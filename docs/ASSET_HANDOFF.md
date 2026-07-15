# Asset Handoff

## Current assets

| Path | Usage | Status |
| --- | --- | --- |
| `src/assets/optimized/welcome-temple.jpg` | Welcome / Intro background | production fallback currently used |
| `src/assets/optimized/temple-transition.jpg` | Activity / deity scene background | production fallback currently used |
| `src/assets/optimized/deity-ganesha.jpg` | Ganesha carousel card | ready |
| `src/assets/optimized/deity-lakshmi.jpg` | Lakshmi carousel card | ready |
| `src/assets/optimized/lucky-incense.jpg` | Incense idle, burning, result base | ready as visual base |
| `src/assets/deity-pair.png` | optional paired deity reference | not in main flow |
| `src/assets/hero.png` | legacy reference | do not use without confirmation |
| `src/assets/fonts/LINESeedSansTH_A_Rg.ttf` | Thai UI font | loaded locally |
| `public/videos/welcome-temple.mp4` | Welcome / Intro motion background | supplied video, loops |
| `public/videos/lucky-incense-burning.mp4` | Burning incense motion background | supplied video, plays after tap |

## Source versus optimized

ไฟล์ PNG ใน `src/assets` เป็น source/reference คุณภาพสูง ส่วน runtime ควร import จาก `src/assets/optimized` เพื่อให้ initial load เบาลง วิดีโอ runtime อยู่ใน `public/videos` และใช้ภาพ poster fallback เสมอ

## Required future assets

- แยก `brand-logo.png` หรือ `brand-logo.svg` แบบโปร่งใส หากต้องวางโลโก้แยกจากฉาก Welcome
- วิดีโอหรือ sprite ควัน/เปลวไฟ หากต้องการ realism สูงกว่า CSS layer
- ฉากและผลลัพธ์ final ของ branch `ขอพร`
- เสียงจุดธูป, temple ambience และ reveal cue แบบ optional
- ไอคอน share/save/LINE ที่มีสิทธิ์ใช้งานถูกต้อง

## Video handoff rules

วิดีโอที่สร้างจากภาพต้องล็อกวัตถุหลัก: รูปทรง ใบหน้า เครื่องประดับ สีผ้า ตำแหน่งองค์เทพ ซุ้ม แท่น และธูป ห้ามให้ AI สร้างอวัยวะหรือรายละเอียดใหม่ที่ผิดจาก reference

แนะนำ:

- Welcome loop: 3-5 วินาที, slow push-in จากระยะไกลสู่ซุ้ม, seamless loop
- Temple walkway: 4-6 วินาที, camera glide ตามพรมแดงไปหาองค์ประธาน
- Deity: 3-5 วินาที, breathing light/cloth micro-motion เท่านั้น
- Incense: 6 วินาที, flame, smoke และ burn progress โดยไม่เปลี่ยนรูปแท่งธูป

ใช้ภาพนิ่งเป็น fallback เสมอ และให้ motion เป็น enhancement ไม่ใช่ dependency ของ flow
