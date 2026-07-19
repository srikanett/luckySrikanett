import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import './AdminApp.css'
import { assetConfig } from '../config/assetConfig'
import { observeAdminDashboard, observeAdminSession, prepareAdminSignIn, saveDonationAmount, signInAdmin, signOutAdmin } from '../services/adminDashboardService'
import type { AdminDashboardData, AdminSession } from '../services/adminDashboardService'
import type { ActivityRecord, AdminLuckyDrawRecord, DonationRecord } from '../types/ceremony'

type AdminView = 'overview' | 'activities' | 'customers' | 'donations' | 'lucky'
type BeamFilter = 'all' | 'paid' | 'pending'
type BeamUiStatus = DonationRecord['status'] | 'not-created'
type AdminLuckyPhase = 'idle' | 'three' | 'two' | 'summary'

interface BeamListItem {
  id: string
  donation?: DonationRecord
  draw?: AdminLuckyDrawRecord
}

interface AdminLocalLuckyResult {
  threeDigits: string[]
  twoDigits: string[]
}

interface LineCustomer {
  userId: string
  displayName: string
  pictureUrl?: string
  activities: ActivityRecord[]
  latestActivity: ActivityRecord
}

const emptyDashboard: AdminDashboardData = {
  activities: [],
  donations: [],
  draws: [],
  donationAmount: 9,
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

function deityShortName(activity: ActivityRecord) {
  return activity.deity === 'lakshmi' ? 'พระแม่ลักษมี' : 'พระคเณศ'
}

function formatRemainingTime(expiresAt: number | undefined, now: number) {
  const remainingSeconds = Math.max(0, Math.floor(((expiresAt ?? now) - now) / 1000))
  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':')
}

type AdminIconName = 'menu' | 'close' | 'overview' | 'activities' | 'customers' | 'donations' | 'lucky' | 'clock' | 'logout'

function AdminIcon({ name }: { name: AdminIconName }) {
  const paths: Record<AdminIconName, ReactNode> = {
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    overview: <><rect height="7" rx="1.5" width="7" x="3" y="3" /><rect height="7" rx="1.5" width="7" x="14" y="3" /><rect height="7" rx="1.5" width="7" x="3" y="14" /><rect height="7" rx="1.5" width="7" x="14" y="14" /></>,
    activities: <><path d="M7 3v3M17 3v3M4 9h16" /><rect height="17" rx="2" width="16" x="4" y="4" /><path d="m8 14 2.4 2.4L16 11" /></>,
    customers: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    donations: <><rect height="14" rx="2" width="20" x="2" y="5" /><path d="M2 10h20M7 15h3" /></>,
    lucky: <><path d="m12 3 1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8-4.8-1.7 4.8-1.7L12 3Z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></>,
  }

  return <svg aria-hidden="true" className="admin-icon" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[name]}</svg>
}

