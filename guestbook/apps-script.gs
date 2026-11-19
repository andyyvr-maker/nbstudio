/**
 * N. B. Studio 訪客留言板後端（Google Apps Script）
 *
 * 安裝方式：見 guestbook/README.md
 * 試算表「留言」工作表欄位：
 *   A 時間｜B 暱稱｜C 留言｜D 顯示｜E 編號｜F 回覆給｜G 站長回覆
 * - 不想顯示某則留言：把「顯示」改成 FALSE，或刪除該列。
 * - 站長回覆：直接在 G 欄「站長回覆」打字，網站會顯示為 N. B. Studio 的官方回覆。
 * - 訪客可以回覆別人的留言（F 欄記錄回覆的是哪一則）。
 */
const SHEET_NAME = '留言';
const HEADERS = ['時間', '暱稱', '留言', '顯示', '編號', '回覆給', '站長回覆'];
const MAX_NAME = 30;
const MAX_MSG = 500;
const SITE_URL = 'https://andyyvr-maker.github.io/nbstudio/';
const RESERVED = /n\.?\s*b\.?\s*studio|站長|版主|管理員/i;   // 訪客不能用的暱稱

// 新留言通知：'owner' = 寄到這個 Google 帳號的 Gmail；'' = 不寄；或填 Email（多個用逗號分隔）
const NOTIFY_EMAIL = 'owner';

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  // 舊版只有 4 欄：補上新欄位標題
  const head = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (head.join('|') !== HEADERS.join('|')) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function unsafe_(s) { return String(s).replace(/^'/, ''); }
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/** 讀取全部列；沒有編號的舊留言自動補上編號。 */
function rows_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  const range = sh.getRange(2, 1, n - 1, HEADERS.length);
  const vals = range.getValues();
  let changed = false;
  vals.forEach(r => { if (r[1] !== '' && !r[4]) { r[4] = newId_(); changed = true; } });
  if (changed) sh.getRange(2, 5, vals.length, 1).setValues(vals.map(r => [r[4]]));
  return vals.filter(r => r[1] !== '');
}

const visible_ = r => String(r[3]).toUpperCase() !== 'FALSE';

function doGet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  let all;
  try { all = rows_(sheet_()); } finally { lock.releaseLock(); }

  const item = r => {
    const o = { id: String(r[4]), t: new Date(r[0]).toISOString(), name: unsafe_(r[1]), msg: unsafe_(r[2]) };
    if (String(r[6]).trim()) o.owner = unsafe_(r[6]);
    return o;
  };
  const shown = all.filter(visible_);
  const topIds = new Set(shown.filter(r => !r[5]).map(r => String(r[4])));
  const replies = {};
  shown.filter(r => r[5] && topIds.has(String(r[5]))).forEach(r => {
    (replies[r[5]] = replies[r[5]] || []).push(item(r));
  });
  const list = shown.filter(r => !r[5]).map(r => {
    const o = item(r);
    o.replies = (replies[o.id] || []).sort((a, b) => a.t.localeCompare(b.t));
    return o;
  }).reverse().slice(0, 100);
  return json_({ ok: true, v: 2, list: list });
}

function notifyTo_() {
  if (!NOTIFY_EMAIL) return '';
  return NOTIFY_EMAIL === 'owner' ? Session.getEffectiveUser().getEmail() : NOTIFY_EMAIL;
}

function sendNotice_(name, msg, when, parent) {
  const to = notifyTo_();
  if (!to) return;
  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const time = Utilities.formatDate(when, 'Asia/Taipei', 'yyyy/MM/dd HH:mm');
  const head = parent
    ? name + ' 在 ' + time + ' 回覆了「' + parent.name + '」的留言：\n\n' + msg + '\n\n（原留言：' + parent.msg + '）'
    : name + ' 在 ' + time + ' 留言：\n\n' + msg;
  MailApp.sendEmail({
    to: to,
    name: 'N. B. Studio 網站',
    subject: (parent ? '↩️ 新回覆：' : '💬 新留言：') + name,
    body: head +
      '\n\n────────\n想以站長身分回覆：打開試算表，在這則留言那一列的「站長回覆」欄（G 欄）打字即可。' +
      '\n管理留言：' + sheetUrl + '\n網站：' + SITE_URL,
  });
}

