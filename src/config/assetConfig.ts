import deityGaneshaImage from '../assets/optimized/deity-ganesha.jpg'
import deityLakshmiImage from '../assets/optimized/deity-lakshmi.jpg'
import incenseImage from '../assets/optimized/lucky-incense.jpg'
import templeTransitionImage from '../assets/optimized/temple-transition.jpg'
import welcomeImage from '../assets/optimized/welcome-temple.jpg'
import type { DeityId } from '../types/ceremony'

export const assetConfig = {
  welcome: welcomeImage,
  welcomeVideo: '/videos/welcome-temple.mp4',
  templeTransition: templeTransitionImage,
  luckyIncense: incenseImage,
  luckyIncenseBurningVideo: '/videos/lucky-incense-burning.mp4',
} as const

export const deityConfig: Array<{ id: DeityId; label: string; image: string }> = [
  { id: 'ganesha', label: 'คเณศ', image: deityGaneshaImage },
  { id: 'lakshmi', label: 'พระแม่ให้รวย', image: deityLakshmiImage },
]
