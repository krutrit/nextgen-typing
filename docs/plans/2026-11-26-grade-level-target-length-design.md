# Design Document: Grade-Level Target Length System (ระบบแยกจำนวนตัวอักษรเป้าหมายตามระดับชั้น)

**Date:** 2026-11-26  
**Status:** Approved by User  
**Author:** Antigravity & User  

---

## 1. Problem Statement & Motivation
ปัจจุบันในระบบ NextGen Typing จำนวนตัวอักษรเป้าหมายต่อบทเรียน (`targetLength`) ถูกกำหนดเป็นค่าคงที่สากลเพียงค่าเดียว (เช่น 1,000 ตัวอักษร) สำหรับผู้เรียนทุกคน ส่งผลให้นักเรียนในแต่ละระดับชั้น ไม่สามารถปรับความยาก-ง่ายให้เหมาะสมกับวัยได้ (เช่น นักเรียนชั้น ป.1–ป.3 ต้องการฝึกพิมพ์เพียง 100–200 ตัวอักษร ในขณะที่นักเรียนชั้นมัธยมต้องการฝึกพิมพ์ 500–1,000 ตัวอักษร)

ผู้ใช้ต้องการให้ระบบสามารถ:
1. กำหนดจำนวนตัวอักษรเป้าหมายแยกตาม **ระดับชั้นเรียน (Grade Level)** เช่น ป.3, ป.4, ม.1 ได้อย่างเป็นอิสระ
2. ใช้สถาปัตยกรรมแบบ **Hybrid**: มีค่าตั้งต้นต่อระดับชั้น (Base target) และสามารถระบุจำนวนตัวอักษรแยกเฉพาะบทเรียน (Per-lesson override) ได้ตามต้องการ
3. มีระบบ Fallback ที่ปลอดภัย ไม่ทำให้ระบบคำนวณคะแนน, Google Sheets API, หรือมินิเกมเดิมพัง

---

## 2. Architecture & Data Model

### 2.1 โครงสร้างข้อมูล `gradeTargets`
โครงสร้างข้อมูลถูกเก็บเป็นอ็อบเจกต์ใน `state.userSettings.gradeTargets` และซิงก์ลง Google Sheets ชีต `Data_Settings`:

```json
{
  "targetLength": 1000,
  "enableMinigame": true,
  "gradeTargets": {
    "ป.1": { "base": 100, "lessons": { "0": 40, "1": 50 } },
    "ป.2": { "base": 150, "lessons": {} },
    "ป.3": { "base": 200, "lessons": { "0": 60, "19": 120 } },
    "ป.4": { "base": 300, "lessons": {} },
    "ป.5": { "base": 400, "lessons": {} },
    "ป.6": { "base": 500, "lessons": {} },
    "ม.1": { "base": 600, "lessons": {} }
  }
}
```

### 2.2 การจัดเก็บ (Storage & Persistence)
1. **Google Sheets (`code.gs`)**:
   - ในชีต `Data_Settings`: แถวคีย์ `gradeTargets` จะเก็บค่า JSON string
   - ฟังก์ชัน `saveSettings(settings)` อัปเดตหรือเพิ่มแถว `gradeTargets` โดยไม่กระทบต่อแถวอื่น
   - ฟังก์ชัน `getSettings()` อ่านและ `JSON.parse` กลับมาเป็นอ็อบเจกต์ หากยังไม่มีคีย์นี้จะส่งคืน `{}`
2. **Client Cache (`localStorage`)**:
   - บันทึกแคชใน `localStorage.getItem('ngt_gradeTargets')` เพื่อให้โหลดได้ทันทีแบบออฟไลน์

---

## 3. Business Logic & Resolution Hierarchy

### 3.1 การสกัดระดับชั้น (`getStudentGrade`)
ใช้ชื่อห้องเรียนที่มีอยู่เดิม เช่น `[ป.3/1] สมชาย` หรือ `[ม.1/2] สมหญิง`:
```javascript
function getStudentGrade(username) {
  const { room } = parseRoom(username);
  if (!room) return null;
  // ตัวอย่าง: "ป.3/1" -> "ป.3", "ม.1/2" -> "ม.1", "ป.4" -> "ป.4"
  return room.split('/')[0].trim();
}
```

