/**
 * مصاريفي -> جدول بيانات الردود (Google Sheet)
 *
 * الواجهة تُستضاف على GitHub Pages وتتصل بهذا السكربت عبر رابط تطبيق الويب (/exec)
 * بطلبات POST تحمل رمز API_TOKEN. انظر README.md للنشر.
 *
 * المحاولات السابقة اعتمدت على محاكاة إرسال Google Form عبر نقطة formResponse
 * العامة (بأرقام entry.*)، لكن هذا الأسلوب توقف عن العمل مع إعادة تصميم
 * Google Forms لعام 2026 (رفض 400 ثابت حتى مع pageHistory وfbzx وكوكيز
 * الجلسة صحيحة). بدل ملاحقة سلوك داخلي غير موثّق قد يتغيّر مرة أخرى بلا
 * إشعار، يكتب هذا الإصدار الرد مباشرةً في نفس جدول بيانات الردود الذي
 * ينشئه Google Forms تلقائياً، عبر SpreadsheetApp — واجهة مستقرة ومصرَّح
 * بها فعلياً، ولا علاقة لها بتصميم واجهة Forms.
 *
 * الطريقة: نقرأ صف العناوين (الصف الأول) في ورقة الردود وقت كل إرسال،
 * ونطابق كل عنوان بعنوان السؤال في QUESTION_TITLES لنعرف أي عمود يقابل
 * أي حقل، ثم نكتب صفاً جديداً بنفس الترتيب — تماماً كما لو أن الرد وصل
 * من النموذج نفسه.
 */

// ===== الإعدادات =====

// معرّف النموذج للتحرير — من رابط: https://docs.google.com/forms/d/EDIT_FORM_ID/edit
// يُستخدم فقط لإيجاد جدول بيانات الردود المرتبط بالنموذج تلقائياً.
const EDIT_FORM_ID = '1LkrJLtydJtBnja2ZLmx0pFfFtkGa0rDkJ5jDRBfub7A';

// عناوين الأسئلة كما تظهر بالضبط في النموذج (ومن ثم في صف عناوين جدول الردود).
const QUESTION_TITLES = {
  type:   'دخل أو مصروف:',
  sub:    'نوع العملية:',
  from:   'سحوبات أو مصروفات:',
  to:     'ايداع أو وارد:',
  amount: 'المبلغ:',
  fee:    'رسوم التحويل:',
  date:   'التاريخ:',
  h:      'الساعة:',
  m:      'الدقيقة:',
  sms:    'الرسالة النصية:',
  notes:  'تفاصيل إضافية:'
};
// هل تُحتسب رسوم التحويل ضمن مصروفات الحساب المصدر (من)؟
// true  = الرسوم مبلغ إضافي يُخصم من الحساب فوق المبلغ (الوضع المعتاد)
// false = الرسوم مشمولة أصلاً داخل المبلغ
const INCLUDE_FEES_IN_OUTCOME = true;

// لون تظليل الخلايا التي عُدّلت من الصفحة (ويُعرض بنفس اللون في الصفحة)
const MARK_COLOR = '#fff2cc';
// =====================

/**
 * عند زيارة الرابط: إن وُجد ملف Index في المشروع يُعرض (الوضع القديم داخل Apps Script)،
 * وإلا يُرجع حالة JSON بسيطة (الوضع الجديد: الواجهة على GitHub Pages).
 */
function doGet() {
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('مصاريفي')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    return json_({ ok: true, service: 'mybudjet-api' });
  }
}

/** الدوال المسموح استدعاؤها من الصفحة المستضافة خارج Apps Script (GitHub Pages) */
function apiMethods_() {
  return {
    ping: function () { return { ok: true }; },
    submitEntry: submitEntry,
    getResponsesPreview: getResponsesPreview,
    updateResponseRow: updateResponseRow,
    deleteResponseRow: deleteResponseRow,
    getAccountCredits: getAccountCredits
  };
}
const WRITE_METHODS = ['submitEntry', 'updateResponseRow', 'deleteResponseRow'];

