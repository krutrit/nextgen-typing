# Grade-Level Target Length System Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Allow teachers to configure typing target character lengths per student grade level (ป.1 - ม.6) with optional per-lesson overrides in a hybrid model.

**Architecture:** Extend `state.userSettings.gradeTargets` with a 3-tier cascade hierarchy (Lesson Override -> Grade Base -> Global Default). Parse student grade from username (`[Grade/Room] Name`), resolve target dynamically in `generateLessonText()`, and provide an interactive Grade Target Configuration UI in Admin Modal synced with Google Sheets and localStorage.

**Tech Stack:** JavaScript (ES6+), HTML5, TailwindCSS, Google Apps Script (`code.gs`), Node.js `node:test` runner.

---

### Task 1: Core Target Resolution Logic & Unit Tests (TDD)

**Files:**
- Create: `tests/grade-targets.test.cjs`
- Modify: `index.html` (core helper functions)

**Step 1: Write the failing test**
Create `tests/grade-targets.test.cjs`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Extract helper functions from index.html for testing
const indexSrc = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');

test('getStudentGrade extracts grade level correctly from various username patterns', () => {
  // Test will verify getStudentGrade implementation
  const fnMatch = indexSrc.match(/function getStudentGrade\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(fnMatch, 'index.html must define getStudentGrade function');
  
  const getStudentGrade = new Function('username', fnMatch[0] + '\nreturn getStudentGrade(username);');
  
  assert.equal(getStudentGrade('[ป.3/1] สมชาย เก่งกาจ'), 'ป.3');
  assert.equal(getStudentGrade('[ป.3/2] สุดา สดใส'), 'ป.3');
  assert.equal(getStudentGrade('[ม.1/4] สมหมาย มุ่งมั่น'), 'ม.1');
  assert.equal(getStudentGrade('[ป.6] วันชัย ใจดี'), 'ป.6');
  assert.equal(getStudentGrade('Guest'), null);
  assert.equal(getStudentGrade('Teacher'), null);
});

test('getTargetLengthForUser resolves override > grade base > global fallback', () => {
  const fnMatch = indexSrc.match(/function getTargetLengthForUser\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(fnMatch, 'index.html must define getTargetLengthForUser function');
  
  const gradeFnMatch = indexSrc.match(/function getStudentGrade\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
  const parseRoomMatch = indexSrc.match(/function parseRoom\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
  
  const getTargetLengthForUser = new Function(
    'username', 'lessonIndex', 'settings',
    parseRoomMatch[0] + '\n' + gradeFnMatch[0] + '\n' + fnMatch[0] + '\nreturn getTargetLengthForUser(username, lessonIndex, settings);'
  );
  
  const settings = {
    targetLength: 1000,
    gradeTargets: {
      'ป.3': { base: 150, lessons: { 0: 50, 1: 60 } },
      'ม.1': { base: 500, lessons: {} }
    }
  };
  
  // 1. Per-lesson override
  assert.equal(getTargetLengthForUser('[ป.3/1] เด็กชาย ก', 0, settings), 50);
  assert.equal(getTargetLengthForUser('[ป.3/1] เด็กชาย ก', 1, settings), 60);
  
  // 2. Grade base target (lesson 2 has no override)
  assert.equal(getTargetLengthForUser('[ป.3/1] เด็กชาย ก', 2, settings), 150);
  assert.equal(getTargetLengthForUser('[ม.1/2] สมหญิง ดีเลิศ', 0, settings), 500);
  
  // 3. Fallback to global targetLength for Guest or unconfigured grade
  assert.equal(getTargetLengthForUser('Guest', 0, settings), 1000);
  assert.equal(getTargetLengthForUser('[ป.5/1] สมปอง', 0, settings), 1000);
});
```

**Step 2: Run test to verify it fails**
Command: `node --test tests/grade-targets.test.cjs`
Expected: FAIL with `index.html must define getStudentGrade function`.

**Step 3: Write minimal implementation in `index.html`**
Add helper functions in script section of `index.html`:
```javascript
function getStudentGrade(username) {
    const { room } = parseRoom(username);
    if (!room) return null;
    return room.split('/')[0].trim();
}

function getTargetLengthForUser(username, lessonIndex, customSettings = null) {
    const s = customSettings || (typeof state !== 'undefined' ? state.userSettings : null);
    const globalDefault = (s && s.targetLength) || 1000;
    if (!username) return globalDefault;
    const grade = getStudentGrade(username);
    const gt = s && s.gradeTargets;
    if (grade && gt && gt[grade]) {
        const gradeConf = gt[grade];
        if (gradeConf.lessons && typeof gradeConf.lessons[lessonIndex] === 'number' && gradeConf.lessons[lessonIndex] > 0) {
            return gradeConf.lessons[lessonIndex];
        }
        if (typeof gradeConf.base === 'number' && gradeConf.base > 0) {
            return gradeConf.base;
        }
    }
    return globalDefault;
}
```

**Step 4: Run test to verify it passes**
Command: `node --test tests/grade-targets.test.cjs`
Expected: PASS (2/2 tests pass).

**Step 5: Commit**
Command: `git add tests/grade-targets.test.cjs index.html; git commit -m "feat(curriculum): implement getStudentGrade and getTargetLengthForUser resolution"`

---

### Task 2: Dynamic Lesson Generation & Sidebar Target Display Integration

**Files:**
- Modify: `index.html` (`generateLessonText`, `loadLesson`, `updateAuthUI`)
- Test: `tests/grade-targets.test.cjs`

**Step 1: Write the failing test**
Append to `tests/grade-targets.test.cjs`:
```javascript
test('generateLessonText generates text matching the user grade target length', () => {
  assert.ok(indexSrc.includes('getTargetLengthForUser(state.currentUser, state.lessonIndex)'), 
    'generateLessonText must use getTargetLengthForUser');
  assert.ok(indexSrc.includes('targetDisplay.innerText = getTargetLengthForUser'),
    'loadLesson or renderLessonList must update target-display with resolved grade length');
});
```

**Step 2: Run test to verify it fails**
Command: `node --test tests/grade-targets.test.cjs`
Expected: FAIL.

**Step 3: Write minimal implementation in `index.html`**
1. In `generateLessonText(lesson)`:
   Change:
   `let content = ""; const length = state.userSettings.targetLength;`
   To:
   `let content = ""; const length = getTargetLengthForUser(state.currentUser, state.lessonIndex);`
2. In `loadLesson(index)`:
   Update sidebar `#target-display`:
   ```javascript
   const resolvedLen = getTargetLengthForUser(state.currentUser, state.lessonIndex);
   const targetDisplay = document.getElementById('target-display');
   if (targetDisplay) targetDisplay.innerText = resolvedLen;
   ```
3. In `updateAuthUI()`:
   Call `loadLesson(state.lessonIndex)` when logging in so target display and lesson text instantly adapt to student grade.

**Step 4: Run test to verify it passes**
Command: `node --test tests/grade-targets.test.cjs`
Expected: PASS (3/3 tests pass).

**Step 5: Commit**
Command: `git add index.html tests/grade-targets.test.cjs; git commit -m "feat(curriculum): integrate grade target length into generateLessonText and sidebar display"`

---

### Task 3: Google Apps Script & localStorage Persistence

**Files:**
- Modify: `code.gs`
- Modify: `index.html` (`saveAdminSettings`, `initMockData`)
- Test: `tests/grade-targets.test.cjs`

**Step 1: Write the failing test**
Append to `tests/grade-targets.test.cjs`:
```javascript
test('code.gs and index.html support gradeTargets persistence and fallback', () => {
  const codeGsSrc = fs.readFileSync(path.join(__dirname, '../code.gs'), 'utf-8');
  assert.ok(codeGsSrc.includes('gradeTargets'), 'code.gs must support gradeTargets in saveSettings and getSettings');
  assert.ok(indexSrc.includes('localStorage.setItem(\'ngt_gradeTargets\''), 'index.html must cache gradeTargets in localStorage');
});
```

**Step 2: Run test to verify it fails**
Command: `node --test tests/grade-targets.test.cjs`
Expected: FAIL.

**Step 3: Write minimal implementation**
1. In `code.gs`:
   - In `saveSettings(settings)`:
     Add check for `settings.gradeTargets`:
     `sheet.appendRow(["gradeTargets", typeof settings.gradeTargets === 'object' ? JSON.stringify(settings.gradeTargets) : String(settings.gradeTargets || "{}")]);`
   - In `getSettings()`:
     Add parsing for `gradeTargets`:
     ```javascript
     } else if (data[i][0] === 'gradeTargets') {
       try { settings.gradeTargets = JSON.parse(data[i][1]); } catch (_) { settings.gradeTargets = {}; }
     }
     ```
2. In `index.html`:
   - Cache `localStorage.setItem('ngt_gradeTargets', JSON.stringify(state.userSettings.gradeTargets || {}));` in `saveAdminSettings()`.
   - Read from localStorage fallback in `initMockData()`.

**Step 4: Run test to verify it passes**
Command: `node --test tests/grade-targets.test.cjs`
Expected: PASS (4/4 tests pass).

**Step 5: Commit**
Command: `git add code.gs index.html tests/grade-targets.test.cjs; git commit -m "feat(storage): support gradeTargets in code.gs and localStorage cache"`

---

### Task 4: Admin UI Panel for Grade-Level & Per-Lesson Target Configuration

**Files:**
- Modify: `index.html` (Admin Modal markup & UI management functions)
- Test: `tests/grade-targets.test.cjs`

**Step 1: Write the failing test**
Append to `tests/grade-targets.test.cjs`:
```javascript
test('index.html contains Grade Targets Admin UI elements and render functions', () => {
  assert.ok(indexSrc.includes('id="admin-grade-targets-container"'), 'index.html must contain admin-grade-targets-container');
  assert.ok(indexSrc.includes('renderGradeTargetsAdmin'), 'index.html must define renderGradeTargetsAdmin function');
  assert.ok(indexSrc.includes('saveGradeTargetsAdmin'), 'index.html must define saveGradeTargetsAdmin function');
});
```

**Step 2: Run test to verify it fails**
Command: `node --test tests/grade-targets.test.cjs`
Expected: FAIL.

**Step 3: Write minimal implementation in `index.html`**
1. Add Grade Targets card in `admin-modal` under Settings Section:
   - Header with `🎯 ตั้งค่าจำนวนตัวอักษรแยกตามระดับชั้น (ป.1 - ม.6)`
   - Container `#admin-grade-pills` for selecting active grade tab
   - Input `#admin-grade-base-input` for baseline length of active grade
   - Accordion `#admin-grade-lessons-panel` with 20 compact inputs for per-lesson overrides
   - Save button with `saveGradeTargetsAdmin()`
2. Implement `renderGradeTargetsAdmin()`:
   - Scans existing student rooms to discover all grade levels (`ป.1`, `ป.2`, `ป.3`... `ม.1`...)
   - Renders active tab and populates values from `state.userSettings.gradeTargets`
3. Implement `saveGradeTargetsAdmin()`:
   - Collects inputs, sanitizes numbers ($\ge 10$), updates `state.userSettings.gradeTargets`, saves to Google Sheets & localStorage, and alerts user.

**Step 4: Run test to verify it passes**
Command: `node --test tests/grade-targets.test.cjs`
Expected: PASS (5/5 tests pass).

**Step 5: Commit**
Command: `git add index.html tests/grade-targets.test.cjs; git commit -m "feat(ui): add interactive grade-level and per-lesson target configuration in admin modal"`

---

### Task 5: End-to-End System Verification & Deployment

**Files:**
- Modify: `docs/plans/task.md`

**Step 1: Run complete test suite**
Command: `node --test tests/*.test.cjs`
Expected: All 88+ tests pass (100% PASS, 0 failures).

**Step 2: Run asset build check**
Command: `node scripts/build-lettercraft.cjs --check`
Expected: `Lazy Lettercraft assets are up to date.`

**Step 3: Update `docs/plans/task.md`**
Record completed tasks in live task tracker.

**Step 4: Push and deploy to GitHub Pages**
Command: `git push origin main`
Expected: Deployed cleanly to GitHub Pages.
