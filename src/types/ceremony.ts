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
  createdAt: string
  campaignId: string
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
  provider: 'beam'
  amount: number
  currency: 'THB'
  status: DonationStatus
  paymentReference?: string
  createdAt: string
  paidAt?: string
}