/**
 * نقطة الدخول للصفحة على GitHub: جسم الطلب JSON بالشكل {token, method, args}.
 * يُرفض أي طلب لا يحمل رمز API_TOKEN الصحيح (المخزّن في خصائص السكربت).
 */
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    const methods = apiMethods_();
    if (!token) {
      out = { ok: false, error: 'API_TOKEN غير مضبوط في خصائص السكربت. شغّل setupApiToken مرة واحدة.' };
    } else if (!req.token || !safeEqual_(String(req.token), token)) {
      out = { ok: false, error: 'unauthorized' };
    } else if (!Object.prototype.hasOwnProperty.call(methods, req.method)) {
      out = { ok: false, error: 'طريقة غير معروفة: ' + req.method };
    } else {
      const args = Array.isArray(req.args) ? req.args : [];
      if (WRITE_METHODS.indexOf(req.method) > -1) {
        const lock = LockService.getScriptLock();
        lock.waitLock(20000); // يمنع تضارب التعديلات المتزامنة (أرقام الصفوف تتغير عند الحذف)
        try { out = methods[req.method].apply(null, args); } finally { lock.releaseLock(); }
      } else {
        out = methods[req.method].apply(null, args);
      }
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** مقارنة نصّين بزمن ثابت تقريباً */
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * شغّلها مرة واحدة من المحرر: تنشئ رمز وصول عشوائياً وتخزّنه في خصائص السكربت (API_TOKEN)
 * وتطبعه في سجل التنفيذ لتنسخه إلى إعدادات الصفحة. لتغيير الرمز لاحقاً شغّلها من جديد.
 * (بديل يدوي: إعدادات المشروع -> خصائص السكربت -> أضف API_TOKEN.)
 */
function setupApiToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('API_TOKEN = ' + token);
}

/** يُستدعى من الصفحة عبر google.script.run أو من doPost */
function submitEntry(d) {
  try {
    d = d || {};
    const sheet = getResponsesSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    const titleToKey = {};
    Object.keys(QUESTION_TITLES).forEach(k => { titleToKey[QUESTION_TITLES[k]] = k; });

    const row = headers.map(h => {
      const title = String(h).trim();
      if (isTimestampHeader_(title)) return new Date();
      const key = titleToKey[title];
      if (!key) return '';
      return formatValueForSheet_(key, d[key]);
    });

    sheet.appendRow(row);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}


/** Returns only the requested page of responses, newest sheet row first. */
function getResponsesPreview(page) {
  try {
    const sh = getResponsesSheet_();
    const last = sh.getLastRow();
    const cols = Math.min(12, sh.getLastColumn());
    const pageSize = 10;
    const totalRows = Math.max(0, last - 1);
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    page = Math.max(1, Math.min(totalPages, Math.floor(Number(page) || 1)));
    if (cols < 1) return {ok:true, headers:[], rows:[], page:page, pageSize:pageSize, totalRows:totalRows, totalPages:totalPages};
    const headers = sh.getRange(1,1,1,cols).getDisplayValues()[0];
    const startRow = last - ((page - 1) * pageSize);
    const count = Math.min(pageSize, Math.max(0, startRow - 1));
    if (count < 1) return {ok:true, headers:headers, rows:[], page:page, pageSize:pageSize, totalRows:totalRows, totalPages:totalPages};
    const firstRow = startRow - count + 1;
    const rng = sh.getRange(firstRow, 1, count, cols);
    const values = rng.getDisplayValues();
    const bgs = rng.getBackgrounds();
    // عمود التاريخ: نرسله بصيغة yyyy-mm-dd الثابتة بدل نص العرض (لتفادي الخلط بين يوم/شهر وشهر/يوم)
    const dateCol = headers.map(h => String(h).trim()).indexOf(QUESTION_TITLES.date);
    if (dateCol >= 0) {
      const raw = rng.getValues();
      const tz = sh.getParent().getSpreadsheetTimeZone();
      raw.forEach((r, i) => { const iso = isoDate_(r[dateCol], tz); if (iso) values[i][dateCol] = iso; });
    }
    const rows = values.map((row, i) => ({rowNumber:firstRow + i, values:row,
      marks:bgs[i].map(c => String(c).toLowerCase() === MARK_COLOR)})).reverse();
    return {ok:true, headers:headers, rows:rows, page:page, pageSize:pageSize, totalRows:totalRows, totalPages:totalPages};
  } catch (err) { return {ok:false,error:String(err)}; }
}

/**
 * Update one response row A:L. Columns are matched by header, not by position.
 * If anything changed: the row's timestamp (A) is set to now (the original is kept in a note on A),
 * and each changed cell is shaded with MARK_COLOR and gets a note with its previous value.
 */
function updateResponseRow(rowNumber, values) {
  try {
    const sh = getResponsesSheet_();
    rowNumber = Number(rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sh.getLastRow())
      throw new Error('رقم الصف غير صالح.');
    const cols = Math.min(12, sh.getLastColumn());
    const row = (values || []).slice(0, cols);
    while (row.length < cols) row.push('');
    const range = sh.getRange(rowNumber, 1, 1, cols);
    const old = range.getValues()[0];
    const disp = range.getDisplayValues()[0];
    const headers = sh.getRange(1, 1, 1, cols).getValues()[0].map(x => String(x).trim());
    const tz = sh.getParent().getSpreadsheetTimeZone();
    const keyOf = {};
    Object.keys(QUESTION_TITLES).forEach(k => { keyOf[QUESTION_TITLES[k]] = k; });

    const changed = [];
    for (let i = 1; i < row.length; i++) {
      const key = keyOf[headers[i]];
      const val = String(row[i]).trim();
      // خلية لم تتغيّر: أبقِ قيمتها الأصلية كما هي (نوعها وتنسيقها)
      if (val === String(disp[i]).trim() || (key === 'date' && val === isoDate_(old[i], tz))) { row[i] = old[i]; continue; }
      changed.push(i);
      if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const p = val.split('-');
        row[i] = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      } else if (['amount', 'fee', 'h', 'm'].indexOf(key) > -1 && val !== '' && !isNaN(Number(val))) {
        row[i] = Number(val);
      }
    }
    if (!changed.length) return {ok:true, changed:0}; // لا شيء تغيّر: لا نلمس الصف ولا الطابع الزمني

    const now = new Date();
    row[0] = now; // تحديث الطابع الزمني للصف
    range.setValues([row]);

    const stamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm');
    changed.forEach(i => {
      const cell = sh.getRange(rowNumber, i + 1);
      cell.setBackground(MARK_COLOR);
      cell.setNote('عُدّلت في ' + stamp + '\nالقيمة السابقة: ' + (String(disp[i]).trim() || '(فارغ)'));
    });
    // نحتفظ بالطابع الزمني الأصلي في ملاحظة (أول مرة فقط)
    const tsCell = sh.getRange(rowNumber, 1);
    if (!tsCell.getNote()) {
      const orig = Object.prototype.toString.call(old[0]) === '[object Date]'
        ? Utilities.formatDate(old[0], tz, 'yyyy-MM-dd HH:mm:ss') : String(old[0]);
      tsCell.setNote('الطابع الزمني الأصلي: ' + orig);
    }
    return {ok:true, changed:changed.length};
  } catch (err) { return {ok:false,error:String(err)}; }
}