function AdminApp() {
  const [session, setSession] = useState<AdminSession>({ status: 'loading' })
  const [dashboard, setDashboard] = useState<AdminDashboardData>(emptyDashboard)
  const [dashboardError, setDashboardError] = useState('')
  const [view, setView] = useState<AdminView>('overview')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [signInError, setSignInError] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSavingAmount, setIsSavingAmount] = useState(false)
  const [amountMessage, setAmountMessage] = useState('')
  const [now, setNow] = useState(Date.now())
  const sidebarCloseRef = useRef<HTMLButtonElement>(null)
  const sidebarLogoutRef = useRef<HTMLButtonElement>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => observeAdminSession(setSession), [])

  useEffect(() => {
    if (session.status !== 'authorized') return
    return observeAdminDashboard(setDashboard, setDashboardError)
  }, [session.status])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isSidebarOpen) return
    sidebarCloseRef.current?.focus()

    const handleSidebarKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false)
        window.requestAnimationFrame(() => sidebarToggleRef.current?.focus())
        return
      }

      if (event.key !== 'Tab') return
      const firstElement = sidebarCloseRef.current
      const lastElement = sidebarLogoutRef.current
      if (!firstElement || !lastElement) return

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }
    window.addEventListener('keydown', handleSidebarKeyboard)
    return () => window.removeEventListener('keydown', handleSidebarKeyboard)
  }, [isSidebarOpen])

  const latestActivities = useMemo(() => dashboard.activities.slice(0, 8), [dashboard.activities])

  async function handleSignIn(passcode: string) {
    setIsSubmitting(true)
    setSignInError('')
    try {
      const result = await signInAdmin(passcode)
      setSession({ status: 'authorized', expiresAt: result.expiresAt })
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
      setSession({ status: 'signed-out' })
    } finally {
      setIsSubmitting(false)
    }
  }

  function selectView(nextView: AdminView) {
    setView(nextView)
    setIsSidebarOpen(false)
    window.scrollTo({ top: 0 })
  }

  function closeSidebar() {
    setIsSidebarOpen(false)
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus())
  }

  async function updateAmount(amount: number) {
    setIsSavingAmount(true)
    setAmountMessage('')
    try {
      const savedAmount = await saveDonationAmount(amount)
      setDashboard((current) => ({ ...current, donationAmount: savedAmount }))
      setAmountMessage(`บันทึกยอดสนับสนุน ${savedAmount.toLocaleString('th-TH')} บาทแล้ว`)
    } catch (error) {
      setAmountMessage(error instanceof Error ? error.message : 'บันทึกยอดไม่สำเร็จ')
    } finally {
      setIsSavingAmount(false)
    }
  }

  if (session.status !== 'authorized') {
    return <AdminGate error={signInError} session={session} isSubmitting={isSubmitting} onSignIn={handleSignIn} onSignOut={handleSignOut} />
  }

  return (
    <main className="admin-shell">
      <aside className={`admin-sidebar${isSidebarOpen ? ' is-open' : ''}`} id="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span aria-hidden="true" className="admin-brand-mark">ศ</span>
          <span><strong>ศรีคเนศ เทวาลัย</strong><small>ระบบผู้ดูแล</small></span>
          <button aria-label="ปิดเมนูด้านข้าง" className="admin-sidebar-close" onClick={closeSidebar} ref={sidebarCloseRef} type="button"><AdminIcon name="close" /></button>
        </div>
        <div className="admin-sidebar-status">
          <span className="admin-status-dot" />
          <span><strong>ระบบพร้อมใช้งาน</strong><small>ข้อมูลอัปเดตอัตโนมัติ</small></span>
        </div>
        <div className="admin-sidebar-footer">
          <div className="admin-session-countdown">
            <AdminIcon name="clock" />
            <span><small>เวลาการใช้งานคงเหลือ</small><strong>{formatRemainingTime(session.expiresAt, now)}</strong></span>
          </div>
          <button className="admin-logout-button" disabled={isSubmitting} onClick={handleSignOut} ref={sidebarLogoutRef} type="button"><AdminIcon name="logout" /><span>{isSubmitting ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}</span></button>
        </div>
      </aside>

      {isSidebarOpen && <button aria-label="ปิดเมนูด้านข้าง" className="admin-sidebar-overlay" onClick={closeSidebar} type="button" />}

      <header className="admin-topbar">
        <button aria-controls="admin-sidebar" aria-expanded={isSidebarOpen} aria-label="เปิดเมนูด้านข้าง" className="admin-sidebar-toggle" onClick={() => setIsSidebarOpen(true)} ref={sidebarToggleRef} type="button"><AdminIcon name="menu" /></button>
        <nav className="admin-nav" aria-label="เมนูแอดมิน">
          <button aria-current={view === 'overview' ? 'page' : undefined} className={view === 'overview' ? 'is-active' : ''} onClick={() => selectView('overview')} type="button"><AdminIcon name="overview" /><span>ภาพรวม</span></button>
          <button aria-current={view === 'activities' ? 'page' : undefined} className={view === 'activities' ? 'is-active' : ''} onClick={() => selectView('activities')} type="button"><AdminIcon name="activities" /><span>ขอโชค</span></button>
          <button aria-current={view === 'customers' ? 'page' : undefined} className={view === 'customers' ? 'is-active' : ''} onClick={() => selectView('customers')} type="button"><AdminIcon name="customers" /><span>ลูกค้า</span></button>
          <button aria-current={view === 'donations' ? 'page' : undefined} className={view === 'donations' ? 'is-active' : ''} onClick={() => selectView('donations')} type="button"><AdminIcon name="donations" /><span>โดเนต</span></button>
          <button aria-current={view === 'lucky' ? 'page' : undefined} className={view === 'lucky' ? 'is-active' : ''} onClick={() => selectView('lucky')} type="button"><AdminIcon name="lucky" /><span>ขอเลข</span></button>
        </nav>
      </header>

      <div className="admin-page">
        {dashboardError && <p className="admin-alert" role="status">{dashboardError}</p>}

        {view === 'overview' && <Overview dashboard={dashboard} activities={latestActivities} />}
        {view === 'activities' && <ActivityHistory activities={dashboard.activities} />}
        {view === 'customers' && <LineCustomerHistory activities={dashboard.activities} />}
        {view === 'donations' && <DonationPanel amount={dashboard.donationAmount} donations={dashboard.donations} draws={dashboard.draws} isSaving={isSavingAmount} message={amountMessage} onUpdateAmount={updateAmount} />}
        {view === 'lucky' && <AdminLuckyDrawPanel />}
      </div>
    </main>
  )
}

