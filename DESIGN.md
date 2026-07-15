---
name: ศรีคเนศ เทวาลัย
description: Immersive dark-luxury temple experience for blessing and lucky-incense rituals.
colors:
  ink: "#050204"
  ink-soft: "#090304"
  wine-deep: "#18050A"
  wine: "#31050B"
  wine-bright: "#8F1125"
  gold-deep: "#7D531B"
  gold: "#D8A84D"
  gold-light: "#F9D989"
  sacred-light: "#FFF5DD"
  body-light: "#FFF1D2"
  fire: "#F4AD43"
  neon-pink: "#FF4397"
typography:
  display:
    fontFamily: "LINESeedSansTH, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(2rem, 9vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "normal"
  body:
    fontFamily: "LINESeedSansTH, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "LINESeedSansTH, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
rounded:
  pill: "999px"
  modal: "22px"
  card: "22px"
  focus: "4px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "32px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.gold-light}"
    textColor: "#241000"
    rounded: "{rounded.pill}"
    height: "54px"
    padding: "0 24px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.body-light}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 16px"
---

## Overview

### Creative North Star

**The Golden Temple Threshold**: ทุกหน้าจอควรรู้สึกเหมือนผู้ใช้กำลังขยับเข้าใกล้พื้นที่ศักดิ์สิทธิ์ทีละขั้น ภาพสถานที่จริงเป็นแกนกลาง ส่วนข้อความและการควบคุมลอยอยู่เหนือฉากอย่างเบาและชัดเจน

### Layout

- ใช้ full-screen visual เป็น primary experience ไม่แสดงกรอบโทรศัพท์ใน production
- วาง UI overlay เหนือภาพโดยตรง และไม่ใช้ blurred bottom panel
- รักษา safe area ด้านข้างอย่างน้อย 24px บนมือถือ และรองรับ `env(safe-area-inset-*)`
- จำกัดพื้นที่แอปไว้ที่ความกว้างสูงสุด 1024px เพื่อรักษาประสบการณ์ mobile/tablet บนจอที่กว้างกว่า
- จัดลำดับสายตาเป็นภาพองค์เทพ/ธูป -> heading -> supporting copy -> CTA
- รองรับสถานะ loading, error, guest และ LINE โดยไม่ทำให้ฉากหลักหายไป

### Responsive behavior

- ต่ำกว่า 760px: ใช้ภาพแนวตั้ง, text block กว้างเต็มพื้นที่ที่ปลอดภัย, CTA เต็มความกว้าง
- 760px ขึ้นไป: จัด subject ทางซ้ายหรือกึ่งกลาง และวาง copy ทางขวาเมื่อไม่ทำให้ภาพเสีย
- สูงสุด 1024px: ใช้ tablet composition เดิมโดยไม่เปลี่ยนเป็น desktop layout
- ปรับ `object-position` ได้ตามภาพ แต่ห้ามตัดใบหน้า องค์เทพ ธูป หรือซุ้มประธานออกจาก safe area

## Colors

ใช้สีดำและแดงไวน์เป็นพื้นลึก ทองเป็นตัวบอก hierarchy และ ivory เป็นสีอ่านข้อความหลัก `neon-pink` ใช้เฉพาะขอบ glow ของ popup/LINE ในปริมาณเล็กน้อย

- `#050204` ink: canvas และขอบมืด
- `#18050A` wine-deep: เงากำมะหยี่แดง
- `#31050B` wine: popup และ state ที่เลือก
- `#8F1125` wine-bright: accent แดงและ progress
- `#7D531B` gold-deep: ขอบทองเข้ม
- `#D8A84D` gold: label และเส้นเน้น
- `#F9D989` gold-light: primary CTA และผลลัพธ์
- `#FFF5DD` sacred-light: heading
- `#FFF1D2` body-light: body copy
- `#F4AD43` fire: flame และ warm glow
- `#FF4397` neon-pink: neon edge ที่ใช้บาง ๆ

