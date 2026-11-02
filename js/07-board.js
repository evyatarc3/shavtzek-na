"use strict";
/* ================= view: לוח = daily table / month ================= */
UI.calMode = UI.calMode || "table";
UI.tblAll = UI.tblAll || false;
function vBoard(ctx){
  return `<div class="row" style="margin-bottom:12px"><div class="seg" role="group" aria-label="תצוגה"><button data-a="calMode" data-v="table" aria-pressed="${UI.calMode !== "month"}">טבלה יומית</button><button data-a="calMode" data-v="month" aria-pressed="${UI.calMode === "month"}">חודש</button></div>
    <span style="flex:1"></span>${canEdit() ? `<button class="btn sm" data-a="newConstraint">+ אילוץ</button>` : ""}<button class="btn sm" data-a="exportXlsx">ייצוא לאקסל</button></div>`
    + (UI.calMode === "month" ? vCal(ctx) : vTable(ctx));
}
function vTable(ctx){
  const jp = jointPl(), hasT = tasksList().length > 0, t = todayStr();
  const rows = UI.tblAll ? ctx.days : ctx.days.filter(x => x.state === "duty");
  let anyManual = false;
  let h = `<section><div class="sec-h"><h2>נוכחות לפי יום</h2><span class="aside">לפי היציאות וההגעות שהוזנו</span>
    <div class="end"><div class="seg" role="group" aria-label="ימים"><button data-a="tblAll" data-v="0" aria-pressed="${!UI.tblAll}">רק ${TD()}</button><button data-a="tblAll" data-v="1" aria-pressed="${UI.tblAll}">כל הקו</button></div></div></div>
    <div class="tbl-wrap"><table class="dtab"><thead><tr><th>יום</th>${jp.map(pl => `<th class="n" title="${esc(plName(pl))}">${esc(shortName(pl))}</th>`).join("")}<th class="n">סה״כ</th>${hasT ? `<th class="n">נדרשים</th><th class="n">פער</th>` : ""}</tr></thead><tbody>`;
  for (const x of rows){
    const cls = (x.d === t ? "today " : "") + (x.state === "home" ? "homerow" : "");
    h += `<tr class="${cls}"><td><button class="dlink" data-a="dayGo" data-v="${x.d}"><b>${WD[dow(x.d)]}</b> <span class="num">${dm(x.d)}</span>${eventOn(x.d) ? ` <span class="evdot" title="${esc(eventOn(x.d).label)}">•</span>` : ""}</button></td>`;
    if (x.state !== "duty"){ h += `<td colspan="${jp.length + 1 + (hasT ? 2 : 0)}" class="muted">בית</td></tr>`; continue; }
    for (const pl of jp){ const u = x.byPl[pl]; if (u.manual) anyManual = true;
      h += `<td class="n"><button class="ucell${u.manual ? " man" : ""}" data-a="unitCount" data-v="${x.d}" data-pid="${pl}" aria-label="${esc(plName(pl))} ${dm(x.d)}">${u.n}${u.manual ? "*" : ""}</button></td>`; }
    h += `<td class="n"><b>${x.sup}</b></td>`;
    if (hasT) h += `<td class="n">${x.need}</td><td class="n gap ${x.slack >= 0 ? "ok" : "bad"}">${x.slack > 0 ? "+" : ""}${x.slack}</td>`;
    h += `</tr>`;
  }
  h += `</tbody></table></div>
    <p class="small muted">לחיצה על תאריך פותחת את היום. לחיצה על מספר של ${esc(TU())} מאפשרת להזין כמה באמת בפנים, למשל כשאין רשימת שמות מלאה.${anyManual ? " * = מספר שהוזן ידנית." : ""}</p></section>`;
  return h;
}

