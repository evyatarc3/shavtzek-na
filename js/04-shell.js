"use strict";
/* ================= UI shell ================= */
const UI = { tab:"today", rosterDate:null, seg:"people", dutyOnly:false, insCat:"all" };
const UI_KEY = APP_MODE === "local" ? LS_KEY + "-ui" : "platoon1-ui";
try { const t = localStorage.getItem(UI_KEY); if (t) Object.assign(UI, JSON.parse(t)); } catch(e){}
(function(){
  const h = (location.hash || "").slice(1); if (["today","ask","matrix","roster","more"].includes(h)) UI.tab = h;
  // earlier versions had more tabs; fold them into "עוד"
  const legacy = { gear: () => UI.gearSeg === "pk" ? "pakal" : "gear", insights: () => "insights", manage: () => UI.seg || "people" };
  if (legacy[UI.tab]){ UI.more = legacy[UI.tab](); UI.tab = "more"; }
})();
function saveUI(){ try { localStorage.setItem(UI_KEY, JSON.stringify({ tab:UI.tab, more:UI.more, calMode:UI.calMode, tblAll:UI.tblAll, seg:UI.seg, dutyOnly:UI.dutyOnly, mxMode:UI.mxMode, gearSeg:UI.gearSeg, calWho:UI.calWho })); } catch(e){} }
let CTX = null;
const canEdit = () => !S.readOnly;

