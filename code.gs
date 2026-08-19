/**
 * Google Apps Script Backend for NextGen Typing
 * รองรับระบบแยกระดับ TH/EN (Progress Tracking) และการจัดการ User แบบเบา
 */

const SHEET_USERS = "Data_Users";
const SHEET_SETTINGS = "Data_Settings";
const SHEET_PROGRESS = "Data_Progress";

// ==========================================
// 1. ฟังก์ชันหลักที่ HTML เรียกใช้ (google.script.run)
// ==========================================

function getData() {
  return {
    users: getUsers(),
    settings: getSettings(),
    progress: getProgress() 
  };
}

function saveUser(username) {
  const sheet = getOrCreateSheet(SHEET_USERS);
  const data = sheet.getDataRange().getValues();
  // เช็คชื่อซ้ำ
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == username) return "Exists";
  }
  sheet.appendRow([username]);
  return "Success";
}

function deleteUser(username) {
  const sheet = getOrCreateSheet(SHEET_USERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == username) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  // ลบ Progress ด้วย
  deleteProgress(username);
  return "Success";
}

function saveSettings(settings) {
  const sheet = getOrCreateSheet(SHEET_SETTINGS);
  sheet.clear(); // ล้างค่าเก่า
  sheet.appendRow(["Key", "Value"]);
  sheet.appendRow(["targetLength", settings.targetLength]);
  return "Success";
}

// รับ Parameter (Username, Level, Lang) เพื่อแยกลงคอลัมน์ภาษา
function saveProgress(username, level, lang) {
  const sheet = getOrCreateSheet(SHEET_PROGRESS);
  const data = sheet.getDataRange().getValues();
  let found = false;

  // ค้นหาแถวของผู้ใช้คนนี้
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == username) {
      if (lang === 'TH') {
        sheet.getRange(i + 1, 2).setValue(level);
      } else if (lang === 'EN') {
        sheet.getRange(i + 1, 3).setValue(level);
      }
      found = true;
      break;
    }
  }

  // ถ้ายังไม่มีให้เพิ่มใหม่ (Col1 = User, Col2 = TH Level, Col3 = EN Level)
  if (!found) {
    const thLevel = lang === 'TH' ? level : 0;
    const enLevel = lang === 'EN' ? level : 0;
    sheet.appendRow([username, thLevel, enLevel]);
  }
  return "Success";
}

function deleteProgress(username) {
  const sheet = getOrCreateSheet(SHEET_PROGRESS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == username) {
      sheet.deleteRow(i + 1);
      break; 
    }
  }
}

// ==========================================
// 2. HTTP Handlers (สำหรับการเรียกแบบ fetch)
// ==========================================

function doGet(e) {
  if (e.parameter && e.parameter.action === 'getData') {
    return ContentService.createTextOutput(JSON.stringify(getData())).setMimeType(ContentService.MimeType.JSON);
  }
  
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('NextGen Typing')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// รับคำสั่งเขียนข้อมูล (save/delete) จากหน้าเว็บที่โฮสต์ภายนอก เช่น GitHub Pages
// ส่ง body มาเป็น JSON string (Content-Type: text/plain) เพื่อเลี่ยง CORS preflight
function doPost(e) {
  let result = { status: 'error', message: 'Unknown action' };
  try {
    const params = JSON.parse(e.postData.contents);
    switch (params.action) {
      case 'saveUser':
        result = { status: 'ok', result: saveUser(params.username) };
        break;
      case 'deleteUser':
        deleteUser(params.username);
        result = { status: 'ok' };
        break;
      case 'saveSettings':
        saveSettings(params.settings);
        result = { status: 'ok' };
        break;
      case 'saveProgress':
        saveProgress(params.username, params.level, params.lang);
        result = { status: 'ok' };
        break;
    }
  } catch (err) {
    result = { status: 'error', message: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 3. Helper Functions (Internal)
// ==========================================

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // สร้าง Header ถ้าเพิ่งสร้าง Sheet ใหม่
    if (name === SHEET_USERS) sheet.appendRow(["Username"]);
    if (name === SHEET_SETTINGS) sheet.appendRow(["Key", "Value"]);
    // ชีตเก็บ Progress มี 3 คอลัมน์
    if (name === SHEET_PROGRESS) sheet.appendRow(["Username", "TH_Level", "EN_Level"]);
  }
  return sheet;
}

function getUsers() {
  const sheet = getOrCreateSheet(SHEET_USERS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return ["Guest"]; 
  return data.slice(1).map(r => r[0]).filter(u => u !== "");
}

function getSettings() {
  const sheet = getOrCreateSheet(SHEET_SETTINGS);
  const data = sheet.getDataRange().getValues();
  let settings = { targetLength: 1000 }; 
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'targetLength') {
      settings.targetLength = parseInt(data[i][1]);
    }
  }
  return settings;
}

function getProgress() {
  const sheet = getOrCreateSheet(SHEET_PROGRESS);
  const data = sheet.getDataRange().getValues();
  let progressMap = {};
  
  // แปลงให้เป็น Object: { 'UserA': { 'TH': 5, 'EN': 2 }, ... } 
  for (let i = 1; i < data.length; i++) {
    const user = data[i][0];
    if (user) {
      progressMap[user] = {
        'TH': parseInt(data[i][1]) || 0,
        'EN': parseInt(data[i][2]) || 0
      };
    }
  }
  return progressMap;
}