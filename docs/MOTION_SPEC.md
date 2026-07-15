# Motion Spec

## Direction

Motion ต้องช้า นุ่ม และรู้สึกเหมือนแสง ควัน และไฟในสถานที่จริง ไม่ใช้ motion แบบ casino, game HUD หรือการกระพริบรุนแรง

| Surface | Motion | Timing |
| --- | --- | --- |
| Welcome | fade จากดำ, sacred light sweep, content scale เข้าเล็กน้อย | 700-1000ms entrance; 4.8s light loop |
| Activity | warm pulse บนทางเดิน, selection glow | 650-900ms transition; 300ms selection |
| Deity | 3D swipe, center card scale/brightness สูงกว่า side cards | 450-600ms ease-out |
| Incense idle | glow หลังธูปและ particle เบา ๆ | 4.8s pulse; 8s particle loop |
| Incense burning | play the supplied 6-second video, reveal one digit at a time, then move to result | 6s ritual; digits around 2.5s, 3.7s, 4.9s |
| Result | ตัวเลขเปิดทีละหลักแล้ว settle | 350-500ms per digit; 900-1200ms settle |
| Popup | fade-up, neon edge อ่อน | 250-400ms ease-out |

ตัวอักษรหลักใช้ faux-bold, text shadow และ light sweep แบบช้า ๆ ประมาณ 6.5 วินาที ส่วนกรอบ `?` ใช้ gold glow pulse 2.2 วินาทีและ pulse ที่ตัว `?` 1.5 วินาที โดยต้องปิดหรือลดเหลือ fade เมื่อเปิด reduced motion

## Visual effects

- Smoke: translucent white-gray, soft blur, upward drift with slight rotation
- Flame: ivory center, yellow body, orange/red edge, irregular low-frequency flicker
- Sacred light: warm gold/orange radial glow behind the subject
- Particles: small gold/orange points with slow depth variation; keep count low
- Neon: thin pink edge only for popup/LINE feedback, never as a full-screen wash

## Reduced motion and performance

- Respect `prefers-reduced-motion: reduce`
- Replace infinite loops with one short fade or static glow
- Avoid animating layout properties such as width, height, margin, or padding when transform/scale can express the same effect
- Keep background images lazy where possible, but preload the current screen asset before the screen transition
- Do not autoplay audio; initialize sound only after a user gesture
