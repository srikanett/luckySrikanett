# Design Handoff: ศรีคเนศ เทวาลัย

เอกสารนี้เป็น handoff สำหรับสร้างเว็บจริงจาก high-fidelity mobile mockup ของแอป “ศรีคเนศ เทวาลัย - ขอพรเสี่ยงโชค”

## 1. Mockup และภาพอ้างอิง

ทุกหน้าต้องเป็น full-screen visual บน mobile viewport โดยให้ภาพสถานที่เป็นพระเอก และวางข้อความ/ปุ่มเป็น overlay เหนือภาพโดยตรง ไม่มีแผง glassmorphism หรือพื้นหลังเบลอที่บดบังภาพ

| หน้าจอ | ภาพอ้างอิง | Asset ปัจจุบัน |
| --- | --- | --- |
| Welcome / Intro | วิดีโอเปิดทางเข้าสู่เทวาลัย พร้อมภาพนิ่งเป็น fallback | [welcome-temple.mp4](public/videos/welcome-temple.mp4), [welcome-temple.png](src/assets/welcome-temple.png) |
| เลือกกิจกรรม | มุมมองทางเดินพรมแดงเข้าสู่องค์ประธาน | [temple-transition.png](src/assets/temple-transition.png) |
| เลือกองค์เทพ | 3D carousel ขององค์เทพ ให้ swipe ซ้าย/ขวาเลือกองค์ | [deity-ganesha.png](src/assets/deity-ganesha.png), [deity-lakshmi.png](src/assets/deity-lakshmi.png), [deity-pair.png](src/assets/deity-pair.png) |
| จุดธูปขอโชค | ธูปหนึ่งดอกในกระถาง ฉากหลังเป็นองค์เทพและแสงทอง | [lucky-incense.png](src/assets/lucky-incense.png) |
| Animation ระหว่างธูปไหม้ | เล่นวิดีโอธูปหลังผู้ใช้กดจุด พร้อมเผยเลขทีละหลัก | [lucky-incense-burning.mp4](public/videos/lucky-incense-burning.mp4) |
| Result เลขมงคล | ตัวเลขปรากฏหลังธูปไหม้ครบ พร้อมแสงทองและคำอวยพร | [lucky-incense.png](src/assets/lucky-incense.png) เป็น background placeholder |
| Guest / รับผลผ่าน LINE | ยังไม่มี mockup เฉพาะหน้า ให้ใช้ result screen เดิมและเพิ่ม action รับผลผ่าน LINE เป็น popup | ยังไม่มี asset เฉพาะ |

### สถานะภาพ

- ไฟล์ใน `src/assets` เป็นภาพอ้างอิง/ภาพพื้นหลังแนวตั้งขนาด 941 x 1672 px ส่วนวิดีโอ motion runtime อยู่ใน `public/videos`
- `hero.png` ยังไม่อยู่ใน flow หลัก ให้ถือเป็น legacy/placeholder จนกว่าจะมีการระบุใช้งาน
- โลโก้ยังไม่มีไฟล์แยกแบบโปร่งใส หากต้องใช้บน UI แยกจากภาพ Welcome ให้เตรียม `brand-logo.png` หรือ `brand-logo.svg`
- ยังไม่มีไฟล์เสียง และฟอนต์ LINESeedSansTH ใช้จากไฟล์ local ที่เพิ่มในโปรเจกต์แล้ว

## 2. Design system

### สี

| Token | Hex | การใช้งาน |
| --- | --- | --- |
| `ink` | `#050204` | พื้นหลังหลัก/ขอบมืด |
| `ink-soft` | `#090304` | พื้นหลังบนภาพและ screen overlay |
| `wine-deep` | `#18050A` | red velvet shadow |
| `wine` | `#31050B` | สีแดงเข้มของ popup/selection |
| `wine-bright` | `#8F1125` | accent สีแดงและแสงด้านหลัง |
| `gold-deep` | `#7D531B` | ทองเงา/ขอบเข้ม |
| `gold` | `#D8A84D` | label, kicker, border |
| `gold-light` | `#F9D989` | ปุ่มหลัก/ไฮไลต์ |
| `sacred-light` | `#FFF5DD` | heading และข้อความสำคัญ |
| `body-light` | `#FFF1D2` | body text |
| `fire` | `#F4AD43` | เปลวไฟและ glow อุ่น |
| `neon-pink` | `#FF4397` | neon glow ใช้เป็น accent บาง ๆ เท่านั้น |

