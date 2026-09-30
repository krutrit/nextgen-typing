# Design Spec: Lesson 20 Progress Saving & Thai Prerequisite Gate

## 1. Overview
This specification addresses two core requirements in the NextGen Typing application:
1. **Fixing the Lesson 20 completion bug**: Ensure students finishing Lesson 20 (the final lesson) have their progress saved to Google Sheets and local state, and the Lesson 20 list item receives a completed checkmark (`✓`).
2. **Thai Prerequisite Gate for English Typing**: Students must complete all 20 lessons of the Thai curriculum before English typing is unlocked. A locked indicator (`EN 🔒`) is displayed when locked, and clicking it informs the student of the requirement.

---

## 2. Bug Fix: Lesson 20 Completion & Checkmark

### Root Cause
In `index.html` within `finishLesson()`:
```javascript
const nextUnlocked = currentUnlocked + 1;
if (nextUnlocked < curriculum[state.lang].length) {
    ...
    mockData.progress[targetUser][state.lang] = nextUnlocked;
    saveProgress(targetUser, nextUnlocked, state.lang);
}
```
When completing Lesson 20 (`currentUnlocked = 19`, `nextUnlocked = 20`), the condition `20 < 20` evaluated to `false`. Therefore:
- The progress was never updated to 20.
- `saveProgress` was never sent to Google Sheets or backend.
- `renderLessonList()` did not mark Lesson 20 as completed because `isCompleted = index < maxUnlocked` (`19 < 19` was `false`).

### Solution
1. Change the guard condition in `finishLesson()` to:
   ```javascript
   if (nextUnlocked <= curriculum[state.lang].length)
   ```
2. When `nextUnlocked === 20`, save progress `20` to Google Sheets / `mockData.progress`.
3. In `renderLessonList()`:
   - If `maxUnlocked >= curriculum[state.lang].length` (all 20 completed):
     - Every lesson `index < maxUnlocked` gets `✓` (including Lesson 20).
     - To allow students who finished all lessons to practice any lesson, when `maxUnlocked >= curriculum[state.lang].length`, all buttons are enabled so they can click and replay any lesson.
4. Call `renderLessonList()` immediately inside `finishLesson()` so that sidebar checkmarks update without requiring page reload.
5. In `setLanguage()` and `loginUser()`, ensure that when `savedLesson >= curriculum[lang].length` (i.e. completed all lessons), `state.lessonIndex` defaults to Lesson 20 (`curriculum[lang].length - 1`) instead of resetting back to Lesson 0.

---

## 3. Thai Prerequisite Gate for English Typing

### Requirements
- Thai has 20 lessons (`curriculum['TH'].length = 20`).
- If `getUserProgress(user, 'TH') < curriculum['TH'].length`:
  - English is locked.
  - The language button displays `EN 🔒`.
  - Clicking `setLanguage('EN')` shows an informative alert:
    `"🔒 กรุณาฝึกพิมพ์ภาษาไทยให้ครบทั้ง 20 บทเรียนก่อน จึงจะปลดล็อกบทเรียนภาษาอังกฤษได้ครับ"`
  - Language remains `'TH'`.
- If `getUserProgress(user, 'TH') >= curriculum['TH'].length`:
  - English is unlocked.
  - The language button displays `EN` normally.
  - Clicking switches language to `'EN'`.
- On completing Thai Lesson 20:
  - If the student just completed Thai Lesson 20, update the language buttons immediately via `updateLanguageButtonsUI()`.
- Admin users: In Admin Dashboard, admins can still view/edit levels freely.

---

## 4. Verification Plan
1. **Unit/Integration verification**:
   - Verify `finishLesson` updates progress to 20 when Lesson 20 is passed.
   - Verify `renderLessonList` displays `✓` for Lesson 20 when level is 20.
   - Verify `setLanguage('EN')` blocks switching when Thai progress < 20.
   - Verify `setLanguage('EN')` allows switching when Thai progress >= 20.
2. **Regression testing**:
   - Run existing Lettercraft unit test suite (`node --test tests/*.test.cjs`).
   - Run syntax checks on `index.html`.
