import type { LuckyResult } from '../types/ceremony'

interface ResultConfig {
  id: string
  luckyDigitLength: number
}

function getRandomDigits(length: number) {
  const values = new Uint32Array(length)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values)
    return Array.from(values, (value) => String(value % 10))
  }

  return Array.from({ length }, () => String(Math.floor(Math.random() * 10)))
}

/** Mock boundary for the future Firebase Function that owns lucky-number generation. */
export async function generateLuckyResult(config: ResultConfig): Promise<LuckyResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 680))
  return {
    digits: getRandomDigits(config.luckyDigitLength),
    createdAt: new Date().toISOString(),
    campaignId: config.id,
  }
}
