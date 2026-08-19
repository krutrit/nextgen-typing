# วิธีย้าย NextGen Typing ขึ้น GitHub Pages

หน้าเว็บ (`index.html`) จะโฮสต์บน GitHub Pages ส่วนการเก็บข้อมูล (Google Sheets)
ยังใช้ Google Apps Script เหมือนเดิม โดยหน้าเว็บจะยิง `fetch` ไปหา Apps Script ให้เอง

---

## ขั้นที่ 1 — อัปเดต Google Apps Script (สำคัญ ต้องทำก่อน)

ไฟล์ `code.gs` ถูกแก้ให้รับคำสั่งบันทึกผ่าน POST แล้ว ต้องเอาขึ้น Apps Script ใหม่:

1. เปิดโปรเจกต์ Apps Script เดิม (script.google.com)
2. ก๊อปโค้ดจาก `code.gs` ในเครื่องนี้ ไปวางทับของเดิมทั้งหมด → บันทึก
3. กด **Deploy → Manage deployments**
4. กดรูปดินสอ (Edit) ที่ deployment เดิม → ช่อง **Version** เลือก **New version**
5. ตรวจให้แน่ใจว่า:
   - **Execute as**: Me
   - **Who has access**: **Anyone**  ← สำคัญมาก ไม่งั้น GitHub ยิงเข้าไม่ได้
6. กด **Deploy**

> ทำแบบ "Manage deployments → Edit → New version" จะได้ URL เดิม (`.../exec`)
> ตรงกับที่ตั้งไว้ใน `index.html` อยู่แล้ว ไม่ต้องแก้อะไรเพิ่ม
>
> ถ้าเผลอสร้าง deployment ใหม่จนได้ URL ใหม่ ให้เอา URL นั้นไปแก้ที่บรรทัด
> `const WEB_APP_URL = "..."` ใน `index.html`

---

## ขั้นที่ 2 — สร้าง GitHub Repo แล้วอัปโหลด index.html

ต้องอัปโหลดแค่ **`index.html`** ไฟล์เดียว (`code.gs` และ `DEPLOY.md` ไม่ต้องขึ้นก็ได้)

### วิธีง่ายสุด (ผ่านหน้าเว็บ GitHub ไม่ต้องใช้ command)
1. ไปที่ https://github.com/new
2. ตั้งชื่อ repo เช่น `nextgen-typing` → เลือก **Public** → กด **Create repository**
3. หน้าถัดไปกด **uploading an existing file**
4. ลากไฟล์ `index.html` เข้าไปวาง → กด **Commit changes**

---

## ขั้นที่ 3 — เปิด GitHub Pages

1. ใน repo ไปที่ **Settings → Pages**
2. หัวข้อ **Build and deployment → Source** เลือก **Deploy from a branch**
3. **Branch**: เลือก `main` โฟลเดอร์ `/ (root)` → **Save**
4. รอ 1–2 นาที รีเฟรชหน้า จะได้ลิงก์เว็บ เช่น
   `https://<username>.github.io/nextgen-typing/`

เปิดลิงก์นั้นได้เลย — เว็บจะโหลดข้อมูลจาก Google Sheets และบันทึกความคืบหน้ากลับได้ครบ

---

## ตรวจสอบว่าใช้ได้จริง

1. เปิดเว็บบน GitHub Pages
2. เพิ่มผู้ใช้ / เล่นผ่าน 1 ด่าน
3. เปิด Google Sheet ที่ผูกกับ Apps Script → ควรเห็นข้อมูลถูกเขียนเข้ามา
4. ถ้าบันทึกไม่เข้า: เปิด DevTools (กด F12) → แท็บ Console ดู error
   - เจอคำว่า CORS / 401 / 403 → กลับไปเช็คขั้นที่ 1 ข้อ 5 ว่า **Who has access = Anyone**

---

## หมายเหตุ

- โค้ดยังใช้กับ Apps Script ได้เหมือนเดิมทุกอย่าง (ตรวจ `google.script` ก่อน ค่อย fallback เป็น fetch)
  ดังนั้นเปิดผ่าน Apps Script URL เดิมก็ยังทำงานได้ปกติ
- Tailwind / Three.js / ฟอนต์ โหลดผ่าน CDN อยู่แล้ว จึงไม่มีไฟล์อื่นต้องอัปโหลด
