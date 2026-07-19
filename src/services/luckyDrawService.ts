import { getFirebaseEnvironment } from './firebaseService'
import type { DeityId, LuckyDraw } from '../types/ceremony'

type CallableResponse<T> = { data: T }

async function callLuckyFunction<Request, Response>(name: string, data: Request) {
  const environment = getFirebaseEnvironment()
  if (!environment) throw new Error('ระบบเสี่ยงดวงยังไม่ได้เชื่อมต่อ Firebase')

  const [{ getApp, getApps, initializeApp }, { getFunctions, httpsCallable }] = await Promise.all([
    import('firebase/app'),
    import('firebase/functions'),
  ])
  const app = getApps().length ? getApp() : initializeApp(environment)
  const callable = httpsCallable<Request, Response>(getFunctions(app, 'asia-southeast1'), name)
  return callable(data) as Promise<CallableResponse<Response>>
}

function readableError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message).replace(/^.*?:\s*/, '') : ''
  if (code.includes('permission-denied')) return message || 'รายการนี้ต้องเปิดผ่านบัญชี LINE เจ้าของรอบ'
  if (code.includes('unavailable')) return message || 'ระบบชำระเงินยังไม่พร้อม กรุณาลองอีกครั้ง'
  if (code.includes('not-found')) return 'ไม่พบรอบเสี่ยงดวงเดิม กรุณาเริ่มใหม่'
  return message || 'ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง'
}

async function unwrap<T>(operation: Promise<CallableResponse<T>>) {
  try {
    return (await operation).data
  } catch (error) {
    throw new Error(readableError(error))
  }
}

export function createLuckyDraw(input: { sessionId: string; deity: DeityId; lineAccessToken?: string }) {
  return unwrap(callLuckyFunction<typeof input, LuckyDraw>('createLuckyDraw', input))
}

export async function resumeLuckyDraw(lineAccessToken?: string) {
  const response = await unwrap(callLuckyFunction<{ lineAccessToken?: string }, { draw: LuckyDraw | null }>('resumeLuckyDraw', lineAccessToken ? { lineAccessToken } : {}))
  return response.draw
}

export function completeWithoutDonation(draw: LuckyDraw) {
  return unwrap(callLuckyFunction<{ drawId: string; drawToken: string }, LuckyDraw>('completeLuckyDrawWithoutDonation', {
    drawId: draw.drawId,
    drawToken: draw.drawToken,
  }))
}

export function createBeamQr(draw: LuckyDraw, lineAccessToken?: string) {
  return unwrap(callLuckyFunction<{ drawId: string; drawToken: string; lineAccessToken?: string }, LuckyDraw>('createBeamQr', {
    drawId: draw.drawId,
    drawToken: draw.drawToken,
    ...(lineAccessToken ? { lineAccessToken } : {}),
  }))
}

export function saveLuckyCard(draw: LuckyDraw, imageDataUrl: string) {
  return unwrap(callLuckyFunction<{ drawId: string; drawToken: string; imageDataUrl: string }, { imageUrl: string }>('saveLuckyCard', {
    drawId: draw.drawId,
    drawToken: draw.drawToken,
    imageDataUrl,
  }))
}

export function markLuckyCardSent(draw: LuckyDraw) {
  return unwrap(callLuckyFunction<{ drawId: string; drawToken: string }, { success: true }>('markLuckyCardSent', {
    drawId: draw.drawId,
    drawToken: draw.drawToken,
  }))
}

export function getLuckyDrawStatus(draw: LuckyDraw) {
  return unwrap(callLuckyFunction<{ drawId: string; drawToken: string }, LuckyDraw>('getLuckyDrawStatus', {
    drawId: draw.drawId,
    drawToken: draw.drawToken,
  }))
}
