# Auto-Transition to English & Permanent Lesson Locking Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Automatically transition students to the English curriculum upon completing Thai Lesson 20 or on login, and permanently lock all completed lessons from being re-typed with an informative completion card.

**Architecture:** Update `finishLesson()` and `nextLesson()` in `index.html` to direct users to English upon passing Thai 20, update `loginUser()` to auto-route to English if Thai is already completed, modify `renderLessonList()` to keep all completed lessons disabled even after finishing 20 lessons, and enhance `renderTypingArea()` and typing event handlers to display a course completion card and disable typing when an entire language curriculum is complete.

**Tech Stack:** HTML5, Vanilla JavaScript, Tailwind CSS, Node.js test runner.

---

### Task 1: Update Verification Unit Tests

**Files:**
- Modify: `tests/progress-gate.test.cjs`

**Step 1: Update unit tests covering:**
1. Verifying completed lessons are permanently locked (`isClickable = false` for any `index < maxUnlocked`, even when `maxUnlocked >= 20`).
2. Verifying transition targets: completing Thai 20 routes to English, login routes to English if Thai completed and English not completed.

**Step 2: Run test to verify failure on old behavior**
Run: `node --test tests/progress-gate.test.cjs`

---

### Task 2: Implement Permanent Locking in `renderLessonList()`

**Files:**
- Modify: `index.html`

**Step 1: Enforce strict disable on completed lessons**
In `renderLessonList()`:
- Completed lessons (`index < maxUnlocked`) are always disabled (`btn.disabled = true;`).
- Remove the condition that unlocked completed lessons when `isCourseFinished`.
- Only the single current lesson (`isCurrent`) can be clicked to load. If the entire course is completed (`maxUnlocked >= curriculum[state.lang].length`), no lesson button is clickable.

---

### Task 3: Implement Auto-Transition to English in `finishLesson()` & `nextLesson()`

**Files:**
- Modify: `index.html`

**Step 1: Set modal button text on Thai 20**
When `state.lang === 'TH'` and `state.lessonIndex === 19` (Lesson 20), set `btnNext.innerText = "ไปฝึกพิมพ์ภาษาอังกฤษต่อ → 🎉"`.

**Step 2: Execute auto-transition in `nextLesson()`**
If `state.lang === 'TH'` and `state.lessonIndex >= 19`:
- Call `closeModal()`.
- Call `setLanguage('EN')`.
- Show brief toast or notification celebrating entry into English.

---

### Task 4: Implement Login Auto-Routing to English

**Files:**
- Modify: `index.html`

**Step 1: Auto-switch to English on Login & Cached Data Load**
In `loginUser(user)`:
- Check if `getUserProgress(user, 'TH') >= 20` and `getUserProgress(user, 'EN') < 20`.
- If true, set `state.lang = 'EN'`.
- Load their current English lesson progress (`getUserProgress(user, 'EN') || 0`).

---

### Task 5: Implement Course Completion Card in `renderTypingArea()`

**Files:**
- Modify: `index.html`

**Step 1: Render completion UI when viewing a finished course**
If `getUserProgress(user, state.lang) >= curriculum[state.lang].length`:
- In `renderTypingArea()`, render a clean congratulations card:
  - Trophy icon `🏆`
  - Headline: "ยอดเยี่ยมมาก! คุณผ่านบทเรียนภาษาไทยครบทั้ง 20 บทแล้ว"
  - Subtitle: "บทเรียนภาษาไทยถูกบันทึกและล็อกเรียบร้อยแล้วครับ"
  - CTA Button: `[ 🚀 ไปฝึกพิมพ์ภาษาอังกฤษต่อ (EN) → ]` with `onclick="setLanguage('EN')"`
- In `handleTyping(e)`: return early if `getUserProgress(user, state.lang) >= curriculum[state.lang].length` to prevent typing inputs.

---

### Task 6: Comprehensive Verification & Build Check

**Files:**
- Run: `node --test tests/block-world.test.cjs tests/lettercraft-view.test.cjs tests/lettercraft-physics.test.cjs tests/progress-gate.test.cjs`
- Check: `node scripts/build-lettercraft.cjs --check`
- Syntax: Node syntax validation on `index.html`

---

### Task 7: Commit & Deploy

**Files:**
- Commit all changes to `main`.
- Push to GitHub repository.
- Verify GitHub Pages deployment status via `gh run list`.
