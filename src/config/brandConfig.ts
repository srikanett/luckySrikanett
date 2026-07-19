export const brandConfig = {
  brandName: 'ศรีคเนศ เทวาลัย',
  campaignName: 'ขอพรเสี่ยงโชค',
} as const

export const campaignConfig = {
  id: import.meta.env.VITE_CAMPAIGN_ID || 'sri-ganesh-lucky-incense',
  luckyDigitLength: 3,
  ritualDurationMs: 3_000,
  allowGuestMode: true,
} as const
