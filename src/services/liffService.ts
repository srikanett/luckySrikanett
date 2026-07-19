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
    if (!accessToken) return { mode: 'guest' }
    return {
      mode: 'line',
      profile: await liff.getProfile(),
      accessToken,
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[liff] unavailable, using guest mode', error)
    return { mode: 'guest' }
  }
}

export async function sendResultToLine(session: LiffSession, result: LuckyResult, brandName: string, imageUrl?: string) {
  if (session.mode !== 'line') return false

  try {
    const liff = await getLiffClient()
    if (!liff.isInClient()) return false
    const bonusLine = result.bonusDigits ? `\nเลข 2 ตัว: ${result.bonusDigits.join('')}` : ''
    const messages: Parameters<typeof liff.sendMessages>[0] = [
      { type: 'text', text: `${brandName}\nเลขมงคลของคุณ: ${result.digits.join('')}${bonusLine}` },
    ]
    if (imageUrl) {
      messages.unshift({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
      })
    }
    await liff.sendMessages(messages)
    return true
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[liff] sendMessages failed', error)
    return false
  }
}
