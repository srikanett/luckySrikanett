import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'

if (!getApps().length) initializeApp()

const database = getFirestore()
const initialPasscode = defineSecret('ADMIN_INITIAL_PASSCODE')
const beamMerchantId = defineSecret('BEAM_MERCHANT_ID')
const beamApiKey = defineSecret('BEAM_API_KEY')
const beamWebhookHmacKey = defineSecret('BEAM_WEBHOOK_HMAC_KEY')
const region = 'asia-southeast1'
// Keep the runtime identity explicit so Firebase Auth custom-token signing
// uses the service account configured in Google Cloud IAM.
const runtimeServiceAccount = '198344792966-compute@developer.gserviceaccount.com'
const sessionDurationMs = 8 * 60 * 60 * 1000
const rateLimitWindowMs = 15 * 60 * 1000
const blockedDurationMs = 30 * 60 * 1000
const maximumAttempts = 5
const activityRateLimitWindowMs = 60 * 1000
const maximumActivitiesPerWindow = 8
const adminSessionCollection = database.collection('adminPrivate').doc('sessions').collection('entries')
const donationConfigRef = database.collection('systemConfig').doc('donation')
const qrLifetimeMs = 15 * 60 * 1000
const defaultDonationAmount = 9
const maximumFreeDrawsPerDay = 2
const beamApiBaseUrl = 'https://api.beamcheckout.com/api/v1'
const productionReturnUrl = 'https://luckysrikanett.web.app/'

interface PasscodeConfiguration {
  hash: string
  salt: string
}

interface AttemptState {
  allowed: boolean
  retryAfterSeconds?: number
}

interface LineProfile {
  userId: string
  displayName?: string
  pictureUrl?: string
}

interface CallerIdentity {
  userId: string
  userMode: 'line' | 'guest'
  displayName: string
  pictureUrl?: string
}

interface AdminSession {
  token: string
  expiresAt: number
}

function hashPasscode(passcode: string, salt: string) {
  return scryptSync(passcode, salt, 64).toString('hex')
}

function isPasscode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}

function asTrimmedString(value: unknown, maximumLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const sensitiveBeamFieldNames = new Set([
  'apikey',
  'authorization',
  'cardnumber',
  'cvv',
  'cvc',
  'imagebase64encoded',
  'pan',
  'securitycode',
])

function sanitizeBeamApiValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[ละเว้นข้อมูลที่ซ้อนลึกเกินไป]'
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.length > 20_000 ? `${value.slice(0, 20_000)}…` : value
  if (Array.isArray(value)) return value.slice(0, 2_000).map((item) => sanitizeBeamApiValue(item, depth + 1))
  if (!isPlainRecord(value)) return String(value)

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLocaleLowerCase()
    if (sensitiveBeamFieldNames.has(normalizedKey)) return [key, '[ปกปิดเพื่อความปลอดภัย]']
    return [key, sanitizeBeamApiValue(item, depth + 1)]
  }))
}

function extractBeamCharges(payload: unknown): { charges: Record<string, unknown>[]; metadata: unknown } {
  if (Array.isArray(payload)) {
    return {
      charges: payload.filter(isPlainRecord),
      metadata: { returnedCount: payload.length },
    }
  }

  if (!isPlainRecord(payload)) return { charges: [], metadata: {} }

  const listKeys = ['charges', 'data', 'items', 'results']
  for (const key of listKeys) {
    const candidate = payload[key]
    if (!Array.isArray(candidate)) continue
    const metadata = Object.fromEntries(Object.entries(payload).filter(([entryKey]) => entryKey !== key))
    return { charges: candidate.filter(isPlainRecord), metadata }
  }

  const nestedData = isPlainRecord(payload.data) ? payload.data : undefined
  if (nestedData) {
    for (const key of listKeys) {
      const candidate = nestedData[key]
      if (!Array.isArray(candidate)) continue
      const metadata = {
        ...Object.fromEntries(Object.entries(payload).filter(([entryKey]) => entryKey !== 'data')),
        data: Object.fromEntries(Object.entries(nestedData).filter(([entryKey]) => entryKey !== key)),
      }
      return { charges: candidate.filter(isPlainRecord), metadata }
    }
  }

  return {
    charges: typeof payload.chargeId === 'string' ? [payload] : [],
    metadata: typeof payload.chargeId === 'string' ? {} : payload,
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isLuckyActivity(data: unknown): data is {
  sessionId: string
  deity: 'ganesha' | 'lakshmi'
  activity: 'luck'
  type: 'lucky_incense'
  result: string
  digitLength: number
  lineAccessToken?: string
} {
  if (!data || typeof data !== 'object') return false
  const value = data as Record<string, unknown>

  return asTrimmedString(value.sessionId, 128).length > 0
    && (value.deity === 'ganesha' || value.deity === 'lakshmi')
    && value.activity === 'luck'
    && value.type === 'lucky_incense'
    && typeof value.result === 'string'
    && /^\d{3}$/.test(value.result)
    && value.digitLength === 3
    && (value.lineAccessToken === undefined || typeof value.lineAccessToken === 'string')
}

function fingerprintRequest(request: { rawRequest: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } } }) {
  const forwardedFor = request.rawRequest.headers['x-forwarded-for']
  const address = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0] ?? request.rawRequest.socket?.remoteAddress ?? 'unknown'

  return createHash('sha256').update(address.trim()).digest('hex')
}

