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
  deity: DeityId
  activity: ActivityKind
  type: 'lucky_incense' | 'wish_placeholder'
  result: string
  digitLength: number
  createdAt: string
  lineMessageSent: boolean
  lineLiftSynced: boolean
}
