const test = require('node:test');
const assert = require('node:assert/strict');

function calculateNextProgress(currentUnlocked, lessonIndex, totalLessons) {
  if (lessonIndex === currentUnlocked) {
    const nextUnlocked = currentUnlocked + 1;
    if (nextUnlocked <= totalLessons) {
      return nextUnlocked;
    }
  }
  return currentUnlocked;
}

function getLessonStatus(index, maxUnlocked, totalLessons) {
  const isCompleted = index < maxUnlocked;
  const isCurrent = index === maxUnlocked;
  const isClickable = maxUnlocked >= totalLessons ? isCompleted : isCurrent;
  const icon = isCompleted ? '✓' : (isCurrent ? '●' : '🔒');
  return { isCompleted, isCurrent, isClickable, icon };
}

function canSwitchToEnglish(thaiProgress, totalThaiLessons) {
  return thaiProgress >= totalThaiLessons;
}

function getLanguageButtonLabel(lang, thaiProgress, totalThaiLessons) {
  if (lang === 'EN') {
    return thaiProgress >= totalThaiLessons ? 'EN' : 'EN 🔒';
  }
  return 'ไทย';
}

test('Lesson 20 completion saves level 20', () => {
  const totalLessons = 20;
  
  // Completing Lesson 19 (index 18) unlocks Lesson 20 (index 19)
  const after19 = calculateNextProgress(18, 18, totalLessons);
  assert.equal(after19, 19);

  // Completing Lesson 20 (index 19) unlocks level 20 (Course completed)
  const after20 = calculateNextProgress(19, 19, totalLessons);
  assert.equal(after20, 20);

  // Once at 20, completing again stays at 20
  const repeat20 = calculateNextProgress(20, 19, totalLessons);
  assert.equal(repeat20, 20);
});

test('All lessons show checkmark and are clickable when level is 20', () => {
  const totalLessons = 20;
  const maxUnlocked = 20;

  for (let index = 0; index < totalLessons; index++) {
    const status = getLessonStatus(index, maxUnlocked, totalLessons);
    assert.equal(status.isCompleted, true, `Lesson ${index + 1} should be completed`);
    assert.equal(status.icon, '✓', `Lesson ${index + 1} should show ✓`);
    assert.equal(status.isClickable, true, `Lesson ${index + 1} should be clickable for practice`);
  }
});

test('English language is locked until Thai has reached 20', () => {
  const totalThai = 20;

  assert.equal(canSwitchToEnglish(0, totalThai), false);
  assert.equal(getLanguageButtonLabel('EN', 0, totalThai), 'EN 🔒');

  assert.equal(canSwitchToEnglish(19, totalThai), false);
  assert.equal(getLanguageButtonLabel('EN', 19, totalThai), 'EN 🔒');

  assert.equal(canSwitchToEnglish(20, totalThai), true);
  assert.equal(getLanguageButtonLabel('EN', 20, totalThai), 'EN');

  assert.equal(canSwitchToEnglish(21, totalThai), true);
  assert.equal(getLanguageButtonLabel('EN', 21, totalThai), 'EN');
});
