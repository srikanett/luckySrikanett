import deityLakshmiImage from '../assets/optimized/deity-lakshmi.webp'
import incenseImage from '../assets/optimized/lucky-incense.webp'
import templeTransitionImage from '../assets/optimized/temple-transition.webp'
import welcomeImage from '../assets/optimized/welcome-temple.webp'
import type { DeityId } from '../types/ceremony'

export const assetConfig = {
  welcome: welcomeImage,
  welcomeVideo: '/videos/welcome-temple-mobile.mp4',
  templeTransition: templeTransitionImage,
  luckyIncense: incenseImage,
  luckyIncenseBurningVideo: '/videos/lucky-incense-burning-mobile.mp4',
} as const

export const deityConfig: Array<{ id: DeityId; label: string; image: string }> = [
  {
    id: 'ganesha',
    label: 'องค์พ่อประทานโชค',
    image: '/images/deity-ganesha-card.webp',
  },
  { id: 'lakshmi', label: 'พระแม่ประทานทรัพย์', image: deityLakshmiImage },
]
