import type { Functions } from 'firebase/functions'
import { getFirebaseEnvironment } from './firebaseService'
import type { ActivityRecord, AdminLuckyDrawRecord, DeityId, DonationRecord, DonationStatus, LuckyDrawStatus } from '../types/ceremony'

type FirestoreDocument = Record<string, unknown>

export interface AdminSession {
  status: 'loading' | 'signed-out' | 'denied' | 'authorized' | 'unavailable'
  message?: string
  expiresAt?: number
}

export interface AdminDashboardData {
  activities: ActivityRecord[]
  donations: DonationRecord[]
  draws: AdminLuckyDrawRecord[]
  donationAmount: number
  metrics: {
    totalUsers: number
    luckyToday: number
    donationToday: number
    donationTotal: number
  }
}

export type BeamApiValue = string | number | boolean | null | BeamApiValue[] | { [key: string]: BeamApiValue }

export interface AdminBeamCharge {
  id: string
  status: string
  amount: number
  currency: string
  referenceId: string
  paymentMethodType: string
  chargeSource: string
  failureCode: string
  createdAt: string
  updatedAt: string
  raw: { [key: string]: BeamApiValue }
}

export interface AdminBeamChargeHistory {
  charges: AdminBeamCharge[]
  metadata: BeamApiValue
  fetchedAt: string
}

interface AdminFirebase {
  functions: Functions
}

let adminFirebasePromise: Promise<AdminFirebase> | undefined
let adminSession: { token: string; expiresAt: number } | undefined
type AdminPasscodeVerifier = (data: { passcode: string }) => Promise<{ data: { token: string; expiresAt: number } }>
let adminPasscodeVerifierPromise: Promise<AdminPasscodeVerifier> | undefined

function getAdminFirebase() {
  adminFirebasePromise ??= (async () => {
    const environment = getFirebaseEnvironment()
    if (!environment) throw new Error('ยังไม่ได้ตั้งค่า Firebase สำหรับหน้าแอดมิน')

    const [{ getApp, getApps, initializeApp }, { getFunctions }] = await Promise.all([
      import('firebase/app'),
      import('firebase/functions'),
    ])
    const app = getApps().length ? getApp() : initializeApp(environment)
    return { functions: getFunctions(app, 'asia-southeast1') }
  })()

  return adminFirebasePromise
}

function getAdminPasscodeVerifier() {
  adminPasscodeVerifierPromise ??= (async () => {
    const [{ functions }, { httpsCallable }] = await Promise.all([getAdminFirebase(), import('firebase/functions')])
    return httpsCallable<{ passcode: string }, { token: string; expiresAt: number }>(functions, 'verifyAdminPasscode')
  })().catch((error: unknown) => {
    adminPasscodeVerifierPromise = undefined
    throw error
  })

  return adminPasscodeVerifierPromise
}

export async function prepareAdminSignIn() {
  await getAdminPasscodeVerifier()
}

function toString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toErrorMessage(error: unknown, fallback = 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่') {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : ''

  if (code.includes('permission-denied')) return 'รหัสผ่านไม่ถูกต้อง'
  if (code.includes('unauthenticated')) return 'เซสชันแอดมินหมดอายุ กรุณาเข้าสู่ระบบใหม่'
  if (code.includes('resource-exhausted')) return message.replace(/^.*?:\s*/, '') || 'ลองรหัสเกินจำนวนที่กำหนด กรุณารอสักครู่'
  if (code.includes('not-found')) return 'ระบบที่เรียกใช้ยังไม่พร้อม กรุณาตรวจสอบว่าเผยแพร่ Cloud Functions แล้ว'
  if (code.includes('unavailable')) return message.replace(/^.*?:\s*/, '') || fallback
  if (code.includes('failed-precondition')) return message.replace(/^.*?:\s*/, '') || 'ยังไม่ได้ตั้งค่าระบบแอดมินบน Firebase'
  if (code.includes('data-loss')) return message.replace(/^.*?:\s*/, '') || 'ข้อมูลที่ได้รับไม่สมบูรณ์ กรุณาลองใหม่'
  return message.replace(/^.*?:\s*/, '') || fallback
}

function toBeamApiValue(value: unknown, depth = 0): BeamApiValue {
  if (depth > 10) return '[ละเว้นข้อมูลที่ซ้อนลึกเกินไป]'
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (Array.isArray(value)) return value.map((item) => toBeamApiValue(item, depth + 1))
  if (typeof value !== 'object') return String(value)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toBeamApiValue(item, depth + 1)]))
}

function toBeamRecord(value: unknown): { [key: string]: BeamApiValue } {
  const converted = toBeamApiValue(value)
  return converted && typeof converted === 'object' && !Array.isArray(converted) ? converted : {}
}

