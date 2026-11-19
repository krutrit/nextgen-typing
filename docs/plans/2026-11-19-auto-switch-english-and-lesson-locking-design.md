# Design Spec: Auto-Transition to English & Completed Lesson Permanent Locking

## 1. Overview
This feature introduces two major UX improvements to the NextGen Typing application:
1. **Auto-transition to English**: When a student completes all 20 lessons of the Thai curriculum, they are automatically transitioned to the English curriculum without needing manual switching. Furthermore, upon logging in (or page reload), students who have already completed Thai are automatically loaded into their current English lesson.
2. **Permanent Locking of Completed Lessons**: Lessons that have already been completed with passing accuracy (≥ 80%) are locked permanently (`disabled`) with a `✓` mark to prevent repeating completed lessons. When an entire course (Thai 20 lessons) is finished, all lessons remain locked, and the central typing area displays a celebratory completion card with a direct call-to-action button to jump straight to English.

---

## 2. Detailed Requirements

### A. Auto-Transition to English Curriculum
1. **Completion of Thai Lesson 20:**
   - In `finishLesson()`: When `state.lang === 'TH'` and Lesson 20 is passed (accuracy ≥ 80%), the completion modal button label updates to `"ไปฝึกพิมพ์ภาษาอังกฤษต่อ → 🎉"`.
   - In `nextLesson()`: When clicked from Thai Lesson 20:
     - Closes modal.
     - Calls `setLanguage('EN')`.
     - Automatically loads the student's current English level (`getUserProgress(user, 'EN') || 0`).
2. **Auto-Routing on Login & Initial Load:**
   - In `loginUser(user)`:
     - If `getUserProgress(user, 'TH') >= 20` AND `getUserProgress(user, 'EN') < 20`:
       - Default `state.lang = 'EN'`.
       - Load their current English lesson.
     - Otherwise, load normally based on their active progress.
   - When switching language to `'TH'`, if `getUserProgress(user, 'TH') >= 20`, display the completion screen.

---

### B. Permanent Locking of Completed Lessons
1. **Sidebar Lesson List (`renderLessonList`):**
   - For every lesson:
     - `isCompleted = index < maxUnlocked`: Displayed with green `✓`, styling `bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/40`, button `disabled = true`. Cannot be clicked.
     - `isCurrent = index === maxUnlocked`: Displayed with green `●`, active/hover style, clickable to load lesson.
     - `isFuture = index > maxUnlocked`: Displayed with lock `🔒`, styling disabled.
   - Even if `maxUnlocked >= curriculum[state.lang].length` (course finished):
     - Every lesson from 0 to 19 remains `isCompleted = true` and `disabled = true`. No re-typing of completed lessons.
2. **Typing Area Completion Screen (`renderTypingArea` & `loadLesson`):**
   - If `maxUnlocked >= curriculum[state.lang].length`:
     - The typing container does NOT render typing spans or prompt text.
     - Instead, render a clean completion card inside the typing display area:
       - 🏆 Trophy icon & congratulations headline.
       - Subtext explaining Thai is complete and locked.
       - Blue CTA button: `"🚀 ไปฝึกพิมพ์ภาษาอังกฤษต่อ (EN) →"` (clicking calls `setLanguage('EN')`).
     - Disable keystroke handling (`handleTyping` returns early if course is finished).
     - Target length and stat displays show completion state.
   - For English course completion (when English also reaches 20):
     - Display a master graduation banner celebrating completion of the entire typing curriculum.

---

## 3. Data Flow & State Interactions

```mermaid
flowchart TD
    A[Student finishes Thai Lesson 20] --> B[Save level 20 to Google Sheets & Cache]
    B --> C[Show Modal with 'ไปฝึกพิมพ์ภาษาอังกฤษต่อ → 🎉']
    C -->|Click Button| D[setLanguage('EN') & loadLesson(currentEnglish)]
    
    E[Student logs in] --> F{Thai Completed & EN < 20?}
    F -->|Yes| G[Set state.lang = 'EN']
    F -->|No| H[Set state.lang = 'TH']
    
    I[Student views Thai tab] --> J{Thai Level >= 20?}
    J -->|Yes| K[All 20 lessons show ✓ and are locked]
    K --> L[Render Completion Card with Jump to EN button]
    J -->|No| M[Render active lesson normally]
```

---

## 4. Verification & Testing
1. Unit tests in `tests/progress-gate.test.cjs`:
   - Verify lesson status: all completed lessons have `isClickable = false` even when `maxUnlocked >= 20`.
   - Verify transition function directs to English when Thai is completed.
2. End-to-end syntax & build checks (`scripts/build-lettercraft.cjs --check`, node syntax validation).
3. Live test of all 60 existing tests to ensure no regressions.
