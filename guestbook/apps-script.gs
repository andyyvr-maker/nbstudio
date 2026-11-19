/**
 * N. B. Studio 訪客留言板後端（Google Apps Script）
 *
 * 安裝方式：見 guestbook/README.md
 * - 留言存在這份試算表的「留言」工作表。
 * - 不想顯示某則留言：把該列「顯示」欄改成 FALSE，或直接刪除該列。
 */
const SHEET_NAME = '留言';
const MAX_NAME = 30;
const MAX_MSG = 500;
const NOTIFY_EMAIL = '';   // 想收到新留言通知就填你的 Email，例如 'you@gmail.com'

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['時間', '暱稱', '留言', '顯示']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 避免留言被試算表當成公式執行
function safe_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doGet() {
  const sh = sheet_();
  const n = sh.getLastRow();
  const rows = n > 1 ? sh.getRange(2, 1, n - 1, 4).getValues() : [];
  const list = rows
    .filter(r => r[1] !== '' && String(r[3]).toUpperCase() !== 'FALSE')
    .map(r => ({ t: new Date(r[0]).toISOString(), name: String(r[1]).replace(/^'/, ''), msg: String(r[2]).replace(/^'/, '') }))
    .reverse()
    .slice(0, 100);
  return json_({ ok: true, list: list });
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '資料格式錯誤。' }); }
  if (d.website) return json_({ ok: true });            // 機器人陷阱欄位
  const name = String(d.name || '').trim().slice(0, MAX_NAME);
  const msg = String(d.msg || '').trim().slice(0, MAX_MSG);
  if (!name || !msg) return json_({ ok: false, error: '請填寫暱稱和留言。' });

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    sheet_().appendRow([new Date(), safe_(name), safe_(msg), true]);
  } finally {
    lock.releaseLock();
  }
  if (NOTIFY_EMAIL) {
    MailApp.sendEmail(NOTIFY_EMAIL, 'N. B. Studio 網站有新留言：' + name, msg);
  }
  return json_({ ok: true });
}
