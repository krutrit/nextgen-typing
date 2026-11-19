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
  // Permanently lock completed lessons: completed lessons are NEVER clickable
  const isClickable = isCurrent && !isCompleted;
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

function getNextLanguageOnCompletion(currentLang, lessonIndex, totalLessons) {
  if (currentLang === 'TH' && lessonIndex >= totalLessons - 1) {
    return 'EN';
  }
  return currentLang;
}

function getInitialLanguageOnLogin(thaiProgress, englishProgress, totalThaiLessons, totalEnglishLessons) {
  if (thaiProgress >= totalThaiLessons && englishProgress < totalEnglishLessons) {
    return 'EN';
  }
  return 'TH';
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

test('Completed lessons are permanently locked and NOT clickable', () => {
  const totalLessons = 20;

  // When midway through (e.g. at lesson 5, maxUnlocked = 4)
  const status0 = getLessonStatus(0, 4, totalLessons);
  assert.equal(status0.isCompleted, true);
  assert.equal(status0.isClickable, false, 'Completed lesson 1 must not be clickable');
  assert.equal(status0.icon, '✓');

  const status4 = getLessonStatus(4, 4, totalLessons);
  assert.equal(status4.isCurrent, true);
  assert.equal(status4.isClickable, true, 'Current lesson 5 must be clickable');
  assert.equal(status4.icon, '●');

  // When all 20 lessons completed (maxUnlocked = 20)
  for (let index = 0; index < totalLessons; index++) {
    const status = getLessonStatus(index, 20, totalLessons);
    assert.equal(status.isCompleted, true, `Lesson ${index + 1} should be completed`);
    assert.equal(status.icon, '✓', `Lesson ${index + 1} should show ✓`);
    assert.equal(status.isClickable, false, `Completed lesson ${index + 1} must be locked permanently`);
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

test('Auto-transition routes to English when Thai 20 is passed', () => {
  assert.equal(getNextLanguageOnCompletion('TH', 19, 20), 'EN');
  assert.equal(getNextLanguageOnCompletion('TH', 18, 20), 'TH');
  assert.equal(getNextLanguageOnCompletion('EN', 19, 20), 'EN');
});

test('Login auto-routes to English if Thai is done and English is not', () => {
  assert.equal(getInitialLanguageOnLogin(20, 0, 20, 20), 'EN');
  assert.equal(getInitialLanguageOnLogin(20, 5, 20, 20), 'EN');
  assert.equal(getInitialLanguageOnLogin(19, 0, 20, 20), 'TH');
  assert.equal(getInitialLanguageOnLogin(20, 20, 20, 20), 'TH');
});
