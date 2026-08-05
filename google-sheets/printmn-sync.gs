/**
 * Printmn Konica → Google Sheets
 *
 * Reads the shop's work logs straight out of Firebase and rewrites two sheets
 * with them. It runs inside Google on a timer, so nothing is added to the app:
 * no second sync path that can fail offline, and no new key inside the APK.
 * The sheet also keeps updating while the app is closed, and picks up orders
 * booked on either device.
 *
 * The sheets are REWRITTEN, not appended to. Orders are edited and deleted in
 * the app, so appending would leave rows behind that no longer exist — the
 * sheet would slowly drift away from the truth, which is worse than being five
 * minutes behind it.
 *
 * ── Setup ────────────────────────────────────────────────────────────
 * 1. Extensions → Apps Script, paste this in, save.
 * 2. Project Settings → Script Properties, add:
 *      RTDB_URL   https://printmn-c0d28-default-rtdb.firebaseio.com/pmn
 *      RTDB_AUTH  <the database secret>
 * 3. Run `syncNow` once and grant the permissions it asks for.
 * 4. Run `installTrigger` once — from then on it runs itself every 5 minutes.
 *
 * The secret lives in Script Properties, on Google's servers. That is better
 * than the app, where anyone who unpacks the binary can read it — but it is
 * still a full-access key, so it should be rotated in the Firebase console
 * before this goes live.
 */

/** How often the timer fires, in minutes. Google allows 1, 5, 10, 15 or 30. */
var SYNC_MINUTES = 5;

var ORDERS_SHEET = 'Захиалга';
var DAILY_SHEET = 'Өдрийн дүн';

var HEADERS = [
  'Огноо',
  '№',
  'Ажил',
  'Тоо',
  'Хүлээн авсан',
  'Хүлээлгэж өгөх',
  'Утас',
  'Дүн',
  'Төлбөр',
  'НӨАТ',
  'Захиалагч',
  'Тайлбар',
  'Гүйцэтгэл',
];

// ── Firebase ─────────────────────────────────────────────────────────

function readWorkLogs_() {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('RTDB_URL');
  var auth = props.getProperty('RTDB_AUTH');

  if (!base) throw new Error('RTDB_URL is not set in Script Properties.');

  var url = base + '/worklogs.json' + (auth ? '?auth=' + encodeURIComponent(auth) : '');
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = response.getResponseCode();

  if (code === 401 || code === 403) {
    // The rules rejected us. Retrying will not help and an empty read would
    // wipe the sheet, so stop loudly instead.
    throw new Error('Firebase refused the request (' + code + '). Check RTDB_AUTH.');
  }
  if (code !== 200) throw new Error('Firebase returned HTTP ' + code);

  var parsed = JSON.parse(response.getContentText());
  if (!parsed) return [];

  // Records are stored one node per id, but older data is a positional array.
  // Both arrive here as objects or arrays; take the values either way and drop
  // the holes a sparse array leaves behind.
  var rows = Array.isArray(parsed) ? parsed : Object.keys(parsed).map(function (key) {
    return parsed[key];
  });

  return rows.filter(function (row) {
    return row && typeof row === 'object' && row.date;
  });
}

// ── Shaping ──────────────────────────────────────────────────────────

function num_(value) {
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

/**
 * The single-word performance cell, matching what the app's own export writes
 * so the two never disagree.
 */
function performanceLabel_(log) {
  if (log.paymentStatus === 'Урьдчилгаа') return 'Урьдчилгаа';
  if (log.paymentStatus === 'Тооцоотой') return 'Тооцоо аваагүй';
  return log.status || 'Болсон';
}

function toRow_(log) {
  return [
    log.date || '',
    num_(log.no),
    log.job || '',
    log.quantity === '' || log.quantity == null ? '' : num_(log.quantity),
    log.receivedTime || '',
    log.isTomorrow ? 'Маргааш ' + (log.deadline || '') : log.deadline || '',
    log.phone || '',
    // A number, not text: the sheet has to be able to add these up.
    num_(log.price),
    log.payType || '',
    log.hasVat ? 'НӨАТ' : '',
    log.customer || '',
    log.note || '',
    performanceLabel_(log),
  ];
}

/** Newest day first, and within a day in the order they were booked. */
function sortRows_(rows) {
  return rows.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1;
    return a[1] - b[1];
  });
}

/**
 * Per-day takings, split by payment type.
 *
 * Uses the raw `price` exactly as the app's daily report does — VAT is not
 * added on here. If the two disagreed, whichever the shop happened to open
 * first would look wrong.
 */
function dailyTotals_(rows) {
  var byDate = {};
  var types = {};

  rows.forEach(function (row) {
    var date = row[0];
    var type = row[8] || 'Бусад';
    var amount = row[7];
    if (!byDate[date]) byDate[date] = {};
    byDate[date][type] = (byDate[date][type] || 0) + amount;
    types[type] = true;
  });

  var typeList = Object.keys(types).sort();
  var header = ['Огноо'].concat(typeList).concat(['Нийт']);

  var out = Object.keys(byDate)
    .sort()
    .reverse()
    .map(function (date) {
      var line = [date];
      var total = 0;
      typeList.forEach(function (type) {
        var amount = byDate[date][type] || 0;
        total += amount;
        line.push(amount);
      });
      line.push(total);
      return line;
    });

  return [header].concat(out);
}

// ── Writing ──────────────────────────────────────────────────────────

function sheetNamed_(name) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  return book.getSheetByName(name) || book.insertSheet(name);
}

function writeTable_(sheet, header, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }

  sheet.setFrozenRows(1);
  // Leaves whatever the user has already resized alone on later runs; only the
  // first pass has anything to fit.
  if (sheet.getLastRow() <= rows.length + 1) {
    sheet.autoResizeColumns(1, header.length);
  }
}

// ── Entry points ─────────────────────────────────────────────────────

/** Run this by hand the first time, and whenever you want an immediate refresh. */
function syncNow() {
  var logs = readWorkLogs_();
  var rows = sortRows_(logs.map(toRow_));

  writeTable_(sheetNamed_(ORDERS_SHEET), HEADERS, rows);

  var totals = dailyTotals_(rows);
  writeTable_(sheetNamed_(DAILY_SHEET), totals[0], totals.slice(1));

  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(ORDERS_SHEET)
    .getRange('A1')
    .setNote('Сүүлд шинэчилсэн: ' + new Date().toLocaleString('mn-MN'));
}

/** Installs the repeating timer. Safe to run twice — old triggers are removed. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(SYNC_MINUTES).create();
}

/** Stops the timer without deleting the script or the data already written. */
function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(trigger);
  });
}