หลักการใช้สี: ภาพจริงและสีแดงเข้มต้องยังมองเห็นได้ชัด ทองใช้เพื่อบอกลำดับความสำคัญ ไม่ใช้ gradient หรือ glow จนทำให้ภาพพื้นหลังเสียรายละเอียด

### Typography

- Font หลัก: `LINESeedSansTH_A_Rg` ตามไฟล์ที่ผู้ใช้จะส่งให้
- Fallback: `LINESeedSansTH`, `Noto Sans Thai`, system sans-serif
- Heading ใช้น้ำหนักเด่น แต่ต้องคงรูปทรงตัวอักษรโปร่ง อ่านง่ายบนภาพ
- ห้ามใช้ letter spacing ติดลบ
- แนะนำให้ประกาศ font ด้วย `@font-face` จากไฟล์ local และใช้ `font-display: swap`

### Shape, spacing และ elevation

- Base spacing: ใช้ระบบ 8 px (`8, 16, 24, 32, 40, 48`)
- Safe-area ของข้อความ/ปุ่มบนมือถือ: อย่างน้อย `24 px` ด้านข้าง และรองรับ `env(safe-area-inset-*)`
- Primary CTA สูงประมาณ `52-56 px`
- ปุ่มหลักเป็น pill: `border-radius: 999px`
- Popup/overlay สำคัญ: `16-26 px`
- Deity card: ประมาณ `22 px`
- Full-screen visual: ไม่ต้องมีกรอบโทรศัพท์ใน production app
- ใช้ shadow ดำเพื่อเพิ่มมิติ และใช้ gold/pink glow เป็นชั้นรอง
- ห้ามใช้ backdrop blur หรือแผงทึบในเมนูล่าง เพราะบดบังภาพเทวาลัย

### Button และ icon

- Primary button: พื้น gold gradient อ่อน ข้อความสีเข้ม `#241102`, ขอบสีทองอ่อน 1 px, outer glow อุ่น และมี pressed state
- Secondary/selection: โปร่งใสหรือ wine-dark, ขอบทองบาง, selected state เปลี่ยนเป็น gold และเพิ่ม glow
- ปุ่มต้องมีพื้นที่กดอย่างน้อย 44 x 44 px
- Icon ใช้เส้นบางแบบ sacred/luxury สีทองหรือสี ivory ไม่ใช้ emoji และไม่ใส่ icon หากไม่มีความหมายต่อการทำงาน
- หากต้องใช้ icon library ในอนาคต ให้ใช้ icon ที่เรียบและสม่ำเสมอทั้งระบบ

## 3. Animation direction

| หน้าจอ | Motion | Duration / easing |
| --- | --- | --- |
| Welcome | เล่นวิดีโอเทวาลัยวน พร้อมข้อความ contrast สูงและแสงทองลอยเบา ๆ | วิดีโอประมาณ `6s`; loop; ease-out |
| เลือกกิจกรรม | ทางเดินมี light pulse เบา ๆ; ปุ่มที่เลือกมี sacred neon pulse | transition `650-900ms`; selection `300ms` |
| เลือกองค์เทพ | swipe ซ้าย/ขวาแบบ 3D carousel; card กลาง scale ใหญ่และชัด; card ด้านข้างเอียง/มืดลง | `450-600ms`; spring-like ease-out |
| จุดธูป | ก่อนกดเป็นภาพนิ่ง; หลังแตะปุ่มเริ่มวิดีโอธูปที่มีไฟและควันจริง | video playback `6s` |
| Animation ธูปไหม้ | เล่นวิดีโอธูป, เผยเลขทีละตัวแนวตั้ง แล้วเปลี่ยนเป็น result | ritual target `6s` จาก config |
| Result | ตัวเลขเปิดทีละหลักจากแสงด้านหลัง, แต่ละหลักมี glow แล้ว settle, particle ตกช้า | digit reveal `350-500ms/หลัก`; result settle `900-1200ms` |
| Popup / LINE | popup fade-up เล็กน้อยพร้อม neon edge; ปุ่ม glow ช้า ไม่กระพริบรุนแรง | `250-400ms`; ease-out |

### ควัน แสง ไฟ และ particle

