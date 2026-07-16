# Admin Dashboard

## What is ready

- เปิดหน้าแอดมินที่ `/admin` ได้ทันที และโค้ดจะเลือกหน้าแอดมินอัตโนมัติเมื่อใช้โดเมนที่ขึ้นต้นด้วย `admin.`
- ผู้ดูแลเข้าสู่ระบบด้วย passcode 6 หลัก ผ่าน Cloud Functions
- รหัสจริงไม่อยู่ในหน้าเว็บหรือเอกสาร Firestore: Function จะสร้าง hash พร้อม salt ใน `adminPrivate/passcode` ครั้งแรก
- Function จะสร้างบัญชีเทคนิค `admin-passcode` ใน Firebase Authentication อัตโนมัติครั้งแรก โดยไม่มีข้อมูลส่วนบุคคล
- ระบบจำกัดการลองรหัสผิด 5 ครั้งต่อ 15 นาทีต่อเครือข่าย และบล็อก 30 นาทีเมื่อเกินกำหนด
- สิทธิ์แอดมินมีอายุ 8 ชั่วโมง และ Firestore Rules ตรวจวันหมดอายุทุกครั้งก่อนอ่านข้อมูล
- Dashboard แสดงผู้ใช้งาน, จำนวนกดเสี่ยงโชค, รายการพิธี, ยอดโดเนต และรายการโดเนตเมื่อมีข้อมูลจริง
- ประวัติขอโชคเรียงจากล่าสุดก่อนเสมอ ค้นหาจากชื่อ LINE, รหัสผู้ใช้, เลขมงคล หรือองค์ที่เลือกได้
- เมื่อผู้ใช้ทำพิธีใน LIFF ระบบตรวจชื่อและรูปผ่าน LINE Profile API ก่อนบันทึก โดยไม่เก็บ LINE access token
- โครงข้อมูล `donations` รองรับ Beam ในอนาคต แต่ยังไม่มีการสร้าง QR Code หรือรับเงินจริง

## Before real data can appear

1. Firebase Console > **Authentication** > กด **Get started** หนึ่งครั้ง (ไม่ต้องเปิด Google หรือผู้ให้บริการอื่น เพราะระบบนี้ใช้ custom token)
2. Google Cloud Console > IAM: กำหนด role **Service Account Token Creator** ให้ `198344792966-compute@developer.gserviceaccount.com` เพื่อให้ Cloud Functions สร้าง custom token ได้
3. ตั้ง Firebase Secret ชื่อ `ADMIN_INITIAL_PASSCODE` ผ่านคำสั่ง `npx firebase-tools functions:secrets:set ADMIN_INITIAL_PASSCODE --project luckysrikanett` แล้วพิมพ์ passcode ในหน้าต่าง Terminal (ไม่ต้องใส่ในไฟล์ `.env`)
4. Publish Cloud Functions และ [firestore.rules](../firestore.rules) ด้วย `npx firebase-tools deploy --only functions,firestore:rules --project luckysrikanett`
5. เปิด `/admin` แล้วกรอกรหัส 6 หลัก ระบบจะบันทึกเฉพาะ hash ของรหัสไว้ในฐานข้อมูลโดยอัตโนมัติ
6. Function `recordLuckyActivity` พร้อมบันทึกประวัติเสี่ยงโชคแล้ว ส่วน Beam donation ยังต้องเพิ่ม backend และ webhook เมื่อเริ่มรับเงินจริง

## Lucky activity data contract

Collection: `activities/{activityId}`

```ts
{
  userId: string,
  userDisplayName: string,
  userPictureUrl?: string,
  userMode: 'line' | 'guest',
  sessionId: string,
  deity: 'ganesha' | 'lakshmi',
  activity: 'luck',
  type: 'lucky_incense',
  result: string,
  digitLength: 3,
  createdAt: string,
  lineMessageSent: boolean,
  lineLiftSynced: boolean,
}
```

ห้ามเก็บ passcode เป็นข้อความธรรมดาใน browser, `.env` ของเว็บ, หรือ Firestore เพราะอ่านออกได้จากผู้มีสิทธิ์ระบบ ควรให้ Cloud Function เป็นผู้ตรวจ hash และออกสิทธิ์เอง ตาม [Firebase Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims), [Firebase callable functions](https://firebase.google.com/docs/functions/callable) และ [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions)

## Hosting

- ใช้ `https://luckysrikanett.web.app/admin` ได้ทันทีเมื่อ deploy build นี้
- `admin.luckysrikanett.web.app` ไม่ใช่ URL มาตรฐานที่ Firebase สร้างให้ เพราะ Firebase Hosting site ID ใช้ dot ไม่ได้
- ทางเลือกคือสร้าง Hosting site แยก เช่น `luckysrikanett-admin.web.app` หรือผูกโดเมนที่คุณเป็นเจ้าของ เช่น `admin.your-domain.com`

## Donation data contract

Collection: `donations/{donationId}`

```ts
{
  userId: string,
  activityId?: string,
  provider: 'beam',
  amount: number,
  currency: 'THB',
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded',
  paymentReference?: string,
  createdAt: string,
  paidAt?: string
}
```

เมื่อทำ Beam จริง ต้องให้ backend เป็นผู้สร้างคำขอชำระเงิน, รับ webhook, ตรวจลายเซ็นของ Beam และเปลี่ยนสถานะเป็น `paid` เอง ห้ามให้ browser ยืนยันการจ่ายเงินโดยตรง