### 3.2 ลำดับการเลือกจำนวนตัวอักษร (`getTargetLengthForUser`)
เมื่อนักเรียนโหลดบทเรียนที่ $X$ (`lessonIndex`):
1. **Per-Lesson Override**: ตรวจสอบว่าในระดับชั้นนั้นมี `lessons[lessonIndex]` กำหนดไว้หรือไม่? ถ้ามีและ $> 0$ ให้ใช้ค่านั้น
2. **Grade Base Target**: ถ้าไม่มีเฉพาะบท ให้ใช้ค่า `base` ของระดับชั้นนั้น
3. **Global Fallback**: หากเป็น Guest หรือระดับชั้นที่ไม่ได้ตั้งค่า ให้ถอยกลับไปใช้ `state.userSettings.targetLength` (1,000)

```javascript
function getTargetLengthForUser(username, lessonIndex) {
  const grade = getStudentGrade(username);
  const gt = state.userSettings && state.userSettings.gradeTargets;
  if (grade && gt && gt[grade]) {
    const gradeConfig = gt[grade];
    if (gradeConfig.lessons && typeof gradeConfig.lessons[lessonIndex] === 'number' && gradeConfig.lessons[lessonIndex] > 0) {
      return gradeConfig.lessons[lessonIndex];
    }
    if (typeof gradeConfig.base === 'number' && gradeConfig.base > 0) {
      return gradeConfig.base;
    }
  }
  return (state.userSettings && state.userSettings.targetLength) || 1000;
}
```

### 3.3 การสร้างบทเรียน (`generateLessonText`)
ปรับปรุงฟังก์ชัน `generateLessonText(lesson)`:
```javascript
let content = "";
const length = getTargetLengthForUser(state.currentUser, state.lessonIndex);
```
และอัปเดตตัวเลข `#target-display` ใน Sidebar ให้แสดงผลจำนวนตัวอักษรเป้าหมายจริงของบทเรียนและนักเรียนคนนั้น

---

## 4. Admin UI Specification
เพิ่มส่วนการตั้งค่าใน `admin-modal` (`index.html`):
1. **Grade Pill Selector**: แสดงรายการระดับชั้นทั้งหมดที่พบในระบบ (เช่น ป.1, ป.2, ป.3, ป.4, ม.1...) พร้อมปุ่ม `+ เพิ่มระดับชั้น`
2. **Base Length Input**: ช่องกรอกจำนวนตัวอักษรเริ่มต้นของระดับชั้นที่เลือก
3. **Per-Lesson Accordion / Grid**: ปุ่มคลี่แสดงรายการบทเรียน 1–20 ให้เลือกปรับเฉพาะบท (ปล่อยว่าง = ใช้ค่า Base)
4. **Action Buttons**: ปุ่มบันทึกการตั้งค่าระดับชั้น บันทึกลงทั้ง Local state, localStorage และ Google Sheets

---

## 5. Safety, Isolation & Verification
1. **Zero Side-Effects**:
   - ไม่แตะต้องระบบจับเวลา, WPM, การคำนวณ Accuracy, แป้นพิมพ์เสมือน, เสียง SFX
   - ไม่แตะต้องมินิเกม MMORPG 2.5D Arcade
   - ไม่แตะต้องโครงสร้างตารางข้อมูลนักเรียน (`Data_Users`) และคะแนน (`Data_Progress`, `Room_*`)
2. **Testing (TDD)**:
   - สร้างชุดทดสอบใน `tests/grade-targets.test.cjs`
   - ทดสอบ `getStudentGrade` กับชื่อนักเรียนหลากหลายรูปแบบ
   - ทดสอบลำดับการเลือก `getTargetLengthForUser`
   - ทดสอบความยาวของข้อความจริงใน `generateLessonText`
   - รันชุดทดสอบทั้งหมด 88+ ข้อในโปรเจกต์ให้ผ่าน 100%