function safelyMatches(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

async function getPasscodeConfiguration(): Promise<PasscodeConfiguration> {
  const configurationRef = database.collection('adminPrivate').doc('passcode')
  const existing = await configurationRef.get()

  if (existing.exists) {
    const data = existing.data()
    if (typeof data?.hash === 'string' && typeof data.salt === 'string') return { hash: data.hash, salt: data.salt }
    throw new HttpsError('failed-precondition', 'รูปแบบรหัสผู้ดูแลในฐานข้อมูลไม่ถูกต้อง')
  }

  const configuredPasscode = initialPasscode.value()
  if (!isPasscode(configuredPasscode)) {
    throw new HttpsError('failed-precondition', 'ยังไม่ได้ตั้งค่า ADMIN_INITIAL_PASSCODE บน Firebase')
  }

  const salt = randomBytes(16).toString('hex')
  const hash = hashPasscode(configuredPasscode, salt)

  await database.runTransaction(async (transaction) => {
    const latest = await transaction.get(configurationRef)
    if (!latest.exists) {
      transaction.set(configurationRef, {
        hash,
        salt,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  })

  const initialized = await configurationRef.get()
  const data = initialized.data()
  if (typeof data?.hash !== 'string' || typeof data.salt !== 'string') {
    throw new HttpsError('internal', 'ไม่สามารถเตรียมรหัสผู้ดูแลได้')
  }

  return { hash: data.hash, salt: data.salt }
}

async function registerAttempt(fingerprint: string): Promise<AttemptState> {
  const attemptRef = database.collection('adminPrivate').doc('passcodeAttempts').collection('entries').doc(fingerprint)
  const now = Date.now()

  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(attemptRef)
    const data = snapshot.data()
    const blockedUntil = typeof data?.blockedUntil === 'number' ? data.blockedUntil : 0
    if (blockedUntil > now) return { allowed: false, retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000) }

    const windowStartedAt = typeof data?.windowStartedAt === 'number' ? data.windowStartedAt : now
    const previousAttempts = typeof data?.attempts === 'number' && now - windowStartedAt < rateLimitWindowMs ? data.attempts : 0
    const attempts = previousAttempts + 1

    if (attempts > maximumAttempts) {
      const nextBlockedUntil = now + blockedDurationMs
      transaction.set(attemptRef, {
        attempts,
        blockedUntil: nextBlockedUntil,
        updatedAt: FieldValue.serverTimestamp(),
        windowStartedAt,
      })
      return { allowed: false, retryAfterSeconds: Math.ceil(blockedDurationMs / 1000) }
    }

    transaction.set(attemptRef, {
      attempts,
      blockedUntil: 0,
      updatedAt: FieldValue.serverTimestamp(),
      windowStartedAt: previousAttempts === 0 ? now : windowStartedAt,
    })
    return { allowed: true }
  })
}

async function registerActivityAttempt(fingerprint: string): Promise<AttemptState> {
  const attemptRef = database.collection('adminPrivate').doc('activityRateLimits').collection('entries').doc(fingerprint)
  const now = Date.now()

  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(attemptRef)
    const data = snapshot.data()
    const windowStartedAt = typeof data?.windowStartedAt === 'number' ? data.windowStartedAt : now
    const previousAttempts = typeof data?.attempts === 'number' && now - windowStartedAt < activityRateLimitWindowMs ? data.attempts : 0
    const attempts = previousAttempts + 1
    const retryAfterSeconds = Math.max(1, Math.ceil((activityRateLimitWindowMs - (now - windowStartedAt)) / 1000))

    transaction.set(attemptRef, {
      attempts,
      updatedAt: FieldValue.serverTimestamp(),
      windowStartedAt: previousAttempts === 0 ? now : windowStartedAt,
    })

    return attempts <= maximumActivitiesPerWindow ? { allowed: true } : { allowed: false, retryAfterSeconds }
  })
}

async function getVerifiedLineProfile(accessToken: unknown): Promise<LineProfile | null> {
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) return null

  try {
    const response = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return null

    const data: unknown = await response.json()
    if (!data || typeof data !== 'object') return null
    const profile = data as Record<string, unknown>
    const userId = asTrimmedString(profile.userId, 128)
    if (!userId) return null

    const displayName = asTrimmedString(profile.displayName, 100)
    const pictureUrl = asTrimmedString(profile.pictureUrl, 2048)
    return {
      userId,
      ...(displayName ? { displayName } : {}),
      ...(pictureUrl && isHttpsUrl(pictureUrl) ? { pictureUrl } : {}),
    }
  } catch {
    return null
  }
}

