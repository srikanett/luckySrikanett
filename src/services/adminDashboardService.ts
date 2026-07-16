import type { User } from 'firebase/auth'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import type { Functions } from 'firebase/functions'
import { getFirebaseEnvironment } from './firebaseService'
import type { ActivityRecord, DeityId, DonationRecord, DonationStatus } from '../types/ceremony'

type FirestoreDocument = Record<string, unknown>

export interface AdminSession {
  status: 'loading' | 'signed-out' | 'denied' | 'authorized' | 'unavailable'
  user?: User
  message?: string
  expiresAt?: number
}

export interface AdminDashboardData {
  activities: ActivityRecord[]
  donations: DonationRecord[]
  metrics: {
    totalUsers: number
    luckyToday: number
    donationToday: number
    donationTotal: number
  }
}

interface AdminFirebase {
  auth: Auth
  database: Firestore
  functions: Functions
}

let adminFirebasePromise: Promise<AdminFirebase> | undefined

function getAdminFirebase() {
  adminFirebasePromise ??= (async () => {
    const environment = getFirebaseEnvironment()
    if (!environment) throw new Error('ยังไม่ได้ตั้งค่า Firebase สำหรับหน้าแอดมิน')

    const [{ getApp, getApps, initializeApp }, { getAuth }, { getFirestore }, { getFunctions }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/functions'),
    ])
    const app = getApps().length ? getApp() : initializeApp(environment)
    return { auth: getAuth(app), database: getFirestore(app), functions: getFunctions(app, 'asia-southeast1') }
  })()

  return adminFirebasePromise
}

function toString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : ''

  if (code.includes('permission-denied')) return 'รหัสผ่านไม่ถูกต้อง'
  if (code.includes('resource-exhausted')) return message.replace(/^.*?:\s*/, '') || 'ลองรหัสเกินจำนวนที่กำหนด กรุณารอสักครู่'
  if (code.includes('not-found') || code.includes('unavailable')) return 'ระบบตรวจรหัสยังไม่พร้อม กรุณาตรวจสอบว่าเผยแพร่ Cloud Functions แล้ว'
  if (code.includes('failed-precondition')) return message.replace(/^.*?:\s*/, '') || 'ยังไม่ได้ตั้งค่าระบบแอดมินบน Firebase'
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
}

function toDeity(value: unknown): DeityId {
  return value === 'lakshmi' ? 'lakshmi' : 'ganesha'
}

function toDonationStatus(value: unknown): DonationStatus {
  return value === 'paid' || value === 'failed' || value === 'expired' || value === 'refunded' ? value : 'pending'
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
    provider: 'beam',
    amount: toNumber(data.amount),
    currency: 'THB',
    status: toDonationStatus(data.status),
    paymentReference: toString(data.paymentReference) || undefined,
    createdAt: toString(data.createdAt),
    paidAt: toString(data.paidAt) || undefined,
  }
}

function dayInBangkok(dateValue: string) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date)
}

function createDashboardData(activities: ActivityRecord[], donations: DonationRecord[]): AdminDashboardData {
  const latestActivities = sortLatestActivities(activities)
  const today = dayInBangkok(new Date().toISOString())
  const paidDonations = donations.filter((donation) => donation.status === 'paid')

  return {
    activities: latestActivities,
    donations,
    metrics: {
      totalUsers: new Set(latestActivities.map((activity) => activity.userId).filter(Boolean)).size,
      luckyToday: latestActivities.filter((activity) => activity.activity === 'luck' && dayInBangkok(activity.createdAt) === today).length,
      donationToday: paidDonations.filter((donation) => dayInBangkok(donation.paidAt ?? donation.createdAt) === today).reduce((sum, donation) => sum + donation.amount, 0),
      donationTotal: paidDonations.reduce((sum, donation) => sum + donation.amount, 0),
    },
  }
}

export function observeAdminSession(onChange: (session: AdminSession) => void) {
  let stopListening: (() => void) | undefined
  let cancelled = false

  void getAdminFirebase()
    .then(async ({ auth }) => {
      const { onAuthStateChanged } = await import('firebase/auth')
      if (cancelled) return

      stopListening = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          onChange({ status: 'signed-out' })
          return
        }

        try {
          const token = await user.getIdTokenResult(true)
          const expiresAt = toNumber(token.claims.adminExpiresAt)
          const hasActivePasscodeSession = token.claims.admin === true && expiresAt > Date.now()
          onChange(hasActivePasscodeSession ? { status: 'authorized', user, expiresAt } : { status: 'signed-out' })
        } catch {
          onChange({ status: 'unavailable', message: 'ตรวจสอบสิทธิ์แอดมินไม่สำเร็จ' })
        }
      })
    })
    .catch(() => onChange({ status: 'unavailable', message: 'ยังไม่ได้ตั้งค่า Firebase สำหรับหน้าแอดมิน' }))

  return () => {
    cancelled = true
    stopListening?.()
  }
}

export async function signInAdmin(passcode: string) {
  const [{ auth, functions }, { httpsCallable }, { signInWithCustomToken }] = await Promise.all([
    getAdminFirebase(),
    import('firebase/functions'),
    import('firebase/auth'),
  ])
  const verifyPasscode = httpsCallable<{ passcode: string }, { token: string; expiresAt: number }>(functions, 'verifyAdminPasscode')

  try {
    const response = await verifyPasscode({ passcode })
    await signInWithCustomToken(auth, response.data.token)
    await auth.currentUser?.getIdToken(true)
  } catch (error) {
    throw new Error(toErrorMessage(error))
  }
}

export async function signOutAdmin() {
  const [{ auth }, { signOut }] = await Promise.all([getAdminFirebase(), import('firebase/auth')])
  await signOut(auth)
}

export function observeAdminDashboard(onChange: (dashboard: AdminDashboardData) => void, onError: (message: string) => void) {
  let stopActivities: (() => void) | undefined
  let stopDonations: (() => void) | undefined
  let cancelled = false
  let activities: ActivityRecord[] = []
  let donations: DonationRecord[] = []

  function publish() {
    onChange(createDashboardData(activities, donations))
  }

  void Promise.all([getAdminFirebase(), import('firebase/firestore')])
    .then(([{ database }, { collection, limit, onSnapshot, orderBy, query }]) => {
      if (cancelled) return
      const activityQuery = query(collection(database, 'activities'), orderBy('createdAt', 'desc'), limit(100))
      const donationQuery = query(collection(database, 'donations'), orderBy('createdAt', 'desc'), limit(100))

      stopActivities = onSnapshot(activityQuery, (snapshot) => {
        activities = sortLatestActivities(snapshot.docs.map((document) => toActivityRecord(document.id, document.data())))
        publish()
      }, () => onError('ยังอ่านข้อมูลพิธีไม่ได้ กรุณาตรวจสอบสิทธิ์ Firestore'))

      stopDonations = onSnapshot(donationQuery, (snapshot) => {
        donations = snapshot.docs.map((document) => toDonationRecord(document.id, document.data()))
        publish()
      }, () => onError('ยังอ่านข้อมูลโดเนตไม่ได้ กรุณาตรวจสอบสิทธิ์ Firestore'))
    })
    .catch(() => onError('เชื่อมต่อฐานข้อมูลแอดมินไม่สำเร็จ'))

  return () => {
    cancelled = true
    stopActivities?.()
    stopDonations?.()
  }
}
