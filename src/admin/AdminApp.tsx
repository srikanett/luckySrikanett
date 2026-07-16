import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './AdminApp.css'
import { observeAdminDashboard, observeAdminSession, signInAdmin, signOutAdmin } from '../services/adminDashboardService'
import type { AdminDashboardData, AdminSession } from '../services/adminDashboardService'
import type { ActivityRecord, DonationRecord } from '../types/ceremony'

type AdminView = 'overview' | 'activities' | 'donations'

const emptyDashboard: AdminDashboardData = {
  activities: [],
  donations: [],
  metrics: { totalUsers: 0, luckyToday: 0, donationToday: 0, donationTotal: 0 },
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value)
}

function deityName(activity: ActivityRecord) {
  return activity.deity === 'lakshmi' ? 'พระแม่ประทานทรัพย์' : 'องค์พ่อประทานโชค'
}

function statusName(donation: DonationRecord) {
  const names = { pending: 'รอชำระ', paid: 'ชำระแล้ว', failed: 'ไม่สำเร็จ', expired: 'หมดเวลา', refunded: 'คืนเงิน' }
  return names[donation.status]
}

function AdminApp() {
  const [session, setSession] = useState<AdminSession>({ status: 'loading' })
  const [dashboard, setDashboard] = useState<AdminDashboardData>(emptyDashboard)
  const [dashboardError, setDashboardError] = useState('')
  const [view, setView] = useState<AdminView>('overview')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [signInError, setSignInError] = useState('')

  useEffect(() => observeAdminSession(setSession), [])

  useEffect(() => {
    if (session.status !== 'authorized') return
    return observeAdminDashboard(setDashboard, setDashboardError)
  }, [session.status])

  const latestActivities = useMemo(() => dashboard.activities.slice(0, 8), [dashboard.activities])

  async function handleSignIn(passcode: string) {
    setIsSubmitting(true)
    setSignInError('')
    try {
      await signInAdmin(passcode)
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    setIsSubmitting(true)
    try {
      await signOutAdmin()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (session.status !== 'authorized') {
    return <AdminGate error={signInError} session={session} isSubmitting={isSubmitting} onSignIn={handleSignIn} onSignOut={handleSignOut} />
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">ศรีคเนศ เทวาลัย</p>
          <h1>ระบบผู้ดูแล</h1>
        </div>
        <div className="admin-account">
          <span>สิทธิ์ถึง {session.expiresAt ? formatDate(new Date(session.expiresAt).toISOString()) : '-'}</span>
          <button className="admin-text-button" disabled={isSubmitting} onClick={handleSignOut} type="button">ออกจากระบบ</button>
        </div>
      </header>

      <nav className="admin-nav" aria-label="เมนูแอดมิน">
        <button className={view === 'overview' ? 'is-active' : ''} onClick={() => setView('overview')} type="button">ภาพรวม</button>
        <button className={view === 'activities' ? 'is-active' : ''} onClick={() => setView('activities')} type="button">ประวัติขอโชค</button>
        <button className={view === 'donations' ? 'is-active' : ''} onClick={() => setView('donations')} type="button">โดเนต</button>
      </nav>

      {dashboardError && <p className="admin-alert" role="status">{dashboardError}</p>}

      {view === 'overview' && <Overview dashboard={dashboard} activities={latestActivities} />}
      {view === 'activities' && <ActivityHistory activities={dashboard.activities} />}
      {view === 'donations' && <DonationPanel donations={dashboard.donations} />}
    </main>
  )
}

function AdminGate({ error, session, isSubmitting, onSignIn, onSignOut }: { error: string; session: AdminSession; isSubmitting: boolean; onSignIn: (passcode: string) => void; onSignOut: () => void }) {
  const [passcode, setPasscode] = useState('')
  const unavailable = session.status === 'unavailable'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (/^\d{6}$/.test(passcode)) onSignIn(passcode)
  }

  return (
    <main className="admin-gate">
      <section className="admin-gate-panel" aria-live="polite">
        <p className="admin-kicker">ศรีคเนศ เทวาลัย</p>
        <h1>{unavailable ? 'ยังเปิดระบบแอดมินไม่ได้' : 'เข้าสู่ระบบผู้ดูแล'}</h1>
        <p>{unavailable ? session.message : 'กรอกรหัสผ่าน 6 หลักเพื่อดูข้อมูลพิธีและการโดเนต สิทธิ์จะหมดอายุอัตโนมัติภายใน 8 ชั่วโมง'}</p>
        {unavailable ? <button className="admin-secondary-button" disabled={isSubmitting} onClick={onSignOut} type="button">ล้างการเข้าสู่ระบบ</button> : <form className="admin-passcode-form" onSubmit={submit}><input aria-label="รหัสผ่านผู้ดูแล 6 หลัก" autoComplete="one-time-code" className="admin-passcode-input" disabled={isSubmitting || session.status === 'loading'} inputMode="numeric" maxLength={6} onChange={(event) => setPasscode(event.target.value.replace(/\D/g, ''))} pattern="[0-9]{6}" placeholder="••••••" value={passcode} /><button className="admin-primary-button" disabled={isSubmitting || passcode.length !== 6 || session.status === 'loading'} type="submit">{isSubmitting ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}</button>{error && <p className="admin-passcode-error" role="alert">{error}</p>}</form>}
      </section>
    </main>
  )
}

function Overview({ dashboard, activities }: { dashboard: AdminDashboardData; activities: ActivityRecord[] }) {
  return (
    <div className="admin-content">
      <section className="admin-metrics" aria-label="สถิติภาพรวม">
        <Metric label="ผู้ใช้งานทั้งหมด" value={dashboard.metrics.totalUsers.toLocaleString('th-TH')} note="นับจากประวัติพิธี" />
        <Metric label="กดเสี่ยงโชควันนี้" value={dashboard.metrics.luckyToday.toLocaleString('th-TH')} note="ตามเวลาไทย" />
        <Metric label="โดเนตวันนี้" value={formatMoney(dashboard.metrics.donationToday)} note="ชำระสำเร็จเท่านั้น" />
        <Metric label="ยอดโดเนตรวม" value={formatMoney(dashboard.metrics.donationTotal)} note="เตรียมสำหรับ Beam" />
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><p className="admin-kicker">กิจกรรมล่าสุด</p><h2>รายการกดเสี่ยงโชค</h2></div>
          <span>{dashboard.activities.length} รายการ</span>
        </div>
        <ActivityTable activities={activities} compact />
      </section>

      <section className="admin-donation-ready">
        <div>
          <p className="admin-kicker">ฟีเจอร์ในอนาคต</p>
          <h2>โดเนตผ่าน Beam</h2>
          <p>โครงข้อมูลการชำระเงินและสถิติถูกเตรียมไว้แล้ว แต่ยังไม่สร้าง QR Code หรือรับชำระเงินจริง</p>
        </div>
        <span className="admin-status-badge">พร้อมต่อยอด</span>
      </section>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="admin-metric"><p>{label}</p><strong>{value}</strong><span>{note}</span></article>
}

function ActivityHistory({ activities }: { activities: ActivityRecord[] }) {
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredActivities = useMemo(() => {
    if (!normalizedSearch) return activities

    return activities.filter((activity) => [
      activity.userDisplayName,
      activity.userId,
      activity.result,
      deityName(activity),
    ].join(' ').toLocaleLowerCase().includes(normalizedSearch))
  }, [activities, normalizedSearch])

  return (
    <section className="admin-content">
      <div className="admin-history-heading">
        <div><p className="admin-kicker">รายการล่าสุดก่อนเสมอ</p><h2>ประวัติขอโชค</h2></div>
        <label className="admin-search-field">
          <span>ค้นหา</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="ชื่อ LINE หรือเลขมงคล" type="search" value={search} />
        </label>
      </div>
      <ActivityTable activities={filteredActivities} emptyMessage={normalizedSearch ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : undefined} />
    </section>
  )
}

function ActivityTable({ activities, compact = false, emptyMessage }: { activities: ActivityRecord[]; compact?: boolean; emptyMessage?: string }) {
  if (activities.length === 0) return <div className="admin-empty">{emptyMessage ?? 'ยังไม่มีรายการขอโชค รายการใหม่จะปรากฏที่นี่ทันทีเมื่อผู้ใช้ทำพิธีเสร็จ'}</div>

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>#</th><th>ผู้ใช้</th><th>เลขมงคล</th><th>เวลา</th><th>องค์ที่เลือก</th><th>LINE</th></tr></thead>
        <tbody>
          {activities.map((activity, index) => (
            <tr key={activity.id}>
              <td>{index + 1}</td>
              <td><UserIdentity activity={activity} /></td>
              <td className="admin-result-number">{activity.result}</td>
              <td>{formatDate(activity.createdAt)}</td>
              <td>{deityName(activity)}</td>
              <td>{activity.lineMessageSent ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!compact && <p className="admin-table-note">แสดงล่าสุดไม่เกิน 100 รายการ</p>}
    </div>
  )
}

function UserIdentity({ activity }: { activity: ActivityRecord }) {
  const displayName = activity.userDisplayName || (activity.userMode === 'line' ? 'ผู้ใช้ LINE' : 'ผู้เยี่ยมชม')
  const initial = displayName.trim().slice(0, 1) || '?'
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className="admin-user-identity">
      {activity.userPictureUrl && !imageFailed
        ? <img alt="" className="admin-user-avatar" onError={() => setImageFailed(true)} src={activity.userPictureUrl} />
        : <span aria-hidden="true" className="admin-user-avatar admin-user-avatar-fallback">{initial}</span>}
      <span><strong>{displayName}</strong><small>{activity.userMode === 'line' ? 'LINE' : 'Guest'}</small></span>
    </div>
  )
}

function DonationPanel({ donations }: { donations: DonationRecord[] }) {
  if (donations.length === 0) {
    return <section className="admin-content"><div className="admin-empty">ยังไม่มีรายการโดเนต เมื่อเชื่อม Beam แล้ว หน้านี้จะแสดงสถานะชำระเงิน ยอด และเลขอ้างอิง</div></section>
  }

  return (
    <section className="admin-content"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>ยอด</th><th>สถานะ</th><th>เลขอ้างอิง</th></tr></thead><tbody>{donations.map((donation) => <tr key={donation.id}><td>{formatDate(donation.createdAt)}</td><td>{donation.userId}</td><td>{formatMoney(donation.amount)}</td><td>{statusName(donation)}</td><td>{donation.paymentReference ?? '-'}</td></tr>)}</tbody></table></div></section>
  )
}

export default AdminApp