async function resolveCallerIdentity(request: { auth?: { uid: string } }, lineAccessToken: unknown): Promise<CallerIdentity> {
  const lineProfile = await getVerifiedLineProfile(lineAccessToken)
  if (lineProfile) {
    return {
      userId: lineProfile.userId,
      userMode: 'line',
      displayName: lineProfile.displayName ?? 'ผู้ใช้ LINE',
      ...(lineProfile.pictureUrl ? { pictureUrl: lineProfile.pictureUrl } : {}),
    }
  }

  const firebaseUserId = asTrimmedString(request.auth?.uid, 128)
  if (!firebaseUserId) {
    throw new HttpsError('unauthenticated', 'กำลังเตรียมรหัสประจำเครื่อง กรุณาลองอีกครั้ง')
  }
  return {
    userId: `firebase_${firebaseUserId}`,
    userMode: 'guest',
    displayName: 'ผู้เยี่ยมชม',
  }
}

function hashAdminSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isAdminSessionToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

async function createAdminSession(): Promise<AdminSession> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + sessionDurationMs
  await adminSessionCollection.doc(hashAdminSessionToken(token)).set({
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  })
  return { token, expiresAt }
}

async function requireAdminSession(value: unknown) {
  if (!isAdminSessionToken(value)) throw new HttpsError('unauthenticated', 'เซสชันแอดมินไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่')

  const sessionRef = adminSessionCollection.doc(hashAdminSessionToken(value))
  const session = await sessionRef.get()
  const expiresAt = session.data()?.expiresAt
  if (!session.exists || typeof expiresAt !== 'number' || expiresAt <= Date.now()) {
    if (session.exists) await sessionRef.delete()
    throw new HttpsError('unauthenticated', 'เซสชันแอดมินหมดอายุ กรุณาเข้าสู่ระบบใหม่')
  }

  return { sessionRef, expiresAt }
}

export const verifyAdminPasscode = onCall({ region, serviceAccount: runtimeServiceAccount, secrets: [initialPasscode] }, async (request) => {
  try {
  const passcode = request.data?.passcode
  if (!isPasscode(passcode)) throw new HttpsError('invalid-argument', 'กรุณากรอกรหัสตัวเลข 6 หลัก')

  const fingerprint = fingerprintRequest(request)
  const attempt = await registerAttempt(fingerprint)
  if (!attempt.allowed) {
    logger.warn('Admin passcode was rate limited', { fingerprint: fingerprint.slice(0, 12) })
    throw new HttpsError('resource-exhausted', `ลองใหม่ได้ใน ${attempt.retryAfterSeconds ?? blockedDurationMs / 1000} วินาที`)
  }

  const configuration = await getPasscodeConfiguration()
  if (!safelyMatches(hashPasscode(passcode, configuration.salt), configuration.hash)) {
    logger.warn('Incorrect admin passcode', { fingerprint: fingerprint.slice(0, 12) })
    throw new HttpsError('permission-denied', 'รหัสไม่ถูกต้อง')
  }

  await database.collection('adminPrivate').doc('passcodeAttempts').collection('entries').doc(fingerprint).delete()

  const session = await createAdminSession()

  logger.info('Admin passcode accepted', { fingerprint: fingerprint.slice(0, 12), expiresAt: session.expiresAt })

  return session
  } catch (error) {
    if (error instanceof HttpsError) throw error

    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    const details = typeof error === 'object' && error && 'details' in error ? String(error.details) : ''
    if (code === '7' || details.includes('PERMISSION_DENIED')) {
      logger.error('Cloud Function is missing Firestore permissions', { code })
      throw new HttpsError('failed-precondition', 'Cloud Function ยังไม่มีสิทธิ์ Firestore สำหรับตรวจรหัสผู้ดูแล')
    }

    logger.error('Unable to verify admin passcode', { code })
    throw new HttpsError('internal', 'ไม่สามารถตรวจสอบรหัสผู้ดูแลได้')
  }
})

export const getAdminDashboard = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  await requireAdminSession(request.data?.sessionToken)

  const [activities, donations, draws, donationConfig] = await Promise.all([
    database.collection('activities').orderBy('createdAt', 'desc').get(),
    database.collection('donations').orderBy('createdAt', 'desc').get(),
    database.collection('luckyDraws').orderBy('createdAt', 'desc').get(),
    donationConfigRef.get(),
  ])

  return {
    activities: activities.docs.map((document) => ({ id: document.id, ...document.data() })),
    donations: donations.docs.map((document) => {
      const data = document.data()
      return {
        id: document.id,
        userId: data.userId,
        ...(data.drawId ? { drawId: data.drawId } : {}),
        provider: 'beam',
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        paymentReference: data.paymentReference,
        createdAt: data.createdAt,
        ...(data.paidAt ? { paidAt: data.paidAt } : {}),
      }
    }),
    draws: draws.docs.map((document) => {
      const data = document.data()
      return {
        drawId: document.id,
        userId: data.userId,
        userMode: data.userMode,
        userDisplayName: data.userDisplayName,
        deity: data.deity,
        status: data.status,
        threeDigitResult: data.threeDigitResult,
        twoDigitResult: data.twoDigitResult,
        ...(data.currentChargeId ? { currentChargeId: data.currentChargeId } : {}),
        amount: data.amount,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        ...(data.paidAt ? { paidAt: data.paidAt } : {}),
        ...(data.qrExpiresAt ? { qrExpiresAt: data.qrExpiresAt } : {}),
        lineCardSent: data.lineCardSent === true,
      }
    }),
    donationAmount: readDonationAmount(donationConfig.data()?.amount),
  }
})

