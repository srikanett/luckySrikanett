import type { DeityId, LuckyDraw } from '../types/ceremony'

const cardWidth = 1080
const cardHeight = 1350

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('ไม่สามารถเตรียมภาพองค์เทพสำหรับการ์ดได้'))
    image.src = source
  })
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const scale = Math.max(cardWidth / image.naturalWidth, cardHeight / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.drawImage(image, (cardWidth - width) / 2, (cardHeight - height) / 2, width, height)
}

function drawNumberRow(context: CanvasRenderingContext2D, digits: string[], centerY: number, color: 'gold' | 'ruby') {
  const blockSize = color === 'gold' ? 164 : 142
  const gap = 26
  const totalWidth = digits.length * blockSize + (digits.length - 1) * gap
  const startX = (cardWidth - totalWidth) / 2

  digits.forEach((digit, index) => {
    const x = startX + index * (blockSize + gap)
    const y = centerY - blockSize / 2
    const gradient = context.createLinearGradient(x, y, x + blockSize, y + blockSize)
    if (color === 'gold') {
      gradient.addColorStop(0, '#fff0b0')
      gradient.addColorStop(0.52, '#dfa43c')
      gradient.addColorStop(1, '#8f5514')
    } else {
      gradient.addColorStop(0, '#c85275')
      gradient.addColorStop(0.55, '#7d2048')
      gradient.addColorStop(1, '#3d0d2c')
    }
    context.save()
    context.shadowColor = 'rgba(0, 0, 0, 0.65)'
    context.shadowBlur = 20
    context.shadowOffsetY = 10
    roundedRect(context, x, y, blockSize, blockSize, 32)
    context.fillStyle = gradient
    context.fill()
    context.restore()
    context.strokeStyle = color === 'gold' ? '#ffeab0' : '#e9a4ba'
    context.lineWidth = 3
    roundedRect(context, x, y, blockSize, blockSize, 32)
    context.stroke()
    context.fillStyle = color === 'gold' ? '#291303' : '#fff1dc'
    context.font = `700 ${color === 'gold' ? 102 : 86}px LINESeedSansTH, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(digit, x + blockSize / 2, y + blockSize / 2 + 5)
  })
}

export async function createLuckyCardImage(draw: LuckyDraw, imageSource: string, deityLabel: string) {
  if (!draw.threeDigitResult || !draw.twoDigitResult) throw new Error('ยังไม่มีเลขครบสำหรับสร้างการ์ด')
  await document.fonts?.ready
  const deityImage = await loadImage(imageSource)
  const canvas = document.createElement('canvas')
  canvas.width = cardWidth
  canvas.height = cardHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('อุปกรณ์นี้ไม่รองรับการสร้างการ์ด')

  drawCover(context, deityImage)
  const shade = context.createLinearGradient(0, 160, 0, cardHeight)
  shade.addColorStop(0, 'rgba(10, 2, 5, 0.06)')
  shade.addColorStop(0.43, 'rgba(10, 2, 5, 0.28)')
  shade.addColorStop(0.62, 'rgba(10, 2, 5, 0.84)')
  shade.addColorStop(1, 'rgba(18, 3, 9, 0.98)')
  context.fillStyle = shade
  context.fillRect(0, 0, cardWidth, cardHeight)

  context.strokeStyle = '#ddb65b'
  context.lineWidth = 5
  roundedRect(context, 34, 34, cardWidth - 68, cardHeight - 68, 46)
  context.stroke()
  context.strokeStyle = 'rgba(255, 235, 174, 0.42)'
  context.lineWidth = 2
  roundedRect(context, 50, 50, cardWidth - 100, cardHeight - 100, 38)
  context.stroke()

  context.textAlign = 'center'
  context.fillStyle = '#ffe8a3'
  context.font = '500 34px LINESeedSansTH, sans-serif'
  context.fillText('ศรีคเนศ เทวาลัย', cardWidth / 2, 100)

  context.save()
  roundedRect(context, 92, 720, cardWidth - 184, 548, 46)
  context.clip()
  context.filter = 'blur(18px) saturate(0.72) brightness(0.62)'
  drawCover(context, deityImage)
  context.restore()

  const panelGradient = context.createLinearGradient(92, 720, cardWidth - 92, 1268)
  panelGradient.addColorStop(0, 'rgba(75, 27, 105, 0.5)')
  panelGradient.addColorStop(0.5, 'rgba(47, 17, 78, 0.5)')
  panelGradient.addColorStop(1, 'rgba(19, 45, 40, 0.5)')
  context.fillStyle = panelGradient
  roundedRect(context, 92, 720, cardWidth - 184, 548, 46)
  context.fill()
  context.strokeStyle = 'rgba(237, 205, 121, 0.9)'
  context.lineWidth = 3
  roundedRect(context, 92, 720, cardWidth - 184, 548, 46)
  context.stroke()

  context.fillStyle = '#ffe7a3'
  context.font = '600 39px LINESeedSansTH, sans-serif'
  context.fillText('เลขเสี่ยงโชคมงคล', cardWidth / 2, 778)
  context.fillStyle = 'rgba(255, 241, 213, 0.86)'
  context.font = '400 31px LINESeedSansTH, sans-serif'
  context.fillText(deityLabel, cardWidth / 2, 824)

  context.fillStyle = '#f8dfa2'
  context.font = '500 30px LINESeedSansTH, sans-serif'
  context.fillText('เลข 3 ตัว', cardWidth / 2, 878)
  drawNumberRow(context, draw.threeDigitResult, 995, 'gold')
  context.fillStyle = '#efbad0'
  context.font = '500 29px LINESeedSansTH, sans-serif'
  context.fillText('เลข 2 ตัว', cardWidth / 2, 1115)
  drawNumberRow(context, draw.twoDigitResult, 1200, 'ruby')

  return canvas.toDataURL('image/jpeg', 0.9)
}

export function downloadLuckyCard(imageDataUrl: string, deity: DeityId) {
  const anchor = document.createElement('a')
  anchor.href = imageDataUrl
  anchor.download = `เลขมงคล-${deity}-${new Date().toISOString().slice(0, 10)}.jpg`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