/* ================= quick constraint entry ================= */
const CKIND = [
  ["leave","יציאה"], ["request","בקשת יציאה"], ["flight","טיסה"], ["weekend","סופ״ש"], ["late","מגיע מאוחר"], ["early","עוזב מוקדם"],
];
function openConstraint(pid, d){
  const ppl = people().filter(p => jointPl().includes(p.platoon) || p.platoon === myPl());
  const groups = {}; ppl.forEach(p => (groups[p.platoon] = groups[p.platoon] || []).push(p));
  const day = d || UI.day || todayStr();
  DRAFT = { kind: "leave" };
  openSheet(`<h3>אילוץ חדש</h3><div class="stack">
    <label class="fld"><span>מי</span><select id="cP" data-ch="cPrev" class="sel">${Object.keys(groups).sort().map(pl => `<optgroup label="${esc(plName(pl))}">${groups[pl].map(p => `<option value="${p.id}"${p.id === pid ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>
    <div class="fld"><span>מה</span><div class="kchips">${CKIND.map(([k, l]) => `<button class="kchip" data-a="cKind" data-v="${k}" aria-pressed="${k === "leave"}">${l}</button>`).join("")}</div></div>
    <div class="fgrid" id="cDates">
      <label class="fld"><span id="cFl">מתאריך</span><input type="date" id="cF" value="${day}" data-ch="cPrev"></label>
      <label class="fld" id="cTw"><span>עד תאריך</span><input type="date" id="cT" value="${day}" data-ch="cPrev"></label>
    </div>
    <label class="fld"><span>סיבה (לא חובה)</span><input id="cR"></label>
    <div id="cPrevBox" class="panel tprev"></div>
  </div><div class="sheet-acts"><button class="btn primary" data-a="saveConstraint">שמירה</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
  updConstraintPrev();
}
function constraintDays(){
  const k = DRAFT.kind, f = val("cF"), t = val("cT") || f, c = cfg();
  if (!f) return [];
  if (k === "late") return range(c.lineStart, addDays(f, -1));
  if (k === "early") return range(addDays(f, 1), c.lineEnd);
  return f <= t ? range(f, t) : range(t, f);
}
function updConstraintPrev(){
  const box = document.getElementById("cPrevBox"); if (!box || !DRAFT) return;
  const k = DRAFT.kind, single = k === "late" || k === "early";
  const tw = document.getElementById("cTw"); if (tw) tw.hidden = single;
  const fl = document.getElementById("cFl"); if (fl) fl.textContent = k === "late" ? "מגיע בתאריך" : k === "early" ? "יום אחרון בפנים" : "מתאריך";
  const p = S.soldiers[val("cP")]; if (!p){ box.innerHTML = ""; return; }
  const dd = constraintDays().filter(d => CTX.map[d] && CTX.map[d].state === "duty" && present(p, d));
  if (!dd.length){ box.innerHTML = `<div class="small">לא משנה את הנוכחות: ${esc(p.name)} ממילא לא בפנים בימים האלה.</div>`; return; }
  const hasT = tasksList().length > 0;
  const worst = dd.reduce((a, d) => CTX.map[d].slack < CTX.map[a].slack ? d : a, dd[0]);
  const after = CTX.map[worst].slack - 1;
  box.innerHTML = `<div class="tp-need"><b class="num">${dd.length}</b><span>ימי ${esc(TD())} שבהם ${esc(p.name)} יחסר</span></div>
    <div class="small">${esc(fmtDays(dd))}</div>
    ${hasT ? `<div class="small" style="color:var(--${after >= 0 ? "ok" : "crit"});font-weight:600">${after >= 0 ? `ביום העמוס (${dm(worst)}) עדיין תישאר רזרבה של ${after}` : `ב-${dm(worst)} יחסרו ${-after} חיילים`}</div>` : ""}`;
}
function saveConstraint(){
  const pid = val("cP"), k = DRAFT.kind, f0 = val("cF"); let f = f0, t = val("cT") || f;
  if (!pid || !f) return toast("בחרו חייל ותאריך");
  if (t < f){ const x = f; f = t; t = x; }
  const reason = val("cR");
  updPerson(pid, p => {
    if (k === "late") p.from = f0;
    else if (k === "early") p.to = f0;
    else {
      const map = { leave:["other","fixed"], request:["request","request"], flight:["flight","fixed"], weekend:["weekend","fixed"] }[k];
      (p.absences = p.absences || []).push({ id:uid("a_"), kind:map[0], from:f, to:t, status:map[1], reason });
    }
    if (reason && (k === "late" || k === "early")) p.note = reason;
  });
  closeSheet(); toast("האילוץ נשמר");
}

/* ================= manual headcount for a unit ================= */
function openUnitCount(d, pl){
  pl = Number(pl); const m = unitManual(pl) || {}, named = unitNamed(pl, d), cur = unitCount(pl, d);
  const hasBase = m.base != null && m.base !== "", hasDay = m.days && m.days[d] != null;
  openSheet(`<h3>${esc(plName(pl))} · ${dmw(d)}</h3>
  <p class="small muted" style="margin-top:-6px">לפי השמות שהוזנו: ${named} בפנים.${hasBase ? ` מוגדר מספר קבוע: ${m.base}.` : ""}</p>
  <div class="stack">
    <label class="fld"><span>כמה בפנים בפועל</span><input type="number" inputmode="numeric" min="0" max="300" id="ucN" value="${cur}"></label>
    <div class="checks"><label><input type="checkbox" id="ucAll"${hasBase && !hasDay ? " checked" : ""}>אותו מספר לכל הימים שה${esc(TU())} בפנים</label></div>
  </div>
  <div class="sheet-acts">${canEdit() ? `<button class="btn primary" data-a="saveUnitCount" data-v="${d}" data-pid="${pl}">שמירה</button>${hasDay || hasBase ? `<button class="btn" data-a="clearUnitCount" data-v="${d}" data-pid="${pl}">${hasDay ? "ביטול ליום הזה" : "חזרה לספירה לפי שמות"}</button>` : ""}` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`);
}
function saveUnitCount(d, pl){
  const n = Math.max(0, Number(val("ucN")) || 0), all = chk("ucAll");
  const uc = JSON.parse(JSON.stringify((cfg().unitCounts) || {})); const m = uc[pl] || { base:null, days:{} }; m.days = m.days || {};
  if (all){ m.base = n; delete m.days[d]; } else m.days[d] = n;
  uc[pl] = m; saveCfg({ unitCounts: uc }); closeSheet(); toast("נשמר");
}
function clearUnitCount(d, pl){
  const uc = JSON.parse(JSON.stringify((cfg().unitCounts) || {})); const m = uc[pl]; if (!m) return closeSheet();
  if (m.days && m.days[d] != null) delete m.days[d]; else m.base = null;
  if ((m.base == null || m.base === "") && !Object.keys(m.days || {}).length) delete uc[pl]; else uc[pl] = m;
  saveCfg({ unitCounts: uc }); closeSheet(); toast("חזרה לספירה לפי שמות");
}

/* ================= Excel export: presence forecast only ================= */
const XLSX_SRC = "vendor/xlsx.bundle.js";
function loadXLSX(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = XLSX_SRC; s.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error("no XLSX")); s.onerror = rej; document.head.appendChild(s); });
}
function buildPresenceWorkbook(X){
  const ctx = CTX, jp = jointPl(), days = ctx.days, ppl = people().filter(p => jp.includes(p.platoon));
  const C = { head:"3E5A27", headTx:"FFFFFF", home:"DFE7FA", in:"DDF0E2", abs:"F7DCD9", req:"F8EBD2", grey:"EEF0EA", tot:"E2E9D6" };
  const st = (fill, o = {}) => Object.assign({ alignment:{ horizontal:"center", vertical:"center", readingOrder:2 }, border:{ top:{style:"thin",color:{rgb:"D6DACF"}}, bottom:{style:"thin",color:{rgb:"D6DACF"}}, left:{style:"thin",color:{rgb:"D6DACF"}}, right:{style:"thin",color:{rgb:"D6DACF"}} } }, fill ? { fill:{ fgColor:{ rgb:fill } } } : {}, o);
  const H = v => ({ v, t:"s", s: st(C.head, { font:{ bold:true, color:{ rgb:C.headTx } } }) });
  const cell = (v, fill, bold) => ({ v, t: typeof v === "number" ? "n" : "s", s: st(fill, bold ? { font:{ bold:true } } : {}) });
  // sheet 1: one row per day
  const s1 = [[H("תאריך"), H("יום"), H("מצב"), ...jp.map(pl => H(plName(pl))), H("סה״כ"), H("בחוץ")]];
  for (const x of days){
    const home = x.state !== "duty", fill = home ? C.home : null;
    const out = home ? "" : x.absent.map(p => { const a = absOn(p, x.d); return p.name + (a ? ` (${KIND[a.kind] || "יציאה"})` : ""); }).join(", ");
    s1.push([cell(dm(x.d), fill, true), cell(WDL[dow(x.d)], fill), cell(home ? "בית" : TD(), fill),
      ...jp.map(pl => home ? cell("", fill) : cell(x.byPl[pl].n, x.byPl[pl].manual ? C.req : fill)),
      cell(home ? "" : x.sup, home ? fill : C.tot, true), Object.assign(cell(out, fill), { s: st(fill, { alignment:{ horizontal:"right", wrapText:true, readingOrder:2 } }) })]);
  }
  const anyMan = days.some(x => x.state === "duty" && jp.some(pl => x.byPl[pl].manual));
  s1.push([]);
  s1.push([Object.assign(cell(`תחזית לפי היציאות וההגעות שהוזנו עד ${dm(todayStr())}.${anyMan ? " רקע כתום = מספר שהוזן ידנית." : ""}`, null), { s: st(null, { alignment:{ horizontal:"right", readingOrder:2 }, font:{ italic:true, color:{ rgb:"5D6659" } } }) })]);
  // sheet 2: every person × every day
  const s2 = [[H("שם"), H(TU()), H("תפקיד"), ...days.map(x => H(`${WD[dow(x.d)]} ${dm(x.d)}`))]];
  const rn = roleNames();
  for (const p of ppl){
    const row = [cell(p.name, null, true), cell(shortName(p.platoon)), cell(rn[p.role] || "")];
    for (const x of days){
      const s = personStatus(p, x.d), a = (s === "abs" || s === "req") ? absOn(p, x.d) : null;
      const map = { in:["✓", C.in], home:["בית", C.home], abs:[a ? (KIND[a.kind] || "יציאה") : "יציאה", C.abs], req:["בקשה", C.req], tent:["?", C.grey], out:["—", C.grey] };
      const [v, f] = map[s] || ["", null]; row.push(cell(v, f));
    }
    s2.push(row);
  }
  s2.push([]);
  for (const pl of jp) s2.push([cell("נוכחים · " + plName(pl), C.tot, true), cell(""), cell(""), ...days.map(x => cell(x.state === "duty" ? x.byPl[pl].n : "", x.state === "duty" ? (x.byPl[pl].manual ? C.req : C.tot) : C.home, true))]);
  s2.push([cell("סה״כ נוכחים", C.tot, true), cell(""), cell(""), ...days.map(x => cell(x.state === "duty" ? x.sup : "", x.state === "duty" ? C.tot : C.home, true))]);
  const ws1 = X.utils.aoa_to_sheet(s1), ws2 = X.utils.aoa_to_sheet(s2);
  ws1["!cols"] = [{ wch:8 }, { wch:8 }, { wch:9 }, ...jp.map(() => ({ wch:18 })), { wch:7 }, { wch:60 }];
  ws2["!cols"] = [{ wch:16 }, { wch:8 }, { wch:13 }, ...days.map(() => ({ wch:8 }))];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws1, "סיכום יומי");
  X.utils.book_append_sheet(wb, ws2, "נוכחות מלאה");
  wb.Workbook = { Views: [{ RTL: true }] };
  return wb;
}
async function exportXlsx(){
  let X; try { X = await loadXLSX(); } catch(e){ return toast("לא הצלחתי לטעון את רכיב האקסל"); }
  const wb = buildPresenceWorkbook(X), c = cfg();
  const name = `נוכחות ${plName(myPl())} ${c.lineStart}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
  try {
    const r = await saveFile(name, new Blob([X.write(wb, { bookType:"xlsx", type:"array" })], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), null, `shabtzak-presence-${c.lineStart}.xlsx`);
    if (r !== "cancel") toast(r === "shared" ? "הקובץ מוכן" : "הקובץ ירד למכשיר");
  } catch(e){ toast("השמירה לא הצליחה"); }
}