- ควัน: โปร่ง สีขาวอมเทา ขอบนุ่ม เคลื่อนขึ้นและบิดเล็กน้อย ไม่เป็นก้อนทึบ
- ไฟ: แกนกลาง ivory/yellow, ขอบ orange/red, flicker แบบไม่ถี่เกินไป
- แสง: warm sacred light จากทอง/ส้ม ควรเป็น radial glow ที่อยู่หลัง subject
- Particle: จุดทองและส้มขนาดเล็ก เคลื่อนช้าแบบ depth ต่างกัน ใช้จำนวนน้อยเพื่อไม่ให้รบกวนภาพ
- รองรับ `prefers-reduced-motion`: ลด particle, ปิด loop ที่ไม่จำเป็น และใช้ fade แบบสั้นแทน

## 4. UX flow

```text
Welcome / Intro
  -> เข้าสู่พิธี
เลือกกิจกรรม
  -> เสี่ยงโชค (ขอพรซ่อนไว้สำหรับการพัฒนาภายหลัง)
เลือกองค์เทพ
  -> คเนศ | ลักษมี | องค์อื่นในอนาคต
  -> ถ้า “เสี่ยงโชค”
จุดธูปขอโชค
  -> ผู้ใช้แตะ “จุดธูป” หรือ “รับคำอวยพร” ตาม state
Animation ธูปไหม้
  -> ระบบสุ่มเลข 3 หลักเมื่อ ritual เสร็จเท่านั้น
Result เลขมงคล
  -> บันทึกพร | รับผลผ่าน LINE | เริ่มใหม่
```

### State ที่ต้องมี

- `welcome`: ยังไม่เริ่มพิธี
- `activity`: เลือก `wish` หรือ `luck`
- `deity`: เลือกเทพที่ต้องการ
- `incense-idle`: เห็นธูปและเลข `?` แนวตั้ง กดเริ่มพิธีได้
- `incense-burning`: ไฟติด ควันลอย burn progress ทำงาน ปุ่มหลักถูก disable หรือเปลี่ยนเป็น loading
- `result`: แสดงเลขสุ่ม 3 หลักและคำอวยพร
- `guest`: ใช้งานได้โดยไม่ต้อง login และยังดู result ได้
- `line-pending`: กำลังส่ง/เปิด LINE
- `line-success`: แจ้งสั้น ๆ ว่ารับผลผ่าน LINE แล้ว
- `line-error`: แจ้งว่าเชื่อมต่อ LINE ไม่สำเร็จ พร้อมปุ่มลองใหม่ และยังคง result ไว้

### Loading และ error copy

- เปิดพิธี: `กำลังเปิดประตูเทวาลัย...`
- จุดธูป: `กำลังอธิษฐาน...`
- เผยเลข: `กำลังเปิดเผยเลขมงคล...`
- LINE ใช้งานไม่ได้: `ยังเชื่อมต่อ LINE ไม่สำเร็จ` และมี action `ลองใหม่` / `ใช้งานต่อแบบ Guest`
- ภาพโหลดไม่ได้: ใช้พื้นหลัง `ink` + warm sacred glow และคงข้อความ/ปุ่มให้อ่านได้

### Branch ที่ยังต้องยืนยัน

เส้นทาง “ขอพร” ยังเก็บ state และ visual placeholder ไว้ในโค้ด แต่ซ่อนจากหน้าใช้งานปัจจุบัน จนกว่าจะมี mockup หน้า “คำอวยพรสำเร็จ” เพิ่มเติม

## 5. Asset handoff

| File | Role | Status |
| --- | --- | --- |
| `src/assets/welcome-temple.png` | Welcome / Intro background | พร้อมใช้เป็น reference |
| `src/assets/temple-transition.png` | Temple walkway / activity background | พร้อมใช้เป็น reference |
| `src/assets/deity-ganesha.png` | Ganesha carousel card | พร้อมใช้ |
| `src/assets/deity-lakshmi.png` | Lakshmi carousel card | พร้อมใช้ |
| `src/assets/deity-pair.png` | Optional deity pair visual | มีไฟล์ แต่ยังไม่ได้ใช้ใน flow หลัก |
| `src/assets/lucky-incense.png` | Incense idle, burning และ result background | พร้อมใช้เป็น placeholder base |
| `src/assets/hero.png` | Legacy/unknown | ยังไม่ใช้จนกว่าจะยืนยัน |

### ต้องเตรียมเพิ่ม