export const getAdminBeamCharges = onCall({
  region,
  serviceAccount: runtimeServiceAccount,
  secrets: [beamMerchantId, beamApiKey],
}, async (request) => {
  await requireAdminSession(request.data?.sessionToken)

  const merchantId = beamMerchantId.value()
  const apiKey = beamApiKey.value()
  if (!merchantId || !apiKey) {
    throw new HttpsError('failed-precondition', 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Beam บน Firebase')
  }

  const credentials = Buffer.from(`${merchantId}:${apiKey}`).toString('base64')
  let response: Response
  try {
    response = await fetch(`${beamApiBaseUrl}/charges`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${credentials}`,
      },
    })
  } catch (error) {
    logger.error('Unable to connect to Beam charge history API', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    throw new HttpsError('unavailable', 'ยังไม่สามารถเชื่อมต่อประวัติการชำระ Beam ได้ กรุณาลองใหม่')
  }

  const responseBody = await response.text()
  if (!response.ok) {
    logger.error('Beam charge history request failed', {
      status: response.status,
      requestId: response.headers.get('x-request-id') ?? response.headers.get('x-beam-request-id') ?? undefined,
    })
    throw new HttpsError('unavailable', 'Beam ยังไม่สามารถส่งประวัติการชำระกลับมาได้ กรุณาลองใหม่')
  }

  let payload: unknown
  try {
    payload = JSON.parse(responseBody) as unknown
  } catch {
    throw new HttpsError('data-loss', 'Beam ส่งข้อมูลประวัติกลับมาในรูปแบบที่อ่านไม่ได้')
  }

  const history = extractBeamCharges(payload)
  return {
    charges: history.charges.map((charge) => sanitizeBeamApiValue(charge)),
    metadata: sanitizeBeamApiValue(history.metadata),
    fetchedAt: new Date().toISOString(),
  }
})

export const updateDonationAmount = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  await requireAdminSession(request.data?.sessionToken)
  const amount = request.data?.amount
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
    throw new HttpsError('invalid-argument', 'ยอดสนับสนุนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 100,000 บาท')
  }

  await donationConfigRef.set({
    amount,
    currency: 'THB',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  logger.info('Donation amount updated', { amount })
  return { amount }
})

export const revokeAdminSession = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  const { sessionRef } = await requireAdminSession(request.data?.sessionToken)
  await sessionRef.delete()
  return { revoked: true }
})

export const recordLuckyActivity = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  if (!isLuckyActivity(request.data)) {
    throw new HttpsError('invalid-argument', 'ข้อมูลพิธีไม่ถูกต้อง')
  }

  const fingerprint = fingerprintRequest(request)
  const attempt = await registerActivityAttempt(fingerprint)
  if (!attempt.allowed) {
    throw new HttpsError('resource-exhausted', `กรุณารอ ${attempt.retryAfterSeconds ?? 60} วินาทีก่อนเริ่มพิธีอีกครั้ง`)
  }

  const lineProfile = await getVerifiedLineProfile(request.data.lineAccessToken)
  const now = new Date().toISOString()
  const activityRef = database.collection('activities').doc()

  await activityRef.set({
    userId: lineProfile?.userId ?? `guest_${fingerprint.slice(0, 16)}`,
    sessionId: asTrimmedString(request.data.sessionId, 128),
    userDisplayName: lineProfile?.displayName ?? 'ผู้เยี่ยมชม',
    ...(lineProfile?.pictureUrl ? { userPictureUrl: lineProfile.pictureUrl } : {}),
    userMode: lineProfile ? 'line' : 'guest',
    deity: request.data.deity,
    activity: 'luck',
    type: 'lucky_incense',
    result: request.data.result,
    digitLength: request.data.digitLength,
    createdAt: now,
    serverCreatedAt: FieldValue.serverTimestamp(),
    lineMessageSent: false,
    lineLiftSynced: false,
  })

  logger.info('Lucky activity recorded', { activityId: activityRef.id, source: lineProfile ? 'line' : 'guest' })
  return { activityId: activityRef.id }
})

type LuckyDrawStatus = 'awaiting_choice' | 'payment_pending' | 'paid' | 'free_completed'

interface LuckyDrawData {
  userId: string
  userMode: 'line' | 'guest'
  userDisplayName: string
  userPictureUrl?: string
  sessionId: string
  deity: 'ganesha' | 'lakshmi'
  threeDigitResult: string
  twoDigitResult: string
  status: LuckyDrawStatus
  accessTokenHash: string
  createdAt: string
  updatedAt: string
  currentChargeId?: string
  qrImageBase64?: string
  qrExpiresAt?: string
  chargeAttempt?: number
  amount?: number
  paidAt?: string
  cardImageUrl?: string
  lineCardSent?: boolean
}

interface BeamChargeResponse {
  actionRequired?: string
  chargeId?: string
  encodedImage?: {
    expiry?: string
    imageBase64Encoded?: string
  }
}

function readDonationAmount(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100_000
    ? Number(value)
    : defaultDonationAmount
}

async function getDonationAmount() {
  const snapshot = await donationConfigRef.get()
  return readDonationAmount(snapshot.data()?.amount)
}

function randomDigits(length: number) {
  return Array.from(randomBytes(length), (value) => String(value % 10)).join('')
}

function hashDrawToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createDrawToken() {
  return randomBytes(32).toString('hex')
}

function userStateRef(userId: string) {
  return database.collection('userDrawState').doc(createHash('sha256').update(userId).digest('hex'))
}

function freeUsageRef(userId: string) {
  return database.collection('freeDrawUsage').doc(createHash('sha256').update(userId).digest('hex'))
}

function bangkokDateKey() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function isDrawStatus(value: unknown): value is LuckyDrawStatus {
  return value === 'awaiting_choice' || value === 'payment_pending' || value === 'paid' || value === 'free_completed'
}

function readDraw(snapshot: FirebaseFirestore.DocumentSnapshot) {
  if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบรอบเสี่ยงดวงนี้')
  const data = snapshot.data() as Partial<LuckyDrawData>
  if (!data.userId || !data.accessTokenHash || !data.threeDigitResult || !data.twoDigitResult || !isDrawStatus(data.status)) {
    throw new HttpsError('data-loss', 'ข้อมูลรอบเสี่ยงดวงไม่สมบูรณ์')
  }
  return data as LuckyDrawData
}

function publicDraw(drawId: string, drawToken: string, draw: LuckyDrawData) {
  const paid = draw.status === 'paid'
  const freeCompleted = draw.status === 'free_completed'
  return {
    drawId,
    drawToken,
    status: draw.status,
    previewDigits: draw.threeDigitResult.slice(0, 2).split(''),
    ...(paid ? {
      threeDigitResult: draw.threeDigitResult.split(''),
      twoDigitResult: draw.twoDigitResult.split(''),
    } : {}),
    ...(freeCompleted ? { twoDigitResult: draw.threeDigitResult.slice(0, 2).split('') } : {}),
    ...(draw.qrImageBase64 ? { qrImageBase64: draw.qrImageBase64 } : {}),
    ...(draw.qrExpiresAt ? { qrExpiresAt: draw.qrExpiresAt } : {}),
    amount: draw.amount ?? defaultDonationAmount,
    deity: draw.deity,
    ...(draw.lineCardSent ? { lineCardSent: true } : {}),
    ...(draw.cardImageUrl ? { cardImageUrl: draw.cardImageUrl } : {}),
    createdAt: draw.createdAt,
  }
}

async function requireDrawAccess(drawIdValue: unknown, drawTokenValue: unknown) {
  const drawId = asTrimmedString(drawIdValue, 128)
  const drawToken = asTrimmedString(drawTokenValue, 128)
  if (!drawId || !/^[a-f0-9]{64}$/.test(drawToken)) {
    throw new HttpsError('unauthenticated', 'สิทธิ์เข้าถึงรอบเสี่ยงดวงไม่ถูกต้อง')
  }

  const drawRef = database.collection('luckyDraws').doc(drawId)
  const snapshot = await drawRef.get()
  const draw = readDraw(snapshot)
  const actualHash = hashDrawToken(drawToken)
  if (!safelyMatches(actualHash, draw.accessTokenHash)) {
    throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์เข้าถึงรอบเสี่ยงดวงนี้')
  }
  return { drawId, drawToken, drawRef, draw }
}

async function saveDrawActivity(drawId: string, draw: LuckyDrawData, paid: boolean) {
  const activityRef = database.collection('activities').doc(drawId)
  const existing = await activityRef.get()
  if (existing.exists) {
    if (paid) {
      await activityRef.set({
        result: draw.threeDigitResult,
        bonusResult: draw.twoDigitResult,
        digitLength: 5,
        upgradedToPaidAt: new Date().toISOString(),
      }, { merge: true })
    }
    return activityRef.id
  }

  const result = paid ? draw.threeDigitResult : draw.threeDigitResult.slice(0, 2)
  await activityRef.set({
    userId: draw.userId,
    sessionId: draw.sessionId,
    userDisplayName: draw.userDisplayName,
    ...(draw.userPictureUrl ? { userPictureUrl: draw.userPictureUrl } : {}),
    userMode: draw.userMode,
    deity: draw.deity,
    activity: 'luck',
    type: 'lucky_incense',
    drawId,
    result,
    ...(paid ? { bonusResult: draw.twoDigitResult } : {}),
    digitLength: paid ? 5 : 2,
    createdAt: new Date().toISOString(),
    serverCreatedAt: FieldValue.serverTimestamp(),
    lineMessageSent: false,
    lineLiftSynced: false,
  }, { merge: false })
  return activityRef.id
}

export const createLuckyDraw = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  const sessionId = asTrimmedString(request.data?.sessionId, 128)
  const deity = request.data?.deity === 'lakshmi' ? 'lakshmi' : 'ganesha'
  if (!sessionId) throw new HttpsError('invalid-argument', 'ไม่พบรหัสเซสชัน')

  const identity = await resolveCallerIdentity(request, request.data?.lineAccessToken)
  const fingerprint = fingerprintRequest(request)

  const state = await userStateRef(identity.userId).get()
  const currentDrawId = asTrimmedString(state.data()?.currentDrawId, 128)
  if (currentDrawId) {
    const currentRef = database.collection('luckyDraws').doc(currentDrawId)
    const current = await currentRef.get()
    if (current.exists) {
      const currentDraw = readDraw(current)
      if (currentDraw.userId === identity.userId && (currentDraw.status === 'awaiting_choice' || currentDraw.status === 'payment_pending')) {
        const drawToken = createDrawToken()
        await currentRef.update({ accessTokenHash: hashDrawToken(drawToken), updatedAt: new Date().toISOString() })
        return publicDraw(currentDrawId, drawToken, { ...currentDraw, accessTokenHash: hashDrawToken(drawToken) })
      }
    }
  }

  const attempt = await registerActivityAttempt(fingerprint)
  if (!attempt.allowed) {
    throw new HttpsError('resource-exhausted', `กรุณารอ ${attempt.retryAfterSeconds ?? 60} วินาทีก่อนเริ่มพิธีอีกครั้ง`)
  }

  const drawToken = createDrawToken()
  const now = new Date().toISOString()
  const amount = await getDonationAmount()
  const drawRef = database.collection('luckyDraws').doc()
  const draw: LuckyDrawData = {
    userId: identity.userId,
    userMode: identity.userMode,
    userDisplayName: identity.displayName,
    ...(identity.pictureUrl ? { userPictureUrl: identity.pictureUrl } : {}),
    sessionId,
    deity,
    threeDigitResult: randomDigits(3),
    twoDigitResult: randomDigits(2),
    status: 'awaiting_choice',
    accessTokenHash: hashDrawToken(drawToken),
    amount,
    createdAt: now,
    updatedAt: now,
  }

  await drawRef.set({ ...draw, serverCreatedAt: FieldValue.serverTimestamp() })
  await userStateRef(identity.userId).set({ currentDrawId: drawRef.id, updatedAt: FieldValue.serverTimestamp() })

  logger.info('Lucky draw created', { drawId: drawRef.id, userMode: identity.userMode })
  return publicDraw(drawRef.id, drawToken, draw)
})

export const resumeLuckyDraw = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  const identity = await resolveCallerIdentity(request, request.data?.lineAccessToken)

  const state = await userStateRef(identity.userId).get()
  const drawId = asTrimmedString(state.data()?.currentDrawId, 128)
  if (!drawId) return { draw: null }

  const drawRef = database.collection('luckyDraws').doc(drawId)
  const snapshot = await drawRef.get()
  if (!snapshot.exists) return { draw: null }
  const draw = readDraw(snapshot)
  if (draw.userId !== identity.userId || draw.status === 'free_completed') return { draw: null }

  const drawToken = createDrawToken()
  const accessTokenHash = hashDrawToken(drawToken)
  await drawRef.update({ accessTokenHash, updatedAt: new Date().toISOString() })
  return { draw: publicDraw(drawId, drawToken, { ...draw, accessTokenHash }) }
})

export const completeLuckyDrawWithoutDonation = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  const access = await requireDrawAccess(request.data?.drawId, request.data?.drawToken)
  if (access.draw.status === 'paid') return publicDraw(access.drawId, access.drawToken, access.draw)
  if (access.draw.status === 'free_completed') return publicDraw(access.drawId, access.drawToken, access.draw)

  const dateKey = bangkokDateKey()
  const usageRef = freeUsageRef(access.draw.userId)
  const updated = await database.runTransaction(async (transaction) => {
    const [drawSnapshot, usageSnapshot] = await Promise.all([
      transaction.get(access.drawRef),
      transaction.get(usageRef),
    ])
    const latestDraw = readDraw(drawSnapshot)
    const actualHash = hashDrawToken(access.drawToken)
    if (!safelyMatches(actualHash, latestDraw.accessTokenHash)) {
      throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์เข้าถึงรอบเสี่ยงดวงนี้')
    }
    if (latestDraw.status === 'paid' || latestDraw.status === 'free_completed') return latestDraw

    const usage = usageSnapshot.data()
    const previousCount = usage?.date === dateKey && typeof usage.count === 'number' ? usage.count : 0
    if (previousCount >= maximumFreeDrawsPerDay) {
      throw new HttpsError('resource-exhausted', 'วันนี้คุณเสี่ยงโชคครบจำนวนโควต้าฟรีแล้ว สามารถบริจาคสนับสนุนเพื่อรับเลขชุดใหม่ได้ครับ')
    }

    const nextDraw: LuckyDrawData = { ...latestDraw, status: 'free_completed', updatedAt: new Date().toISOString() }
    transaction.update(access.drawRef, { status: nextDraw.status, updatedAt: nextDraw.updatedAt })
    transaction.set(usageRef, {
      date: dateKey,
      count: previousCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return nextDraw
  })
  await saveDrawActivity(access.drawId, updated, false)
  return publicDraw(access.drawId, access.drawToken, updated)
})

export const getLuckyDrawStatus = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  const access = await requireDrawAccess(request.data?.drawId, request.data?.drawToken)
  let draw = access.draw
  if (draw.status === 'payment_pending' && draw.qrExpiresAt && new Date(draw.qrExpiresAt).getTime() <= Date.now()) {
    const previousChargeId = draw.currentChargeId
    draw = {
      ...draw,
      status: 'awaiting_choice',
      qrImageBase64: undefined,
      qrExpiresAt: undefined,
      currentChargeId: undefined,
      chargeAttempt: (draw.chargeAttempt ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    }
    await access.drawRef.update({
      status: draw.status,
      qrImageBase64: FieldValue.delete(),
      qrExpiresAt: FieldValue.delete(),
      currentChargeId: FieldValue.delete(),
      chargeAttempt: draw.chargeAttempt,
      updatedAt: draw.updatedAt,
    })
    if (previousChargeId) {
      await database.collection('donations').doc(previousChargeId).set({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }
  }
  return publicDraw(access.drawId, access.drawToken, draw)
})

export const createBeamQr = onCall({
  region,
  serviceAccount: runtimeServiceAccount,
  secrets: [beamMerchantId, beamApiKey],
}, async (request) => {
  const access = await requireDrawAccess(request.data?.drawId, request.data?.drawToken)
  const identity = await resolveCallerIdentity(request, request.data?.lineAccessToken)
  if (identity.userId !== access.draw.userId) {
    throw new HttpsError('permission-denied', 'รอบเสี่ยงดวงนี้เป็นของผู้ใช้อื่น')
  }
  if (access.draw.status === 'paid') return publicDraw(access.drawId, access.drawToken, access.draw)
  if (access.draw.status === 'free_completed') throw new HttpsError('failed-precondition', 'รอบนี้รับเลข 2 หลักและจบพิธีแล้ว')

  const existingExpiry = access.draw.qrExpiresAt ? new Date(access.draw.qrExpiresAt).getTime() : 0
  if (access.draw.qrImageBase64 && existingExpiry > Date.now()) {
    return publicDraw(access.drawId, access.drawToken, access.draw)
  }

  const amount = readDonationAmount(access.draw.amount)
  const expiryTime = new Date(Date.now() + qrLifetimeMs).toISOString()
  const chargeAttempt = access.draw.chargeAttempt ?? 0
  const idempotencyKey = `lucky-draw-${createHash('sha256').update(`${access.drawId}:${chargeAttempt}`).digest('hex')}`
  const credentials = Buffer.from(`${beamMerchantId.value()}:${beamApiKey.value()}`).toString('base64')
  const response = await fetch(`${beamApiBaseUrl}/charges`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'x-beam-idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      amount: amount * 100,
      currency: 'THB',
      paymentMethod: { qrPromptPay: { expiryTime }, paymentMethodType: 'QR_PROMPT_PAY' },
      referenceId: access.drawId,
      returnUrl: productionReturnUrl,
      skip3dsFlow: false,
    }),
  })

  const responseBody = await response.text()
  if (!response.ok) {
    logger.error('Beam charge creation failed', { drawId: access.drawId, status: response.status, body: responseBody.slice(0, 500) })
    throw new HttpsError('unavailable', 'ยังไม่สามารถสร้าง QR ชำระเงินได้ กรุณาลองอีกครั้ง')
  }

  let charge: BeamChargeResponse
  try {
    charge = JSON.parse(responseBody) as BeamChargeResponse
  } catch {
    throw new HttpsError('data-loss', 'Beam ส่งข้อมูล QR กลับมาไม่สมบูรณ์')
  }
  const chargeId = asTrimmedString(charge.chargeId, 128)
  const qrImageBase64 = asTrimmedString(charge.encodedImage?.imageBase64Encoded, 500_000)
  const qrExpiresAt = asTrimmedString(charge.encodedImage?.expiry, 64) || expiryTime
  if (charge.actionRequired !== 'ENCODED_IMAGE' || !chargeId || !qrImageBase64) {
    throw new HttpsError('failed-precondition', 'Beam ไม่ได้ส่ง QR PromptPay กลับมาตามที่คาดไว้')
  }

  const updated: LuckyDrawData = {
    ...access.draw,
    status: 'payment_pending',
    currentChargeId: chargeId,
    qrImageBase64,
    qrExpiresAt,
    amount,
    updatedAt: new Date().toISOString(),
  }
  await Promise.all([
    access.drawRef.update({
      status: updated.status,
      currentChargeId: chargeId,
      qrImageBase64,
      qrExpiresAt,
      amount,
      updatedAt: updated.updatedAt,
    }),
    database.collection('donations').doc(chargeId).set({
      userId: access.draw.userId,
      drawId: access.drawId,
      provider: 'beam',
      amount,
      currency: 'THB',
      status: 'pending',
      paymentReference: chargeId,
      createdAt: updated.updatedAt,
      serverCreatedAt: FieldValue.serverTimestamp(),
    }),
  ])

  return publicDraw(access.drawId, access.drawToken, updated)
})

export const saveLuckyCard = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  const access = await requireDrawAccess(request.data?.drawId, request.data?.drawToken)
  if (access.draw.status !== 'paid') {
    throw new HttpsError('failed-precondition', 'การ์ดเลขมงคลสำหรับผู้ที่รับเลขครบ 2 ชุดเท่านั้น')
  }
  if (access.draw.cardImageUrl) return { imageUrl: access.draw.cardImageUrl }

  const imageDataUrl = asTrimmedString(request.data?.imageDataUrl, 4_500_000)
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl)
  if (!match) throw new HttpsError('invalid-argument', 'รูปแบบการ์ดเลขมงคลไม่ถูกต้อง')

  const image = Buffer.from(match[1], 'base64')
  if (image.length < 1_000 || image.length > 3_000_000 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    throw new HttpsError('invalid-argument', 'ขนาดหรือข้อมูลภาพการ์ดไม่ถูกต้อง')
  }

  const bucket = getStorage().bucket()
  const fileName = `lucky-cards/${access.drawId}.jpg`
  const downloadToken = randomBytes(24).toString('hex')
  await bucket.file(fileName).save(image, {
    resumable: false,
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  })
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${downloadToken}`
  await access.drawRef.update({ cardImageUrl: imageUrl, updatedAt: new Date().toISOString() })
  return { imageUrl }
})

export const markLuckyCardSent = onCall({ region, serviceAccount: runtimeServiceAccount }, async (request) => {
  const access = await requireDrawAccess(request.data?.drawId, request.data?.drawToken)
  if (access.draw.status !== 'paid') throw new HttpsError('failed-precondition', 'รอบนี้ยังชำระเงินไม่สำเร็จ')
  await Promise.all([
    access.drawRef.update({ lineCardSent: true, updatedAt: new Date().toISOString() }),
    database.collection('activities').doc(access.drawId).set({ lineMessageSent: true }, { merge: true }),
  ])
  return { success: true as const }
})

function validBeamSignature(rawBody: Buffer, signature: string, encodedKey: string) {
  try {
    const expected = createHmac('sha256', Buffer.from(encodedKey, 'base64')).update(rawBody).digest()
    const received = Buffer.from(signature, 'base64')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

export const beamWebhook = onRequest({
  region,
  serviceAccount: runtimeServiceAccount,
  secrets: [beamMerchantId, beamWebhookHmacKey],
}, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).send('Method not allowed')
    return
  }

  const signature = asTrimmedString(request.header('x-beam-signature'), 512)
  const event = asTrimmedString(request.header('x-beam-event'), 64)
  const rawBody = request.rawBody
  if (!signature || !rawBody || !validBeamSignature(rawBody, signature, beamWebhookHmacKey.value())) {
    logger.warn('Rejected Beam webhook with invalid signature')
    response.status(401).send('Invalid signature')
    return
  }
  if (event !== 'charge.succeeded' && event !== 'charge.failed') {
    response.status(204).send()
    return
  }

  const body = request.body as Record<string, unknown>
  const drawId = asTrimmedString(body.referenceId, 128)
  const chargeId = asTrimmedString(body.chargeId, 128)
  const merchantId = asTrimmedString(body.merchantId, 128)
  if (!drawId || !chargeId || merchantId !== beamMerchantId.value()) {
    response.status(400).send('Invalid payment reference')
    return
  }

  const drawRef = database.collection('luckyDraws').doc(drawId)
  const drawSnapshot = await drawRef.get()
  if (!drawSnapshot.exists) {
    response.status(404).send('Draw not found')
    return
  }
  const draw = readDraw(drawSnapshot)
  const donationRef = database.collection('donations').doc(chargeId)
  const donationSnapshot = await donationRef.get()
  if (!donationSnapshot.exists || donationSnapshot.data()?.drawId !== drawId) {
    response.status(409).send('Charge does not belong to draw')
    return
  }
  if (event === 'charge.failed') {
    const updates: Array<Promise<unknown>> = [donationRef.set({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }, { merge: true })]
    if (draw.currentChargeId === chargeId && draw.status === 'payment_pending') {
      updates.push(drawRef.update({
        status: 'awaiting_choice',
        currentChargeId: FieldValue.delete(),
        qrImageBase64: FieldValue.delete(),
        qrExpiresAt: FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      }))
    }
    await Promise.all(updates)
    response.status(204).send()
    return
  }

  const expectedAmountSatang = readDonationAmount(donationSnapshot.data()?.amount) * 100
  if (body.status !== 'SUCCEEDED' || body.currency !== 'THB' || body.amount !== expectedAmountSatang) {
    logger.error('Beam webhook payment details did not match draw', { drawId, chargeId })
    response.status(409).send('Payment details do not match')
    return
  }

  const paidAt = asTrimmedString(body.transactionTime, 64) || new Date().toISOString()
  const paidDraw: LuckyDrawData = { ...draw, status: 'paid', updatedAt: new Date().toISOString() }
  const paidUpdates: Array<Promise<unknown>> = [
    drawRef.update({ status: 'paid', paidAt, updatedAt: paidDraw.updatedAt }),
    donationRef.set({ status: 'paid', paidAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    saveDrawActivity(drawId, paidDraw, true),
  ]
  paidUpdates.push(userStateRef(draw.userId).set({ currentDrawId: drawId, updatedAt: FieldValue.serverTimestamp() }))
  await Promise.all(paidUpdates)

  logger.info('Beam donation confirmed', { drawId, chargeId })
  response.status(204).send()
})
