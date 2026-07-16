import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { assetConfig, deityConfig } from './config/assetConfig'
import { brandConfig, campaignConfig } from './config/brandConfig'
import { saveActivityRecord } from './services/activityService'
import { generateLuckyResult } from './services/resultGeneratorService'
import { initializeLiff, sendResultToLine } from './services/liffService'
import type { LiffSession } from './services/liffService'
import { getSessionId } from './utils/session'
import type { ActivityKind, AppScreen, DeityId, LuckyResult } from './types/ceremony'

const particles = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  left: `${(index * 37 + 11) % 96}%`,
  top: `${(index * 61 + 7) % 88}%`,
  delay: `${(index % 7) * -0.8}s`,
  duration: `${7 + (index % 5)}s`,
}))

type NetworkConnection = EventTarget & {
  saveData?: boolean
}

function getNetworkConnection() {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { connection?: NetworkConnection }).connection
}

function getPowerSavingPreference() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || getNetworkConnection()?.saveData === true
}

function useRuntimePreferences() {
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  const [isPowerSaving, setIsPowerSaving] = useState(getPowerSavingPreference)

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const connection = getNetworkConnection()
    const updatePreferences = () => setIsPowerSaving(getPowerSavingPreference())
    const updateVisibility = () => setIsPageVisible(document.visibilityState !== 'hidden')

    motionQuery.addEventListener('change', updatePreferences)
    connection?.addEventListener('change', updatePreferences)
    document.addEventListener('visibilitychange', updateVisibility)

    return () => {
      motionQuery.removeEventListener('change', updatePreferences)
      connection?.removeEventListener('change', updatePreferences)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  return { isPageVisible, isPowerSaving }
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('welcome')
  const [activity, setActivity] = useState<ActivityKind | null>(null)
  const [selectedDeity, setSelectedDeity] = useState<DeityId>('ganesha')
  const [deityIndex, setDeityIndex] = useState(0)
  const [burningProgress, setBurningProgress] = useState(0)
  const [burningDigits, setBurningDigits] = useState<string[] | null>(null)
  const [revealedDigitCount, setRevealedDigitCount] = useState(0)
  const [result, setResult] = useState<LuckyResult | null>(null)
  const [lineSession, setLineSession] = useState<LiffSession>({ mode: 'guest' })
  const [lineStatus, setLineStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [toast, setToast] = useState('')
  const [shouldLoadWelcomeVideo, setShouldLoadWelcomeVideo] = useState(false)
  const resultPromiseRef = useRef<Promise<LuckyResult> | null>(null)
  const revealRequestedRef = useRef(false)
  const completionRequestedRef = useRef(false)
  const ritualElapsedRef = useRef(0)
  const mountedRef = useRef(true)
  const sessionId = useMemo(() => getSessionId(), [])
  const { isPageVisible, isPowerSaving } = useRuntimePreferences()

  useEffect(() => {
    void initializeLiff().then((session) => {
      if (mountedRef.current) setLineSession(session)
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (screen !== 'welcome' || isPowerSaving || !isPageVisible) {
      setShouldLoadWelcomeVideo(false)
      return
    }

    const timeoutId = window.setTimeout(() => setShouldLoadWelcomeVideo(true), 450)
    return () => window.clearTimeout(timeoutId)
  }, [isPageVisible, isPowerSaving, screen])

  useEffect(() => {
    if (!toast) return
    const timeoutId = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  const completeRitual = useCallback(async () => {
    try {
      const resultPromise = resultPromiseRef.current ?? generateLuckyResult(campaignConfig)
      const nextResult = await resultPromise

      void saveActivityRecord({
        id: `${sessionId}-${Date.now()}`,
        userId: lineSession.profile?.userId ?? sessionId,
        sessionId,
        userDisplayName: lineSession.profile?.displayName,
        userPictureUrl: lineSession.profile?.pictureUrl,
        userMode: lineSession.mode,
        deity: selectedDeity,
        activity: 'luck',
        type: 'lucky_incense',
        result: nextResult.digits.join(''),
        digitLength: nextResult.digits.length,
        createdAt: new Date().toISOString(),
        lineMessageSent: false,
        lineLiftSynced: false,
      }, lineSession.accessToken).catch(() => {
        if (import.meta.env.DEV) console.warn('[activity] could not save history')
      })

      if (mountedRef.current) {
        setResult(nextResult)
        setScreen('result')
      }
    } catch {
      if (mountedRef.current) {
        setScreen('incense-idle')
        setToast('ลองเริ่มพิธีอีกครั้ง')
      }
    }
  }, [lineSession.accessToken, lineSession.mode, lineSession.profile?.displayName, lineSession.profile?.pictureUrl, lineSession.profile?.userId, selectedDeity, sessionId])

  useEffect(() => {
    if (screen !== 'incense-burning' || !isPageVisible) return

    const startedAt = performance.now() - ritualElapsedRef.current
    let animationFrame = 0
    let lastProgressUpdate = 0
    let lastDigitCount = -1

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / campaignConfig.ritualDurationMs)
      if (now - lastProgressUpdate >= 100 || progress >= 1) {
        lastProgressUpdate = now
        setBurningProgress(progress)
      }

      const nextDigitCount = progress < 0.42 ? 0 : progress < 0.62 ? 1 : progress < 0.82 ? 2 : 3
      if (nextDigitCount !== lastDigitCount) {
        lastDigitCount = nextDigitCount
        setRevealedDigitCount(nextDigitCount)
      }

      if (progress >= 0.35 && !revealRequestedRef.current && resultPromiseRef.current) {
        revealRequestedRef.current = true
        void resultPromiseRef.current.then((nextResult) => {
          if (mountedRef.current) setBurningDigits(nextResult.digits)
        })
      }

      if (progress >= 1) {
        if (!completionRequestedRef.current) {
          completionRequestedRef.current = true
          void completeRitual()
        }
        return
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => {
      ritualElapsedRef.current = Math.min(campaignConfig.ritualDurationMs, performance.now() - startedAt)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [completeRitual, isPageVisible, screen])

  const currentAsset = screen === 'welcome' ? assetConfig.welcome :
    screen === 'activity' || screen === 'wish-placeholder' || screen === 'deity'
      ? assetConfig.templeTransition
      : assetConfig.luckyIncense

  const incenseDigits = burningDigits
    ? burningDigits.map((digit, index) => index < revealedDigitCount ? digit : '?')
    : ['?', '?', '?']
  const isVideoAllowed = isPageVisible && !isPowerSaving
  const showWelcomeVideo = screen === 'welcome' && shouldLoadWelcomeVideo && isVideoAllowed
  const showIncenseVideo = screen === 'incense-burning' && isVideoAllowed
  const activeParticles = particles.slice(0, isPowerSaving ? 3 : 6)

  function selectActivity(nextActivity: ActivityKind) {
    setActivity(nextActivity)
    setScreen('deity')
  }

  function startLuckyFlow() {
    setActivity('luck')
    setScreen('deity')
  }

  function selectDeity(nextIndex: number) {
    const nextDeity = deityConfig[nextIndex]
    setDeityIndex(nextIndex)
    setSelectedDeity(nextDeity.id)
  }

  function moveDeity(direction: -1 | 1) {
    const nextIndex = (deityIndex + direction + deityConfig.length) % deityConfig.length
    selectDeity(nextIndex)
  }

  function beginCeremony() {
    if (!activity) return
    if (activity === 'wish') {
      setScreen('wish-placeholder')
      return
    }

    setBurningProgress(0)
    setBurningDigits(null)
    setRevealedDigitCount(0)
    setSaved(false)
    setToast('')
    ritualElapsedRef.current = 0
    revealRequestedRef.current = false
    completionRequestedRef.current = false
    resultPromiseRef.current = generateLuckyResult(campaignConfig)
    setScreen('incense-idle')
  }

  function startRitual() {
    if (screen !== 'incense-idle') return
    setBurningProgress(0)
    setBurningDigits(null)
    setRevealedDigitCount(0)
    ritualElapsedRef.current = 0
    revealRequestedRef.current = false
    completionRequestedRef.current = false
    resultPromiseRef.current = generateLuckyResult(campaignConfig)
    setScreen('incense-burning')
  }

  async function saveBlessing() {
    if (!result || isSaving || saved) return
    setIsSaving(true)
    await new Promise((resolve) => window.setTimeout(resolve, 420))
    setIsSaving(false)
    setSaved(true)
    setToast('บันทึกพรแล้ว')
  }

  async function shareToLine() {
    if (!result || lineStatus === 'pending') return
    setLineStatus('pending')
    const sent = await sendResultToLine(lineSession, result, brandConfig.brandName)
    if (!mountedRef.current) return
    setLineStatus(sent ? 'success' : 'error')
  }

  function resetCeremony() {
    setActivity(null)
    setResult(null)
    setBurningDigits(null)
    setBurningProgress(0)
    setRevealedDigitCount(0)
    setLineStatus('idle')
    setSaved(false)
    setToast('')
    ritualElapsedRef.current = 0
    setScreen('welcome')
  }

  function goBack() {
    if (screen === 'activity') setScreen('welcome')
    if (screen === 'deity') setScreen('welcome')
    if (screen === 'incense-idle') setScreen('deity')
    if (screen === 'wish-placeholder') setScreen('deity')
  }

  const screenNumber = screen === 'welcome' ? '01' : screen === 'activity' || screen === 'deity' ? '02' : screen === 'wish-placeholder' ? '03' : screen === 'result' ? '04' : '03'
  const isRitual = screen === 'incense-idle' || screen === 'incense-burning'

  return (
    <main className={`app-shell scene-${screen} mode-${lineSession.mode} ${isPowerSaving ? 'is-power-saving' : ''} ${isPageVisible ? '' : 'is-page-hidden'}`}>
      <div className="scene-stage">
        <ImageLayer src={currentAsset} alt="บรรยากาศศรีคเนศ เทวาลัย" />
        {showWelcomeVideo && <VideoLayer src={assetConfig.welcomeVideo} poster={assetConfig.welcome} loop />}
        {showIncenseVideo && <VideoLayer src={assetConfig.luckyIncenseBurningVideo} poster={assetConfig.luckyIncense} />}
        <div className="scene-vignette" />
        <div className="scene-wash" />
        <div className="particle-field" aria-hidden="true">
          {activeParticles.map((particle) => (
            <span
              className="particle"
              key={particle.id}
              style={{
                left: particle.left,
                top: particle.top,
                animationDelay: particle.delay,
                animationDuration: particle.duration,
              }}
            />
          ))}
        </div>
        <div className="smoke-layer smoke-layer-one" aria-hidden="true" />
        <div className="smoke-layer smoke-layer-two" aria-hidden="true" />

        <header className="app-topbar">
          <button
            aria-label="ย้อนกลับ"
            className={`icon-button back-button ${screen === 'welcome' || screen === 'incense-burning' || screen === 'result' ? 'is-hidden' : ''}`}
            onClick={goBack}
            type="button"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <span className="step-count">{screenNumber}</span>
          <span className="brand-mark">เทวาลัย</span>
          <button
            aria-label={soundEnabled ? 'ปิดเสียง' : 'เปิดเสียง'}
            className="icon-button sound-button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
            type="button"
          >
            <span aria-hidden="true">{soundEnabled ? '◉' : '◌'}</span>
          </button>
        </header>

        <section className="screen-content" key={screen}>
          {screen === 'welcome' && <WelcomeScreen onContinue={startLuckyFlow} />}
          {screen === 'activity' && <ActivityScreen selected={activity} onSelect={selectActivity} />}
          {screen === 'deity' && (
            <DeityScreen
              activeIndex={deityIndex}
              onMove={moveDeity}
              onSelect={selectDeity}
              onContinue={beginCeremony}
              playVideo={isVideoAllowed}
            />
          )}
          {isRitual && (
            <IncenseScreen
              burning={screen === 'incense-burning'}
              digits={incenseDigits}
              progress={burningProgress}
              onStart={startRitual}
            />
          )}
          {screen === 'wish-placeholder' && <WishPlaceholder onReset={resetCeremony} />}
          {screen === 'result' && result && (
            <ResultScreen
              result={result}
              saved={saved}
              saving={isSaving}
              onSave={saveBlessing}
              onLine={shareToLine}
              onReset={resetCeremony}
            />
          )}
        </section>

        {isRitual && screen === 'incense-burning' && (
          <div className="ritual-progress" aria-label={`ความคืบหน้าการจุดธูป ${Math.round(burningProgress * 100)} เปอร์เซ็นต์`}>
            <span style={{ transform: `scaleX(${burningProgress})` }} />
          </div>
        )}
      </div>

      {lineStatus !== 'idle' && (
        <LineModal status={lineStatus} mode={lineSession.mode} onClose={() => setLineStatus('idle')} onRetry={shareToLine} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  )
}

function ImageLayer({ src, alt }: { src: string; alt: string }) {
  return <img className="scene-image" src={src} alt={alt} decoding="async" fetchPriority="high" onError={(event) => { event.currentTarget.style.opacity = '0' }} />
}

function VideoLayer({ src, poster, loop = false }: { src: string; poster: string; loop?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Safari sometimes ignores autoplay for a video inserted after the first render.
    // Reinforce the muted inline state, then retry when enough media data is available.
    const startPlayback = () => {
      video.muted = true
      video.defaultMuted = true
      video.volume = 0
      void video.play().catch(() => undefined)
    }

    setIsPlaying(false)
    startPlayback()
    video.addEventListener('loadeddata', startPlayback)
    video.addEventListener('canplay', startPlayback)

    return () => {
      video.removeEventListener('loadeddata', startPlayback)
      video.removeEventListener('canplay', startPlayback)
    }
  }, [src])

  return (
    <video
      autoPlay
      className={`scene-video ${isPlaying ? 'is-playing' : 'is-pending'}`}
      disablePictureInPicture
      loop={loop}
      muted
      onPlaying={() => setIsPlaying(true)}
      playsInline
      poster={poster}
      preload="metadata"
      ref={videoRef}
      src={src}
      aria-hidden="true"
    />
  )
}

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="screen-copy intro-copy">
      <p className="eyebrow">เสี่ยงโชค</p>
      <h1>ศรีคเนศ เทวาลัย</h1>
      <p className="copy-note">ตั้งจิต แล้วเริ่มการขอโชค</p>
      <button className="primary-button" onClick={onContinue} type="button">เริ่มการขอโชค</button>
    </div>
  )
}

function ActivityScreen({ selected, onSelect }: { selected: ActivityKind | null; onSelect: (activity: ActivityKind) => void }) {
  return (
    <div className="screen-copy activity-copy">
      <p className="eyebrow">เลือกเส้นทาง</p>
      <h1>วันนี้ลูกพ่อต้องการอะไร</h1>
      <div className="choice-row choice-row-single" role="group" aria-label="เลือกกิจกรรม">
        <button className={`choice-button ${selected === 'luck' ? 'is-selected' : ''}`} onClick={() => onSelect('luck')} type="button">เสี่ยงโชค</button>
      </div>
    </div>
  )
}

function DeityScreen({ activeIndex, onMove, onSelect, onContinue, playVideo }: { activeIndex: number; onMove: (direction: -1 | 1) => void; onSelect: (index: number) => void; onContinue: () => void; playVideo: boolean }) {
  const pointerStart = useRef<number | null>(null)
  const didDrag = useRef(false)
  const [dragOffset, setDragOffset] = useState(0)

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerStart.current = event.clientX
    didDrag.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerStart.current === null) return
    const distance = Math.max(-96, Math.min(96, event.clientX - pointerStart.current))
    if (Math.abs(distance) > 8) didDrag.current = true
    setDragOffset(distance)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerStart.current === null) return
    const distance = event.clientX - pointerStart.current
    pointerStart.current = null
    setDragOffset(0)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (Math.abs(distance) > 34) onMove(distance < 0 ? 1 : -1)
  }

  function handlePointerCancel() {
    pointerStart.current = null
    setDragOffset(0)
  }

  function handleCardClick(index: number) {
    if (didDrag.current) {
      didDrag.current = false
      return
    }
    onSelect(index)
  }

  const dragStyle = {
    '--drag-offset': `${dragOffset}px`,
    '--side-pull': `${dragOffset * 0.45}px`,
  } as CSSProperties

  return (
    <div className="deity-layout">
      <div
        className={`deity-stage ${dragOffset !== 0 ? 'is-dragging' : ''}`}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={dragStyle}
      >
        <button className="carousel-arrow carousel-arrow-left" aria-label="องค์ก่อนหน้า" onClick={() => onMove(-1)} type="button">‹</button>
        {deityConfig.map((deity, index) => {
          const position = index === activeIndex ? 'is-center' : index === (activeIndex + 1) % deityConfig.length ? 'is-right' : 'is-left'
          return (
            <button
              aria-label={`เลือก${deity.label}`}
              aria-pressed={index === activeIndex}
              className={`deity-card ${position}`}
              key={deity.id}
              onClick={() => handleCardClick(index)}
              type="button"
            >
              {playVideo && index === activeIndex && deity.video ? (
                <video
                  aria-hidden="true"
                  autoPlay
                  className="deity-card-media"
                  loop
                  muted
                  playsInline
                  poster={deity.image}
                  preload="metadata"
                  src={deity.video}
                />
              ) : (
                <img className="deity-card-media" src={deity.image} alt={deity.label} decoding="async" />
              )}
              <span>{deity.label}</span>
            </button>
          )
        })}
        <button className="carousel-arrow carousel-arrow-right" aria-label="องค์ถัดไป" onClick={() => onMove(1)} type="button">›</button>
        <div className="halo" aria-hidden="true" />
      </div>
      <div className="screen-copy deity-copy">
        <h1>วันนี้ขอโชคจากองค์ใด</h1>
        <p className="selected-deity">{deityConfig[activeIndex].label}</p>
        <button className="primary-button" onClick={onContinue} type="button">เริ่มพิธี</button>
      </div>
    </div>
  )
}

function IncenseScreen({ burning, digits, progress, onStart }: { burning: boolean; digits: string[]; progress: number; onStart: () => void }) {
  return (
    <div className="incense-layout">
      <div className={`incense-focus ${burning ? 'is-burning' : ''}`} aria-label="ธูปเสี่ยงโชค">
        <div className="incense-flame" aria-hidden="true" />
        <div className="incense-smoke incense-smoke-one" aria-hidden="true" />
        <div className="incense-smoke incense-smoke-two" aria-hidden="true" />
        <div className="incense-digit-stack" aria-label="เลขบนธูปเรียงแนวตั้ง">
          {digits.map((digit, index) => <span className={digit === '?' ? 'is-pending' : 'is-revealed'} key={`${digit}-${index}`}>{digit}</span>)}
        </div>
      </div>
      <div className="screen-copy incense-copy">
        <p className="eyebrow">{burning ? 'กำลังอธิษฐาน...' : 'อธิษฐานเงียบ ๆ'}</p>
        <h1>{burning ? 'กำลังเปิดเผยเลขมงคล...' : 'จุดธูปขอโชค'}</h1>
        <button className="primary-button" disabled={burning} onClick={onStart} type="button">
          {burning ? `${Math.max(1, Math.ceil((1 - progress) * 10))} วินาที` : 'จุดธูป'}
        </button>
      </div>
    </div>
  )
}

function WishPlaceholder({ onReset }: { onReset: () => void }) {
  return (
    <div className="screen-copy wish-copy">
      <p className="eyebrow">คำอวยพรประจำวัน</p>
      <h1>ขอให้พร เปิดทาง</h1>
      <p className="copy-note">หน้าผลลัพธ์สำหรับกิจกรรมขอพรจะเชื่อมต่อในขั้นถัดไป</p>
      <button className="primary-button" onClick={onReset} type="button">เริ่มใหม่</button>
    </div>
  )
}

function ResultScreen({ result, saved, saving, onSave, onLine, onReset }: { result: LuckyResult; saved: boolean; saving: boolean; onSave: () => void; onLine: () => void; onReset: () => void }) {
  return (
    <div className="result-layout">
      <div className="result-plaque" aria-label={`เลขมงคล ${result.digits.join(' ')}`}>
        {result.digits.map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}
      </div>
      <div className="screen-copy result-copy">
        <p className="eyebrow">พรประจำวัน</p>
        <h1>เลขมงคลของคุณ</h1>
        <p className="blessing-line">โชคเปิดทาง</p>
        <button className="primary-button" disabled={saving} onClick={onSave} type="button">{saving ? 'กำลังบันทึก...' : saved ? 'บันทึกแล้ว' : 'บันทึกพร'}</button>
        <div className="result-actions">
          <button className="text-button" onClick={onLine} type="button">รับผลผ่าน LINE</button>
          <button className="text-button" onClick={onReset} type="button">เริ่มใหม่</button>
        </div>
      </div>
    </div>
  )
}

function LineModal({ status, mode, onClose, onRetry }: { status: 'pending' | 'success' | 'error'; mode: 'guest' | 'line'; onClose: () => void; onRetry: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const content = status === 'pending'
    ? { title: 'กำลังเชื่อมต่อ LINE', body: 'กำลังเตรียมส่งคำอวยพรของคุณ...' }
    : status === 'success'
      ? { title: 'ส่งคำอวยพรแล้ว', body: 'ผลของคุณถูกส่งกลับไปที่ LINE แล้ว' }
      : { title: 'ยังเชื่อมต่อ LINE ไม่สำเร็จ', body: mode === 'guest' ? 'คุณกำลังใช้งานแบบ Guest ผลยังอยู่บนหน้านี้' : 'ลองเชื่อมต่ออีกครั้งได้เลย' }

  useEffect(() => {
    closeButtonRef.current?.focus()
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'pending') onClose()
    }
    window.addEventListener('keydown', closeWithEscape)
    return () => window.removeEventListener('keydown', closeWithEscape)
  }, [onClose, status])

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="line-modal" role="dialog" aria-modal="true" aria-labelledby="line-title">
        <span className="modal-neon" aria-hidden="true" />
        <p className="eyebrow">ศรีคเนศ เทวาลัย</p>
        <h2 id="line-title">{content.title}</h2>
        <p>{content.body}</p>
        {status === 'pending' && <div className="modal-loader" aria-hidden="true" />}
        <div className="modal-actions">
          {status === 'error' && <button className="primary-button" onClick={onRetry} type="button">ลองใหม่</button>}
          <button className="text-button" disabled={status === 'pending'} onClick={onClose} ref={closeButtonRef} type="button">{status === 'success' ? 'ปิด' : 'ใช้งานต่อแบบ Guest'}</button>
        </div>
      </section>
    </div>
  )
}

export default App