/** Delete one response row. */
function deleteResponseRow(rowNumber) {
  try {
    const sh = getResponsesSheet_();
    rowNumber = Number(rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sh.getLastRow())
      throw new Error('رقم الصف غير صالح.');
    sh.deleteRow(rowNumber);
    return {ok:true};
  } catch (err) { return {ok:false,error:String(err)}; }
}

/** Account summary: income, outcome, and net credit for the three configured accounts. */
function getAccountCredits() {
  try {
    const sh = getResponsesSheet_();
    const last = sh.getLastRow(), cols = sh.getLastColumn();
    const accountNames = ['الأهلي', 'ساب', 'StcPay'];
    const totals = {};
    accountNames.forEach(name => totals[name] = {name:name, income:0, outcome:0, credit:0});
    if (last < 2 || cols < 1) {
      return {ok:true, accounts:accountNames.map(name => totals[name]), feesTotal:0, skipped:{count:0, rows:[]}};
    }

    const headers = sh.getRange(1,1,1,cols).getDisplayValues()[0].map(x => String(x).trim());
    const fromIdx = headers.indexOf(QUESTION_TITLES.from);
    const toIdx = headers.indexOf(QUESTION_TITLES.to);
    const amountIdx = headers.indexOf(QUESTION_TITLES.amount);
    const feeIdx = headers.indexOf(QUESTION_TITLES.fee);
    if (amountIdx < 0) throw new Error('لم يتم العثور على عمود المبلغ في ورقة الردود.');

    const normalizeAccount = value => {
      const v = String(value || '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, '').toLowerCase();
      if (!v) return '';
      if (v.indexOf('اهلي') > -1) return 'الأهلي';
      if (v === 'ساب' || v.indexOf('sab') === 0) return 'ساب';
      if (v.indexOf('stc') > -1) return 'StcPay';
      return '';
    };
    const rows = sh.getRange(2,1,last-1,cols).getValues();
    let feesTotal = 0;
    const skippedRows = [];
    rows.forEach((row, idx) => {
      const amount = toNumber_(row[amountIdx]);
      if (amount <= 0) return;
      const fromRaw = fromIdx >= 0 ? String(row[fromIdx] || '').trim() : '';
      const toRaw = toIdx >= 0 ? String(row[toIdx] || '').trim() : '';
      const from = normalizeAccount(fromRaw);
      const to = normalizeAccount(toRaw);
      // صف فيه حساب مكتوب لكن لا نعرفه (أو لا حساب أصلاً): يُسجَّل للمراجعة
      if ((fromRaw && !from) || (toRaw && !to) || (!fromRaw && !toRaw)) skippedRows.push(idx + 2);

      // الوارد يُحتسب دخلاً للحساب المستلم، والصادر مصروفاً على الحساب المصدر.
      if (to) totals[to].income += amount;
      if (from) {
        const fee = (INCLUDE_FEES_IN_OUTCOME && feeIdx >= 0) ? toNumber_(row[feeIdx]) : 0;
        totals[from].outcome += amount + fee;
        feesTotal += fee;
      }
    });
    accountNames.forEach(name => {
      totals[name].credit = totals[name].income - totals[name].outcome;
    });
    return {ok:true, accounts:accountNames.map(name => totals[name]), feesTotal:feesTotal,
            skipped:{count:skippedRows.length, rows:skippedRows.slice(0, 20)}};
  } catch (err) { return {ok:false,error:String(err)}; }
}

/** يحوّل قيمة خلية إلى رقم (يتعامل مع الأرقام العربية والفواصل والنص مثل "1,250.50 ر.س") */
function toNumber_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v == null ? '' : v)
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632)
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776)
    .replace(/٫/g, '.').replace(/[٬,\s]/g, '')
    .replace(/[^0-9.\-]/g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

/** تاريخ الخلية بصيغة yyyy-mm-dd (أو '' إن لم تكن تاريخاً) */
function isoDate_(v, tz) {
  if (Object.prototype.toString.call(v) !== '[object Date]' || isNaN(v.getTime())) return '';
  return Utilities.formatDate(v, tz || 'Asia/Riyadh', 'yyyy-MM-dd');
}

/** يفتح النموذج ويعثر على جدول بيانات الردود المرتبط به */
function getForm_() {
  return FormApp.openById(EDIT_FORM_ID);
}

/**
 * يعثر على ورقة الردود داخل جدول البيانات المرتبط بالنموذج، بالبحث عن
 * الورقة التي يبدأ صفها الأول بعمود "الطابع الزمني" (Timestamp) الذي
 * يضيفه Google Forms تلقائياً لكل جدول ردود.
 */
function getResponsesSheet_() {
  const form = getForm_();
  if (form.getDestinationType() !== FormApp.DestinationType.SPREADSHEET) {
    throw new Error('النموذج غير مربوط بجدول بيانات (Google Sheet) لتخزين الردود. اربطه من النموذج: الردود -> رمز Sheets الأخضر.');
  }
  const ss = SpreadsheetApp.openById(form.getDestinationId());
  const sheets = ss.getSheets();
  for (const sh of sheets) {
    if (sh.getLastColumn() < 1) continue;
    const first = sh.getRange(1, 1).getValue();
    if (isTimestampHeader_(String(first).trim())) return sh;
  }
  // احتياطي: أول ورقة إن لم يُعثر على عمود الطابع الزمني بالاسم المتوقع
  return sheets[0];
}

function isTimestampHeader_(title) {
  return title === 'Timestamp' || title === 'الطابع الزمني' || title === 'الختم الزمني' || title.indexOf('Timestamp') > -1;
}

/** يهيئ القيمة حسب نوع الحقل قبل كتابتها في الخلية */
function formatValueForSheet_(key, val) {
  if (val === undefined || val === null || val === '') return '';
  val = String(val).trim();
  if (val === '') return '';

  if (key === 'date') {
    const p = val.split('-'); // yyyy-mm-dd
    if (p.length === 3) return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return val;
  }
  if (key === 'amount' || key === 'fee' || key === 'h' || key === 'm') {
    const n = Number(val);
    return isNaN(n) ? val : n;
  }
  return val;
}

/**
 * أداة تشخيص: تطبع عناوين صف الردود الفعلية (كما هي في الجدول) لمقارنتها
 * بعناوين QUESTION_TITLES أعلاه، وتصحيح أي فرق (فراغ زائد، اختلاف نقطتين...).
 */
function debugListSheetHeaders() {
  const sheet = getResponsesSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach((h, i) => Logger.log('عمود ' + (i + 1) + ': "' + h + '"'));
}

/**
 * اختبار: شغّل هذه الدالة من المحرر مرة واحدة، ثم افتح جدول الردود مباشرة.
 * ستجد 3 صفوف (دخل 11.11 / بين الحسابات 22.22 / مصاريف 33.33)
 * بالساعة 7 والدقيقة 45 والرسالة "اختبار الرسالة النصية" والتفاصيل "اختبار التفاصيل".
 * راجع كل صف ثم احذفها.
 */
function testSubmit() {
  const today = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd');
  const base = { date: today, h: '7', m: '45', sms: 'اختبار الرسالة النصية', notes: 'اختبار التفاصيل' };
  const cases = {
    income:   { type: 'دخل', to: 'الأهلي', amount: '11.11' },
    transfer: { type: 'خيارات أخرى', sub: 'بين الحسابات', from: 'الأهلي', fee: '0.58', to: 'STCPay', amount: '22.22' },
    expense:  { type: 'خيارات أخرى', sub: 'مصاريف', from: 'STCPay', fee: '0', amount: '33.33' }
  };
  Object.keys(cases).forEach(k =>
    Logger.log(k + ': ' + JSON.stringify(submitEntry(Object.assign({}, base, cases[k])))));
}