function AdminGate({ error, session, isSubmitting, onSignIn, onSignOut }: { error: string; session: AdminSession; isSubmitting: boolean; onSignIn: (passcode: string) => void; onSignOut: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [showSlowLoading, setShowSlowLoading] = useState(false)
  const [activeOtpIndex, setActiveOtpIndex] = useState<number | null>(null)
  const [showOtpErrorPulse, setShowOtpErrorPulse] = useState(false)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const lastAutoSubmittedPasscode = useRef('')
  const unavailable = session.status === 'unavailable'

  useEffect(() => {
    if (unavailable) return
    void prepareAdminSignIn().catch(() => undefined)
  }, [unavailable])

  useEffect(() => {
    if (!isSubmitting) {
      setShowSlowLoading(false)
      return
    }

    const timer = window.setTimeout(() => setShowSlowLoading(true), 1000)
    return () => window.clearTimeout(timer)
  }, [isSubmitting])

  useEffect(() => {
    if (!error) return

    setPasscode('')
    setShowSlowLoading(false)
    setShowOtpErrorPulse(true)
    setActiveOtpIndex(0)
    lastAutoSubmittedPasscode.current = ''
    window.requestAnimationFrame(() => inputRefs.current[0]?.focus())

    const timer = window.setTimeout(() => setShowOtpErrorPulse(false), 1300)
    return () => window.clearTimeout(timer)
  }, [error])

  function submitPasscode(value: string, force = false) {
    if (!/^\d{6}$/.test(value) || isSubmitting) return
    if (!force && lastAutoSubmittedPasscode.current === value) return
    lastAutoSubmittedPasscode.current = value
    onSignIn(value)
  }

  function applyPasscode(value: string) {
    const nextPasscode = value.replace(/\D/g, '').slice(0, 6)
    setPasscode(nextPasscode)
    if (nextPasscode.length < 6) lastAutoSubmittedPasscode.current = ''

    const focusIndex = Math.min(nextPasscode.length, 5)
    window.requestAnimationFrame(() => inputRefs.current[focusIndex]?.focus())
    if (nextPasscode.length === 6) window.requestAnimationFrame(() => submitPasscode(nextPasscode))
  }

  function updateDigit(index: number, value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length > 1) {
      applyPasscode(digits)
      return
    }

    const characters = passcode.padEnd(6, ' ').split('')
    characters[index] = digits || ' '
    const nextPasscode = characters.join('').trimEnd()
    setPasscode(nextPasscode)
    if (nextPasscode.length < 6) lastAutoSubmittedPasscode.current = ''

    if (digits && index < 5) inputRefs.current[index + 1]?.focus()
    if (nextPasscode.length === 6 && !nextPasscode.includes(' ')) submitPasscode(nextPasscode)
  }

  function handleOtpKeyDown(index: number, event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !passcode[index] && index > 0) {
      event.preventDefault()
      const characters = passcode.padEnd(6, ' ').split('')
      characters[index - 1] = ' '
      setPasscode(characters.join('').trimEnd())
      lastAutoSubmittedPasscode.current = ''
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleOtpPaste(event: ClipboardEvent<HTMLFieldSetElement>) {
    event.preventDefault()
    applyPasscode(event.clipboardData.getData('text'))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitPasscode(passcode, true)
  }

  return (
    <main className="admin-gate">
      <section className="admin-gate-panel" aria-live="polite">
        <p className="admin-kicker">ศรีคเนศ เทวาลัย</p>
        <h1>{unavailable ? 'ยังเปิดระบบแอดมินไม่ได้' : 'เข้าสู่ระบบผู้ดูแล'}</h1>
        <p>{unavailable ? session.message : 'กรอกรหัสผ่าน 6 หลักเพื่อดูข้อมูลพิธีและการโดเนต สิทธิ์จะหมดอายุอัตโนมัติภายใน 8 ชั่วโมง'}</p>
        {unavailable
          ? <button className="admin-secondary-button" disabled={isSubmitting} onClick={onSignOut} type="button">ล้างการเข้าสู่ระบบ</button>
          : <form className="admin-passcode-form" onSubmit={submit}>
              <fieldset className={`admin-otp-fieldset${showOtpErrorPulse ? ' has-error' : ''}`} disabled={isSubmitting || session.status === 'loading'} onPaste={handleOtpPaste}>
                <legend>รหัส OTP ผู้ดูแล 6 หลัก</legend>
                <div className="admin-otp-inputs">
                  {Array.from({ length: 6 }, (_, index) => <input aria-describedby={error ? 'admin-passcode-error' : undefined} aria-invalid={Boolean(error)} aria-label={`รหัสหลักที่ ${index + 1}`} autoComplete={index === 0 ? 'one-time-code' : 'off'} className="admin-otp-input" inputMode="numeric" key={index} maxLength={1} onBlur={() => setActiveOtpIndex((currentIndex) => currentIndex === index ? null : currentIndex)} onChange={(event) => updateDigit(index, event.target.value)} onFocus={(event) => { setActiveOtpIndex(index); event.currentTarget.select() }} onKeyDown={(event) => handleOtpKeyDown(index, event)} pattern="[0-9]" ref={(element) => { inputRefs.current[index] = element }} type={passcode[index]?.trim() && activeOtpIndex !== index ? 'password' : 'text'} value={passcode[index]?.trim() ?? ''} />)}
                </div>
              </fieldset>
              <button aria-busy={isSubmitting} className="admin-primary-button" disabled={isSubmitting || !/^\d{6}$/.test(passcode) || session.status === 'loading'} type="submit">
                {isSubmitting ? <span className="admin-login-progress">{showSlowLoading && <span aria-hidden="true" className="admin-login-spinner" />}<span>{showSlowLoading ? 'กำลังเชื่อมต่อ...' : 'กำลังตรวจสอบ...'}</span></span> : 'เข้าสู่ระบบ'}
              </button>
              {error && <p className="admin-passcode-error" id="admin-passcode-error" role="alert">{error}{error.includes('ไม่ถูกต้อง') ? ' กรุณากรอกใหม่' : ''}</p>}
            </form>}
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
          <p className="admin-kicker">Beam Production</p>
          <h2>โดเนตผ่าน Beam</h2>
          <p>ยอดสนับสนุนปัจจุบัน {formatMoney(dashboard.donationAmount)} ระบบสร้าง QR PromptPay และเปิดเลขเมื่อ Beam ยืนยันการชำระเงิน</p>
        </div>
        <span className="admin-status-badge">เชื่อมระบบแล้ว</span>
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
      activity.bonusResult,
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
    <div className={`admin-activity-list-wrap${compact ? ' is-compact' : ''}`}>
      <ol className="admin-activity-list">
        {activities.map((activity, index) => (
          <li className="admin-activity-card" key={activity.id}>
            <span className="admin-activity-index">{index + 1}</span>
            <UserIdentity activity={activity} />
            <strong className="admin-result-number" aria-label={`เลขมงคล ${activity.result}${activity.bonusResult ? ` และ ${activity.bonusResult}` : ''}`}>{activity.result}{activity.bonusResult ? ` / ${activity.bonusResult}` : ''}</strong>
            <span aria-hidden="true" className="admin-activity-row-spacer" />
            <span className="admin-activity-meta">
              <time dateTime={activity.createdAt}>{formatDate(activity.createdAt)}</time>
              <span>{deityShortName(activity)}</span>
              <span className={activity.lineMessageSent ? 'is-sent' : ''}>{activity.lineMessageSent ? 'ส่ง LINE แล้ว' : 'ยังไม่ส่ง LINE'}</span>
            </span>
          </li>
        ))}
      </ol>
      {!compact && <p className="admin-table-note">แสดงประวัติทั้งหมด เรียงจากล่าสุดก่อน</p>}
    </div>
  )
}

function createLineCustomers(activities: ActivityRecord[]) {
  const customerActivities = new Map<string, ActivityRecord[]>()

  for (const activity of activities) {
    if (activity.userMode !== 'line' || !activity.userId) continue
    const history = customerActivities.get(activity.userId) ?? []
    history.push(activity)
    customerActivities.set(activity.userId, history)
  }

  return Array.from(customerActivities, ([userId, history]): LineCustomer => {
    const latestActivity = history[0]
    return {
      userId,
      displayName: latestActivity.userDisplayName || 'ผู้ใช้ LINE',
      ...(latestActivity.userPictureUrl ? { pictureUrl: latestActivity.userPictureUrl } : {}),
      activities: history,
      latestActivity,
    }
  }).sort((left, right) => new Date(right.latestActivity.createdAt).getTime() - new Date(left.latestActivity.createdAt).getTime())
}

function LineCustomerHistory({ activities }: { activities: ActivityRecord[] }) {
  const [search, setSearch] = useState('')
  const customers = useMemo(() => createLineCustomers(activities), [activities])
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredCustomers = useMemo(() => {
    if (!normalizedSearch) return customers
    return customers.filter((customer) => [
      customer.displayName,
      customer.userId,
      ...customer.activities.map((activity) => activity.result),
      ...customer.activities.map((activity) => activity.bonusResult),
    ].join(' ').toLocaleLowerCase().includes(normalizedSearch))
  }, [customers, normalizedSearch])

  return (
    <section className="admin-content">
      <div className="admin-history-heading">
        <div><p className="admin-kicker">เฉพาะผู้ใช้ที่ยืนยันผ่าน LINE</p><h2>ประวัติลูกค้า LINE</h2></div>
        <label className="admin-search-field">
          <span>ค้นหาลูกค้า</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="ชื่อ LINE, User ID หรือเลขมงคล" type="search" value={search} />
        </label>
      </div>
      <p className="admin-customer-count">พบ {filteredCustomers.length.toLocaleString('th-TH')} คน จากประวัติทั้งหมด</p>
      {filteredCustomers.length > 0
        ? <div className="admin-customer-list">{filteredCustomers.map((customer) => <LineCustomerCard customer={customer} key={customer.userId} />)}</div>
        : <div className="admin-empty">{normalizedSearch ? 'ไม่พบลูกค้าที่ตรงกับคำค้นหา' : 'ยังไม่มีประวัติจากผู้ใช้ LINE'}</div>}
    </section>
  )
}

function LineCustomerCard({ customer }: { customer: LineCustomer }) {
  return (
    <details className="admin-customer-card">
      <summary>
        <CustomerIdentity customer={customer} />
        <span className="admin-customer-usage"><strong>{customer.activities.length.toLocaleString('th-TH')} ครั้ง</strong><small>ล่าสุด {formatDate(customer.latestActivity.createdAt)}</small></span>
        <span aria-hidden="true" className="admin-details-indicator">⌄</span>
      </summary>
      <div className="admin-customer-detail">
        <p><strong>LINE User ID</strong><span>{customer.userId}</span></p>
        <h3>รายละเอียดการใช้งานทั้งหมด</h3>
        <ol className="admin-customer-activity-list">
          {customer.activities.map((activity, index) => (
            <li key={activity.id}>
              <span className="admin-customer-activity-index">{index + 1}</span>
              <span><small>เลขมงคล</small><strong>{activity.result}{activity.bonusResult ? ` / ${activity.bonusResult}` : ''}</strong></span>
              <span><small>องค์ที่เลือก</small><strong>{deityName(activity)}</strong></span>
              <span><small>วันและเวลา</small><strong>{formatDate(activity.createdAt)}</strong></span>
              <span><small>ส่งเข้า LINE</small><strong>{activity.lineMessageSent ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</strong></span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}

function CustomerIdentity({ customer }: { customer: LineCustomer }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = customer.displayName.trim().slice(0, 1) || '?'

  return (
    <span className="admin-user-identity admin-customer-identity">
      {customer.pictureUrl && !imageFailed
        ? <img alt="" className="admin-user-avatar" onError={() => setImageFailed(true)} src={customer.pictureUrl} />
        : <span aria-hidden="true" className="admin-user-avatar admin-user-avatar-fallback">{initial}</span>}
      <span><strong>{customer.displayName}</strong><small>LINE</small></span>
    </span>
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

function drawResult(draw: AdminLuckyDrawRecord) {
  if (draw.status === 'paid') return `${draw.threeDigitResult} / ${draw.twoDigitResult}`
  if (draw.status === 'free_completed') return `${draw.threeDigitResult.slice(0, 2)} (ฟรี)`
  if (draw.status === 'payment_pending') return 'รอชำระเพื่อเปิดเลข'
  return 'ยังไม่เลือกรับผล'
}

function drawStatusName(draw: AdminLuckyDrawRecord) {
  if (draw.status === 'paid') return 'ออกเลขครบแล้ว'
  if (draw.status === 'free_completed') return 'ออกเลขฟรีแล้ว'
  if (draw.status === 'payment_pending') return 'รอผลชำระ'
  return 'รอเลือกวิธีรับเลข'
}

function statusClass(status: BeamUiStatus) {
  return `admin-beam-status is-${status}`
}

function beamStatusForItem(item: BeamListItem): BeamUiStatus {
  if (item.donation) return item.donation.status
  if (item.draw?.status === 'paid') return 'paid'
  if (item.draw?.status === 'payment_pending' && item.draw.currentChargeId) return 'pending'
  return 'not-created'
}

function beamStatusLabel(status: BeamUiStatus) {
  if (status === 'not-created') return 'ยังไม่สร้าง QR'
  const names: Record<DonationRecord['status'], string> = {
    pending: 'รอชำระ',
    paid: 'ชำระแล้ว',
    failed: 'ไม่สำเร็จ',
    expired: 'หมดเวลา',
    refunded: 'คืนเงิน',
  }
  return names[status]
}

function itemDisplayName(item: BeamListItem) {
  return item.draw?.userDisplayName || item.donation?.userId || 'ไม่ทราบผู้ใช้'
}

function itemCreatedAt(item: BeamListItem) {
  return item.draw?.createdAt ?? item.donation?.createdAt ?? ''
}

function itemAmount(item: BeamListItem) {
  return item.draw?.amount ?? item.donation?.amount ?? 0
}

function DonationPanel({ amount, donations, draws, isSaving, message, onUpdateAmount }: {
  amount: number
  donations: DonationRecord[]
  draws: AdminLuckyDrawRecord[]
  isSaving: boolean
  message: string
  onUpdateAmount: (amount: number) => void
}) {
  const [amountInput, setAmountInput] = useState(String(amount))
  const [activeFilter, setActiveFilter] = useState<BeamFilter>('all')
  const [selectedItem, setSelectedItem] = useState<BeamListItem | null>(null)
  const closeSelectedItem = useCallback(() => setSelectedItem(null), [])
  const donationsByDraw = useMemo(() => {
    const records = new Map<string, DonationRecord>()
    for (const donation of donations) {
      if (donation.drawId && !records.has(donation.drawId)) records.set(donation.drawId, donation)
    }
    return records
  }, [donations])
  const linkedDrawIds = useMemo(() => new Set(draws.map((draw) => draw.drawId)), [draws])
  const orphanDonations = useMemo(() => donations.filter((donation) => !donation.drawId || !linkedDrawIds.has(donation.drawId)), [donations, linkedDrawIds])
  const beamItems = useMemo<BeamListItem[]>(() => [
    ...draws.map((draw) => ({ id: `draw-${draw.drawId}`, draw, donation: donationsByDraw.get(draw.drawId) })),
    ...orphanDonations.map((donation) => ({ id: `donation-${donation.id}`, donation })),
  ], [donationsByDraw, draws, orphanDonations])
  const paidItemCount = beamItems.filter((item) => beamStatusForItem(item) === 'paid').length
  const pendingItemCount = beamItems.filter((item) => beamStatusForItem(item) === 'pending').length
  const filteredItems = activeFilter === 'all'
    ? beamItems
    : beamItems.filter((item) => beamStatusForItem(item) === activeFilter)

  useEffect(() => setAmountInput(String(amount)), [amount])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextAmount = Number(amountInput)
    if (Number.isInteger(nextAmount) && nextAmount >= 1 && nextAmount <= 100_000) onUpdateAmount(nextAmount)
  }

  return (
    <section className="admin-content">
      <form className="admin-amount-form" onSubmit={submit}>
        <div><p className="admin-kicker">ตั้งค่าการสนับสนุน</p><h2>ยอดสำหรับเปิดเลขที่เหลือ</h2><p>ยอดใหม่จะใช้กับรอบที่สร้างหลังจากบันทึก โดยรอบเดิมจะคงราคาเดิมไว้</p></div>
        <label><span>จำนวนเงิน (บาท)</span><input inputMode="numeric" max="100000" min="1" onChange={(event) => setAmountInput(event.target.value.replace(/\D/g, '').slice(0, 6))} required type="number" value={amountInput} /></label>
        <button className="admin-primary-button" disabled={isSaving || !/^\d+$/.test(amountInput) || Number(amountInput) < 1 || Number(amountInput) > 100_000} type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึกราคา'}</button>
        {message && <p className="admin-amount-message" role="status">{message}</p>}
      </form>
      <section className="admin-beam-overview" aria-label="กรองรายการ Beam">
        <button aria-pressed={activeFilter === 'all'} className={activeFilter === 'all' ? 'is-active' : ''} onClick={() => setActiveFilter('all')} type="button"><small>รายการทั้งหมด</small><strong>{beamItems.length.toLocaleString('th-TH')}</strong></button>
        <button aria-pressed={activeFilter === 'paid'} className={activeFilter === 'paid' ? 'is-active' : ''} onClick={() => setActiveFilter('paid')} type="button"><small>ชำระสำเร็จ</small><strong>{paidItemCount.toLocaleString('th-TH')}</strong></button>
        <button aria-pressed={activeFilter === 'pending'} className={activeFilter === 'pending' ? 'is-active' : ''} onClick={() => setActiveFilter('pending')} type="button"><small>กำลังรอชำระ</small><strong>{pendingItemCount.toLocaleString('th-TH')}</strong></button>
      </section>
      <div className="admin-beam-list-heading">
        <div><p className="admin-kicker">รายการจากระบบ Beam</p><h2>{activeFilter === 'all' ? 'รายการทั้งหมด' : activeFilter === 'paid' ? 'รายการชำระสำเร็จ' : 'รายการกำลังรอชำระ'}</h2></div>
        <span>ดับเบิลคลิกที่การ์ดเพื่อดูรายละเอียด</span>
      </div>
      {beamItems.length === 0
        ? <div className="admin-empty">ยังไม่มีรายการเสี่ยงโชคหรือรายการจาก Beam</div>
        : filteredItems.length === 0
          ? <div className="admin-empty">ไม่พบรายการในสถานะที่เลือก</div>
          : <div className="admin-beam-card-grid">
              {filteredItems.map((item) => <BeamRecordCard item={item} key={item.id} onOpen={() => setSelectedItem(item)} />)}
            </div>}
      {selectedItem && <BeamDetailModal item={selectedItem} onClose={closeSelectedItem} />}
    </section>
  )
}

function BeamRecordCard({ item, onOpen }: { item: BeamListItem; onOpen: () => void }) {
  const beamStatus = beamStatusForItem(item)
  const result = item.draw ? drawResult(item.draw) : 'ไม่พบข้อมูลรอบ'

  return (
    <article className="admin-beam-card" onDoubleClick={onOpen}>
      <header>
        <time dateTime={itemCreatedAt(item)}>{formatDate(itemCreatedAt(item))}</time>
        <span className={statusClass(beamStatus)}>{beamStatusLabel(beamStatus)}</span>
      </header>
      <div className="admin-beam-card-user">
        <span aria-hidden="true">{itemDisplayName(item).trim().slice(0, 1) || '?'}</span>
        <div><h3>{itemDisplayName(item)}</h3><p>{item.draw ? `${item.draw.userMode === 'line' ? 'LINE' : 'Guest'} · ${item.draw.deity === 'lakshmi' ? 'พระแม่ลักษมี' : 'พระคเณศ'}` : 'รายการ Beam เดิม'}</p></div>
      </div>
      <dl className="admin-beam-card-summary">
        <div><dt>เลขที่ออก</dt><dd className="admin-result-number">{result}</dd></div>
        <div><dt>ยอด</dt><dd>{formatMoney(itemAmount(item))}</dd></div>
        <div><dt>สถานะรอบ</dt><dd>{item.draw ? drawStatusName(item.draw) : 'ข้อมูล Beam เดิม'}</dd></div>
      </dl>
      <footer><code>{item.draw?.drawId ?? item.donation?.drawId ?? item.donation?.id ?? '-'}</code><button className="admin-text-button" onClick={onOpen} type="button">ดูรายละเอียด</button></footer>
    </article>
  )
}

function BeamDetailModal({ item, onClose }: { item: BeamListItem; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const beamStatus = beamStatusForItem(item)
  const draw = item.draw
  const donation = item.donation

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        event.preventDefault()
        closeButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      previousActiveElement?.focus()
    }
  }, [onClose])

  return (
    <div className="admin-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="beam-detail-title" aria-modal="true" className="admin-detail-modal" role="dialog">
        <header><div><p className="admin-kicker">รายละเอียดรายการ</p><h2 id="beam-detail-title">{itemDisplayName(item)}</h2></div><button aria-label="ปิดรายละเอียด" className="admin-detail-close" onClick={onClose} ref={closeButtonRef} type="button"><AdminIcon name="close" /></button></header>
        <dl className="admin-detail-list">
          <div><dt>เวลา</dt><dd>{formatDate(itemCreatedAt(item))}</dd></div>
          <div><dt>ผู้ใช้</dt><dd>{itemDisplayName(item)}{draw ? ` · ${draw.userMode === 'line' ? 'LINE' : 'Guest'}` : ''}</dd></div>
          <div><dt>องค์เทพ</dt><dd>{draw ? draw.deity === 'lakshmi' ? 'พระแม่ประทานทรัพย์' : 'องค์พ่อประทานโชค' : '-'}</dd></div>
          <div><dt>Draw ID</dt><dd><code>{draw?.drawId ?? donation?.drawId ?? '-'}</code></dd></div>
          <div><dt>Charge ID</dt><dd><code>{donation?.paymentReference ?? draw?.currentChargeId ?? '-'}</code></dd></div>
          <div><dt>เลขที่ออก</dt><dd className="admin-result-number">{draw ? drawResult(draw) : 'ไม่พบข้อมูลรอบ'}</dd></div>
          <div><dt>สถานะรอบ</dt><dd>{draw ? drawStatusName(draw) : 'ข้อมูล Beam เดิม'}</dd></div>
          <div><dt>ยอด</dt><dd>{formatMoney(itemAmount(item))}</dd></div>
          <div><dt>สถานะ Beam</dt><dd><span className={statusClass(beamStatus)}>{beamStatusLabel(beamStatus)}</span></dd></div>
          <div><dt>ชำระเมื่อ</dt><dd>{donation?.paidAt || draw?.paidAt ? formatDate(donation?.paidAt ?? draw?.paidAt ?? '') : '-'}</dd></div>
          <div><dt>ส่งการ์ด LINE</dt><dd>{draw ? draw.lineCardSent ? 'ส่งแล้ว' : 'ยังไม่ส่ง' : '-'}</dd></div>
        </dl>
      </section>
    </div>
  )
}

function randomDigits(length: number) {
  const values = new Uint32Array(length)
  globalThis.crypto.getRandomValues(values)
  return Array.from(values, (value) => String(value % 10))
}

function AdminLuckyDrawPanel() {
  const [phase, setPhase] = useState<AdminLuckyPhase>('idle')
  const [result, setResult] = useState<AdminLocalLuckyResult | null>(null)

  useEffect(() => {
    if (phase !== 'three' && phase !== 'two') return
    const nextPhase: AdminLuckyPhase = phase === 'three' ? 'two' : 'summary'
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 350 : 1_600
    const timer = window.setTimeout(() => setPhase(nextPhase), delay)
    return () => window.clearTimeout(timer)
  }, [phase])

  function startDraw() {
    setResult({ threeDigits: randomDigits(3), twoDigits: randomDigits(2) })
    setPhase('three')
  }

  const isRevealing = phase === 'three' || phase === 'two'
  const title = phase === 'idle'
    ? 'ขอเลขเสี่ยงโชคมงคล'
    : phase === 'three'
      ? 'กำลังเปิดเลข 3 ตัว...'
      : phase === 'two'
        ? 'กำลังประทานเลข 2 ตัว...'
        : 'เลขเสี่ยงโชคมงคล'

  return (
    <section className="admin-content">
      <div className="admin-lucky-panel" aria-busy={isRevealing}>
        <img alt="องค์พ่อประทานโชค" className="admin-lucky-background" src={assetConfig.luckyIncense} />
        <div className="admin-lucky-overlay" />
        <header><p className="admin-kicker">สำหรับผู้ดูแลระบบ</p><h1>{title}</h1><p>ออกเลขสำหรับตรวจสอบหรือใช้งานภายในเท่านั้น ระบบจะไม่สร้างรายการ Beam และไม่บันทึกข้อมูล</p></header>
        <div aria-live="polite" className={`admin-lucky-stage is-${phase}`}>
          {phase === 'idle' && <><LuckyDigitGroup digits={['?', '?', '?']} label="เลข 3 ตัว" /><LuckyDigitGroup accent digits={['?', '?']} label="เลข 2 ตัว" /></>}
          {phase === 'three' && result && <LuckyDigitGroup digits={result.threeDigits} label="เลข 3 ตัว" />}
          {phase === 'two' && result && <LuckyDigitGroup accent digits={result.twoDigits} label="เลข 2 ตัว" />}
          {phase === 'summary' && result && <><LuckyDigitGroup digits={result.threeDigits} label="เลข 3 ตัว" /><LuckyDigitGroup accent digits={result.twoDigits} label="เลข 2 ตัว" /></>}
        </div>
        <button className="admin-primary-button admin-lucky-button" disabled={isRevealing} onClick={startDraw} type="button">{isRevealing ? 'กำลังเปิดเลข...' : phase === 'summary' ? 'ขอเลขชุดใหม่' : 'ขอเลขเสี่ยงโชค'}</button>
        <p className="admin-lucky-note">โหมดแอดมิน · ไม่มีหน้าบริจาค · ไม่เก็บประวัติ</p>
      </div>
    </section>
  )
}

function LuckyDigitGroup({ accent = false, digits, label }: { accent?: boolean; digits: string[]; label: string }) {
  return (
    <div className={`admin-lucky-number-group${accent ? ' is-accent' : ''}`}>
      <small>{label}</small>
      <div>{digits.map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}</div>
    </div>
  )
}

export default AdminApp
