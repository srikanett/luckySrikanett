# Admin Dashboard

## What is ready

- เปิดหน้าแอดมินที่ `/admin` ได้ทันที และโค้ดจะเลือกหน้าแอดมินอัตโนมัติเมื่อใช้โดเมนที่ขึ้นต้นด้วย `admin.`
- ผู้ดูแลเข้าสู่ระบบด้วย passcode 6 หลัก ผ่าน Cloud Functions
- รหัสจริงไม่อยู่ในหน้าเว็บหรือเอกสาร Firestore: Function จะสร้าง hash พร้อม salt ใน `adminPrivate/passcode` ครั้งแรก
- Function จะออก session token แบบสุ่มและเก็บเฉพาะ hash ของ token ใน `adminPrivate/sessions` โดย session มีอายุ 8 ชั่วโมง
- ระบบจำกัดการลองรหัสผิด 5 ครั้งต่อ 15 นาทีต่อเครือข่าย และบล็อก 30 นาทีเมื่อเกินกำหนด
- สิทธิ์แอดมินมีอายุ 8 ชั่วโมง และ Cloud Functions ตรวจ session ทุกครั้งก่อนอ่านข้อมูล
- Dashboard แสดงผู้ใช้งาน, จำนวนกดเสี่ยงโชค, รายการพิธี, ยอดโดเนต และรายการโดเนตเมื่อมีข้อมูลจริง
- ประวัติขอโชคเรียงจากล่าสุดก่อนเสมอ ค้นหาจากชื่อ LINE, รหัสผู้ใช้, เลขมงคล หรือองค์ที่เลือกได้
- ประวัติลูกค้า LINE รวมข้อมูลด้วย LINE User ID ค้นหาจากชื่อ, User ID หรือเลขมงคล พร้อมแสดงจำนวนครั้งและรายละเอียดการใช้งานทั้งหมด
- เมื่อผู้ใช้ทำพิธีใน LIFF ระบบตรวจชื่อและรูปผ่าน LINE Profile API ก่อนบันทึก โดยไม่เก็บ LINE access token
- หน้าโดเนตสามารถแก้ยอดสนับสนุนได้ โดยค่าเริ่มต้นคือ 9 บาท ยอดใหม่มีผลกับรอบที่สร้างหลังบันทึก
- Cloud Functions สร้าง QR PromptPay ผ่าน Beam Production, รับ webhook และเปิดเลขเมื่อยืนยันยอดสำเร็จ
- QR มีอายุ 15 นาที หากหมดอายุสามารถสร้างใหม่ใน `drawId` เดิมโดยเลขไม่เปลี่ยน
- ผู้ใช้ทั่วไปได้รหัส Firebase Anonymous อัตโนมัติโดยไม่ต้อง login และสามารถสนับสนุนผ่าน QR ได้
- สิทธิ์รับเลขฟรีจำกัด 2 รอบต่อวันตามเวลาไทยต่อ Anonymous ID หรือ LINE User ID
- ผู้สนับสนุนสร้างการ์ดเลขมงคลจากองค์เทพที่เลือก บันทึกลงเครื่องได้ และระบบพยายามส่งภาพเข้าแชต LINE อัตโนมัติ
- หน้าโดเนตเชื่อมข้อมูลรอบเสี่ยงโชคกับ Beam แสดง Draw ID, Charge ID, เลขที่ออก, สถานะรอบ และสถานะชำระในตารางเดียว
- การเรียกสร้าง Charge ซ้ำของรอบและ QR เดิมใช้ idempotency key เดิมเพื่อป้องกันรายการ Beam ซ้ำจากการ retry

## Before real data can appear

1. เปิด Firebase Console > Authentication > Sign-in method แล้วเปิดผู้ให้บริการ `Anonymous`
2. ตั้ง Firebase Secret ชื่อ `ADMIN_INITIAL_PASSCODE` ผ่านคำสั่ง `npx firebase-tools functions:secrets:set ADMIN_INITIAL_PASSCODE --project luckysrikanett` แล้วพิมพ์ passcode ในหน้าต่าง Terminal (ไม่ต้องใส่ในไฟล์ `.env`)
3. ยกเลิก Beam API key ที่เคยเปิดเผยและสร้าง Merchant API Key ชุดใหม่สำหรับ Production
4. ตั้ง Firebase Secrets โดยรันทีละคำสั่งและกรอกค่าผ่าน Terminal: `BEAM_MERCHANT_ID`, `BEAM_API_KEY` และ `BEAM_WEBHOOK_HMAC_KEY`
5. Publish Functions ด้วย `npx firebase-tools deploy --only functions --project luckysrikanett`
6. นำ URL `https://asia-southeast1-luckysrikanett.cloudfunctions.net/beamWebhook` ไปตั้งใน Beam Lighthouse ให้รับ event `charge.succeeded` และ `charge.failed`
7. เปิด `/admin` แล้วกรอกรหัส 6 หลัก จากนั้นตรวจยอดสนับสนุนในเมนูโดเนต

ตัวอย่างคำสั่งตั้ง secret (ห้ามใส่ค่าจริงต่อท้ายคำสั่งหรือเก็บใน `.env`):

```bash
npx firebase-tools functions:secrets:set BEAM_MERCHANT_ID --project luckysrikanett
npx firebase-tools functions:secrets:set BEAM_API_KEY --project luckysrikanett
npx firebase-tools functions:secrets:set BEAM_WEBHOOK_HMAC_KEY --project luckysrikanett
```

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

ห้ามเก็บ passcode หรือ session token เป็นข้อความธรรมดาใน Firestore และห้ามให้ browser อ่าน collection แอดมินโดยตรง ให้ Cloud Functions ตรวจ hash และส่งข้อมูล dashboard กลับเฉพาะ session ที่ยังไม่หมดอายุ ตาม [Firebase callable functions](https://firebase.google.com/docs/functions/callable) และ [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions)

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

Collection `luckyDraws/{drawId}` เก็บเลข 3 ตัวและเลข 2 ตัวไว้เฉพาะฝั่ง backend หน้าเว็บจะได้รับเลขครบเมื่อสถานะเป็น `paid` เท่านั้น ผู้ใช้ LINE และ Anonymous จะกู้รอบล่าสุดผ่าน `userDrawState` หลัง backend ตรวจตัวตนแล้ว ส่วน `freeDrawUsage` เก็บเฉพาะวันและจำนวนการใช้สิทธิ์ฟรีตามรหัสผู้ใช้ที่ hash แล้ว

Webhook ตรวจ `X-Beam-Signature` ด้วย HMAC-SHA256 จาก raw request body และตรวจ merchant, charge, reference, สกุลเงิน และยอดก่อนเปลี่ยนสถานะเป็น `paid` ห้ามให้ browser ยืนยันการจ่ายเงินโดยตรง
