"use strict";
/* ================= actions ================= */
function saveCfg(patch){ const c = Object.assign(JSON.parse(JSON.stringify(cfg() || {})), patch); put("line/config", c); }
function armDelete(el){ if (el.dataset.armed){ return true; } el.dataset.armed = "1"; el.textContent = "לחצו שוב למחיקה"; setTimeout(() => { if (el.isConnected){ delete el.dataset.armed; el.textContent = "מחיקה"; } }, 3500); return false; }
function updPerson(pid, fn){ const p = JSON.parse(JSON.stringify(S.soldiers[pid])); fn(p); put("soldiers/" + pid, p); }

const ACT = {
  tab: v => { UI.tab = v; if (v === "more") UI.more = null; saveUI(); render(); window.scrollTo(0, 0); },
  dayMove: v => { UI.day = addDays(UI.day, Number(v)); render(); },
  dayGo: v => { UI.tab = "today"; UI.day = v; saveUI(); render(); window.scrollTo(0, 0); },
  goRoster: v => { UI.tab = "roster"; UI.rosterDate = v; saveUI(); render(); window.scrollTo(0, 0); },
  openMore: v => { UI.tab = "more"; UI.more = v; saveUI(); render(); window.scrollTo(0, 0); },
  moreBack: () => { UI.more = null; saveUI(); render(); window.scrollTo(0, 0); },
  seg: v => { UI.seg = v; saveUI(); render(); },
  dutyOnly: v => { UI.dutyOnly = v === "1"; saveUI(); render(); },
  insCat: v => { UI.insCat = v; render(); },
  rosterBy: v => { UI.rosterBy = v; render(); },
  pickDate: v => { UI.rosterDate = v; render(); },
  goDay: v => { if (dayState(v) !== "duty") return toast(`${dmw(v)} — יום בית`); UI.tab = "roster"; UI.rosterDate = v; saveUI(); render(); window.scrollTo(0, 0); },
  goManage: v => ACT.openMore(v || "people"),
  closeSheet: () => closeSheet(),
  scrim: (v, el, e) => { if (e.target === el) closeSheet(); },
  newLine: () => { const t = todayStr(); put("line/config", { lineStart:t, lineEnd:addDays(t, 30), myPlatoon:1, platoonNames:{ 1:"מחלקה 1", 2:"מחלקה 2", 3:"מחלקה 3" }, blocks:[], events:[], settings:{} }); UI.tab = "more"; UI.more = "line"; },
  // roster
  genDay: v => genDates([v]),
  genDates: v => genDates(v.split(",").filter(Boolean)),
  genBlockAsk: v => { const ds = blockDutyDays(v); openSheet(`<h3>ג׳ינרוט כל הסבב</h3><p>ייווצר שבצ״ק ל-${ds.length} ימים: ${esc(fmtDays(ds))}. שיבוצים שנערכו ידנית נשמרים, כל השאר מתחלף.</p><div class="sheet-acts"><button class="btn primary" data-a="genDates" data-v="${ds.join(",")}">ג׳נרט</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`); },
  copyDay: v => copyText(dayText(v)),
  slot: (v, el) => openSlot(v, Number(el.dataset.si), Number(el.dataset.pi)),
  assign: (v, el) => assign(v, Number(el.dataset.si), Number(el.dataset.pi), el.dataset.pid),
  unlock: (v, el) => { const r = JSON.parse(JSON.stringify(S.rosters[v])); r.slots[Number(el.dataset.si)].lock = false; put("rosters/" + v, r); closeSheet(); toast("הנעילה בוטלה — ג׳ינרוט הבא יחליף"); },
  // insights
  runChk: () => runCheck(),
  setWeekend: (v, el) => { updPerson(el.dataset.pid, p => { const a = (p.absences || []).find(x => x.id === el.dataset.aid); if (a){ a.from = v; a.to = addDays(v, 1); a.status = "fixed"; } }); toast("סופ״ש נקבע"); },
  addAbsQuick: (v, el) => { const [f, t] = v.split("|"); updPerson(el.dataset.pid, p => { (p.absences = p.absences || []).push({ id:uid("a_"), kind:"other", from:f, to:t, status:"fixed", reason:"" }); }); UI.chk = null; toast("היציאה נרשמה"); },
  // daily table, constraints, headcount, export
  calMode: v => { UI.calMode = v; saveUI(); render(); },
  tblAll: v => { UI.tblAll = v === "1"; saveUI(); render(); },
  newConstraint: v => openConstraint(null, v || null),
  cKind: (v, el) => { DRAFT.kind = v; document.querySelectorAll("#sheetHost .kchip").forEach(b => b.setAttribute("aria-pressed", String(b === el))); updConstraintPrev(); },
  saveConstraint: () => saveConstraint(),
  unitCount: (v, el) => openUnitCount(v, el.dataset.pid),
  saveUnitCount: (v, el) => saveUnitCount(v, Number(el.dataset.pid)),
  clearUnitCount: (v, el) => clearUnitCount(v, Number(el.dataset.pid)),
  exportXlsx: () => exportXlsx(),
  // שאל
  askGo: () => askSubmit(),
  askQ: v => askSubmit(v),
  askAi: v => { const it = ASK.items.find(x => x.id === Number(v)); if (it) askSubmit(it.q, true, it.id); },
  askRetry: v => { const it = ASK.items.find(x => x.id === Number(v)); if (it && !ASK.busy && askAiOn()) askAi(it); },
  askStop: () => { if (ASK.ctl) ASK.ctl.abort(); },
  askCopy: v => copyText(askCopyText(ASK.items.find(x => x.id === Number(v)))),
  askClear: () => { if (ASK.ctl) ASK.ctl.abort(); ASK.items = []; ASK.last = null; render(); },
  // calendar
  mxMode: v => { UI.mxMode = v; saveUI(); render(); },
  calMove: v => { const ms = monthsOfLine(), i = ms.indexOf(UI.calMonth) + Number(v); if (i >= 0 && i < ms.length){ UI.calMonth = ms[i]; render(); } },
  openDay: v => ACT.dayGo(v),
  dayAbs: v => { const pid = val("dayP"); if (pid){ closeSheet(); openCell(pid, v); } },
  // פק״לים
  gearSeg: v => { UI.gearSeg = v; saveUI(); render(); },
  goPakal: () => ACT.openMore("pakal"),
  pkPl: v => { UI.pkPl = Number(v); render(); },
  pkCell: (v, el) => { if (!canEdit()) return; updPerson(el.dataset.pid, p => { const t = p.tags || []; p.tags = t.includes(v) ? t.filter(x => x !== v) : t.concat([v]); }); },
  copyPakal: () => copyText(pakalText()),
  editPakal: () => openPakalEdit(),
  pakalAdd: () => { readPakal(); DRAFT.items.push({ id:uid("k_"), name:"", min:0 }); pakalSheet(); const el = document.getElementById("pk" + (DRAFT.items.length - 1)); if (el) el.focus(); },
  pakalDel: (v, el) => { readPakal(); DRAFT.items.splice(Number(el.dataset.i), 1); pakalSheet(); },
  savePakal: () => savePakal(),
  // gear
  gearQuick: v => { UI.gearQuick = v === "1"; render(); },
  gearCell: (v, el) => {
    const pid = el.dataset.pid;
    if (UI.gearQuick && canEdit()){ const e = gearOf(S.soldiers[pid], v) || {}; const nx = { none:"ok", ok:"bad", bad:"none" }[gearState(e)]; setGear(pid, v, nx, e.sn, e.note); }
    else openGear(pid, v);
  },
  saveGear: (v, el) => { let st = checkedVals("gst")[0] || "none"; const sn = val("gSn"), note = val("gNo"); if (st === "none" && sn) st = "ok"; setGear(el.dataset.pid, v, st, sn, note); closeSheet(); toast("עודכן"); },
  gearCol: v => openGearCol(v),
  gearColOk: v => { for (const p of gearPeople()){ const e = gearOf(p, v); if (gearState(e) !== "ok") setGear(p.id, v, "ok", e && e.sn, e && e.note); } closeSheet(); toast("העמודה סומנה כחתומה"); },
  copyGear: () => copyText(gearText()),
  editGearItems: () => openGearItems(),
  gearItemAdd: () => { readGearItems(); DRAFT.items.push({ id:uid("g_"), name:"" }); gearItemsSheet(); const last = document.getElementById("gi" + (DRAFT.items.length - 1)); if (last) last.focus(); },
  gearItemDel: (v, el) => { readGearItems(); DRAFT.items.splice(Number(el.dataset.i), 1); gearItemsSheet(); },
  saveGearItems: () => { readGearItems(); const items = DRAFT.items.filter(i => i.name); if (!items.length) return toast("צריך לפחות פריט אחד"); saveCfg({ gearItems:items }); closeSheet(); toast("רשימת הפריטים נשמרה"); },
  // matrix cell
  cell: (v, el) => openCell(el.dataset.pid, v),
  saveCellAbs: (v, el) => { let f = val("qF"), t = val("qT") || f; if (!f) return; if (t < f){ const x = f; f = t; t = x; } updPerson(el.dataset.pid, p => { (p.absences = p.absences || []).push({ id:uid("a_"), kind:val("qK"), from:f, to:t, status:val("qS"), reason:val("qR") }); }); closeSheet(); toast("היציאה סומנה"); },
  delAbs: (v, el) => { updPerson(el.dataset.pid, p => { p.absences = (p.absences || []).filter(a => a.id !== el.dataset.aid); }); closeSheet(); toast("היציאה בוטלה"); },
  // person
  editPerson: v => openPerson(v),
  addAbsRow: () => { readPerson(); DRAFT.absences.push({ id:uid("a_"), kind:"request", from:null, to:null, status:"request", reason:"" }); personSheet(); },
  delAbsRow: (v, el) => { readPerson(); DRAFT.absences.splice(Number(el.dataset.i), 1); personSheet(); },
  savePerson: () => { readPerson(); if (!DRAFT.name) return toast("חסר שם"); const id = DRAFT.id || uid("s_"); DRAFT.id = id; put("soldiers/" + id, DRAFT); closeSheet(); toast("נשמר"); },
  delPerson: (v, el) => { if (!armDelete(el)) return; const id = DRAFT.id; put("soldiers/" + id, null); for (const r of Object.values(S.rules)) if ((r.a || []).includes(id)){ const n = JSON.parse(JSON.stringify(r)); n.a = n.a.filter(x => x !== id); put("rules/" + r.id, n); } closeSheet(); toast("נמחק"); },
  // task
  editTask: v => openTask(v),
  saveTask: () => { readTask(); if (!DRAFT.name) return toast("חסר שם משימה"); if (!DRAFT.platoons.length) return toast("בחרו מי מאייש"); const id = DRAFT.id || uid("t_"); DRAFT.id = id; if (DRAFT.order == null) DRAFT.order = Object.keys(S.tasks).length; put("tasks/" + id, DRAFT); closeSheet(); toast("המשימה נשמרה"); },
  delTask: (v, el) => { if (!armDelete(el)) return; put("tasks/" + DRAFT.id, null); closeSheet(); toast("המשימה נמחקה"); },
  // rule
  editRule: v => openRule(v),
  saveRule: () => { readRule(); const f = RULE_TYPES[DRAFT.type].f; if (f.includes("a") && DRAFT.a.length < (["together","apart","notBothOut"].includes(DRAFT.type) ? 2 : 1)) return toast(["together","apart","notBothOut"].includes(DRAFT.type) ? "בחרו לפחות שניים" : "בחרו לפחות חייל אחד"); if (f.includes("task") && !DRAFT.task) return toast("בחרו משימה"); const id = DRAFT.id || uid("r_"); DRAFT.id = id; put("rules/" + id, DRAFT); closeSheet(); toast("האילוץ נשמר"); },
  delRule: (v, el) => { if (!armDelete(el)) return; put("rules/" + DRAFT.id, null); closeSheet(); toast("האילוץ נמחק"); },
  // line
  addBlock: () => { const bl = JSON.parse(JSON.stringify(cfg().blocks || [])); const last = bl[bl.length - 1]; const s = last ? addDays(last.end, 1) : cfg().lineStart; bl.push({ id:uid("b_"), start:s, end:addDays(s, 6), home: last ? nextHome(last.home) : groupOf(myPl()) }); saveCfg({ blocks:bl }); },
  delBlock: (v, el) => { const bl = JSON.parse(JSON.stringify(cfg().blocks || [])); bl.splice(Number(el.dataset.i), 1); saveCfg({ blocks:bl }); },
  swapBlocks: () => { const bl = JSON.parse(JSON.stringify(cfg().blocks || [])).map(b => Object.assign(b, { home: nextHome(b.home) })); saveCfg({ blocks:bl }); toast("הוחלף: ימי הבית וה" + TD() + " התהפכו"); },
  saveStruct: () => saveStruct(),
  addUnit: () => addUnit(),
  delUnit: v => delUnit(v),
  saveLine: () => {
    let ls = val("cLS"), le = val("cLE"); if (!ls || !le) return toast("חסרים תאריכי קו"); if (le < ls){ const x = ls; ls = le; le = x; }
    const s = { minRest:Number(val("sMR")) || 0, minCmd:Number(val("sMC")) || 0, nightFrom:Number(val("sNF")) || 0, nightTo:Number(val("sNT")) || 0 };
    saveCfg({ lineStart:ls, lineEnd:le, settings:s }); toast("ההגדרות נשמרו");
  },
  addEvent: () => openSheet(`<h3>אירוע בקו</h3><div class="fgrid"><label class="fld"><span>שם</span><input id="eL" placeholder="ביקור מח״ט, יום בחירות…"></label><label class="fld"><span>תאריך</span><input type="date" id="eD" value="${todayStr()}"></label></div><div class="sheet-acts"><button class="btn primary" data-a="saveEvent">הוספה</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`),
  saveEvent: () => { const l = val("eL"), d = val("eD"); if (!l || !d) return toast("חסר שם או תאריך"); const ev = (cfg().events || []).concat([{ date:d, label:l }]).sort((a,b) => a.date.localeCompare(b.date)); saveCfg({ events:ev }); closeSheet(); },
  delEvent: (v, el) => { const ev = (cfg().events || []).slice(); ev.splice(Number(el.dataset.i), 1); saveCfg({ events:ev }); },
  exportJson: () => { copyText(JSON.stringify(backupObj())); markBackup(); },
  backupFile: () => backupFile(),
  createLine: () => createFromWizard(),
  wzAdd: () => { readWizard(); WZ.units.push({ name:"", rot:0 }); render(); },
  wzDel: (v, el) => { readWizard(); const i = Number(el.dataset.i); WZ.units.splice(i, 1); const pp = {}; Object.keys(WZ.people).forEach(k => { const n = Number(k); if (n < i) pp[n] = WZ.people[k]; else if (n > i) pp[n - 1] = WZ.people[k]; }); WZ.people = pp; if (WZ.mine >= WZ.units.length) WZ.mine = 0; else if (WZ.mine > i) WZ.mine--; render(); },
  importFileGo: () => { const t = DRAFT && DRAFT.importText; closeSheet(); if (t) importData(t); },
  resetAll: () => openSheet(`<h3>מחיקת כל הנתונים</h3><p>כל החיילים, המשימות, השבצ״קים והצל״ם במכשיר הזה יימחקו. אי אפשר לבטל את זה. כדאי לשמור גיבוי לפני.</p><div class="sheet-acts"><button class="btn danger" data-a="resetGo">מחיקה</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`),
  resetGo: (v, el) => { if (!armDelete(el)) return; resetAll(); },
  importAsk: () => openSheet(`<h3>שחזור מגיבוי</h3><p class="small muted">הדביקו טקסט גיבוי. החיילים, המשימות והאילוצים יוחלפו בתוכן הגיבוי.</p><textarea id="imp" class="mono" style="width:100%;min-height:200px;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface2)"></textarea><div class="sheet-acts"><button class="btn primary" data-a="importDo">שחזור</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`),
  importDo: () => { const t = document.getElementById("imp").value; if (importData(t)) closeSheet(); },
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-a]"); if (!el) return;
  const a = el.dataset.a; if (a === "blk" || a === "ruleType") return;
  const fn = ACT[a]; if (!fn) return;
  if (a !== "scrim") e.preventDefault();
  fn(el.dataset.v, el, e);
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset && el.dataset.a === "blk"){
    const i = Number(el.dataset.i), bl = JSON.parse(JSON.stringify(cfg().blocks || []));
    bl[i] = Object.assign({}, bl[i], { start: val("bs" + i) || bl[i].start, end: val("be" + i) || bl[i].end, home: val("bh" + i) || bl[i].home });
    if (bl[i].end < bl[i].start){ const x = bl[i].start; bl[i].start = bl[i].end; bl[i].end = x; }
    bl.sort((a,b) => a.start.localeCompare(b.start)); saveCfg({ blocks:bl });
  }
  if (el.dataset && el.dataset.ch === "ruleType"){ readRule(); DRAFT.type = el.value; ruleSheet(); }
  if (el.dataset && el.dataset.ch === "calWho"){ UI.calWho = el.value; saveUI(); render(); }
  if (el.dataset && el.dataset.ch === "tPrev") updTaskPrev();
  if (el.dataset && el.dataset.ch === "cPrev") updConstraintPrev();
  if (el.dataset && el.dataset.ch === "impFile") onImportFile(el);
  if (el.dataset && el.dataset.ch === "wzRe"){ readWizard(); render(); }
});
document.addEventListener("input", e => { const el = e.target; if (el.dataset && el.dataset.ch === "tPrev") updTaskPrev(); if (el.dataset && el.dataset.ch === "cPrev") updConstraintPrev(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#sheetHost").innerHTML) closeSheet();
  // a label standing in for a hidden file picker opens it from the keyboard too
  const lb = e.target.closest && e.target.closest('label[for]');
  if (lb && (e.key === "Enter" || e.key === " ")){ const f = document.getElementById(lb.getAttribute("for")); if (f && f.type === "file"){ e.preventDefault(); f.click(); } }
});
document.querySelectorAll("#nav button").forEach(b => b.addEventListener("click", () => ACT.tab(b.dataset.tab)));
