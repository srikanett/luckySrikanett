import type { LuckyResult } from '../types/ceremony'

interface LiffClient {
  init(options: { liffId: string }): Promise<void>
  isLoggedIn(): boolean
  isInClient?(): boolean
  login?(): void
  getProfile?(): Promise<{ userId: string; displayName?: string; pictureUrl?: string }>
  sendMessages?(messages: Array<{ type: 'text'; text: string }>): Promise<void>
}

declare global {
  interface Window {
    liff?: LiffClient
  }
}

export interface LiffSession {
  mode: 'guest' | 'line'
  profile?: { userId: string; displayName?: string; pictureUrl?: string }
}

export async function initializeLiff(): Promise<LiffSession> {
  const liffId = import.meta.env.VITE_LIFF_ID
  const liff = typeof window !== 'undefined' ? window.liff : undefined
  if (!liffId || !liff) return { mode: 'guest' }

  try {
    await liff.init({ liffId })
    if (!liff.isLoggedIn() || !liff.getProfile) return { mode: 'guest' }
    return { mode: 'line', profile: await liff.getProfile() }
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[liff] unavailable, using guest mode', error)
    return { mode: 'guest' }
  }
}

export async function sendResultToLine(session: LiffSession, result: LuckyResult, brandName: string) {
  const liff = typeof window !== 'undefined' ? window.liff : undefined
  if (session.mode !== 'line' || !liff?.sendMessages) return false

  try {
    await liff.sendMessages([{ type: 'text', text: `${brandName}\nเลขมงคลของคุณ: ${result.digits.join('')}` }])
    return true
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[liff] sendMessages failed', error)
    return false
  }
}
