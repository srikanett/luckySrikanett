export type ActivityKind = 'wish' | 'luck'

export type DeityId = 'ganesha' | 'lakshmi'

export type AppScreen =
  | 'welcome'
  | 'activity'
  | 'deity'
  | 'incense-idle'
  | 'incense-burning'
  | 'wish-placeholder'
  | 'result'

export interface LuckyResult {
  digits: string[]
  bonusDigits?: string[]
  drawId?: string
  createdAt: string
  campaignId: string
}

export type LuckyDrawStatus = 'awaiting_choice' | 'payment_pending' | 'paid' | 'free_completed'

export interface LuckyDraw {
  drawId: string
  drawToken: string
  status: LuckyDrawStatus
  previewDigits: string[]
  threeDigitResult?: string[]
  twoDigitResult?: string[]
  qrImageBase64?: string
  qrExpiresAt?: string
  amount: number
  deity: DeityId
  lineCardSent?: boolean
  cardImageUrl?: string
  createdAt: string
}

export interface ActivityRecord {
  id: string
  userId: string
  sessionId: string
  userDisplayName?: string
  userPictureUrl?: string
  userMode: 'guest' | 'line'
  deity: DeityId
  activity: ActivityKind
  type: 'lucky_incense' | 'wish_placeholder'
  result: string
  bonusResult?: string
  digitLength: number
  createdAt: string
  lineMessageSent: boolean
  lineLiftSynced: boolean
}

export type DonationStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'

export interface DonationRecord {
  id: string
  userId: string
  activityId?: string
  drawId?: string
  provider: 'beam'
  amount: number
  currency: 'THB'
  status: DonationStatus
  paymentReference?: string
  createdAt: string
  paidAt?: string
}

export interface AdminLuckyDrawRecord {
  drawId: string
  userId: string
  userMode: 'guest' | 'line'
  userDisplayName: string
  deity: DeityId
  status: LuckyDrawStatus
  threeDigitResult: string
  twoDigitResult: string
  currentChargeId?: string
  amount: number
  createdAt: string
  updatedAt: string
  paidAt?: string
  qrExpiresAt?: string
  lineCardSent: boolean
}