- `LINESeedSansTH_A_Rg.woff2` หรือไฟล์ font ที่ผู้ใช้ส่งให้
- โลโก้แยกโปร่งใสสำหรับกรณีที่ต้องวางบนหน้าอื่น
- วิดีโอ runtime สำหรับ Welcome และธูปถูกเพิ่มไว้ใน `public/videos` แล้ว
- เสียงจุดธูป, ambience เทวาลัย และเสียง reveal แบบสั้น หากเปิดเสียงใน product
- ไอคอน share/save/LINE ที่มีสิทธิ์ใช้งานถูกต้อง
- ภาพหรือ motion สำหรับ branch “ขอพร” และหน้า Guest/LINE แบบ final

## 6. Implementation notes

### ต้องรักษาให้เหมือน design

- ใช้ full-screen image เป็น primary experience และวาง UI overlay เหนือภาพ
- ลำดับ flow: Welcome -> เลือกกิจกรรม -> เลือกองค์เทพ -> ritual -> result
- หน้าเลือกองค์เทพต้องเป็น swipeable 3D carousel ไม่ใช่ grid card ธรรมดา
- ตัวเลขระหว่างธูปไหม้ต้องเรียงแนวตั้งเสมอ:

```text
1
2
3
```

- ใช้ font LINESeedSansTH เมื่อไฟล์จริงถูกเพิ่มเข้ามา
- menu ด้านล่างเป็นข้อความ/ปุ่มโปร่งใสที่มี shadow หรือ glow เท่านั้น ไม่มี blurred panel
- โทนต้องคงเป็น dark luxury, black-gold, red velvet และ warm sacred light
- random number ต้องสร้างตอน ritual เสร็จ ไม่ hardcode เลขจาก mockup

### ห้ามเปลี่ยน

- ห้ามเปลี่ยนภาพพระ/องค์เทพให้เป็นภาพ stock หรือภาพที่ไม่ตรง reference
- ห้ามทำ background เป็น card หรือแผงเบลอเต็มพื้นที่ด้านล่าง
- ห้ามทำเลขธูปเป็นแนวนอน
- ห้ามตัดขั้นตอนเลือกกิจกรรมหรือเลือกองค์เทพออก
- ห้ามใส่ particle/neon มากจนอ่านตัวอักษรหรือเห็นองค์เทพไม่ชัด
- ห้ามใช้ mockup phone frame, motion note panel หรือ palette board เป็น production UI

### ปรับได้เมื่อทำ responsive

- ปรับ `object-position` ของแต่ละภาพเพื่อรักษาใบหน้า/ธูป/แท่นพิธีให้อยู่ใน safe area
- ปรับขนาด heading, ระยะห่าง และความกว้างปุ่มตาม viewport
- รองรับเฉพาะ mobile/tablet และจำกัดพื้นที่แอปไว้ที่ความกว้างสูงสุด 1024 px
- carousel ปรับจำนวน card ที่เห็นตามความกว้างจอ แต่ card ที่เลือกต้องเด่นที่สุดเสมอ
- ลดความเข้มของ overlay ได้เมื่อภาพมืดหรือสว่างต่างกัน แต่ต้องรักษาคอนทราสต์ของข้อความ

## Copy-paste implementation brief

สร้างเว็บ React + TypeScript + Vite ตาม design handoff นี้ โดยเริ่มจาก single full-screen mobile-first experience ไม่ใช่หน้าแสดง mockup หลายโทรศัพท์ ใช้ asset ที่อยู่ใน `src/assets` และคงภาพ/ลำดับ flow/โทนสีตามเอกสารนี้

ทำ state flow ให้กดใช้งานได้จริง: Welcome -> เลือกกิจกรรม -> เลือกองค์เทพ -> จุดธูป -> animation ธูปไหม้ -> result เลขสุ่ม 3 หลัก โดยเลขในขั้น animation ต้องเรียงแนวตั้ง ส่วน result ใช้ layout ตาม mockup เพิ่ม guest mode, loading, error และ LINE handoff state โดยยังไม่ทำ backend หากยังไม่มี API

คง UI เป็นข้อความและปุ่ม overlay บนภาพเต็ม ไม่มี glassmorphism panel ด้านล่าง ใช้ LINESeedSansTH เมื่อมีไฟล์ font เพิ่มเข้ามา ทำ animation แบบ CSS/React ที่เบาและรองรับ reduced motion พร้อมตรวจสอบ mobile viewport, keyboard focus, contrast และกด flow หลักได้ครบ
