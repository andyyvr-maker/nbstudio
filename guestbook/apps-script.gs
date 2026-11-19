/**
 * N. B. Studio 訪客留言板後端（Google Apps Script）
 *
 * 安裝方式：見 guestbook/README.md
 * - 留言存在這份試算表的「留言」工作表。
 * - 不想顯示某則留言：把該列「顯示」欄改成 FALSE，或直接刪除該列。
 * - 新留言會寄 Email 通知（見 NOTIFY_EMAIL）。
 */
const SHEET_NAME = '留言';
const MAX_NAME = 30;
const MAX_MSG = 500;
const SITE_URL = 'https://andyyvr-maker.github.io/nbstudio/';

// 新留言通知：
//   'owner'  → 寄到這個 Google 帳號自己的 Gmail（預設）
//   ''       → 不寄通知
//   或直接填 Email，例如 'you@gmail.com'；多個信箱用逗號分隔
const NOTIFY_EMAIL = 'owner';

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

function notifyTo_() {
  if (!NOTIFY_EMAIL) return '';
  return NOTIFY_EMAIL === 'owner' ? Session.getEffectiveUser().getEmail() : NOTIFY_EMAIL;
}

function sendNotice_(name, msg, when) {
  const to = notifyTo_();
  if (!to) return;
  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const time = Utilities.formatDate(when, 'Asia/Taipei', 'yyyy/MM/dd HH:mm');
  MailApp.sendEmail({
    to: to,
    name: 'N. B. Studio 網站',
    subject: '💬 新留言：' + name,
    body: name + ' 在 ' + time + ' 留言：\n\n' + msg +
      '\n\n────────\n管理留言（隱藏或刪除）：' + sheetUrl + '\n網站：' + SITE_URL,
  });
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

  const now = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    sheet_().appendRow([now, safe_(name), safe_(msg), true]);
  } finally {
    lock.releaseLock();
  }
  try { sendNotice_(name, msg, now); } catch (err) { console.error(err); }  // 寄信失敗不影響留言
  return json_({ ok: true });
}

/** 在編輯器上方選這個函式按「執行」：完成寄信授權並寄一封測試信給自己。 */
function testNotify() {
  sendNotice_('測試', '這是 N. B. Studio 留言通知的測試信。收到就代表設定成功，之後網站有新留言都會寄到這裡。', new Date());
}