ห้ามใช้สีหรือ gradient จนภาพพื้นหลังอ่านไม่ออก และห้ามใช้ palette เดียวจนทุกองค์ประกอบแยก hierarchy ไม่ได้

## Typography

- ใช้ `LINESeedSansTH_A_Rg` จาก `src/assets/fonts/LINESeedSansTH_A_Rg.ttf` เป็น font หลัก
- fallback คือ `LINESeedSansTH`, `Noto Sans Thai`, `system-ui`, sans-serif
- heading ใช้น้ำหนักและขนาดเพื่อสร้าง hierarchy ไม่ใช้ letter spacing ติดลบ
- body copy ต้องอ่านได้บนภาพโดยใช้ ivory + shadow แทนการวางกล่องทึบบังภาพ
- ตัวเลขผลลัพธ์ควรใหญ่ ชัด และใช้ gold-light เพื่อให้รู้ว่าเป็น moment สำคัญ

## Elevation

ใช้ depth จากภาพ, vignette, text shadow และ glow แบบบาง ไม่ใช้ shadow หนักกับทุกชิ้น

- Content shadow: `0 2px 12px rgba(0, 0, 0, 0.5)`
- Primary glow: `0 0 30px rgba(255, 194, 76, 0.28)`
- Result glow: `0 0 62px rgba(255, 178, 52, 0.3)`
- Modal shadow: `0 24px 80px rgba(0, 0, 0, 0.68)`
- Neon edge: `0 0 50px rgba(255, 74, 151, 0.14)`

## Components

### Primary Button

Pill สูงประมาณ 54px, พื้น gold-light, ข้อความเข้ม, ขอบ ivory 1px และ warm glow แบบเบา เมื่อกดให้ลด brightness/translate เล็กน้อยโดยไม่เปลี่ยน layout

### Secondary and selection button

พื้นโปร่งใสหรือ wine-dark, ขอบทองบาง, ข้อความ ivory; selected state เปลี่ยนเป็น gold-light หรือเพิ่ม glow เพื่อสื่อสถานะอย่างชัดเจน

### Deity carousel

ต้อง swipe ซ้าย/ขวาได้ มี card กลางเด่นที่สุด card ข้างเคียงมืดลงและเอียงแบบ 3D ใช้ภาพองค์เทพจริง ห้ามแทนด้วย grid ธรรมดา

### Incense ritual

ใช้ภาพธูปเต็มฉากเป็นฐาน เพิ่ม flame, smoke, particles และ progress layer ธูปต้องแสดงตัวเลขแนวตั้งตามลำดับ `1`, `2`, `3` หรือ `?`, `?`, `?`

### Result plaque and popup

แสดงเลขทีละหลักพร้อม gold glow และเปิดคำอวยพร/LINE action เป็น popup ที่มี neon edge บาง ๆ popup ต้องไม่บดบังองค์ประกอบสำคัญเกินจำเป็น

## Do's and Don'ts

### Do

- รักษาโทน dark luxury, black-gold, red velvet และ warm sacred light
- ให้ภาพจริงของเทวาลัยและองค์เทพเป็น first-viewport signal
- ใช้ animation ที่ช้า นุ่ม และมีจุดเริ่ม/จุดจบชัด
- รองรับ Guest โดยไม่ใช้ข้อมูล LINE และรองรับ reduced motion
- ตรวจคอนทราสต์และพื้นที่กดทุกครั้งที่ปรับ responsive

### Don't

- อย่าทำให้เป็นเว็บ AI template สำเร็จรูป
- อย่าทำให้เป็นเว็บเกมเสี่ยงโชคทั่วไป
- อย่าทำให้เป็นเว็บ landing page ขายสินค้า
- อย่าใช้ภาพเทพหรือวัตถุที่ดูปลอม/ผิดรูป
- อย่าใช้ backdrop blur หรือแผงทึบด้านล่างที่บดบังภาพ
- อย่าเพิ่ม particle, neon, gradient หรือเสียงจนแย่งความสนใจจากองค์เทพและธูป