function firstBeamString(record: { [key: string]: BeamApiValue }, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function firstBeamNumber(record: { [key: string]: BeamApiValue }, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return 0
}

function nestedBeamString(record: { [key: string]: BeamApiValue }, parentKey: string, keys: string[]) {
  const parent = record[parentKey]
  if (!parent || typeof parent !== 'object' || Array.isArray(parent)) return ''
  return firstBeamString(parent, keys)
}

function toAdminBeamCharge(value: unknown, index: number): AdminBeamCharge {
  const raw = toBeamRecord(value)
  const id = firstBeamString(raw, ['chargeId', 'id']) || `beam-charge-${index + 1}`
  return {
    id,
    status: firstBeamString(raw, ['status', 'chargeStatus']) || 'UNKNOWN',
    amount: firstBeamNumber(raw, ['amount']),
    currency: firstBeamString(raw, ['currency']) || 'THB',
    referenceId: firstBeamString(raw, ['referenceId', 'merchantReferenceId']),
    paymentMethodType: firstBeamString(raw, ['paymentMethodType']) || nestedBeamString(raw, 'paymentMethod', ['paymentMethodType', 'type']),
    chargeSource: firstBeamString(raw, ['chargeSource', 'source']) || nestedBeamString(raw, 'chargeSource', ['type', 'sourceType']),
    failureCode: firstBeamString(raw, ['failureCode', 'errorCode']),
    createdAt: firstBeamString(raw, ['createdAt', 'created', 'createdTime']),
    updatedAt: firstBeamString(raw, ['updatedAt', 'updated', 'updatedTime']),
    raw,
  }
}

function toDeity(value: unknown): DeityId {
  return value === 'lakshmi' ? 'lakshmi' : 'ganesha'
}

function toDonationStatus(value: unknown): DonationStatus {
  return value === 'paid' || value === 'failed' || value === 'expired' || value === 'refunded' ? value : 'pending'
}

function toLuckyDrawStatus(value: unknown): LuckyDrawStatus {
  return value === 'payment_pending' || value === 'paid' || value === 'free_completed' ? value : 'awaiting_choice'
}

function toActivityRecord(id: string, data: FirestoreDocument): ActivityRecord {
  const userDisplayName = toString(data.userDisplayName)
  const userPictureUrl = toString(data.userPictureUrl)

  return {
    id,
    userId: toString(data.userId, 'ไม่ระบุ'),
    sessionId: toString(data.sessionId),
    ...(userDisplayName ? { userDisplayName } : {}),
    ...(userPictureUrl ? { userPictureUrl } : {}),
    userMode: data.userMode === 'line' ? 'line' : 'guest',
    deity: toDeity(data.deity),
    activity: data.activity === 'wish' ? 'wish' : 'luck',
    type: data.type === 'wish_placeholder' ? 'wish_placeholder' : 'lucky_incense',
    result: toString(data.result, '-'),
    bonusResult: toString(data.bonusResult) || undefined,
    digitLength: toNumber(data.digitLength, 3),
    createdAt: toString(data.createdAt),
    lineMessageSent: data.lineMessageSent === true,
    lineLiftSynced: data.lineLiftSynced === true,
  }
}

function sortLatestActivities(activities: ActivityRecord[]) {
  return [...activities].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

function toDonationRecord(id: string, data: FirestoreDocument): DonationRecord {
  return {
    id,
    userId: toString(data.userId, 'ไม่ระบุ'),
    activityId: toString(data.activityId) || undefined,
    drawId: toString(data.drawId) || undefined,
    provider: 'beam',
    amount: toNumber(data.amount),
    currency: 'THB',
    status: toDonationStatus(data.status),
    paymentReference: toString(data.paymentReference) || undefined,
    createdAt: toString(data.createdAt),
    paidAt: toString(data.paidAt) || undefined,
  }
}

function toLuckyDrawRecord(data: FirestoreDocument): AdminLuckyDrawRecord {
  return {
    drawId: toString(data.drawId),
    userId: toString(data.userId, 'ไม่ระบุ'),
    userMode: data.userMode === 'line' ? 'line' : 'guest',
    userDisplayName: toString(data.userDisplayName, 'ผู้เยี่ยมชม'),
    deity: toDeity(data.deity),
    status: toLuckyDrawStatus(data.status),
    threeDigitResult: toString(data.threeDigitResult, '-'),
    twoDigitResult: toString(data.twoDigitResult, '-'),
    currentChargeId: toString(data.currentChargeId) || undefined,
    amount: toNumber(data.amount),
    createdAt: toString(data.createdAt),
    updatedAt: toString(data.updatedAt),
    paidAt: toString(data.paidAt) || undefined,
    qrExpiresAt: toString(data.qrExpiresAt) || undefined,
    lineCardSent: data.lineCardSent === true,
  }
}

function dayInBangkok(dateValue: string) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date)
}

