| Task | Status | Details |
|---|---|---|
| Explore codebase & root-cause investigation | Completed | Found root cause in finishLesson (nextUnlocked < length), verified auto-save behavior |
| Clarify & present approaches to user | Completed | User approved approach 1 (EN lock + alert & lesson 20 fix) |
| Write design doc & implementation plan | Completed | Created design doc and plan in docs/plans/ |
| Task 1: Write automated tests for progress & gate logic | Completed | tests/progress-gate.test.cjs (3/3 pass) |
| Task 2: Implement Lesson 20 save & checkmark | Completed | Fixed finishLesson, renderLessonList in index.html |
| Task 3: Implement Thai prerequisite gate for English | Completed | Added isThaiCompleted, updateLanguageButtonsUI, setLanguage gate |
| Task 4: Verify test suite & syntax | Completed | 60 unit tests pass, syntax checked |
| Task 5: Commit & deploy to GitHub Pages | In Progress | git add, commit, push, verify gh pages run |
