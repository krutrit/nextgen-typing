/**
 * Google Apps Script Backend for NextGen Typing
 * รองรับระบบแยกระดับ TH/EN (Progress Tracking) และการจัดการ User แบบเบา
 * อัปเดต: แยกฐานข้อมูลตามห้องเรียน (Room_*) และรองรับการบันทึกแบบ Batch (สำหรับ CSV)
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

function getOrCreateRoomSheet(name) {
  const ss = SpreadsheetApp.openById("1iPaLZL5F2nXGPURv2qD3nz_pLTyhhHSjKR8gCsnaWgs");
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // ชีต Room จะเก็บทั้ง Username, TH_Level, EN_Level ในตัว
    sheet.appendRow(["Username", "TH_Level", "EN_Level"]);
  }
  return sheet;
}

function saveUser(username) {
  let sheetName = SHEET_USERS;
  const match = username.match(/^\[(.*?)\]/);
  if (match) {
    sheetName = "Room_" + match[1];
  }
  
  const sheet = sheetName === SHEET_USERS ? getOrCreateSheet(SHEET_USERS) : getOrCreateRoomSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  
  // เช็คชื่อซ้ำ
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == username) return "Exists";
  }
  
  if (sheetName === SHEET_USERS) {
    sheet.appendRow([username]);
  } else {
    sheet.appendRow([username, 0, 0]); // สำหรับ Room_ ให้ใส่ progress ไปด้วย
  }
  return "Success";
}

function saveUsersBatch(usernames) {
  const ss = SpreadsheetApp.openById("1iPaLZL5F2nXGPURv2qD3nz_pLTyhhHSjKR8gCsnaWgs");
  let roomGroups = {};
  
  // จัดกลุ่มตามห้อง
  usernames.forEach(username => {
    let sheetName = SHEET_USERS;
    const match = username.match(/^\[(.*?)\]/);
    if (match) {
      sheetName = "Room_" + match[1];
    }
    if (!roomGroups[sheetName]) roomGroups[sheetName] = [];
    roomGroups[sheetName].push(username);
  });
  
  for (let sheetName in roomGroups) {
    const sheet = sheetName === SHEET_USERS ? getOrCreateSheet(SHEET_USERS) : getOrCreateRoomSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    const existingUsers = new Set(data.slice(1).map(r => r[0]));
    
    let newRows = [];
    for (let u of roomGroups[sheetName]) {
      if (!existingUsers.has(u)) {
        if (sheetName === SHEET_USERS) {
          newRows.push([u]);
        } else {
          newRows.push([u, 0, 0]);
        }
        existingUsers.add(u);
      }
    }
    
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }
  }
  return "Success";
}

function deleteUser(username) {
  const ss = SpreadsheetApp.openById("1iPaLZL5F2nXGPURv2qD3nz_pLTyhhHSjKR8gCsnaWgs");
  const sheets = ss.getSheets();
  
  // ลบผู้ใช้จากทุกชีตที่เกี่ยวข้อง (รวมถึง Progress)
  for (let s of sheets) {
    const name = s.getName();
    if (name === SHEET_USERS || name === SHEET_PROGRESS || name.startsWith("Room_")) {
      const data = s.getDataRange().getValues();
      // ลบจากล่างขึ้นบนป้องกัน index คลาดเคลื่อน
      for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][0] == username) {
          s.deleteRow(i + 1);
        }
      }
    }
  }
  return "Success";
}

function saveSettings(settings) {
  const sheet = getOrCreateSheet(SHEET_SETTINGS);
  sheet.clear(); // ล้างค่าเก่า
  sheet.appendRow(["Key", "Value"]);
  sheet.appendRow(["targetLength", settings.targetLength]);
  sheet.appendRow(["enableMinigame", settings.enableMinigame !== false]);
  return "Success";
}

// รับ Parameter (Username, Level, Lang) เพื่อแยกลงคอลัมน์ภาษา
function saveProgress(username, level, lang) {
  const ss = SpreadsheetApp.openById("1iPaLZL5F2nXGPURv2qD3nz_pLTyhhHSjKR8gCsnaWgs");
  const sheets = ss.getSheets();
  let found = false;

  // ค้นหาแถวของผู้ใช้คนนี้จากชีตทั้งหมด
  for (let s of sheets) {
    const name = s.getName();
    if (name === SHEET_PROGRESS || name.startsWith("Room_")) {
      const data = s.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == username) {
          if (lang === 'TH') {
            s.getRange(i + 1, 2).setValue(level);
          } else if (lang === 'EN') {
            s.getRange(i + 1, 3).setValue(level);
          }
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  // ถ้ายังไม่มีให้เพิ่มใหม่
  if (!found) {
    let sheetName = SHEET_PROGRESS;
    const match = username.match(/^\[(.*?)\]/);
    if (match) {
      sheetName = "Room_" + match[1];
    }
    const sheet = sheetName === SHEET_PROGRESS ? getOrCreateSheet(SHEET_PROGRESS) : getOrCreateRoomSheet(sheetName);
    const thLevel = lang === 'TH' ? level : 0;
    const enLevel = lang === 'EN' ? level : 0;
    sheet.appendRow([username, thLevel, enLevel]);
  }
  return "Success";
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
function doPost(e) {
  let result = { status: 'error', message: 'Unknown action' };
  try {
    const params = JSON.parse(e.postData.contents);
    switch (params.action) {
      case 'saveUser':
        result = { status: 'ok', result: saveUser(params.username) };
        break;
      case 'saveUsersBatch':
        result = { status: 'ok', result: saveUsersBatch(params.usernames) };
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
  const ss = SpreadsheetApp.openById("1iPaLZL5F2nXGPURv2qD3nz_pLTyhhHSjKR8gCsnaWgs");
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_USERS) sheet.appendRow(["Username"]);
    if (name === SHEET_SETTINGS) sheet.appendRow(["Key", "Value"]);
    if (name === SHEET_PROGRESS) sheet.appendRow(["Username", "TH_Level", "EN_Level"]);
  }
  return sheet;
}

function getUsers() {
  const ss = SpreadsheetApp.openById("1iPaLZL5F2nXGPURv2qD3nz_pLTyhhHSjKR8gCsnaWgs");
  const sheets = ss.getSheets();
  let users = [];
  
  for (let s of sheets) {
    const name = s.getName();
    if (name === SHEET_USERS || name.startsWith("Room_")) {
      const data = s.getDataRange().getValues();
      if (data.length > 1) {
        users = users.concat(data.slice(1).map(r => r[0]).filter(u => u !== ""));
      }
    }
  }
  
  if (users.length === 0) return ["Guest"];
  return [...new Set(users)]; // ลบตัวซ้ำ
}

function getSettings() {
  const sheet = getOrCreateSheet(SHEET_SETTINGS);
  const data = sheet.getDataRange().getValues();
  let settings = { targetLength: 1000, enableMinigame: true }; 
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'targetLength') {
      settings.targetLength = parseInt(data[i][1]);
    } else if (data[i][0] === 'enableMinigame') {
      settings.enableMinigame = (data[i][1] === true || String(data[i][1]).toLowerCase() === 'true');
    }
  }
  return settings;
}

function getProgress() {
  const ss = SpreadsheetApp.openById("1iPaLZL5F2nXGPURv2qD3nz_pLTyhhHSjKR8gCsnaWgs");
  const sheets = ss.getSheets();
  let progressMap = {};
  
  for (let s of sheets) {
    const name = s.getName();
    if (name === SHEET_PROGRESS || name.startsWith("Room_")) {
      const data = s.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const user = data[i][0];
        if (user) {
          progressMap[user] = {
            'TH': parseInt(data[i][1]) || 0,
            'EN': parseInt(data[i][2]) || 0
          };
        }
      }
    }
  }
  return progressMap;
}