/* ---------- 站長模式 ---------- */
function ownerKey_() { return PropertiesService.getScriptProperties().getProperty('OWNER_KEY') || ''; }
function isOwner_(k) { const key = ownerKey_(); return !!key && String(k || '') === key; }

/** 站長回覆：寫入（或修改）該則留言的「站長回覆」欄。 */
function ownerReply_(parentId, msg) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sh = sheet_();
    const all = rows_(sh);
    const n = sh.getLastRow();
    const ids = n > 1 ? sh.getRange(2, 5, n - 1, 1).getValues().map(r => String(r[0])) : [];
    const idx = ids.indexOf(String(parentId));
    if (idx < 0 || !all.length) return json_({ ok: false, error: '要回覆的留言已不存在。' });
    sh.getRange(idx + 2, 7).setValue(msg ? safe_(msg) : '');
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '資料格式錯誤。' }); }
  if (d.website) return json_({ ok: true });            // 機器人陷阱欄位
  if (d.ownerKey !== undefined) {
    if (!isOwner_(d.ownerKey)) return json_({ ok: false, error: '站長金鑰不正確，請重新點選 Email 裡的站長連結。' });
    if (d.verify) return json_({ ok: true, owner: true });
    if (!d.parent) return json_({ ok: false, error: '請選擇要回覆的留言。' });
    return ownerReply_(String(d.parent), String(d.msg || '').trim().slice(0, MAX_MSG));
  }
  const name = String(d.name || '').trim().slice(0, MAX_NAME);
  const msg = String(d.msg || '').trim().slice(0, MAX_MSG);
  const parentId = String(d.parent || '').trim();
  if (!name || !msg) return json_({ ok: false, error: '請填寫暱稱和留言。' });
  if (RESERVED.test(name)) return json_({ ok: false, error: '這個暱稱保留給站長使用，請換一個。' });

  const now = new Date();
  let parent = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sh = sheet_();
    if (parentId) {
      const p = rows_(sh).find(r => String(r[4]) === parentId && !r[5] && visible_(r));
      if (!p) return json_({ ok: false, error: '要回覆的留言已不存在。' });
      parent = { name: unsafe_(p[1]), msg: unsafe_(p[2]) };
    }
    sh.appendRow([now, safe_(name), safe_(msg), true, newId_(), parentId, '']);
  } finally {
    lock.releaseLock();
  }
  try { sendNotice_(name, msg, now, parent); } catch (err) { console.error(err); }  // 寄信失敗不影響留言
  return json_({ ok: true });
}

/**
 * 開通站長模式：在編輯器上方選這個函式按「執行」。
 * 會產生一把站長金鑰（存在這個專案的私密設定，不在程式碼裡），並把開通連結寄給你。
 * 在要用來回覆的電腦或手機上點那個連結，該裝置就會進入站長模式。
 * 想讓舊連結失效：先執行 resetOwnerKey，再執行一次 setupOwnerMode。
 */
function setupOwnerMode() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('OWNER_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('OWNER_KEY', key);
  }
  const link = SITE_URL + '#owner=' + key;
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    name: 'N. B. Studio 網站',
    subject: '🔑 N. B. Studio 站長模式開通連結',
    body: '在要用來回覆留言的電腦或手機上點這個連結，該裝置就會進入站長模式：\n\n' + link +
      '\n\n站長模式下，回覆留言會自動以「N. B. Studio 站長」身分送出，不用輸入暱稱。' +
      '\n請不要把這封信轉寄給別人。若連結外流，在 Apps Script 執行 resetOwnerKey 再執行 setupOwnerMode 即可換新。',
  });
  console.log('已寄出站長開通連結到 ' + Session.getEffectiveUser().getEmail());
}

/** 讓所有裝置的站長模式失效（之後要再執行 setupOwnerMode 重新開通）。 */
function resetOwnerKey() {
  PropertiesService.getScriptProperties().deleteProperty('OWNER_KEY');
  console.log('站長金鑰已清除。');
}

/** 在編輯器上方選這個函式按「執行」：寄一封測試信給自己。 */
function testNotify() {
  sendNotice_('測試', '這是 N. B. Studio 留言通知的測試信。收到就代表設定成功。', new Date(), null);
}