function render(){
  const main = $("#main");
  document.querySelectorAll("#nav button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === UI.tab ? "page" : "false"));
  const rb = $("#roBanner");
  rb.hidden = false;
  const pb = pwaBanner();
  if (PWA.update) rb.innerHTML = pb;
  else if (cfg() && backupDue()) rb.innerHTML = `${esc(lastBackupText())} הנתונים שמורים רק במכשיר הזה. <button class="btn sm" style="margin-inline-start:6px" data-a="backupFile">גיבוי עכשיו</button>`;
  else if (pb) rb.innerHTML = pb;
  else rb.hidden = true;
  // until a line exists every tab would show the setup screen, so the tab bar waits for it
  $("#nav").hidden = !isLoaded() || !cfg();
  if (!isLoaded()){ main.innerHTML = `<div class="empty-state"><b>טוען את נתוני הקו…</b>רגע אחד</div>`; return; }
  if (!cfg() && APP_MODE === "local"){ $("#sub").textContent = "הקמת קו חדש"; $("#brandName").textContent = APP_NAME; $("#stateChip").hidden = true; main.innerHTML = vSetup(); return; }
  $("#stateChip").hidden = false;
  if (!cfg()){
    $("#sub").textContent = "אין עדיין לוח";
    main.innerHTML = `<div class="empty-state"><b>עוד לא הוגדר קו</b>כאן יופיעו סבבי הבית והתעסוקה, החיילים והמשימות.<div class="row" style="justify-content:center;margin-top:12px">${canEdit()?`<button class="btn primary" data-a="newLine">יצירת קו חדש</button>`:""}</div></div>`;
    return;
  }
  const ae = document.activeElement, keepFocus = ae && ae.id === "askIn" ? [ae.selectionStart, ae.selectionEnd] : null;
  const keep = {}; ["mxw","dts","gxw"].forEach(id => { const el = document.getElementById(id); if (el) keep[id] = [el.scrollLeft, el.scrollTop]; });
  CTX = buildCtx();
  renderHeader(CTX);
  const views = { today:vDay, ask:vAsk, matrix:vBoard, roster:vRoster, more:vMore };
  main.innerHTML = (views[UI.tab] || vDay)(CTX);
  if (keepFocus){ const el = document.getElementById("askIn"); if (el){ el.focus({ preventScroll:true }); try { el.setSelectionRange(keepFocus[0], keepFocus[1]); } catch(e){} } }
  for (const id in keep){ const el = document.getElementById(id); if (el){ el.scrollLeft = keep[id][0]; el.scrollTop = keep[id][1]; } }
  if (UI.tab === "roster" && !keep.dts){ const a = document.querySelector('#dts [aria-pressed="true"]'); if (a) a.scrollIntoView({ inline:"center", block:"nearest" }); }
}
function nextSwitch(d, pl = myPl()){
  const st = dayState(d, pl); let x = d;
  for (let i = 0; i < 120; i++){ x = addDays(x, 1); if (dayState(x, pl) !== st) return { date:x, state:dayState(x, pl) }; }
  return null;
}
function renderHeader(ctx){
  const c = cfg(), t = todayStr(), total = diffDays(c.lineStart, c.lineEnd) + 1, n = diffDays(c.lineStart, t) + 1;
  const standalone = APP_MODE === "local";
  $("#brandName").textContent = standalone ? APP_NAME : "שבצ״ק " + plName(myPl());
  document.title = standalone ? APP_NAME : "שבצ״ק " + plName(myPl());
  $("#sub").textContent = (standalone ? plName(myPl()) + " · " : "") + `קו ${dm(c.lineStart)}–${dm(c.lineEnd)}` + (n >= 1 && n <= total ? ` · יום ${n} מתוך ${total}` : "");
  const st = dayState(t), ns = nextSwitch(t), chip = $("#stateChip");
  chip.className = "state-chip " + (st === "duty" ? "duty" : st === "home" ? "home" : "none");
  const lastDay = ns ? addDays(ns.date, -1) : null;
  chip.innerHTML = `<span class="dot"></span><span>${st === "duty" ? `ב${TD()} עד ${dm(lastDay || c.lineEnd)}` : st === "home" ? `בבית עד ${dm(lastDay)}` : t < c.lineStart ? `הקו נפתח ב-${dm(c.lineStart)}` : "הקו הסתיים"}</span>`;
}

/* ================= view: today ================= */
function focusDay(ctx){ const t = todayStr(); if (ctx.map[t] && ctx.map[t].state === "duty") return t; const n = ctx.days.find(x => x.d > t && x.state === "duty"); return n ? n.d : (ctx.days.filter(x=>x.state==="duty").slice(-1)[0] || {}).d; }
function insCard(i){
  const icon = { crit:"!", warn:"!", ok:"✓", info:"i" }[i.sev];
  const acts = (i.acts || []).filter(a => canEdit() || a.a === "goManage").map(a => `<button class="btn sm" data-a="${a.a}" data-v="${esc(a.v || "")}" data-pid="${esc(a.pid || "")}" data-aid="${esc(a.aid || "")}">${esc(a.l)}</button>`).join("");
  return `<div class="ins"><div class="sev ${i.sev}" aria-hidden="true">${icon}</div><div class="body"><div class="t">${esc(i.t)}</div>${i.d ? `<div class="d">${esc(i.d)}</div>` : ""}${acts ? `<div class="acts">${acts}</div>` : ""}</div></div>`;
}
/* ================= view: presence matrix ================= */
const CELL_TXT = { flight:"ט", request:"ב", weekend:"ס", release:"ש", other:"ה" };
function vMatrix(ctx){
  const t = todayStr(), days = UI.dutyOnly ? ctx.days.filter(x => x.state === "duty") : ctx.days;
  const groups = {}; ctx.all.forEach(p => (groups[p.platoon] = groups[p.platoon] || []).push(p));
  const hasT = tasksList().length > 0;
  let h = `<section><div class="sec-h"><h2>מי בפנים ומתי</h2><span class="aside">לחיצה על משבצת מסמנת יציאה</span>
  <div class="end"><div class="seg" role="group" aria-label="תצוגה"><button data-a="dutyOnly" data-v="0" aria-pressed="${!UI.dutyOnly}">כל הקו</button><button data-a="dutyOnly" data-v="1" aria-pressed="${UI.dutyOnly}">רק ${TD()}</button></div></div></div>
  <div class="strip-legend" style="margin:0 0 8px"><span><i class="sw" style="background:var(--duty)"></i>בפנים</span><span><i class="sw" style="background:var(--home-soft)"></i>בית</span><span><i class="sw" style="background:var(--crit-soft)"></i>יציאה מאושרת</span><span><i class="sw" style="background:var(--warn-soft)"></i>בקשה</span><span><i class="sw" style="background:var(--surface2);border:1px solid var(--line)"></i>לא בקו</span><span>ט טיסה · ב בקשה · ס סופ״ש · ש שחרור · ? לא ודאי</span></div>
  <div class="mx-wrap" id="mxw"><table class="mx"><thead><tr><th class="nm">שם</th>${days.map(x => `<th class="hd ${x.state === "duty" ? "" : "home"}${x.d === t ? " today" : ""}" title="${dmw(x.d)}${eventOn(x.d) ? " · " + esc(eventOn(x.d).label) : ""}">${x.state === "duty" ? `<span class="w">${WD[dow(x.d)]}</span>${pd(x.d).getUTCDate()}` : ""}</th>`).join("")}</tr></thead><tbody>`;
  for (const pl of Object.keys(groups).map(Number).sort()){
    h += `<tr class="grp"><td colspan="${days.length + 1}"><span class="gl">${esc(plName(pl))} · ${groups[pl].length}</span></td></tr>`;
    for (const p of groups[pl]){
      h += `<tr><th class="nm" scope="row" title="${esc(p.name)}"><button class="cell" style="text-align:start;height:auto;font-weight:600;font-size:13px" data-a="editPerson" data-v="${p.id}">${esc(p.name)}${isCmd(p) ? ` <span class="pill cmd" style="padding:0 5px">מ׳</span>` : isCmdP(p) ? ` <span class="pill" style="padding:0 5px">פוט׳</span>` : ""}</button></th>`;
      for (const x of days){
        const s = personStatus(p, x.d), a = (s === "abs" || s === "req") ? absOn(p, x.d) : null;
        const cls = s === "in" ? "in" : s === "home" ? "home" : s === "abs" ? "abs" : s === "req" ? "req" : s === "tent" ? "tent in" : "out";
        const txt = a ? (CELL_TXT[a.kind] || "ה") : s === "tent" ? "?" : "";
        h += `<td class="${cls}${x.state === "duty" ? "" : " home"}"><button class="cell" data-a="cell" data-pid="${p.id}" data-v="${x.d}" aria-label="${esc(p.name)} ${dmw(x.d)}">${txt}</button></td>`;
      }
      h += `</tr>`;
    }
    h += `<tr class="tot"><td class="nm">נוכחים</td>${days.map(x => x.state === "duty" ? `<td>${groups[pl].filter(p => present(p, x.d)).length}</td>` : `<td class="home"></td>`).join("")}</tr>`;
  }
  if (hasT) h += `<tr class="tot"><td class="nm">${JL()} מול דרישה</td>${days.map(x => x.state === "duty" ? `<td class="${x.slack < 0 ? "bad" : ""}">${x.slack >= 0 ? "+" : ""}${x.slack}</td>` : `<td class="home"></td>`).join("")}</tr>`;
  h += `</tbody></table></div></section>`;
  if (!ctx.all.length) h += `<div class="empty-state"><b>אין עדיין חיילים</b>הוסיפו חיילים בלשונית ניהול.</div>`;
  return h;
}
