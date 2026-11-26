const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexSrc = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');

test('getStudentGrade extracts grade level correctly from various username patterns', () => {
  const fnMatch = indexSrc.match(/function getStudentGrade\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(fnMatch, 'index.html must define getStudentGrade function');
  
  const parseRoomMatch = indexSrc.match(/function parseRoom\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(parseRoomMatch, 'index.html must define parseRoom function');

  const getStudentGrade = new Function('username', parseRoomMatch[0] + '\n' + fnMatch[0] + '\nreturn getStudentGrade(username);');
  
  assert.equal(getStudentGrade('[ป.3/1] สมชาย เก่งกาจ'), 'ป.3');
  assert.equal(getStudentGrade('[ป.3/2] สุดา สดใส'), 'ป.3');
  assert.equal(getStudentGrade('[ม.1/4] สมหมาย มุ่งมั่น'), 'ม.1');
  assert.equal(getStudentGrade('[ป.6] วันชัย ใจดี'), 'ป.6');
  assert.equal(getStudentGrade('Guest'), null);
  assert.equal(getStudentGrade('Teacher'), null);
});

test('getTargetLengthForUser resolves override > grade base > global fallback', () => {
  const fnMatch = indexSrc.match(/function getTargetLengthForUser[\s\S]*?^    \}/m);
  assert.ok(fnMatch, 'index.html must define getTargetLengthForUser function');
  
  const gradeFnMatch = indexSrc.match(/function getStudentGrade[\s\S]*?^    \}/m);
  const parseRoomMatch = indexSrc.match(/function parseRoom[\s\S]*?^    \}/m);
  
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

test('generateLessonText and target-display integrate getTargetLengthForUser', () => {
  const currentSrc = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');
  assert.ok(currentSrc.includes('getTargetLengthForUser(state.currentUser, state.lessonIndex)'), 
    'generateLessonText must call getTargetLengthForUser(state.currentUser, state.lessonIndex)');
  assert.ok(currentSrc.includes('targetDisplay.innerText = getTargetLengthForUser(state.currentUser, state.lessonIndex)'), 
    'Sidebar targetDisplay must update using getTargetLengthForUser(state.currentUser, state.lessonIndex)');
});

test('code.gs and index.html support gradeTargets persistence and fallback', () => {
  const codeGsSrc = fs.readFileSync(path.join(__dirname, '../code.gs'), 'utf-8');
  assert.ok(codeGsSrc.includes('gradeTargets'), 'code.gs must support gradeTargets in saveSettings and getSettings');
  
  const currentSrc = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');
  assert.ok(currentSrc.includes("localStorage.setItem('ngt_gradeTargets'") || currentSrc.includes('localStorage.setItem("ngt_gradeTargets"'),
    'index.html must cache gradeTargets in localStorage');
  assert.ok(currentSrc.includes("localStorage.getItem('ngt_gradeTargets'") || currentSrc.includes('localStorage.getItem("ngt_gradeTargets"'),
    'index.html must read gradeTargets from localStorage');
});
