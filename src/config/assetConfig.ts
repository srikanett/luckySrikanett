import deityLakshmiImage from '../assets/optimized/deity-lakshmi.jpg'
import incenseImage from '../assets/optimized/lucky-incense.jpg'
import templeTransitionImage from '../assets/optimized/temple-transition.jpg'
import welcomeImage from '../assets/optimized/welcome-temple.jpg'
import type { DeityId } from '../types/ceremony'

export const assetConfig = {
  welcome: welcomeImage,
  welcomeVideo: '/videos/welcome-temple-mobile.mp4',
  templeTransition: templeTransitionImage,
  luckyIncense: incenseImage,
  luckyIncenseBurningVideo: '/videos/lucky-incense-burning-mobile.mp4',
} as const

export const deityConfig: Array<{ id: DeityId; label: string; image: string; video?: string }> = [
  {
    id: 'ganesha',
    label: 'องค์พ่อประทานโชค',
    image: '/images/deity-ganesha-card.jpg',
    video: '/videos/deity-ganesha-card-mobile.mp4',
  },
  { id: 'lakshmi', label: 'พระแม่ประทานทรัพย์', image: deityLakshmiImage },
]
