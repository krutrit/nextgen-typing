# Lesson 20 Progress Saving & Thai Prerequisite Gate Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Fix the Lesson 20 saving bug so the 20th lesson saves to level 20 and gets checked, and lock English typing until all 20 Thai lessons are completed.

**Architecture:** Modify `finishLesson()` in `index.html` to allow progress to reach `curriculum[lang].length` (20), update `renderLessonList()` to properly display checkmarks for all completed lessons, and add a prerequisite check in `setLanguage('EN')` and `updateLanguageButtonsUI()` that gates English access behind Thai completion.

**Tech Stack:** Vanilla JavaScript, HTML5, Tailwind CSS, Node.js test runner.

---

### Task 1: Write Automated Verification Tests for Progress & Gate Logic

**Files:**
- Create: `tests/progress-gate.test.cjs`

**Step 1: Write unit tests covering:**
1. Progress advancement to Lesson 20 (`nextUnlocked = 20`) when finishing lesson 19.
2. Checkmark rendering logic for lesson 20 when level is 20.
3. English gating logic when Thai level < 20 vs >= 20.

**Step 2: Run test to verify initial failures or logic contract**
Run: `node --test tests/progress-gate.test.cjs`

---

### Task 2: Implement Lesson 20 Save and Checkmark in `index.html`

**Files:**
- Modify: `index.html`

**Step 1: Fix `finishLesson` guard condition**
Change `if (nextUnlocked < curriculum[state.lang].length)` to `if (nextUnlocked <= curriculum[state.lang].length)`.
Call `renderLessonList()` immediately inside `finishLesson()` so the checkmark appears right away.
Call `updateLanguageButtonsUI()` so the EN lock state updates immediately if Thai is finished.

**Step 2: Fix `renderLessonList` completion & clickable state**
Ensure that when `maxUnlocked >= curriculum[state.lang].length` (all 20 lessons completed):
- All 20 lessons have `isCompleted = true` and show `✓`.
- Students who completed all 20 lessons are allowed to click any lesson to replay/practice.

**Step 3: Fix `setLanguage` lesson index handling**
When switching languages or logging in, if `savedLesson >= curriculum[lang].length`, default to `curriculum[lang].length - 1` (the 20th lesson) rather than resetting to 0.

---

### Task 3: Implement Thai Prerequisite Gate for English in `index.html`

**Files:**
- Modify: `index.html`

**Step 1: Add `isThaiCompleted()` helper and `updateLanguageButtonsUI()`**
Check whether Thai level >= `curriculum['TH'].length` (20).
Display `EN 🔒` when locked and `EN` when unlocked.

**Step 2: Add gate in `setLanguage(lang)`**
If `lang === 'EN'` and `!isThaiCompleted()`:
Show alert: `"🔒 กรุณาฝึกพิมพ์ภาษาไทยให้ครบทั้ง 20 บทเรียนก่อน จึงจะปลดล็อกบทเรียนภาษาอังกฤษได้ครับ"`.
Keep language as `'TH'`.

**Step 3: Call `updateLanguageButtonsUI()` on page load, login, logout, and lesson completion**

---

### Task 4: Verify All Tests and Build Consistency

**Files:**
- Check: `scripts/build-lettercraft.cjs --check`
- Run: `node --test tests/*.test.cjs`
- Check: `index.html` syntax

---

### Task 5: Commit and Deploy to GitHub Pages

**Files:**
- Commit changes with clear commit message
- Push to GitHub `main` branch
- Verify GitHub Pages deployment status
