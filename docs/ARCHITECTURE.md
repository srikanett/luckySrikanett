# Architecture Notes

## Runtime shape

โปรเจกต์เป็น React + TypeScript + Vite single-page experience โดย state หลักอยู่ใน `src/App.tsx` และ style visual อยู่ใน `src/App.css` / `src/index.css`

```text
src/
  App.tsx                       screen state and interaction orchestration
  App.css                       full-screen scenes, overlays, motion
  config/                       assets, brand, campaign configuration
  services/                     activity, Firebase, LIFF, result generation
  types/                        ceremony domain types
  utils/                        session helpers
  assets/                       source assets, optimized runtime assets, font
```

## Boundaries

- `assetConfig`: เป็น source of truth ของภาพที่ใช้ใน flow
- `brandConfig`: เป็น source of truth ของชื่อแบรนด์และ campaign
- `activityService`: ส่งผลพิธีที่เสร็จแล้วไปยัง Cloud Function `recordLuckyActivity`; หากเปิดจาก LINE Function จะตรวจชื่อและรูปผ่าน LINE Profile API ก่อนบันทึก
- `resultGeneratorService`: สร้างเลขตาม campaign config; ต้องไม่ผูกกับ UI
- `liffService`: ใช้ LINE LIFF SDK ทางการ ตรวจโหมด Guest/LINE และส่งผลเฉพาะเมื่อ LINE พร้อม
- `utils/session`: สร้าง session id สำหรับ Guest โดยไม่เก็บ LINE identity

## Configuration

ใช้ตัวแปรจาก `.env.example` เท่านั้น:

- `VITE_FIREBASE_*`: backend persistence เมื่อเปิดใช้งานจริง
- `VITE_LIFF_ID`: LIFF integration
- `VITE_CAMPAIGN_ID`: campaign key สำหรับ result generation

ห้าม commit secret และห้ามย้ายค่า credential มาไว้ใน source code

## Data and privacy

- Guest result ต้องแสดงได้โดยไม่ต้องมี account
- Browser ไม่เก็บ LINE profile, token หรือ identifier ลง local storage
- LINE access token ใช้เฉพาะระหว่าง Cloud Function ตรวจ LINE Profile API และห้ามบันทึกลง Firestore หรือ log
- Guest ยังทำพิธีได้ โดย dashboard จะแสดงเป็น `ผู้เยี่ยมชม` แทนชื่อ LINE
- Firebase record ควรใช้ session id/approved user id เท่าที่จำเป็น และไม่เก็บข้อมูลส่วนเกิน

## Error contract

Service error ต้องถูกแปลงเป็น user-facing state โดยไม่ทำให้ภาพหลักหาย: retry ได้, ย้อนกลับได้ และ result ที่มีอยู่แล้วต้องไม่ถูกลบทิ้งจากความผิดพลาดของ LINE

## Verification

ทุก change ที่แตะ flow ต้องผ่าน `npm run lint`, `npx tsc -b`, `npm run build` และทดสอบ flow Welcome -> Activity -> Deity -> Incense -> Result ใน browser อย่างน้อยหนึ่งรอบ
