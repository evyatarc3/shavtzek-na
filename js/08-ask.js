"use strict";
/* ================= view: שאל (free-text questions) ================= */
/* Two layers. A built-in Hebrew reader answers the common questions at once, offline and free:
   head-counts per day and unit, who is out, what the tasks need, gaps, פק״לים, one person, the rotation,
   "can X go on date". Whatever it can't read goes to Claude (the `sample` capability) with the app's
   computed numbers attached. The store app has no Claude, so there the reader is all there is. */
const ASK = { items:[], seq:0, busy:false, ctl:null, last:null, draft:"" };
const ASK_QKEY = UI_KEY + "-q";
function askRecent(){ try { const r = JSON.parse(localStorage.getItem(ASK_QKEY) || "[]"); return Array.isArray(r) ? r.filter(x => typeof x === "string").slice(0, 6) : []; } catch(e){ return []; } }
function askRemember(q){ try { localStorage.setItem(ASK_QKEY, JSON.stringify([q].concat(askRecent().filter(x => x !== q)).slice(0, 6))); } catch(e){} }
const askAiOn = () => !!S.sample && !S.aiOff;

/* ---------- reading Hebrew ---------- */
const QB = "(?:^|[\\s,.;:!?()\\[\\]/+\\-])", QE = "(?=$|[\\s,.;:!?()\\[\\]/+\\-])", QP = "[ובלהמשכ]{0,3}";
function qNorm(s){ return String(s || "").replace(/[֑-ׇ]/g, "").replace(/[״"“”׳'`’]/g, "").replace(/[־–—]/g, "-").replace(/\s+/g, " ").trim(); }
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* a word or phrase, with the one-letter prefixes Hebrew glues on (ו, ב, ל, ה, מ, ש, כ) */
function wordRe(w, opt = {}){
  let body = qNorm(w).split(" ").map(reEsc).join("\\s*");
  // a final letter turns regular before a suffix: רחפן → רחפנים
  const FIN = { "ך":"כ", "ם":"מ", "ן":"נ", "ף":"פ", "ץ":"צ" };
  if (opt.suffix && FIN[body.slice(-1)]) body = body.slice(0, -1) + "[" + body.slice(-1) + FIN[body.slice(-1)] + "]";
  const pre = opt.prefix === false ? "" : opt.prefix === "short" ? "[ולבמש]?" : QP;
  return new RegExp(QB + "(" + pre + body + (opt.suffix ? "[\\u05D0-\\u05EA]{0," + (opt.suffix === true ? 4 : opt.suffix) + "}" : "") + ")" + QE);
}
const anyRe = (list, opt) => list.filter(Boolean).map(w => wordRe(w, opt));
/* find and blank out, so later readers don't see the same words again */
function take(Q, re){
  const m = Q.rest.match(re); if (!m) return null;
  const i = m.index + m[0].length - m[1].length;
  Q.rest = Q.rest.slice(0, i) + " ".repeat(m[1].length) + Q.rest.slice(i + m[1].length);
  return m;
}
function takeRaw(Q, re){ const m = Q.rest.match(re); if (!m) return null; Q.rest = Q.rest.slice(0, m.index) + " ".repeat(m[0].length) + Q.rest.slice(m.index + m[0].length); return m; }
function takeAny(Q, list, opt){ for (const w of list){ const m = take(Q, wordRe(w, opt)); if (m) return m; } return null; }

const HMONTH = { ינואר:1, פברואר:2, מרץ:3, מרס:3, אפריל:4, מאי:5, יוני:6, יולי:7, אוגוסט:8, ספטמבר:9, אוקטובר:10, נובמבר:11, דצמבר:12 };
function qMkDate(d, m, y){
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const base = (cfg() && cfg().lineStart) || todayStr(), by = Number(base.slice(0, 4));
  const mk = yy => `${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let s = mk(y ? (y < 100 ? 2000 + y : y) : by);
  if (!y && diffDays(base, s) < -150) s = mk(by + 1);
  return fd(pd(s)) === s ? s : null;
}
/* consecutive days on which any of the units is in */
const anyIn = (U, d) => U.some(pl => platoonIn(pl, d));
function nextRun(U, after){
  const c = cfg(); let d = addDays(after, 1); if (d < c.lineStart) d = c.lineStart;
  while (d <= c.lineEnd && !anyIn(U, d)) d = addDays(d, 1);
  if (d > c.lineEnd) return null;
  const s = d; while (addDays(d, 1) <= c.lineEnd && anyIn(U, addDays(d, 1))) d = addDays(d, 1);
  return { from:s, to:d };
}
function qRange(Q){
  const t = todayStr(), c = cfg(), ws = addDays(t, -dow(t));
  const R = (from, to, label) => ({ from, to: to || from, label: label || "", single: !to || to === from });
  // dates: 15/10, 15.10.26, 15 באוקטובר
  const found = []; let m;
  while ((m = takeRaw(Q, /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/))){ const s = qMkDate(+m[1], +m[2], m[3] ? +m[3] : 0); if (s) found.push(s); }
  const reM = new RegExp("(\\d{1,2})\\s*-?\\s*[בל]?-?\\s*(" + Object.keys(HMONTH).join("|") + ")");
  while ((m = takeRaw(Q, reM))){ const s = qMkDate(+m[1], HMONTH[m[2]], 0); if (s) found.push(s); }
  if (found.length){
    found.sort(); const a = found[0], b = found[found.length - 1];
    if (found.length > 1) return R(a, b);
    if (/(^|\s)עד\s*(ה|ל)?-?\s*$/.test(Q.q.slice(0, Q.q.search(/\d/)))) return a >= t ? R(t, a) : R(a);
    if (/(^|\s)(והלאה|ואילך|ומעלה)(\s|$|[?.!,])/.test(Q.q)) return R(a, c.lineEnd);
    return R(a);
  }
  // weekdays: ביום שלישי, יום ג, בשבת, ביום ראשון הבא
  const WDN = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"], WDA = "אבגדהוש";
  m = takeRaw(Q, /(?:^|\s)[בול]{0,2}יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|[אבגדהוש])(?=$|[\s?.!,])(\s+הבא)?/)
   || takeRaw(Q, /(?:^|\s)ו?[בל](ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=$|[\s?.!,])(\s+הבא)?/);
  if (m){
    const i = WDN.includes(m[1]) ? WDN.indexOf(m[1]) : WDA.indexOf(m[1]);
    const d = m[2] ? addDays(ws, 7 + i) : addDays(t, (i - dow(t) + 7) % 7);
    return R(d, null, "יום " + WDN[i] + (m[2] ? " הבא" : ""));
  }
  const tdn = qNorm(TD());
  const runNow = () => { if (!anyIn(jointPl(), t)) return null; let a = t, b = t; while (addDays(a, -1) >= c.lineStart && anyIn(jointPl(), addDays(a, -1))) a = addDays(a, -1); while (addDays(b, 1) <= c.lineEnd && anyIn(jointPl(), addDays(b, 1))) b = addDays(b, 1); return { from:a, to:b }; };
  const month = k => { const d0 = pd(t); const a = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k, 1)), b = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k + 1, 0)); return R(fd(a), fd(b), k ? "החודש הבא" : "החודש"); };
  const KW = [
    [["סופש הבא","סוף שבוע הבא","סוף השבוע הבא"], () => R(addDays(ws, 12), addDays(ws, 13), "בסופ״ש הבא")],
    [["סופש","סוף שבוע","סוף השבוע"], () => dow(t) === 6 ? R(t, null, "בסופ״ש") : R(addDays(ws, 5), addDays(ws, 6), "בסופ״ש")],
    [["שבוע הבא"], () => R(addDays(ws, 7), addDays(ws, 13), "בשבוע הבא")],
    [["שבוע שעבר","שבוע הקודם","שבוע קודם"], () => R(addDays(ws, -7), addDays(ws, -1), "בשבוע שעבר")],
    [["שבועיים הקרובים","שבועיים"], () => R(t, addDays(t, 13), "בשבועיים הקרובים")],
    [["שבוע הזה","השבוע","שבוע"], () => R(ws, addDays(ws, 6), "השבוע")],
    [["חודש הבא"], () => month(1)],
    [["חודש הזה","החודש"], () => month(0)],
    [["סבב הבא", tdn + " הבאה", tdn + " הבא", "עלייה הבאה", "עליה הבאה"], () => { const nr = nextRun(jointPl(), runNow() ? runNow().to : addDays(t, -1)); return nr ? R(nr.from, nr.to, "ב" + TD() + " הבאה") : null; }],
    [["סבב הזה","סבב הנוכחי", tdn + " הזאת", tdn + " הזו", tdn + " הנוכחית"], () => { const r = runNow() || blockOf(t); return r ? R(r.from || r.start, r.to || r.end, "ב" + TD() + " הנוכחית") : null; }],
    [["כל הקו","כל התקופה","לאורך הקו"], () => R(c.lineStart, c.lineEnd, "בכל הקו")],
    [["עד סוף הקו","סוף הקו","מהיום והלאה","מהיום ואילך","מעכשיו והלאה","מעכשיו","מכאן והלאה"], () => R(t < c.lineStart ? c.lineStart : t, c.lineEnd, "עד סוף הקו")],
    [["מחרתיים"], () => R(addDays(t, 2), null, "מחרתיים")],
    [["מחר"], () => R(addDays(t, 1), null, "מחר")],
    [["שלשום"], () => R(addDays(t, -2), null, "שלשום")],
    [["אתמול"], () => R(addDays(t, -1), null, "אתמול")],
    [["היום","עכשיו","כרגע","הערב","הלילה"], () => R(t, null, "היום")],
  ];
  for (const [words, fn] of KW) if (takeAny(Q, words)) return fn();
  return null;
}
function qUnits(Q){
  const tu = qNorm(TU()), tus = qNorm(TUS()), set = new Set(); let kind = null;
  const ORD = { "א":1, "ב":2, "ג":3, "ד":4, "ה":5, "ראשונה":1, "שנייה":2, "שניה":2, "שלישית":3, "רביעית":4, "חמישית":5 };
  const re = new RegExp(QB + "(" + QP + "(?:" + reEsc(tus) + "|" + reEsc(tu) + ")\\s*(\\d{1,2}|ראשונה|שנייה|שניה|שלישית|רביעית|חמישית|[אבגדה])((?:\\s*(?:\\+|,|-|וגם|ו-?)\\s*\\d{1,2})*))" + QE);
  let m;
  while ((m = take(Q, re))){ const first = ORD[m[2]] || Number(m[2]); if (first) set.add(first); (m[3].match(/\d{1,2}/g) || []).forEach(n => set.add(Number(n))); kind = "named"; }
  while ((m = takeRaw(Q, /(?:^|\s)(\d)\s*\+\s*(\d)(?=$|[\s?.!,])/))){ set.add(+m[1]); set.add(+m[2]); kind = "named"; }
  // a unit's own name, e.g. "לביא"
  for (const pl of allPlatoons()){
    const ph = qNorm(plName(pl)).replace(new RegExp("(^|\\s)" + reEsc(tu) + "(?=\\s|$)"), " ").replace(new RegExp("(^|\\s)" + pl + "(?=\\s|$)"), " ").replace(/[·|,\-]/g, " ").replace(/\s+/g, " ").trim();
    if (ph.length >= 2 && !/^\d+$/.test(ph) && take(Q, wordRe(ph))){ set.add(pl); kind = "named"; }
  }
  if (takeAny(Q, ["שלי","שלנו"], { prefix:false }) || takeAny(Q, ["אצלי","אצלנו"])){ set.add(myPl()); kind = kind || "mine"; }
  if (!set.size && takeAny(Q, ["כל ה" + tus, "כל הפלוגה", "הפלוגה"])) return { units: allPlatoons(), kind:"all" };
  if (!set.size && takeAny(Q, ["שתי ה" + tus, "שני ה" + tus, "שתיהן", "שניהם", "ביחד", "יחד", "בסך הכל", "בסהכ", "סהכ", "כולם", "כולנו"])) return { units: jointPl(), kind:"joint" };
  return set.size ? { units:[...set].filter(n => allPlatoons().includes(n)).sort((a, b) => a - b), kind } : null;
}
function qRole(Q){
  if (takeAny(Q, ["מפקדים פוטנציאליים","מפקד פוטנציאלי","פוטנציאליים","פוטנציאלי"])) return "cmdp";
  if (takeAny(Q, ["מפקדים","מפקדות","מפקד"])) return "cmd";
  return null;
}
function qHypo(Q){
  const allDay = !!takeAny(Q, ["כל היממה","יממה","24 שעות ביממה","מסביב לשעון"]);
  const ml = takeRaw(Q, /משמרות?\s*(?:של\s*)?(\d{1,2})/), ms = takeRaw(Q, /(\d{1,3})\s*(?:חיילים|לוחמים|אנשים|במשמרת|בעמדה)/), mh = takeRaw(Q, /(\d{1,2})\s*(?:שעות|ש)(?=$|[\s?.!,])/);
  if (!ms || !(mh || allDay)) return null;
  return { size: +ms[1], hours: allDay ? 24 : Math.min(24, +mh[1]), len: ml ? Math.min(24, +ml[1]) : null };
}
function qTasks(Q){
  const ts = tasksList(), out = [];
  for (const t of ts.slice().sort((a, b) => qNorm(b.name).length - qNorm(a.name).length)){
    const n = qNorm(t.name); if (n.length < 2) continue;
    if (take(Q, wordRe(n, { suffix: n.length >= 3 }))) out.push(t);
  }
  // one distinctive word is enough: "כוננות" → "כיתת כוננות"
  const words = {}; ts.forEach(t => qNorm(t.name).split(" ").forEach(w => { if (w.length >= 3 && !/^\d+$/.test(w)) (words[w] = words[w] || new Set()).add(t); }));
  for (const [w, set] of Object.entries(words)) if (set.size === 1){ const t = [...set][0]; if (!out.includes(t) && take(Q, wordRe(w, { suffix:true }))) out.push(t); }
  return out;
}
function qTags(Q){
  Q.rest = Q.rest.replace(/בקשר\s*ל/g, x => " ".repeat(x.length));   // "בקשר ל" is not the קשר פק״ל
  const ks = pakalim().map(k => k.name).filter(Boolean), out = [];
  for (const n of ks.slice().sort((a, b) => qNorm(b).length - qNorm(a).length)){ const nn = qNorm(n); if (nn.length >= 2 && take(Q, wordRe(nn, { suffix: nn.length >= 3 ? 5 : false }))) out.push(n); }
  // a family: "רחפנים" → every רחפן …
  const fam = {}; ks.forEach(n => { const nn = qNorm(n), w = nn.split(" ")[0]; if (w.length >= 3 && nn.includes(" ")) (fam[w] = fam[w] || []).push(n); });
  for (const [w, list] of Object.entries(fam)) if (!list.some(n => out.includes(n)) && take(Q, wordRe(w, { suffix:5 }))) list.forEach(n => out.push(n));
  return [...new Set(out)];
}
function qPersons(Q){
  const full = people().map(p => ({ p, n: qNorm(p.name) })).filter(x => x.n.length >= 2).sort((a, b) => b.n.length - a.n.length), out = [];
  for (const x of full) if (take(Q, wordRe(x.n, { prefix: x.n.length >= 3 ? true : "short" }))) out.push(x.p);
  // first or last name alone, when only one person has it
  const words = {}; full.forEach(x => { if (x.n.includes(" ")) x.n.split(" ").forEach(w => { if (w.length >= 3) (words[w] = words[w] || new Set()).add(x.p); }); });
  for (const [w, set] of Object.entries(words)) if (set.size === 1 && !full.some(x => x.n === w)){ const p = [...set][0]; if (!out.includes(p) && take(Q, wordRe(w))) out.push(p); }
  return out;
}
function qGear(Q){
  const out = [];
  for (const it of gearItems().slice().sort((a, b) => qNorm(b.name).length - qNorm(a.name).length)){ const n = qNorm(it.name); if (n.length >= 2 && take(Q, wordRe(n, { suffix: n.length >= 3 ? 2 : false }))) out.push(it); }
  const ctx = !!takeAny(Q, ["צלם","ציוד","חתום","חתומים","חתומה","חתימה","חתימות","חתם","חתמו","לא חתום","לא חתומים","מספר צ","מספרי צ","מסטב"]);
  return { items: out, ctx };
}
const W_WHO = ["מי","מיהם","מיהו","מיהן","שמות","רשימה","רשימת","פירוט","תפרט","פרט"];
const W_COUNT = ["כמה","מספר","מס"];
const W_OUT = ["בחוץ","יוצא","יוצאים","יוצאת","יציאה","יציאות","נעדר","נעדרים","נעדרת","חופש","חופשה","טס","טסים","טסה","טיסה","טיסות","לא נמצא","לא נמצאים","לא נמצאת","לא יהיה","לא יהיו","לא מגיע","לא מגיעים","לא בפנים","משתחרר","משתחררים","משתחררת","בקשה","בקשות","אילוץ","אילוצים","מצטרף","מצטרפים","עוזב","עוזבים"];
const W_GAP = ["חסר","חסרים","חסרה","חוסר","פער","פערים","מספיק","עומדים","לעמוד","רזרבה","רזרבות","עודף","לשחרר","מרווח","מצב","תמונת מצב","סיכום","בעיה","בעייתי","בעייתיים"];
const W_SHORT = ["חסר","חסרים","חסרה","חוסר","פער","פערים","מספיק","עומדים","לעמוד"];
const W_NEED = ["נדרש","נדרשים","נדרשת","צריך","צריכים","דרוש","דרושים","דרישה","דרישת","לאייש","איוש","מאיישים","תקן","משימה","משימות","משמרות","משמרת"];
const W_PRES = ["יש","נמצא","נמצאים","נמצאת","בפנים","נוכח","נוכחים","נוכחות","זמין","זמינים","מגיע","מגיעים","כוח אדם","כא","חיילים","אנשים","לוחמים","עולים"];
const W_REL = ["לשחרר","לאשר","לתת","יכול לצאת","יכולה לצאת","לצאת","שיצא","שתצא","יציאה","שחרור","להוציא"];
const W_ROT = ["עולים","עולה","יורדים","יורדת","חוזרים","חוזרת","הביתה","בית","הבית","תעסוקה","מתחלפים","מתחלף","סבב","סבבים","נגמר","נגמרת","מסתיים","מתחיל","מתחילים","יוצאים"];
/* questions that need judgment, a what-if or a written message go to Claude when it is available */
const DEFER_RE = /(^|\s)(?:ו?אם|נניח|למה|איך|כדאי|תציע|הצע|המלצה|תמליץ|ממליץ|השווה|השוואה|יחס|אחוז|אחוזים|ממוצע|בלי|למעט|נסח|תנסח|הודעה|תסביר|הסבר|במקום|תחשב|לחשב|תבדוק)(?=\s|$|[?.!,])|חוץ\s*מ/;

function askLocal(qRaw){
  const q0 = qNorm(qRaw).replace(/24\s*\/\s*7/g, " כל היממה ");
  const Q = { q: q0, rest: " " + q0 + " " };
  const range = qRange(Q), units = qUnits(Q), role = qRole(Q), hypo = qHypo(Q);
  const allTasks = !!takeAny(Q, ["כל המשימות"]);
  const tasks = qTasks(Q), tags = qTags(Q), persons = qPersons(Q), gear = qGear(Q);
  const r = " " + Q.rest.replace(/\s+/g, " ").trim() + " ";
  const has = list => anyRe(list).some(x => x.test(r));
  const when = /(^|\s)ו?מתי(\s|$)/.test(r);
  let intent = null;
  if (gear.ctx || gear.items.length) intent = "gear";
  else if (persons.length) intent = has(W_REL) && range && !when ? "release" : "person";
  else if (tags.length) intent = "tag";
  else if (when && has(W_GAP)) intent = "gap";
  else if (when || has(["סבבים","לוח הסבבים","לוח סבבים"])) intent = "rot";
  else if (has(W_NEED) || tasks.length || allTasks || hypo) intent = has(W_SHORT) && !hypo ? "gap" : "need";
  else if (/(^|\s)ו?מי\s+(חסר|חסרים|נעדר|נעדרים|לא)(\s|$)/.test(r) || has(W_OUT)) intent = "out";
  else if (has(W_GAP)) intent = "gap";
  else if (has(W_WHO)) intent = "who";
  else if (has(W_COUNT) || has(W_PRES)) intent = "pres";
  let P = { q:q0, intent, range, units, role, hypo, tasks, allTasks, tags, persons, gear, isCount: has(W_COUNT), rel: has(["לשחרר","שחרור","לשחרר עוד"]) };
  // a follow-up like "ומחר?" or "ומחלקה 2?" keeps the last question and changes what was said
  const L = ASK.last, follow = /^ו/.test(q0);
  if (!intent && L && (range || units || role || follow)) P = Object.assign({}, L, { q:q0, range: range || L.range, units: units || L.units, role: role || L.role });
  else if (!intent && (range || units || role)) P.intent = "pres";
  else if (intent && L && follow){ if (!range) P.range = L.range; if (!units && ["pres","who","out"].includes(intent)) P.units = L.units; }
  if (!P.intent){
    if (/^(תודה|תודה רבה|תנקס|סבבה|אחלה|מעולה|יופי|אוקיי?|אוקי|ok|קיבלתי|הבנתי|👍)[\s!.]*$/i.test(q0)){ const a = ansNew(); a.head = "בשמחה"; a.unknown = true; return a; }
    return null;
  }
  P.defer = DEFER_RE.test(q0);
  ASK.last = P;
  const fn = { gear:ansGear, pres:ansPres, who:ansWho, out:ansOut, gap:ansGap, need:ansNeed, tag:ansTag, person:ansPerson, release:ansRelease, rot:ansRot }[P.intent];
  const res = fn(P); res.defer = P.defer; return res;
}

/* ---------- answers ---------- */
const STATUS_WORD = { in:"בפנים", home:"בבית", abs:"ביציאה", req:"בקשת יציאה", tent:"לא ודאי", out:"לא בקו" };
const sgn = n => (n > 0 ? "+" : "") + n;
const isNumLike = v => typeof v === "number" || /^[+\-−]?\d+$/.test(String(v));
function ansNew(){
  const a = { pre:"", head:"", sub:"", tone:"", html:[], txt:[], acts:[] };
  a.p = (s, cls) => { if (!s) return a; a.html.push(`<p${cls ? ` class="${cls}"` : ""}>${esc(s)}</p>`); a.txt.push(s); return a; };
  a.list = items => { if (!items.length) return a; a.html.push(`<ul class="alist">${items.map(i => `<li><b>${esc(i.n)}</b>${i.s ? ` <span>${esc(i.s)}</span>` : ""}</li>`).join("")}</ul>`); items.forEach(i => a.txt.push("• " + i.n + (i.s ? " — " + i.s : ""))); return a; };
  a.kv = rows => { a.html.push(`<div class="akv">${rows.map(([k, v]) => `<span>${esc(k)} <b${isNumLike(v) ? ` class="num"` : ""}>${esc(v)}</b></span>`).join("")}</div>`); a.txt.push(rows.map(([k, v]) => k + ": " + v).join(" · ")); return a; };
  a.names = ps => { if (!ps.length) return a; a.html.push(`<div class="anames">${ps.map(p => `<span>${esc(p.name)}${isCmd(p) ? `<i>מ׳</i>` : ""}</span>`).join("")}</div>`); a.txt.push(ps.map(p => p.name).join(", ")); return a; };
  a.table = (head, rows) => {
    const cell = (v, tag) => { const o = v && typeof v === "object" ? v : { v }; const cls = [o.cls || "", isNumLike(o.v) ? "num" : ""].join(" ").trim(); return `<${tag}${cls ? ` class="${cls}"` : ""}>${esc(o.v ?? "")}</${tag}>`; };
    a.html.push(`<div class="tbl-wrap"><table class="atab"><thead><tr>${head.map(h => cell(h, "th")).join("")}</tr></thead><tbody>${rows.map(r => `<tr${r.cls ? ` class="${r.cls}"` : ""}>${r.c.map(v => cell(v, "td")).join("")}</tr>`).join("")}</tbody></table></div>`);
    a.txt.push(head.join(" | ")); rows.forEach(r => a.txt.push(r.c.map(v => v && typeof v === "object" ? v.v : v).join(" | ")));
    return a;
  };
  a.act = (l, act, v, pid) => { a.acts.push({ l, a:act, v: v ?? "", pid: pid ?? "" }); return a; };
  return a;
}
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const uLbl = U => U.length === 1 ? plName(U[0]) : groupName(U);
function dayLbl(d){ const t = todayStr(); return dmw(d) + (d === t ? " · היום" : d === addDays(t, 1) ? " · מחר" : ""); }
const rng0 = (f, to) => f === to ? dmw(f) : `${dmw(f)}–${dmw(to)}`;
const rngLbl = (f, to) => f === to ? dayLbl(f) : rng0(f, to);
const unitsOf = P => P.units && P.units.units.length ? P.units.units : jointPl();
const roleOk = (P, p) => !P.role || (P.role === "cmd" ? isCmd(p) : isCmdP(p));
/* group date-adjacent rows with the same numbers, so a long range stays short */
function runsOf(rows, key){
  const out = [];
  for (const r of rows){ const last = out[out.length - 1]; if (last && last.k === key(r) && addDays(last.to, 1) === r.d) { last.to = r.d; last.n++; } else out.push({ k:key(r), from:r.d, to:r.d, n:1, r }); }
  return out;
}
const runLbl = g => g.from === g.to ? dmw(g.from) : `${dm(g.from)}–${dm(g.to)}`;
/* the asked days, clipped to the line. If the units are home the whole time, the next time they are in instead. */
function qDays(P, U, def){
  const t = todayStr(), c = cfg();
  const r = P.range || def || { from:t, to:t, single:true, label:"היום" };
  if (r.to < c.lineStart || r.from > c.lineEnd) return { duty:[], days:[], out:true, note:`${rng0(r.from, r.to)} מחוץ לקו (${dm(c.lineStart)}–${dm(c.lineEnd)}).` };
  let from = r.from < c.lineStart ? c.lineStart : r.from, to = r.to > c.lineEnd ? c.lineEnd : r.to, pre = "";
  let duty = range(from, to).filter(d => anyIn(U, d));
  if (!duty.length){
    const nr = nextRun(U, to);
    pre = `${r.label ? r.label + " (" + rng0(from, to) + ")" : rng0(from, to) + ":"} ${uLbl(U)} בבית.`;
    if (!nr) return { duty:[], days:[], home:true, pre: pre + ` אין עוד ימי ${TD()} בקו.` };
    from = nr.from; to = r.single ? nr.from : nr.to; duty = range(from, to).filter(d => anyIn(U, d));
    pre += r.single ? ` היום הבא בפנים:` : ` ה${TD()} הבאה:`;
  }
  return { from, to, days: range(from, to), duty, pre, single: duty.length === 1 };
}
function homeAns(a, D, U){ a.pre = ""; a.head = D.out ? "מחוץ לקו" : `${uLbl(U)} בבית`; a.tone = "home"; a.p(D.note || D.pre); return a; }
function rosterNotes(a, U, d){
  for (const pl of U){
    if (unitManual(pl)) continue;
    const n = people().filter(p => p.platoon === pl).length;
    if (!n) a.p(`ל${plName(pl)} אין שמות ואין מספר ידני, אז נספר 0.`, "an");
    else if (pl !== myPl()) a.p(`${plName(pl)}: לפי ${n} שמות שהוזנו. אם יש יותר אנשים, אפשר להזין מספר ידני.`, "an");
    if ((!n || pl !== myPl()) && canEdit() && d) a.act(`מספר ידני ל${shortName(pl) === String(pl) ? TU() + " " + pl : plName(pl)}`, "unitCount", d, pl);
  }
}

function ansPres(P){
  const a = ansNew(), U = unitsOf(P), hasT = tasksList().length > 0;
  const D = qDays(P, U); a.pre = D.pre || "";
  if (!D.duty.length) return homeAns(a, D, U);
  const what = P.role === "cmd" ? "מפקדים" : P.role === "cmdp" ? "מפקדים פוטנציאליים" : "נוכחים";
  const joint = !P.role && sameSet(U, jointPl());
  const cnt = (pl, d) => !platoonIn(pl, d) ? null : P.role ? people().filter(p => p.platoon === pl && present(p, d) && roleOk(P, p)).length : unitCount(pl, d);
  const rows = D.duty.map(d => { const per = U.map(pl => cnt(pl, d)); return { d, per, tot: per.reduce((s, v) => s + (v || 0), 0), x: CTX.map[d] }; });
  if (rows.length === 1){
    const r = rows[0];
    a.head = `${r.tot} ${what}`; a.sub = `${uLbl(U)} · ${dayLbl(r.d)}`;
    if (U.length > 1) a.kv(U.map((pl, i) => [plName(pl), r.per[i] == null ? "בבית" : r.per[i]]));
    if (joint && hasT && r.x){ a.tone = r.x.slack >= 0 ? "ok" : "bad"; a.p(`נדרשים ${r.x.need} למשימות: ${r.x.slack >= 0 ? `רזרבה של ${r.x.slack}` : `חסרים ${-r.x.slack}`}.`); }
    const outP = people().filter(p => U.includes(p.platoon) && roleOk(P, p) && ["abs","req"].includes(personStatus(p, r.d)));
    if (outP.length){ a.p(`בחוץ (${outP.length}):`, "al"); a.list(outP.map(p => ({ n:p.name, s: KIND[(absOn(p, r.d) || {}).kind] || "" }))); }
    if (!P.role){ a.p(`רשומים: ${U.map(pl => (U.length > 1 ? shortName(pl) + ": " : "") + people().filter(p => p.platoon === pl).length).join(" · ")}${U.length > 1 ? "" : " שמות"}.`, "an"); rosterNotes(a, U, r.d); }
    a.act("לפתוח את היום", "dayGo", r.d);
    return a;
  }
  const tots = rows.map(r => r.tot), mn = Math.min(...tots), mx = Math.max(...tots);
  a.head = mn === mx ? `${mn} ${what} בכל יום` : `${mn}–${mx} ${what} ביום`;
  a.sub = `${uLbl(U)} · ${rng0(D.from, D.to)} · ${rows.length} ימי ${TD()}`;
  const withNeed = joint && hasT;
  const head = ["יום"].concat(U.length > 1 ? U.map(shortName) : []).concat(["סה״כ"]).concat(withNeed ? ["נדרשים","פער"] : []);
  const line = (lbl, r, cls) => { const c = [lbl].concat(U.length > 1 ? r.per.map(v => v == null ? "–" : v) : []).concat([r.tot]); if (withNeed) c.push(r.x.need, { v: sgn(r.x.slack), cls:"gap " + (r.x.slack >= 0 ? "ok" : "bad") }); return { c, cls }; };
  const t = todayStr();
  if (D.days.length <= 9) a.table(head, D.days.map(d => { const r = rows.find(x => x.d === d); return r ? line(dmw(d), r, d === t ? "today" : "") : { c:[dmw(d), "בית"].concat(Array(head.length - 2).fill("")), cls:"homerow" }; }));
  else a.table(head, runsOf(rows, r => r.per.join(",") + "|" + (withNeed ? r.x.need : "")).map(g => line(runLbl(g), g.r, "")));
  if (withNeed){ const short = rows.filter(r => r.x.slack < 0); a.tone = short.length ? "bad" : "ok"; a.p(short.length ? `חסרים ב-${short.length} מתוך ${rows.length} הימים.` : `יש מספיק בכל הימים.`); }
  const manual = U.some(pl => D.duty.some(d => platoonIn(pl, d) && unitManualOn(pl, d) != null));
  if (!manual && !P.role){
    const ppl = people().filter(p => U.includes(p.platoon));
    const any = ppl.filter(p => D.duty.some(d => present(p, d))).length, all = ppl.filter(p => D.duty.every(d => !platoonIn(p.platoon, d) || present(p, d))).length;
    a.p(`${any} אנשים שונים בפנים לפחות יום אחד, ${all} מהם בכל הימים.`);
  }
  if (!P.role) rosterNotes(a, U, D.duty[0]);
  return a;
}
function ansWho(P){
  const a = ansNew(), U = unitsOf(P);
  const D = qDays(P, U); a.pre = D.pre || "";
  if (!D.duty.length) return homeAns(a, D, U);
  const ppl = people().filter(p => U.includes(p.platoon) && roleOk(P, p));
  if (D.single){
    const d = D.duty[0], inP = ppl.filter(p => present(p, d));
    a.head = `${inP.length} בפנים`; a.sub = `${uLbl(U)} · ${dayLbl(d)}`;
    for (const pl of U){
      const ps = inP.filter(p => p.platoon === pl), man = unitManualOn(pl, d);
      if (U.length > 1) a.p(`${plName(pl)} (${ps.length}${man != null && !P.role ? ` שמות · ספירה ידנית ${man}` : ""}):`, "al");
      a.names(ps);
    }
    const outP = ppl.filter(p => ["abs","req"].includes(personStatus(p, d)));
    if (outP.length){ a.p("בחוץ:", "al"); a.list(outP.map(p => ({ n:p.name, s: KIND[(absOn(p, d) || {}).kind] || "" }))); }
    a.act("לפתוח את היום", "dayGo", d);
    return a;
  }
  const dutyOf = p => D.duty.filter(d => platoonIn(p.platoon, d));
  const all = ppl.filter(p => dutyOf(p).length && dutyOf(p).every(d => present(p, d)));
  const some = ppl.filter(p => !all.includes(p) && dutyOf(p).some(d => present(p, d)));
  const none = ppl.filter(p => dutyOf(p).length && !dutyOf(p).some(d => present(p, d)));
  a.head = `${all.length} בפנים בכל הימים`; a.sub = `${uLbl(U)} · ${rng0(D.from, D.to)}`;
  if (all.length){ a.p(`כל הימים (${all.length}):`, "al"); a.names(all); }
  if (some.length){ a.p(`חלק מהימים (${some.length}):`, "al"); a.list(some.map(p => ({ n:p.name, s:`${dutyOf(p).filter(d => present(p, d)).length} מתוך ${dutyOf(p).length} ימים` }))); }
  if (none.length){ a.p(`לא בפנים (${none.length}):`, "al"); a.names(none); }
  return a;
}
function ansOut(P){
  const a = ansNew(), U = unitsOf(P), t = todayStr();
  const nr = nextRun(U, addDays(t, -1));
  const def = nr ? { from:nr.from, to:nr.to, label: anyIn(U, t) ? `עד סוף ה${TD()} הנוכחית` : `ב${TD()} הבאה` } : null;
  const D = qDays(P, U, def); a.pre = D.pre || "";
  if (!D.duty.length) return homeAns(a, D, U);
  const rows = [];
  for (const p of people().filter(p => U.includes(p.platoon) && roleOk(P, p))){
    for (const ab of (p.absences || [])){
      if (!ab.from || !ab.to) continue;
      const miss = D.duty.filter(d => d >= ab.from && d <= ab.to && platoonIn(p.platoon, d) && inWindow(p, d));
      if (miss.length) rows.push({ p, ab, miss: miss.length, k: ab.from });
    }
    if (p.from && p.from > D.from && p.from <= D.to) rows.push({ p, arr:p.from, k:p.from });
    if (p.to && p.to >= D.from && p.to < D.to) rows.push({ p, dep:p.to, k:p.to });
  }
  const tent = people().filter(p => U.includes(p.platoon) && roleOk(P, p) && p.tentative && D.duty.some(d => platoonIn(p.platoon, d)));
  rows.sort((x, y) => x.k.localeCompare(y.k));
  const n = new Set(rows.filter(r => r.ab).map(r => r.p.id)).size;
  a.head = !n ? "אף אחד לא יוצא" : D.single ? (n === 1 ? "אחד בחוץ" : `${n} בחוץ`) : n === 1 ? "יוצא אחד" : `${n} יוצאים`; a.tone = n ? "" : "ok";
  a.sub = `${uLbl(U)} · ${rngLbl(D.from, D.to)}`;
  a.list(rows.map(r => r.ab ? { n:r.p.name, s:`${KIND[r.ab.kind] || "יציאה"}${r.ab.status === "request" ? " (בקשה)" : ""} · ${r.ab.from === r.ab.to ? dm(r.ab.from) : dm(r.ab.from) + "–" + dm(r.ab.to)}${!D.single && r.miss > 1 ? ` · ${r.miss} ימים` : ""}` }
    : r.arr ? { n:r.p.name, s:`הגעה ב-${dmw(r.arr)}` } : { n:r.p.name, s:`יום אחרון ${dmw(r.dep)}` }));
  if (tent.length) a.p(`הגעה לא ודאית: ${tent.map(p => p.name).join(", ")}`, "an");
  if (canEdit()) a.act("+ יציאה או אילוץ", "newConstraint", D.duty[0]);
  return a;
}
function ansGap(P){
  const a = ansNew(), t = todayStr(), c = cfg();
  if (!tasksList().length){ a.head = "אין עדיין משימות"; a.p("כדי לדעת אם חסרים, מגדירים משימות: כמה חיילים וכמה שעות."); a.act("הוספת משימה", "editTask", ""); return a; }
  const U = jointPl();
  const D = qDays(P, U, { from: t < c.lineStart ? c.lineStart : t, to: c.lineEnd, label:"עד סוף הקו" }); a.pre = D.pre || "";
  if (!D.duty.length) return homeAns(a, D, U);
  const xs = D.duty.map(d => CTX.map[d]).filter(Boolean);
  if (xs.length === 1){
    const x = xs[0];
    a.head = x.slack < 0 ? `חסרים ${-x.slack}` : P.rel ? (x.slack > 0 ? `אפשר לשחרר עד ${x.slack}` : "אין את מי לשחרר") : x.slack ? `יש מספיק · רזרבה ${x.slack}` : "בדיוק מספיק";
    a.tone = x.slack >= 0 ? "ok" : "bad";
    a.sub = `${x.sup} נוכחים מול ${x.need} נדרשים · ${dayLbl(x.d)}`;
    if (U.length > 1) a.kv(U.map(pl => [plName(pl), x.byPl[pl].n]));
    pakalAlerts(x).forEach(k => a.p(`חסר ${k.name} בפנים (${x.tagSup[k.name] || 0} מתוך ${k.min}).`));
    a.act("לפתוח את היום", "dayGo", x.d);
    return a;
  }
  const short = xs.filter(x => x.slack < 0), worst = xs.reduce((w, x) => x.slack < w.slack ? x : w, xs[0]);
  a.head = short.length ? `חסרים ב-${short.length} מתוך ${xs.length} ימים` : `יש מספיק בכל ${xs.length} הימים`;
  a.tone = short.length ? "bad" : "ok";
  a.sub = `${uLbl(U)} · ${rng0(D.from, D.to)}`;
  a.p(short.length ? `הכי קשה: ${dmw(worst.d)}, ${worst.sup} מול ${worst.need} (חסרים ${-worst.slack}).` : `הרזרבה הכי קטנה: ${dmw(worst.d)}, ${sgn(worst.slack)}.`);
  const groups = xs.length <= 9 ? xs.map(x => ({ from:x.d, to:x.d, r:x })) : runsOf(xs, x => x.sup + "|" + x.need);
  a.table(["יום","נוכחים","נדרשים","פער"], groups.map(g => ({ c:[runLbl(g), g.r.sup, g.r.need, { v:sgn(g.r.slack), cls:"gap " + (g.r.slack >= 0 ? "ok" : "bad") }], cls: g.from === t ? "today" : "" })));
  return a;
}
function ansNeed(P){
  const a = ansNew(), all = tasksList(), t = todayStr();
  if (P.hypo){
    const h = P.hypo, len = h.len || Math.min(h.hours, 8);
    const s = taskShape({ size:h.size, hours:h.hours, len, rest: settings().minRest }), need = s.size * s.teams;
    a.head = `${need} חיילים ביום`; a.sub = `משימה של ${s.size} במשמרת, ${s.hours === 24 ? "כל היממה" : s.hours + " ש׳ ביום"}`;
    a.p(`${s.count} ${s.count === 1 ? "משמרת" : "משמרות"} של ${s.len} ש׳. עם מנוחה של ${s.rest} ש׳ בין משמרות ${s.teams === 1 ? "מספיק צוות אחד" : `צריך ${s.teams} צוותים מתחלפים`} × ${s.size} = ${need}.`);
    if (!h.len) a.p(`חישבתי משמרות של ${len} ש׳. אפשר לכתוב למשל "משמרות של 4".`, "an");
    const fdd = focusDay(CTX), x = fdd && CTX.map[fdd];
    if (x && x.state === "duty") a.p(`ב-${dmw(fdd)}: ${x.sup} נוכחים, המשימות הקיימות דורשות ${x.need}. עם המשימה הזו: ${x.need + need} (${sgn(x.sup - x.need - need)}).`);
    return a;
  }
  if (!all.length){ a.head = "אין עדיין משימות"; a.p("מגדירים משימה: כמה חיילים במשמרת וכמה שעות ביום."); a.act("הוספת משימה", "editTask", ""); return a; }
  let d = P.range && P.range.single && inLine(P.range.from) ? P.range.from : null;
  if (d && dayState(d) !== "duty"){ const D = qDays(P, jointPl()); a.pre = D.pre || ""; d = D.duty[0] || null; }
  const subset = P.tasks.length > 0;
  let list = subset ? P.tasks : all;
  if (d) list = list.filter(tk => taskActive(tk, d));
  const cmd = P.role === "cmd";
  const needOf = tk => cmd ? (tk.cmd || 0) * taskShape(tk).teams : taskNeed(tk);
  const tot = list.reduce((s, tk) => s + needOf(tk), 0);
  const who = cmd ? "מפקדים" : "חיילים";
  if (d && !list.length){ a.head = subset ? "המשימה לא פעילה ביום הזה" : "אין משימות ביום הזה"; a.sub = dayLbl(d); return a; }
  a.head = subset && list.length === 1 ? `${tot} ${who} ל${list[0].name}` : `${tot} ${who} ביום`;
  a.sub = (subset ? list.map(tk => tk.name).join(" + ") : "כל המשימות") + (d ? ` · ${dayLbl(d)}` : "");
  a.table(["משימה","במשמרת","שעות","צוותים","נדרשים"], list.map(tk => { const s = taskShape(tk); return { c:[tk.name, cmd ? (tk.cmd || 0) : s.size, s.hours, s.teams, needOf(tk)] }; }).concat(list.length > 1 ? [{ c:["סה״כ", "", "", "", tot], cls:"tot" }] : []));
  a.p(`נדרשים = במשמרת × צוותים מתחלפים, כדי שלכל אחד תהיה מנוחה של ${settings().minRest} ש׳ בין משמרות.`, "an");
  const partDays = list.filter(tk => tk.days && tk.days.length < 7);
  if (partDays.length && !d) a.p(partDays.map(tk => `${tk.name}: רק בימים ${tk.days.map(i => WD[i]).join(" ")}`).join(" · "), "an");
  if (subset){ const allTot = (d ? all.filter(tk => taskActive(tk, d)) : all).reduce((s, tk) => s + needOf(tk), 0); if (allTot !== tot) a.p(`כל המשימות יחד: ${allTot} ${who} ביום.`); }
  const dd = d || focusDay(CTX), x = dd && CTX.map[dd];
  if (x && x.state === "duty" && !cmd) a.p(`ב-${dmw(dd)}${dd === t ? " (היום)" : ""} נוכחים ${x.sup} (${JL()})${subset ? `, ואחרי ${list.length === 1 ? "המשימה הזו" : "המשימות האלה"} נשארים ${x.sup - tot}` : ` → ${x.slack >= 0 ? "רזרבה " + x.slack : "חסרים " + (-x.slack)}`}.`);
  a.act("למשימות", "openMore", "tasks");
  return a;
}
function ansTag(P){
  const a = ansNew(), U = P.units ? P.units.units : null;
  let d = null;
  if (P.range){ const D = qDays(P, jointPl()); d = D.duty[0] || null; }
  else d = focusDay(CTX) || null;
  const holders = tag => pakalHolders(tag).filter(p => !U || U.includes(p.platoon));
  if (P.tags.length === 1){
    const tag = P.tags[0], hs = holders(tag);
    if (!hs.length){ a.head = `אף אחד לא מסומן ${tag}`; a.p("מסמנים פק״לים בעוד ← פק״לים, או בכרטיס של כל חייל."); a.act("לפק״לים", "openMore", "pakal"); return a; }
    const inN = d ? hs.filter(p => present(p, d)).length : null;
    a.head = `${hs.length} ${tag}${d ? ` · ${inN} בפנים` : ""}`; a.sub = d ? dayLbl(d) : "";
    a.list(hs.map(p => ({ n:p.name, s: plName(p.platoon) + (d ? " · " + STATUS_WORD[personStatus(p, d)] : "") })));
    const k = pakalim().find(k => k.name === tag);
    if (k && k.min && d) { a.p(`מינימום בפנים: ${k.min}`); a.tone = inN >= k.min ? "ok" : "bad"; }
    return a;
  }
  a.head = "פק״לים"; a.sub = d ? `✓ = בפנים ב-${dayLbl(d)}` : "";
  a.list(P.tags.map(tag => { const hs = holders(tag); return { n:tag, s: hs.length ? hs.map(p => p.name + (d && present(p, d) ? " ✓" : "")).join(", ") : "אף אחד לא מסומן" }; }));
  a.act("לפק״לים", "openMore", "pakal");
  return a;
}
function personSummary(p, f, to){
  const dd = range(f, to).filter(d => inLine(d) && platoonIn(p.platoon, d) && inWindow(p, d));
  if (!dd.length) return `לא ב${TD()} ב-${rng0(f, to)}`;
  const inD = dd.filter(d => present(p, d)).length;
  return inD === dd.length ? `בפנים בכל ${dd.length} ימי ה${TD()}` : `בפנים ${inD} מתוך ${dd.length} ימי ${TD()}`;
}
function personNow(p){
  const t = todayStr(), c = cfg();
  if (t > c.lineEnd) return "הקו הסתיים";
  const d0 = t < c.lineStart ? c.lineStart : t, st = personStatus(p, d0);
  let nx = null; for (let d = addDays(d0, 1); d <= c.lineEnd; d = addDays(d, 1)){ const s = personStatus(p, d); if (st === "in" ? s !== "in" : s === "in"){ nx = { d, s }; break; } }
  const now = (d0 === t ? STATUS_WORD[st] + " היום" : `ב-${dmw(d0)}: ${STATUS_WORD[st]}`);
  if (!nx) return now + (st === "in" ? " ועד סוף הקו" : "");
  return now + (st === "in" ? ` · ${STATUS_WORD[nx.s]} מ-${dmw(nx.d)}` : ` · בפנים שוב מ-${dmw(nx.d)}`);
}
function ansPerson(P){
  const a = ansNew(), ps = P.persons.slice(0, 5), rn = roleNames();
  const line = p => P.range ? (P.range.single ? `${STATUS_WORD[personStatus(p, P.range.from)]} ב-${dmw(P.range.from)}` : personSummary(p, P.range.from, P.range.to)) : personNow(p);
  if (ps.length > 1){ a.head = ps.map(p => p.name).join(", "); a.list(ps.map(p => ({ n:p.name, s:line(p) }))); return a; }
  const p = ps[0];
  a.head = p.name; a.sub = `${plName(p.platoon)} · ${rn[p.role] || rn.soldier}${(p.tags || []).length ? " · " + p.tags.join(", ") : ""}`;
  a.p(line(p));
  if (P.range && !P.range.single){
    const out = range(P.range.from, P.range.to).filter(d => ["abs","req"].includes(personStatus(p, d)));
    if (out.length) a.p(`בחוץ: ${fmtDays(out)}`);
  }
  const abs = (p.absences || []).filter(x => x.from && x.to).sort((x, y) => x.from.localeCompare(y.from));
  if (abs.length){ a.p("יציאות:", "al"); a.list(abs.map(x => ({ n: KIND[x.kind] || "יציאה", s:`${x.from === x.to ? dmw(x.from) : rng0(x.from, x.to)}${x.status === "request" ? " · בקשה" : ""}${x.reason && x.reason !== KIND[x.kind] ? " · " + x.reason : ""}` }))); }
  else a.p("אין יציאות רשומות.", "an");
  const c = cfg(), t0 = todayStr() < c.lineStart ? c.lineStart : todayStr();
  const missed = range(t0, c.lineEnd).filter(d => ["abs","req"].includes(personStatus(p, d)));
  if (missed.length && !P.range) a.p(`ימי ${TD()} בחוץ מהיום ועד סוף הקו: ${missed.length} (${fmtDays(missed)}).`);
  if (p.from || p.to) a.p(`בקו ${p.from ? "מ-" + dmw(p.from) : ""}${p.from && p.to ? " " : ""}${p.to ? "עד " + dmw(p.to) : ""}.`);
  if (p.tentative) a.p("ההגעה לא ודאית.", "an");
  a.act("לכרטיס", "editPerson", p.id);
  return a;
}
function ansRelease(P){
  const a = ansNew(), p = P.persons[0];
  if (!P.range){ a.head = "לאיזה תאריך?"; a.p(`כתבו למשל: "אפשר לשחרר את ${p.name} ב-${dm(addDays(todayStr(), 3))}?"`); return a; }
  const from = P.range.from, to = P.range.to;
  const dd = range(from, to).filter(d => dayState(d, p.platoon) === "duty" && personStatus(p, d) === "in");
  a.sub = `${p.name} · ${rng0(from, to)}`;
  if (!dd.length){ a.head = `${p.name} לא ב${TD()} בתאריכים האלה`; a.p("ימי בית, יציאה שכבר רשומה או מחוץ לקו. אין מה לאשר."); a.tone = "ok"; return a; }
  const slacks = dd.map(d => CTX.map[d] && CTX.map[d].slack).filter(v => v != null);
  const minSlack = slacks.length ? Math.min(...slacks) - 1 : 0;
  const sim = tasksList().length && jointPl().includes(p.platoon) ? simulateAbs(p, { from, to, kind:"other" }) : null;
  const v = verdictOf(minSlack, sim ? sim.delta : null);
  a.head = v.word; a.tone = v.sev === "ok" ? "ok" : v.sev === "crit" ? "bad" : "warn";
  a.sub = `${p.name} · ${fmtDays(dd)}`;
  a.p(`${dd.length === 1 ? "יום " + TD() + " אחד" : dd.length + " ימי " + TD()}. ${v.why}.`);
  if (isCmd(p)){ const mc = Math.min(...dd.map(d => CTX.map[d] ? CTX.map[d].p1Cmd : 0)) - 1; a.p(`יישארו ${mc} מפקדים ב${plName(myPl())}.`); }
  const pkLow = pakalim().filter(k => (k.min || 0) > 0 && hasTag(p, k.name) && dd.some(d => CTX.map[d] && (CTX.map[d].tagSup[k.name] || 0) - 1 < k.min));
  if (pkLow.length) a.p(`יחסר ${pkLow.map(k => k.name).join(", ")} בפנים.`);
  if (canEdit()) a.act("לרשום כיציאה מאושרת", "addAbsQuick", from + "|" + to, p.id);
  return a;
}
function ansRot(P){
  const a = ansNew(), t = todayStr(), c = cfg(), U = unitsOf(P), pl = U[0];
  if (t > c.lineEnd){ a.head = "הקו הסתיים"; a.sub = `${dm(c.lineStart)}–${dm(c.lineEnd)}`; return a; }
  const start = t < c.lineStart ? c.lineStart : t, runs = []; let cur = null;
  for (const d of range(start, c.lineEnd)){ const s = dayState(d, pl); if (cur && cur.s === s) cur.to = d; else runs.push(cur = { s, from:d, to:d }); }
  const now = runs[0], nx = runs[1];
  if (t < c.lineStart) a.head = `הקו נפתח ב-${dmw(c.lineStart)}`;
  else if (now.s === "duty") a.head = nx ? `הביתה ב-${dmw(nx.from)}` : `ב${TD()} עד סוף הקו`;
  else a.head = nx ? `עולים ב-${dmw(nx.from)}` : "בבית עד סוף הקו";
  a.tone = now.s === "duty" ? "" : "home";
  const g = groupsCfg().find(x => x.includes(pl));
  a.sub = (g ? groupName(g) : plName(pl)) + ` · הקו עד ${dmw(c.lineEnd)}`;
  a.list(runs.slice(0, 8).map((r, i) => ({ n: r.s === "duty" ? TD() : "בית", s:`${rng0(r.from, r.to)}${i === 0 && t >= c.lineStart ? " · עכשיו" : ""}` })));
  return a;
}
function ansGear(P){
  const a = ansNew(), all = gearItems(), items = P.gear.items.length ? P.gear.items : all;
  const ppl = gearPeople().filter(p => !P.persons.length || P.persons.includes(p));
  const word = s => s === "ok" ? "חתום" : s === "bad" ? "תקלה / חסר" : "לא חתום";
  a.act("לטבלת הצל״ם", "openMore", "gear");
  if (!ppl.length){ a.head = P.persons.length ? `${P.persons.map(p => p.name).join(", ")}: לא ב${plName(myPl())}` : "אין חיילים"; a.p(`טבלת הצל״ם היא של ${plName(myPl())}.`); return a; }
  if (P.persons.length){
    a.head = ppl.length === 1 ? `צל״ם · ${ppl[0].name}` : "צל״ם";
    for (const p of ppl){
      if (ppl.length > 1) a.p(p.name + ":", "al");
      a.list(items.map(it => { const e = gearOf(p, it.id), s = gearState(e); return { n: it.name, s: word(s) + (e && e.sn ? ` · צ׳ ${e.sn}` : "") + (e && e.note ? ` · ${e.note}` : "") }; }));
    }
    return a;
  }
  const miss = it => ppl.filter(p => gearState(gearOf(p, it.id)) !== "ok");
  if (items.length === 1){
    const it = items[0], m = miss(it);
    a.head = !m.length ? `כולם חתומים על ${it.name}` : m.length === 1 ? `רק ${m[0].name} לא חתום על ${it.name}` : `${m.length} לא חתומים על ${it.name}`; a.tone = m.length ? "warn" : "ok";
    a.sub = `${plName(myPl())} · ${ppl.length - m.length} מתוך ${ppl.length} חתומים`;
    a.list(m.map(p => ({ n:p.name, s: word(gearState(gearOf(p, it.id))) })));
    return a;
  }
  const rows = items.map(it => ({ it, m: miss(it) })).filter(r => r.m.length);
  const tot = rows.reduce((s, r) => s + r.m.length, 0);
  a.head = tot ? `${tot} חתימות חסרות` : "הכול חתום"; a.tone = tot ? "warn" : "ok";
  a.sub = `${plName(myPl())} · ${ppl.length} חיילים · ${items.length} פריטים`;
  a.list(rows.map(r => ({ n: `${r.it.name} (${r.m.length})`, s: r.m.length === ppl.length ? "אף אחד לא חתום" : r.m.map(p => p.name).join(", ") })));
  return a;
}
function ansHelp(){
  const a = ansNew();
  a.head = "לא הבנתי את השאלה";
  a.p("השאלות שנענות כאן מיד הן על נוכחות, משימות, יציאות, פק״לים וסבבים. למשל:");
  a.html.push(`<div class="askchips wrap">${askSuggest().slice(0, 6).map(q => `<button class="kchip" data-a="askQ" data-v="${esc(q)}">${esc(q)}</button>`).join("")}</div>`);
  a.unknown = true;
  return a;
}

/* ---------- Claude ---------- */
const AI_RULES = `You are the question box inside "שבצ״ק", a duty-roster app that an IDF reserve platoon commander uses on his phone. Answer the last question using ONLY the app data below. The app computed it and it is authoritative: per-day counts already exclude people at home in rotation, on leave, outside their dates in the line, or tentative. Never invent people, numbers or dates. If the data can't answer, say so in one line and say what to enter in the app.
Reply in Hebrew, short, for a phone screen. The first line is the direct answer (a number, yes/no, a date or names). Then, only if it helps, a few "- " bullets or one small Markdown table (at most 4 columns and 15 rows). No preamble, no headings, don't repeat the question. Dates as d/m (11/10), weekdays as א׳–ש׳.
"השבוע" is the Sunday–Saturday week that contains today; "שבוע הבא" is the one after. For a range, give per-day counts as min–max and name notable days. If the asked units are home for the whole range, say so and give the next duty period instead. "המחלקה שלי" is the user's unit; with no unit named, use the units that rotate together.`;
function aiData(){
  const c = cfg(), t = todayStr(), jp = jointPl(), ctx = buildCtx(), rn = roleNames(), L = [];
  L.push(`Today: ${t} (${WDL[dow(t)]}). Weeks run Sunday to Saturday.`);
  L.push(`User's unit: ${plName(myPl())}. Units that rotate together and share the tasks ("${JL()}"): ${jp.map(plName).join(", ")}.`);
  L.push(`All units: ${allPlatoons().map(pl => `${pl} = "${plName(pl)}" (rotation ${groupLabel(groupOf(pl))})`).join("; ")}.`);
  L.push(`Line: ${c.lineStart} to ${c.lineEnd}. Days inside are called "${TD()}".`);
  L.push(`Rotation blocks: ${(c.blocks || []).map(b => `${b.start}..${b.end} ${b.home === "none" ? "everyone in" : "home: " + groupLabel(b.home)}`).join("; ") || "none"}.`);
  const man = allPlatoons().filter(pl => unitManual(pl));
  if (man.length) L.push(`Manual headcounts (roster incomplete, the number replaces the named count): ${man.map(pl => { const m = unitManual(pl); return `${plName(pl)}: ${m.base != null && m.base !== "" ? m.base + " every day in" : ""}${m.days ? " " + Object.entries(m.days).map(([d, n]) => d + "=" + n).join(", ") : ""}`; }).join("; ")}.`);
  if ((c.events || []).length) L.push(`Events: ${c.events.map(e => e.date + " " + e.label).join("; ")}.`);
  L.push("");
  L.push(`DAYS for ${JL()}: date | weekday | state | present per unit (unit:count, * = manual number) | total present | needed by tasks | slack | commanders present | out (name: reason)`);
  for (const x of ctx.days){
    if (x.state !== "duty"){ L.push(`${x.d} | ${WD[dow(x.d)]} | home`); continue; }
    L.push([x.d, WD[dow(x.d)], TD(), jp.map(pl => `${pl}:${x.byPl[pl].n}${x.byPl[pl].manual ? "*" : ""}`).join(" "), x.sup, x.need, x.slack, x.cmdSup,
      x.absent.map(p => `${p.name}: ${KIND[(absOn(p, x.d) || {}).kind] || "out"}${personStatus(p, x.d) === "req" ? " (request)" : ""}`).join(", ") || "-"].join(" | "));
  }
  for (const pl of allPlatoons().filter(pl => !jp.includes(pl))){
    const ppl = people().filter(p => p.platoon === pl);
    const days = lineDays().filter(d => platoonIn(pl, d));
    L.push(`${plName(pl)} (other rotation): ${ppl.length} named people${unitManual(pl) ? ", manual count set" : ""}; in on ${days.length ? fmtDays(days) : "no days"}.`);
  }
  L.push("");
  L.push("PEOPLE: name | unit | role | פק״לים | dates in the line | absences");
  for (const p of people()) L.push([p.name, p.platoon, rn[p.role] || p.role || rn.soldier, (p.tags || []).join("/") || "-", (p.from || p.to) ? `${p.from || "start"}..${p.to || "end"}` : "whole line",
    (p.absences || []).filter(x => x.from && x.to).map(x => `${KIND[x.kind] || "out"} ${x.from}..${x.to}${x.status === "request" ? " (request)" : ""}${x.reason ? " " + x.reason : ""}`).join("; ") || "-"].join(" | ") + (p.tentative ? " | tentative" : ""));
  L.push("");
  L.push(`TASKS (needed per day = per shift × rotating crews, so each crew rests ${settings().minRest}h): name | per shift | hours a day | shift length | crews | needed a day | commanders per shift | days | manned by`);
  for (const tk of tasksList()){ const s = taskShape(tk); L.push([tk.name, s.size, s.hours, s.len, s.teams, taskNeed(tk), tk.cmd || 0, (tk.days || []).length && tk.days.length < 7 ? tk.days.map(i => WD[i]).join("") : "daily", (tk.platoons || jp).join("+")].join(" | ")); }
  const rules = Object.values(S.rules).filter(r => r.on !== false);
  if (rules.length){ L.push(""); L.push("ROSTER RULES: " + rules.map(ruleText).join("; ")); }
  const kmin = pakalim().filter(k => (k.min || 0) > 0);
  if (kmin.length) L.push(`פק״ל minimums in: ${kmin.map(k => k.name + " " + k.min).join(", ")}.`);
  const gi = gearItems(), gp = gearPeople().map(p => [p.name, gi.filter(it => gearState(gearOf(p, it.id)) !== "ok").map(it => it.name)]).filter(x => x[1].length);
  if (gp.length) L.push(`GEAR not signed (${plName(myPl())}): ${gp.map(([n, xs]) => n + ": " + xs.join(", ")).join("; ")}.`);
  return L.join("\n");
}
function localText(it){ const r = it.r; return [r.pre, r.head, r.sub].concat(r.txt).filter(Boolean).join("\n"); }
function aiTurns(it){
  const turns = [{ role:"user", content: AI_RULES + "\n\n<app_data>\n" + aiData() + "\n</app_data>" }];
  const prev = ASK.items.filter(x => x.id < it.id && x.id !== it.skip && (x.kind === "local" ? !x.r.unknown : x.st === "done" && x.text)).slice(-4);
  for (const x of prev){ turns.push({ role:"user", content:x.q }); turns.push({ role:"assistant", content: x.kind === "local" ? localText(x) : x.text }); }
  turns.push({ role:"user", content: it.q });
  return turns;
}
/* small Markdown: paragraphs, - lists, 1. lists, | tables |, **bold** */
function md(s){
  let h = "", list = null, tbl = null;
  const inl = x => esc(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(:|])([+\-−]\d[\d.,]*)/g, '$1<span class="ltr">$2</span>');
  const flush = () => {
    if (list){ h += `<${list.t}>${list.items.map(i => `<li>${inl(i)}</li>`).join("")}</${list.t}>`; list = null; }
    if (tbl){ const [hd, ...rows] = tbl; h += `<div class="tbl-wrap"><table class="atab"><thead><tr>${hd.map(c => `<th>${inl(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td${isNumLike(c) ? ` class="num"` : ""}>${inl(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; tbl = null; }
  };
  for (const raw of String(s || "").split("\n")){
    const ln = raw.trim(); let m;
    if (/^\|.*\|$/.test(ln)){ if (list) flush(); const cells = ln.slice(1, -1).split("|").map(x => x.trim()); if (!cells.every(x => /^:?-{2,}:?$/.test(x))) (tbl = tbl || []).push(cells); continue; }
    if (tbl) flush();
    if ((m = ln.match(/^[-*•]\s+(.*)$/))){ if (list && list.t !== "ul") flush(); (list = list || { t:"ul", items:[] }).items.push(m[1]); continue; }
    if ((m = ln.match(/^\d+[.)]\s+(.*)$/))){ if (list && list.t !== "ol") flush(); (list = list || { t:"ol", items:[] }).items.push(m[1]); continue; }
    flush();
    if (!ln) continue;
    if ((m = ln.match(/^#{1,6}\s+(.*)$/))){ h += `<p><b>${inl(m[1])}</b></p>`; continue; }
    h += `<p>${inl(ln)}</p>`;
  }
  flush();
  return h;
}
function paintAi(it){ const el = document.getElementById("md-" + it.id); if (el) el.innerHTML = md(it.text); }
const AI_OFF = ["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"];
async function askAi(it){
  const ctl = new AbortController(); ASK.ctl = ctl; ASK.busy = true;
  it.kind = "ai"; it.st = "wait"; it.text = ""; it.err = null; it.trunc = false; render();
  try {
    const sample = S.sample;
    const r = await sample(aiTurns(it), { signal: ctl.signal, cache:false, onText: ({ text }) => { it.text = text; if (it.st !== "stream"){ it.st = "stream"; render(); } else paintAi(it); } });
    it.text = r.text; it.trunc = !!r.truncated; it.st = "done";
  } catch(e){
    const code = e && e.code;
    it.text = (e && e.text) || "";
    it.st = code === "cancelled" ? "stopped" : "err";
    if (code === "cancelled") it.err = it.text ? "נעצר." : "נעצר לפני שהתחילה תשובה.";
    else if (AI_OFF.includes(code)){
      S.aiOff = true; it.err = "התשובות של Claude לא זמינות כאן. שאלות נפוצות עדיין נענות מהנתונים.";
      if (!it.text){ let loc = null; try { loc = askLocal(it.q); } catch(_){} if (loc){ it.kind = "local"; it.r = loc; } }
    }
    else if (code === "rate_limited") it.err = "יותר מדי שאלות ברצף. נסו שוב עוד מעט.";
    else if (code === "session_expired") it.err = "צריך להתחבר מחדש ל-Claude.";
    else if (code === "refused"){ it.text = ""; it.err = "לא התקבלה תשובה לשאלה הזו. נסו לנסח אחרת."; }
    else if (code === "prompt_too_large") it.err = "יותר מדי נתונים לשאלה אחת.";
    else it.err = "התשובה נקטעה. אפשר לנסות שוב.";
  } finally {
    if (ASK.ctl === ctl){ ASK.ctl = null; ASK.busy = false; }
    render();
  }
}
function askSubmit(qRaw, forceAi, skipId){
  const inp = document.getElementById("askIn");
  const q = String(qRaw != null ? qRaw : (inp ? inp.value : ASK.draft)).trim();
  if (!q){ if (inp) inp.focus(); return; }
  CTX = buildCtx();
  let r = null;
  if (!forceAi){ try { r = askLocal(q); } catch(e){ console.error(e); r = null; } }
  const ai = askAiOn(), wantAi = ai && (forceAi || !r || r.defer);
  if (wantAi && ASK.busy) return toast("רגע, Claude עוד עונה על השאלה הקודמת");
  if (qRaw == null || inp && inp.value.trim() === q){ ASK.draft = ""; if (inp){ inp.value = ""; inp.blur(); } }
  askRemember(q);
  const it = { id: ++ASK.seq, q };
  if (wantAi){ it.kind = "ai"; it.skip = skipId || null; }
  else { it.kind = "local"; it.r = r || ansHelp(); if (r && r.defer) r.p("ייתכן שחלק מהשאלה לא נענה. אפשר לשאול בפשטות יותר.", "an"); }
  ASK.items.push(it); if (ASK.items.length > 30) ASK.items.shift();
  if (UI.tab !== "ask"){ UI.tab = "ask"; saveUI(); }
  render();
  const el = document.getElementById("qa-" + it.id); if (el && el.scrollIntoView) el.scrollIntoView({ block:"nearest" });
  if (wantAi) askAi(it);
}
function askCopyText(it){ if (!it) return ""; const body = it.kind === "local" ? localText(it) : String(it.text || "").replace(/\*\*(.+?)\*\*/g, "*$1*"); return it.q + "\n" + body; }

/* ---------- view ---------- */
function askSuggest(){
  const jp = jointPl(), other = jp.find(pl => pl !== myPl()), ts = tasksList(), out = ["כמה חיילים יש השבוע?"];
  out.push(`כמה חיילים מה${TU()} שלי יש בשבוע הבא?`);
  if (other) out.push(`כמה חיילים מ${TU()} ${other} יש בשבוע הבא?`);
  if (ts.length >= 2) out.push(`כמה נדרשים ל${ts[0].name} ול${ts[1].name}?`); else if (ts.length) out.push(`כמה נדרשים ל${ts[0].name}?`);
  if (ts.length) out.push("באילו ימים חסרים?");
  out.push("מי בחוץ בשבוע הבא?");
  out.push("מתי עולים?");
  const pr = people().find(p => (p.absences || []).some(x => x.to && x.to >= todayStr()));
  if (pr) out.push(`מה המצב של ${pr.name}?`);
  if (pakalim().some(k => k.name === "חובש")) out.push("מי החובשים?");
  return out;
}
function askCard(it){
  let body;
  if (it.kind === "local"){
    const r = it.r, EDIT = ["unitCount","newConstraint","addAbsQuick","editTask"];
    const acts = r.acts.filter(x => canEdit() || !EDIT.includes(x.a)).map(x => `<button class="btn sm" data-a="${x.a}" data-v="${esc(x.v)}" data-pid="${esc(x.pid)}">${esc(x.l)}</button>`).join("");
    body = `<div class="aa ${r.tone || ""}">${r.pre ? `<div class="apre">${esc(r.pre)}</div>` : ""}<div class="ah">${esc(r.head)}</div>${r.sub ? `<div class="as">${esc(r.sub)}</div>` : ""}${r.html.join("")}
      <div class="aacts">${acts}${r.unknown ? "" : `<button class="btn ghost sm" data-a="askCopy" data-v="${it.id}">העתקה</button>`}${askAiOn() ? `<button class="btn ghost sm" data-a="askAi" data-v="${it.id}">${r.unknown ? "לשאול את Claude" : "לשאול את Claude במקום"}</button>` : ""}</div></div>`;
  } else {
    const live = it.st === "wait" || it.st === "stream";
    body = `<div class="aa ai"><div class="abadge">Claude</div><div class="md" id="md-${it.id}">${it.text ? md(it.text) : live ? `<p class="muted think">חושב…</p>` : ""}</div>
      ${it.err ? `<p class="aerr">${esc(it.err)}</p>` : ""}${it.trunc ? `<p class="an">התשובה ארוכה מדי ונקטעה. אפשר לשאול על חלק ממנה.</p>` : ""}
      <div class="aacts">${live ? `<button class="btn sm" data-a="askStop">עצירה</button>` : `${it.text ? `<button class="btn ghost sm" data-a="askCopy" data-v="${it.id}">העתקה</button>` : ""}${(it.st === "err" || it.st === "stopped") && askAiOn() && !ASK.busy ? `<button class="btn ghost sm" data-a="askRetry" data-v="${it.id}">לנסות שוב</button>` : ""}`}</div></div>`;
  }
  return `<article class="qa" id="qa-${it.id}"><div class="qq">${esc(it.q)}</div>${body}</article>`;
}
function vAsk(){
  const rec = askRecent(), chips = [...new Set(rec.slice(0, 3).concat(askSuggest()))].slice(0, 9), empty = !ASK.items.length;
  let h = `<section class="askbar">
    <div class="askrow"><input id="askIn" class="askin" type="text" enterkeyhint="send" autocomplete="off" placeholder="שאלו על הקו…" value="${esc(ASK.draft)}" aria-label="שאלה על הקו">
      <button class="btn primary" data-a="askGo">שאל</button></div>
    <div class="askchips${empty ? " wrap" : ""}">${chips.map(q => `<button class="kchip" data-a="askQ" data-v="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    ${empty ? `<p class="small muted asknote">${askAiOn() ? "שאלות על נוכחות, משימות, יציאות, פק״לים וסבבים נענות מיד מהנתונים. שאלות אחרות עוברות ל-Claude ונספרות בשימוש שלך." : "התשובות מחושבות מהנתונים שהוזנו: נוכחות, משימות, יציאות, פק״לים וסבבים."}</p>` : ""}
  </section>`;
  for (const it of ASK.items.slice().reverse()) h += askCard(it);
  if (!empty) h += `<div class="row" style="justify-content:center"><button class="btn ghost sm" data-a="askClear">ניקוי השאלות</button></div>`;
  return h;
}
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target && e.target.id === "askIn" && !e.isComposing){ e.preventDefault(); askSubmit(); } });
document.addEventListener("input", e => { if (e.target && e.target.id === "askIn") ASK.draft = e.target.value; });
