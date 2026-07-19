import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { assetConfig, deityConfig } from './config/assetConfig'
import { brandConfig, campaignConfig } from './config/brandConfig'
import { initializeLiff, sendResultToLine } from './services/liffService'
import type { LiffSession } from './services/liffService'
import { initializeAnonymousUser } from './services/anonymousAuthService'
import { createLuckyCardImage, downloadLuckyCard } from './services/luckyCardService'
import { completeWithoutDonation, createBeamQr, createLuckyDraw, getLuckyDrawStatus, markLuckyCardSent, resumeLuckyDraw, saveLuckyCard } from './services/luckyDrawService'
import { getSessionId } from './utils/session'
import type { ActivityKind, AppScreen, DeityId, LuckyDraw, LuckyResult } from './types/ceremony'

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

// Locks the app height once LINE's in-app toolbar has settled, instead of tracking
// it live — a live-tracked height would shift the whole layout (and desync every
// position/timing-based animation) whenever the toolbar shows or hides mid-session.
function useLiffViewportHeight() {
  useEffect(() => {
    const root = document.documentElement
    const applyHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight
      root.style.setProperty('--app-vh', `${height}px`)
    }

    applyHeight()
    const settleTimeoutId = window.setTimeout(applyHeight, 400)
    window.addEventListener('orientationchange', applyHeight)

    return () => {
      window.clearTimeout(settleTimeoutId)
      window.removeEventListener('orientationchange', applyHeight)
    }
  }, [])
}

function usePreventTouchZoom() {
  useEffect(() => {
    const preventGesture = (event: Event) => event.preventDefault()
    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault()
    }

    document.addEventListener('gesturestart', preventGesture, { passive: false })
    document.addEventListener('gesturechange', preventGesture, { passive: false })
    document.addEventListener('touchmove', preventMultiTouch, { passive: false })

    return () => {
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
      document.removeEventListener('touchmove', preventMultiTouch)
    }
  }, [])
}

