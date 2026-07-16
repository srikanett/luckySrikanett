import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

if (!getApps().length) initializeApp()

const database = getFirestore()
const initialPasscode = defineSecret('ADMIN_INITIAL_PASSCODE')
const region = 'asia-southeast1'
const sessionDurationMs = 8 * 60 * 60 * 1000
const rateLimitWindowMs = 15 * 60 * 1000
const blockedDurationMs = 30 * 60 * 1000
const maximumAttempts = 5
const activityRateLimitWindowMs = 60 * 1000
const maximumActivitiesPerWindow = 8
const adminAuthUserId = 'admin-passcode'

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

function hashPasscode(passcode: string, salt: string) {
  return scryptSync(passcode, salt, 64).toString('hex')
}

function isPasscode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}

function asTrimmedString(value: unknown, maximumLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''
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

async function ensureAdminAuthUser() {
  const auth = getAuth()

  try {
    await auth.getUser(adminAuthUserId)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code !== 'auth/user-not-found') throw error

    try {
      await auth.createUser({ uid: adminAuthUserId })
    } catch (creationError) {
      const creationCode = typeof creationError === 'object' && creationError && 'code' in creationError ? String(creationError.code) : ''
      if (creationCode !== 'auth/uid-already-exists') throw creationError
    }
  }
}

export const verifyAdminPasscode = onCall({ region, secrets: [initialPasscode] }, async (request) => {
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

  const expiresAt = Date.now() + sessionDurationMs
  let token: string
  try {
    await ensureAdminAuthUser()
    await getAuth().setCustomUserClaims(adminAuthUserId, { admin: true, adminExpiresAt: expiresAt })
    token = await getAuth().createCustomToken(adminAuthUserId)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'auth/configuration-not-found') {
      throw new HttpsError('failed-precondition', 'ต้องเปิด Firebase Authentication ก่อนใช้งาน passcode')
    }
    if (code === 'auth/insufficient-permission') {
      throw new HttpsError('failed-precondition', 'Cloud Function ยังไม่มีสิทธิ์สร้าง session แอดมิน')
    }
    logger.error('Unable to create an admin session', { code })
    throw new HttpsError('internal', 'ไม่สามารถออกสิทธิ์แอดมินได้')
  }

  logger.info('Admin passcode accepted', { fingerprint: fingerprint.slice(0, 12), expiresAt })

  return { expiresAt, token }
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

export const recordLuckyActivity = onCall({ region }, async (request) => {
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