function createDashboardData(activities: ActivityRecord[], donations: DonationRecord[], draws: AdminLuckyDrawRecord[], donationAmount: number): AdminDashboardData {
  const latestActivities = sortLatestActivities(activities)
  const today = dayInBangkok(new Date().toISOString())
  const paidDonations = donations.filter((donation) => donation.status === 'paid')

  return {
    activities: latestActivities,
    donations,
    draws,
    donationAmount,
    metrics: {
      totalUsers: new Set(draws.map((draw) => draw.userId).filter(Boolean)).size,
      luckyToday: draws.filter((draw) => dayInBangkok(draw.createdAt) === today).length,
      donationToday: paidDonations.filter((donation) => dayInBangkok(donation.paidAt ?? donation.createdAt) === today).reduce((sum, donation) => sum + donation.amount, 0),
      donationTotal: paidDonations.reduce((sum, donation) => sum + donation.amount, 0),
    },
  }
}

export function observeAdminSession(onChange: (session: AdminSession) => void) {
  if (adminSession && adminSession.expiresAt > Date.now()) {
    onChange({ status: 'authorized', expiresAt: adminSession.expiresAt })
  } else {
    adminSession = undefined
    onChange({ status: 'signed-out' })
  }

  return () => undefined
}

export async function signInAdmin(passcode: string) {
  const verifyPasscode = await getAdminPasscodeVerifier()

  try {
    const response = await verifyPasscode({ passcode })
    adminSession = { token: response.data.token, expiresAt: response.data.expiresAt }
    return { expiresAt: response.data.expiresAt }
  } catch (error) {
    throw new Error(toErrorMessage(error))
  }
}

export async function signOutAdmin() {
  if (!adminSession) return

  try {
    const [{ functions }, { httpsCallable }] = await Promise.all([getAdminFirebase(), import('firebase/functions')])
    const revokeSession = httpsCallable<{ sessionToken: string }, { revoked: boolean }>(functions, 'revokeAdminSession')
    await revokeSession({ sessionToken: adminSession.token })
  } finally {
    adminSession = undefined
  }
}

export async function getAdminBeamChargeHistory(): Promise<AdminBeamChargeHistory> {
  if (!adminSession || adminSession.expiresAt <= Date.now()) {
    throw new Error('เซสชันแอดมินหมดอายุ กรุณาเข้าสู่ระบบใหม่')
  }

  try {
    const [{ functions }, { httpsCallable }] = await Promise.all([getAdminFirebase(), import('firebase/functions')])
    const getBeamCharges = httpsCallable<
      { sessionToken: string },
      { charges?: unknown[]; metadata?: unknown; fetchedAt?: unknown }
    >(functions, 'getAdminBeamCharges')
    const response = await getBeamCharges({ sessionToken: adminSession.token })
    const charges = Array.isArray(response.data.charges)
      ? response.data.charges.map(toAdminBeamCharge)
      : []

    return {
      charges,
      metadata: toBeamApiValue(response.data.metadata ?? {}),
      fetchedAt: toString(response.data.fetchedAt, new Date().toISOString()),
    }
  } catch (error) {
    throw new Error(toErrorMessage(error, 'โหลดประวัติการชำระ Beam ไม่สำเร็จ กรุณาลองใหม่'))
  }
}

export async function saveDonationAmount(amount: number) {
  if (!adminSession || adminSession.expiresAt <= Date.now()) throw new Error('เซสชันแอดมินหมดอายุ กรุณาเข้าสู่ระบบใหม่')
  try {
    const [{ functions }, { httpsCallable }] = await Promise.all([getAdminFirebase(), import('firebase/functions')])
    const updateAmount = httpsCallable<{ sessionToken: string; amount: number }, { amount: number }>(functions, 'updateDonationAmount')
    const response = await updateAmount({ sessionToken: adminSession.token, amount })
    return response.data.amount
  } catch (error) {
    throw new Error(toErrorMessage(error))
  }
}

export function observeAdminDashboard(onChange: (dashboard: AdminDashboardData) => void, onError: (message: string) => void) {
  let cancelled = false
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  async function refresh() {
    if (cancelled || !adminSession || adminSession.expiresAt <= Date.now()) {
      if (!cancelled) onError('เซสชันแอดมินหมดอายุ กรุณาเข้าสู่ระบบใหม่')
      return
    }

    try {
      const [{ functions }, { httpsCallable }] = await Promise.all([getAdminFirebase(), import('firebase/functions')])
      const getDashboard = httpsCallable<{ sessionToken: string }, { activities: FirestoreDocument[]; donations: FirestoreDocument[]; draws?: FirestoreDocument[]; donationAmount: number }>(functions, 'getAdminDashboard')
      const response = await getDashboard({ sessionToken: adminSession.token })
      if (cancelled) return

      const activities = response.data.activities.map((record) => toActivityRecord(toString(record.id), record))
      const donations = response.data.donations.map((record) => toDonationRecord(toString(record.id), record))
      const draws = (response.data.draws ?? []).map(toLuckyDrawRecord)
      onChange(createDashboardData(activities, donations, draws, toNumber(response.data.donationAmount, 9)))
    } catch (error) {
      if (!cancelled) onError(toErrorMessage(error))
    }
  }

  void refresh()
  refreshTimer = setInterval(() => void refresh(), 30000)

  return () => {
    cancelled = true
    if (refreshTimer) clearInterval(refreshTimer)
  }
}