function App() {
  useLiffViewportHeight()
  usePreventTouchZoom()
  const [screen, setScreen] = useState<AppScreen>('welcome')
  const [activity, setActivity] = useState<ActivityKind | null>(null)
  const [selectedDeity, setSelectedDeity] = useState<DeityId>('ganesha')
  const [deityIndex, setDeityIndex] = useState(0)
  const [burningProgress, setBurningProgress] = useState(0)
  const [draw, setDraw] = useState<LuckyDraw | null>(null)
  const [ritualPhase, setRitualPhase] = useState<'initial' | 'paid-three' | 'paid-two'>('initial')
  const [showDonationModal, setShowDonationModal] = useState(false)
  const [paymentChoice, setPaymentChoice] = useState<'donate' | 'free' | null>(null)
  const [paymentState, setPaymentState] = useState<'idle' | 'loading' | 'waiting' | 'error'>('idle')
  const [paymentError, setPaymentError] = useState('')
  const [isStartingRitual, setIsStartingRitual] = useState(false)
  const [videoVersion, setVideoVersion] = useState(0)
  const [result, setResult] = useState<LuckyResult | null>(null)
  const [lineSession, setLineSession] = useState<LiffSession>({ mode: 'guest' })
  const [lineStatus, setLineStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [toast, setToast] = useState('')
  const [shouldLoadWelcomeVideo, setShouldLoadWelcomeVideo] = useState(false)
  const mountedRef = useRef(true)
  const liffStartedRef = useRef(false)
  const paidRevealStartedRef = useRef(false)
  const cardDeliveryRef = useRef(false)
  const cardCacheRef = useRef<{ drawId: string; imageDataUrl: string } | null>(null)
  const revealSequenceRef = useRef(0)
  const activeDrawRef = useRef<LuckyDraw | null>(null)
  activeDrawRef.current = draw
  const sessionId = useMemo(() => getSessionId(), [])
  const { isPageVisible, isPowerSaving } = useRuntimePreferences()

  const prepareLuckyCard = useCallback(async (paidDraw: LuckyDraw) => {
    if (cardCacheRef.current?.drawId === paidDraw.drawId) return cardCacheRef.current.imageDataUrl
    const deity = deityConfig.find((item) => item.id === paidDraw.deity) ?? deityConfig[0]
    const imageDataUrl = await createLuckyCardImage(paidDraw, deity.image, deity.label)
    cardCacheRef.current = { drawId: paidDraw.drawId, imageDataUrl }
    return imageDataUrl
  }, [])

  const deliverLuckyCardToLine = useCallback(async (paidDraw: LuckyDraw) => {
    if (lineSession.mode !== 'line' || paidDraw.lineCardSent || cardDeliveryRef.current) return false
    cardDeliveryRef.current = true
    try {
      const imageDataUrl = await prepareLuckyCard(paidDraw)
      const imageUrl = paidDraw.cardImageUrl ?? (await saveLuckyCard(paidDraw, imageDataUrl)).imageUrl
      const sent = await sendResultToLine(lineSession, toLuckyResult(paidDraw, true), brandConfig.brandName, imageUrl)
      if (sent) await markLuckyCardSent(paidDraw)
      return sent
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[lucky-card] automatic delivery failed', error)
      return false
    } finally {
      cardDeliveryRef.current = false
    }
  }, [lineSession, prepareLuckyCard])

  useEffect(() => {
    if (liffStartedRef.current) return
    liffStartedRef.current = true
    void (async () => {
      try {
        const session = await initializeLiff()
        if (!mountedRef.current) return
        setLineSession(session)
        if (session.mode === 'guest') await initializeAnonymousUser()
        const restoredDraw = await resumeLuckyDraw(session.accessToken)
        if (!mountedRef.current || !restoredDraw) return
        setDraw(restoredDraw)
        setActivity('luck')
        setBurningProgress(1)
        if (restoredDraw.status === 'paid' && restoredDraw.threeDigitResult && restoredDraw.twoDigitResult) {
          setResult(toLuckyResult(restoredDraw, true))
          setScreen('result')
          return
        }
        setRitualPhase('initial')
        setPaymentChoice(restoredDraw.status === 'payment_pending' ? 'donate' : null)
        setPaymentState(restoredDraw.status === 'payment_pending' ? 'waiting' : 'idle')
        setShowDonationModal(true)
        setScreen('incense-burning')
      } catch (error) {
        if (import.meta.env.DEV) console.warn('[draw] could not restore active draw', error)
      }
    })()
  }, [])

  useEffect(() => {
    if (screen !== 'result' || !result?.bonusDigits || !draw || lineSession.mode !== 'line' || draw.lineCardSent) return
    void deliverLuckyCardToLine(draw).then((sent) => {
      if (sent && mountedRef.current) setToast('ส่งการ์ดเลขมงคลเข้า LINE แล้ว')
    })
  }, [deliverLuckyCardToLine, draw, lineSession.mode, result, screen])

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

  useEffect(() => {
    if (screen !== 'incense-burning' || ritualPhase !== 'initial' || !draw || showDonationModal || !isPageVisible || burningProgress >= 1) return

    const startedAt = performance.now() - (burningProgress * campaignConfig.ritualDurationMs)
    let animationFrame = 0
    let lastProgressUpdate = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / campaignConfig.ritualDurationMs)
      if (now - lastProgressUpdate >= 100 || progress >= 1) {
        lastProgressUpdate = now
        setBurningProgress(progress)
      }

      if (progress >= 1) {
        setShowDonationModal(true)
        return
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [burningProgress, draw, isPageVisible, ritualPhase, screen, showDonationModal])

  const runPaidReveal = useCallback(async (paidDraw: LuckyDraw) => {
    if (!paidDraw.threeDigitResult || !paidDraw.twoDigitResult || paidRevealStartedRef.current) return
    paidRevealStartedRef.current = true
    const sequence = ++revealSequenceRef.current
    setShowDonationModal(false)
    setPaymentState('idle')
    setRitualPhase('paid-three')
    setBurningProgress(1)
    setVideoVersion((version) => version + 1)
    setScreen('incense-burning')

    await new Promise((resolve) => window.setTimeout(resolve, isPowerSaving ? 500 : 1900))
    if (!mountedRef.current || revealSequenceRef.current !== sequence) return
    setRitualPhase('paid-two')
    setVideoVersion((version) => version + 1)

    await new Promise((resolve) => window.setTimeout(resolve, isPowerSaving ? 500 : 1900))
    if (!mountedRef.current || revealSequenceRef.current !== sequence) return
    setResult(toLuckyResult(paidDraw, true))
    setScreen('result')
    paidRevealStartedRef.current = false
  }, [isPowerSaving])

  const pollingDrawId = draw?.drawId
  const pollingDrawToken = draw?.drawToken
  const pollingDrawStatus = draw?.status

  useEffect(() => {
    if (!pollingDrawId || !pollingDrawToken || pollingDrawStatus !== 'payment_pending' || !showDonationModal || !isPageVisible) return
    let cancelled = false

    async function refreshPayment() {
      try {
        const currentDraw = activeDrawRef.current
        if (!currentDraw) return
        const latestDraw = await getLuckyDrawStatus(currentDraw)
        if (cancelled || !mountedRef.current) return
        setDraw(latestDraw)
        if (latestDraw.status === 'paid') {
          void runPaidReveal(latestDraw)
        } else if (!latestDraw.qrImageBase64) {
          setPaymentState('idle')
        }
      } catch (error) {
        if (!cancelled && import.meta.env.DEV) console.warn('[draw] payment status unavailable', error)
      }
    }

    void refreshPayment()
    const timer = window.setInterval(() => void refreshPayment(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isPageVisible, pollingDrawId, pollingDrawStatus, pollingDrawToken, runPaidReveal, showDonationModal])

  const currentAsset = screen === 'welcome' ? assetConfig.welcome :
    screen === 'activity' || screen === 'wish-placeholder' || screen === 'deity'
      ? assetConfig.templeTransition
      : assetConfig.luckyIncense

  const incenseDigits = ritualPhase === 'paid-three'
    ? draw?.threeDigitResult ?? ['?', '?', '?']
    : ritualPhase === 'paid-two'
      ? draw?.twoDigitResult ?? ['?', '?']
      : draw
        ? [burningProgress >= 0.42 ? draw.previewDigits[0] : '?', burningProgress >= 0.7 ? draw.previewDigits[1] : '?', '?']
        : ['?', '?', '?']
  const isVideoAllowed = isPageVisible && !isPowerSaving
  const showWelcomeVideo = screen === 'welcome' && shouldLoadWelcomeVideo && isVideoAllowed
  const showIncenseVideo = screen === 'incense-burning' && isVideoAllowed && !showDonationModal
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
    setDraw(null)
    setRitualPhase('initial')
    setShowDonationModal(false)
    setPaymentChoice(null)
    setPaymentState('idle')
    setSaved(false)
    setToast('')
    setScreen('incense-idle')
  }

  async function startRitual() {
    if (screen !== 'incense-idle' || isStartingRitual) return
    setIsStartingRitual(true)
    setBurningProgress(0)
    setRitualPhase('initial')
    setShowDonationModal(false)
    setPaymentChoice(null)
    setPaymentError('')
    setScreen('incense-burning')
    try {
      if (lineSession.mode === 'guest') await initializeAnonymousUser()
      const nextDraw = await createLuckyDraw({
        sessionId,
        deity: selectedDeity,
        ...(lineSession.accessToken ? { lineAccessToken: lineSession.accessToken } : {}),
      })
      if (!mountedRef.current) return
      setDraw(nextDraw)
      setVideoVersion((version) => version + 1)
      if (nextDraw.status === 'payment_pending') {
        setBurningProgress(1)
        setPaymentChoice('donate')
        setPaymentState('waiting')
        setShowDonationModal(true)
      }
    } catch (error) {
      if (mountedRef.current) {
        setScreen('incense-idle')
        setToast(error instanceof Error ? error.message : 'ลองเริ่มพิธีอีกครั้ง')
      }
    } finally {
      if (mountedRef.current) setIsStartingRitual(false)
    }
  }

  async function chooseDonation() {
    if (!draw || paymentState === 'loading') return
    setPaymentChoice('donate')
    setPaymentState('loading')
    setPaymentError('')
    try {
      if (lineSession.mode === 'guest') await initializeAnonymousUser()
      const nextDraw = await createBeamQr(draw, lineSession.accessToken)
      if (!mountedRef.current) return
      setDraw(nextDraw)
      if (nextDraw.status === 'paid') {
        void runPaidReveal(nextDraw)
        return
      }
      setPaymentState('waiting')
    } catch (error) {
      if (!mountedRef.current) return
      setPaymentState('error')
      setPaymentError(error instanceof Error ? error.message : 'สร้าง QR ไม่สำเร็จ')
    }
  }

  async function finishWithoutDonation() {
    if (!draw || paymentState === 'loading') return
    setPaymentChoice('free')
    setPaymentState('loading')
    setPaymentError('')
    try {
      const completedDraw = await completeWithoutDonation(draw)
      if (!mountedRef.current) return
      setDraw(completedDraw)
      if (completedDraw.status === 'paid') {
        void runPaidReveal(completedDraw)
        return
      }
      if (!completedDraw.twoDigitResult) return
      setShowDonationModal(false)
      setResult(toLuckyResult(completedDraw, false))
      setScreen('result')
    } catch (error) {
      if (!mountedRef.current) return
      setPaymentState('error')
      setPaymentError(error instanceof Error ? error.message : 'เปิดผลเลขไม่สำเร็จ')
    }
  }

  async function saveCard() {
    if (!result?.bonusDigits || !draw || isSaving) return
    setIsSaving(true)
    try {
      const imageDataUrl = await prepareLuckyCard(draw)
      downloadLuckyCard(imageDataUrl, draw.deity)
      setSaved(true)
      setToast('บันทึกการ์ดเลขมงคลแล้ว')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'บันทึกการ์ดไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  async function shareToLine() {
    if (!result || lineStatus === 'pending') return
    setLineStatus('pending')
    const sent = result.bonusDigits && draw
      ? await deliverLuckyCardToLine({ ...draw, lineCardSent: false })
      : await sendResultToLine(lineSession, result, brandConfig.brandName)
    if (!mountedRef.current) return
    setLineStatus(sent ? 'success' : 'error')
  }

  function resetCeremony() {
    setActivity(null)
    setResult(null)
    setDraw(null)
    setBurningProgress(0)
    setRitualPhase('initial')
    setShowDonationModal(false)
    setPaymentChoice(null)
    setPaymentState('idle')
    setLineStatus('idle')
    setSaved(false)
    setToast('')
    revealSequenceRef.current += 1
    paidRevealStartedRef.current = false
    cardCacheRef.current = null
    cardDeliveryRef.current = false
    setScreen('welcome')
  }

  function goBack() {
    if (screen === 'activity') setScreen('welcome')
    if (screen === 'deity') setScreen('welcome')
    if (screen === 'incense-idle') setScreen('deity')
    if (screen === 'wish-placeholder') setScreen('deity')
  }

  const isRitual = screen === 'incense-idle' || screen === 'incense-burning'

  return (
    <main className={`app-shell scene-${screen} mode-${lineSession.mode} ${isPowerSaving ? 'is-power-saving' : ''} ${isPageVisible ? '' : 'is-page-hidden'}`}>
      <div className="scene-stage">
        <ImageLayer src={currentAsset} alt="บรรยากาศศรีคเนศ เทวาลัย" />
        {showWelcomeVideo && <VideoLayer src={assetConfig.welcomeVideo} poster={assetConfig.welcome} loop />}
        {showIncenseVideo && <VideoLayer key={`incense-${videoVersion}`} src={assetConfig.luckyIncenseBurningVideo} poster={assetConfig.luckyIncense} />}
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
            />
          )}
          {isRitual && (
            <IncenseScreen
              burning={screen === 'incense-burning'}
              digits={incenseDigits}
              fadedDigitIndex={ritualPhase === 'initial' && burningProgress >= 0.7 ? 1 : undefined}
              phase={ritualPhase}
              progress={burningProgress}
              starting={isStartingRitual}
              onStart={startRitual}
            />
          )}
          {screen === 'wish-placeholder' && <WishPlaceholder onReset={resetCeremony} />}
          {screen === 'result' && result && (
            <ResultScreen
              result={result}
              saved={saved}
              saving={isSaving}
              showLineAction={lineSession.mode === 'line'}
              onSave={saveCard}
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
      {showDonationModal && draw && (
        <DonationModal
          choice={paymentChoice}
          draw={draw}
          error={paymentError}
          paymentState={paymentState}
          onChooseDonation={chooseDonation}
          onChooseFree={() => { setPaymentChoice('free'); setPaymentState('idle'); setPaymentError('') }}
          onConfirmFree={finishWithoutDonation}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  )
}

function toLuckyResult(draw: LuckyDraw, paid: boolean): LuckyResult {
  return {
    digits: paid ? draw.threeDigitResult ?? [] : draw.twoDigitResult ?? [],
    ...(paid && draw.twoDigitResult ? { bonusDigits: draw.twoDigitResult } : {}),
    drawId: draw.drawId,
    createdAt: draw.createdAt,
    campaignId: campaignConfig.id,
  }
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

function DeityScreen({ activeIndex, onMove, onSelect, onContinue }: { activeIndex: number; onMove: (direction: -1 | 1) => void; onSelect: (index: number) => void; onContinue: () => void }) {
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
              <img className="deity-card-media" src={deity.image} alt={deity.label} decoding="async" />
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
        <button className="primary-button" onClick={onContinue} type="button">เริ่มการเสี่ยงดวง</button>
      </div>
    </div>
  )
}

function IncenseScreen({ burning, digits, fadedDigitIndex, phase, progress, starting, onStart }: {
  burning: boolean
  digits: string[]
  fadedDigitIndex?: number
  phase: 'initial' | 'paid-three' | 'paid-two'
  progress: number
  starting: boolean
  onStart: () => void
}) {
  const revealLabel = phase === 'paid-three'
    ? 'กำลังเปิดเลข 3 ตัวให้ครบ...'
    : phase === 'paid-two'
      ? 'กำลังประทานเลข 2 ตัวอีกชุด...'
      : 'กำลังเปิดเผยเลขมงคล...'

  return (
    <div className="incense-layout">
      <div className={`incense-focus ${burning ? 'is-burning' : ''}`} aria-label="ธูปเสี่ยงโชค">
        <div className="incense-flame" aria-hidden="true" />
        <div className="incense-smoke incense-smoke-one" aria-hidden="true" />
        <div className="incense-smoke incense-smoke-two" aria-hidden="true" />
        <div className="incense-digit-stack" aria-label="เลขบนธูปเรียงแนวตั้ง">
          {digits.map((digit, index) => (
            <span className={`${digit === '?' ? 'is-pending' : 'is-revealed'}${fadedDigitIndex === index ? ' is-faded' : ''}`} key={`${digit}-${index}`}>{digit}</span>
          ))}
        </div>
      </div>
      <div className="screen-copy incense-copy">
        <p className="eyebrow">{burning ? 'กำลังอธิษฐาน...' : 'อธิษฐานเงียบ ๆ'}</p>
        <h1>{burning ? revealLabel : 'จุดธูปขอโชค'}</h1>
        <button className="primary-button" disabled={burning || starting} onClick={onStart} type="button">
          {starting ? 'กำลังเตรียมรอบ...' : burning ? phase === 'initial' ? `${Math.max(1, Math.ceil((1 - progress) * 3))} วินาที` : 'กำลังประทานเลข...' : 'จุดธูปเสี่ยงดวง'}
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

function ResultScreen({ result, saved, saving, showLineAction, onSave, onLine, onReset }: {
  result: LuckyResult
  saved: boolean
  saving: boolean
  showLineAction: boolean
  onSave: () => void
  onLine: () => void
  onReset: () => void
}) {
  return (
    <div className="result-layout">
      <div className={`result-plaque${result.bonusDigits ? ' has-bonus' : ' is-free-result'}`} aria-label={`เลขมงคล ${result.digits.join(' ')}${result.bonusDigits ? ` และ ${result.bonusDigits.join(' ')}` : ''}`}>
        <div className="result-number-group">
          <small>{result.bonusDigits ? 'เลข 3 ตัว' : 'เลข 2 ตัว'}</small>
          <div className="result-number-row result-number-row-primary">
            {result.digits.map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}
          </div>
        </div>
        {result.bonusDigits && (
          <div className="result-number-group">
            <small>เลข 2 ตัว</small>
            <div className="result-number-row result-number-row-bonus">
              {result.bonusDigits.map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}
            </div>
          </div>
        )}
      </div>
      <div className="screen-copy result-copy">
        <p className="eyebrow">พรประจำวัน</p>
        <h1>เลขมงคลของคุณ</h1>
        <p className="blessing-line">โชคเปิดทาง</p>
        {result.bonusDigits && <button className="primary-button" disabled={saving} onClick={onSave} type="button">{saving ? 'กำลังสร้างการ์ด...' : saved ? 'บันทึกการ์ดแล้ว' : 'บันทึกการ์ดเลขมงคล'}</button>}
        <div className={`result-actions${showLineAction ? '' : ' is-single'}`}>
          {showLineAction && <button className="text-button" onClick={onLine} type="button">รับผลผ่าน LINE</button>}
          <button className="text-button" onClick={onReset} type="button">เริ่มใหม่</button>
        </div>
      </div>
    </div>
  )
}

function DonationModal({ choice, draw, error, paymentState, onChooseDonation, onChooseFree, onConfirmFree }: {
  choice: 'donate' | 'free' | null
  draw: LuckyDraw
  error: string
  paymentState: 'idle' | 'loading' | 'waiting' | 'error'
  onChooseDonation: () => void
  onChooseFree: () => void
  onConfirmFree: () => void
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const hasActiveQr = Boolean(draw.qrImageBase64 && draw.qrExpiresAt && new Date(draw.qrExpiresAt).getTime() > Date.now())

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  return (
    <div className="modal-backdrop donation-backdrop" role="presentation">
      <section className="donation-modal" role="dialog" aria-modal="true" aria-labelledby="donation-title">
        <p className="eyebrow">เปิดเลขเสี่ยงดวงที่เหลือ</p>
        <h2 id="donation-title" ref={titleRef} tabIndex={-1}>รับเลขมงคลครบ 2 ชุด</h2>
        <p className="donation-copy">หากต้องการเห็นเลขที่เหลือ สนับสนุน {draw.amount.toLocaleString('th-TH')} บาท เพื่อช่วยดูแล ปรับปรุงระบบ และดูแลส่วนเทวาลัย คุณจะได้รับเลข 3 ตัวและเลข 2 ตัวอีกหนึ่งชุด หากไม่สนับสนุนจะได้รับเลขเพียง 2 หลัก</p>

        <fieldset className="donation-options">
          <legend>เลือกวิธีรับเลข</legend>
          <label className={`donation-option donation-option-paid${choice === 'donate' ? ' is-selected' : ''}`}>
            <input checked={choice === 'donate'} disabled={paymentState === 'loading'} name="donation-choice" onChange={onChooseDonation} type="radio" value="donate" />
            <span><strong>สนับสนุนเพื่อรับเลขที่เหลือ</strong><small>ชำระผ่าน QR PromptPay {draw.amount.toLocaleString('th-TH')} บาท</small></span>
          </label>
          <label className={`donation-option donation-option-free${choice === 'free' ? ' is-selected' : ''}`}>
            <input checked={choice === 'free'} disabled={paymentState === 'loading'} name="donation-choice" onChange={onChooseFree} type="radio" value="free" />
            <span><strong>ไม่สนับสนุน รับเลขสองหลัก</strong><small>เปิดเลขจางให้ชัดและจบพิธี</small></span>
          </label>
        </fieldset>

        {choice === 'donate' && (
          <div className="beam-payment" aria-live="polite">
            {draw.qrImageBase64 && hasActiveQr && <>
              <div className="beam-assurance">
                <strong>ชำระผ่านศรีคเนศ × <span>Beam</span></strong>
                <small>ปลอดภัย ตรวจรับยอดอัตโนมัติ<br />สแกน QR ไม่ต้องแนบสลิป · ยอดเข้าแล้วแจ้งทันที</small>
              </div>
              <img alt={`QR PromptPay จำนวน ${draw.amount} บาท`} className="beam-qr" src={`data:image/png;base64,${draw.qrImageBase64}`} />
              <strong className="beam-amount">ยอดชำระ {draw.amount.toLocaleString('th-TH')} บาท</strong>
              <p className="beam-save-guide">คุณสามารถแคปภาพหน้าจอ หรือกดค้างที่ QR เพื่อบันทึก และสแกนในแอปธนาคารเพื่อชำระเงินต่อไป<br />สแกนแล้วรอสักครู่ ระบบจะอัปเดตให้อัตโนมัติ</p>
            </>}
            {paymentState === 'loading' && <><div className="modal-loader" aria-hidden="true" /><p>กำลังสร้าง QR ที่ปลอดภัย...</p></>}
            {paymentState === 'waiting' && hasActiveQr && <p className="payment-waiting"><span aria-hidden="true" />รอรับผลการชำระเงิน ระบบจะเปิดเลขให้อัตโนมัติ</p>}
            {paymentState === 'error' && <p className="payment-error" role="alert">{error}</p>}
            {(!hasActiveQr && paymentState !== 'loading') && <button className="primary-button" onClick={onChooseDonation} type="button">{paymentState === 'error' ? 'ลองสร้าง QR อีกครั้ง' : 'สร้าง QR PromptPay'}</button>}
          </div>
        )}

        {choice === 'free' && <button className="primary-button free-result-button" disabled={paymentState === 'loading'} onClick={onConfirmFree} type="button">{paymentState === 'loading' ? 'กำลังเปิดเลข...' : 'ยืนยันรับเลข 2 หลัก'}</button>}
        {error && choice !== 'donate' && <p className="payment-error" role="alert">{error}</p>}
      </section>
    </div>
  )
}

function LineModal({ status, mode, onClose, onRetry }: { status: 'pending' | 'success' | 'error'; mode: 'guest' | 'line'; onClose: () => void; onRetry: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const content = status === 'pending'
    ? { title: 'กำลังเชื่อมต่อ LINE', body: 'กำลังเตรียมส่งคำอวยพรของคุณ...' }
    : status === 'success'
      ? { title: 'ส่งผลเข้า LINE แล้ว', body: 'เลขมงคลและการ์ดของคุณถูกส่งกลับไปที่ LINE แล้ว' }
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
