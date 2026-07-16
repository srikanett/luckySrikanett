import type { LuckyResult } from '../types/ceremony'

let liffClientPromise: ReturnType<typeof importLiffClient> | undefined

function importLiffClient() {
  return import('@line/liff').then(({ default: liff }) => liff)
}

function getLiffClient() {
  liffClientPromise ??= importLiffClient()
  return liffClientPromise
}

export interface LiffSession {
  mode: 'guest' | 'line'
  profile?: { userId: string; displayName?: string; pictureUrl?: string }
  accessToken?: string
}

export async function initializeLiff(): Promise<LiffSession> {
  const liffId = import.meta.env.VITE_LIFF_ID
  if (!liffId) return { mode: 'guest' }

  try {
    const liff = await getLiffClient()
    await liff.init({ liffId })
    if (!liff.isLoggedIn()) return { mode: 'guest' }
    const accessToken = liff.getAccessToken()
    return {
      mode: 'line',
      profile: await liff.getProfile(),
      ...(accessToken ? { accessToken } : {}),
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[liff] unavailable, using guest mode', error)
    return { mode: 'guest' }
  }
}

export async function sendResultToLine(session: LiffSession, result: LuckyResult, brandName: string) {
  if (session.mode !== 'line') return false

  try {
    const liff = await getLiffClient()
    if (!liff.isInClient()) return false
    await liff.sendMessages([{ type: 'text', text: `${brandName}\nเลขมงคลของคุณ: ${result.digits.join('')}` }])
    return true
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[liff] sendMessages failed', error)
    return false
  }
}
