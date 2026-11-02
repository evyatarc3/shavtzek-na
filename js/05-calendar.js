"use strict";
/* ================= view: calendar ================= */
UI.mxMode = UI.mxMode || "cal";
UI.calWho = UI.calWho || "";
const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
function vPresence(ctx){
  return `<div class="seg" role="group" aria-label="תצוגה" style="margin-bottom:12px"><button data-a="mxMode" data-v="cal" aria-pressed="${UI.mxMode !== "table"}">לוח שנה</button><button data-a="mxMode" data-v="table" aria-pressed="${UI.mxMode === "table"}">טבלת נוכחות</button></div>`
    + (UI.mxMode === "table" ? vMatrix(ctx) : vCal(ctx));
}
function monthsOfLine(){
  const c = cfg(), out = []; let y = +c.lineStart.slice(0,4), m = +c.lineStart.slice(5,7); const ey = +c.lineEnd.slice(0,4), em = +c.lineEnd.slice(5,7);
  while (y < ey || (y === ey && m <= em)){ out.push(`${y}-${String(m).padStart(2,"0")}`); m++; if (m > 12){ m = 1; y++; } }
  return out;
}
function vCal(ctx){
  const months = monthsOfLine(); let mo = UI.calMonth;
  if (!months.includes(mo)){ const t = todayStr().slice(0,7); mo = months.includes(t) ? t : months[0]; UI.calMonth = mo; }
  const i = months.indexOf(mo), y = +mo.slice(0,4), m = +mo.slice(5,7);
  const first = mo + "-01", last = addDays(fd(new Date(Date.UTC(y, m, 1))), -1);
  const days = range(addDays(first, -dow(first)), addDays(last, 6 - dow(last)));
  const who = UI.calWho && S.soldiers[UI.calWho] ? S.soldiers[UI.calWho] : null;
  const hasT = tasksList().length > 0, t = todayStr();
  let h = `<section><div class="cal-nav">
    <button class="btn sm" data-a="calMove" data-v="-1" aria-label="חודש קודם"${i <= 0 ? " disabled" : ""}>›</button>
    <h2>${HEB_MONTHS[m - 1]} ${y}</h2>
    <button class="btn sm" data-a="calMove" data-v="1" aria-label="חודש הבא"${i >= months.length - 1 ? " disabled" : ""}>‹</button>
    <select id="calWho" data-ch="calWho" aria-label="הצגה לפי"><option value="">כל ${JL()}</option>${people().map(p => `<option value="${p.id}"${who && who.id === p.id ? " selected" : ""}>${esc(p.name)} · ${esc(shortName(p.platoon))}</option>`).join("")}</select>
  </div><div class="cal">${WDL.map(w => `<div class="wh">${w}</div>`).join("")}`;
  for (const d of days){
    const inMo = d.slice(0,7) === mo, x = ctx.map[d], ev = eventOn(d);
    const st = who ? (inLine(d) ? dayState(d, who.platoon) : "out") : (x ? x.state : "out");
    let lines = "";
    if (who && inLine(d)){
      const s = personStatus(who, d), a = absOn(who, d);
      const lbl = { in:"בפנים", home:"בית", abs: a ? (KIND[a.kind] || "יציאה") : "יציאה", req:"בקשה", tent:"לא ודאי", out:"לא בקו" }[s];
      lines += `<span class="ln ${s === "abs" ? "bad" : s === "req" ? "warn" : s === "in" ? "st" : ""}">${lbl}</span>`;
    } else if (x && x.state === "duty"){
      const bb = dayBadge(x);
      lines += `<span class="ln big ${bb.cls}">${bb.big}</span>`;
      if (bb.small) lines += `<span class="ln">${bb.small}</span>`;
      const ps = pakalAlerts(x); if (ps.length) lines += `<span class="ln warn">⚠ ${esc(ps[0].name)}</span>`;
    } else if (x && x.state === "home") lines += `<span class="ln">בית</span>`;
    if (ev) lines += `<span class="ln ev">${esc(ev.label)}</span>`;
    h += `<button class="cday ${st === "duty" ? "duty" : st === "home" ? "home" : ""}${inMo ? "" : " dim"}${d === t ? " today" : ""}" data-a="openDay" data-v="${d}" aria-label="${dmw(d)}"><span class="dn">${pd(d).getUTCDate()}</span>${lines}</button>`;
  }
  h += `</div><div class="strip-legend"><span><i class="sw" style="background:var(--duty-soft);border:1px solid var(--duty)"></i>${TD()}${who ? "" : " " + JL()}</span><span><i class="sw" style="background:var(--home-soft);border:1px solid var(--home)"></i>בית</span>${who ? "" : `<span><b dir="ltr" style="color:var(--ok)">+2</b> = אפשר לשחרר 2</span><span><b dir="ltr" style="color:var(--crit)">-3</b> = חסרים 3</span><span><b dir="ltr" class="num">26/30</b> = נוכחים/נדרשים</span>`}</div></section>`;
  return h;
}
function openDay(d){
  const x = CTX && CTX.map[d], st = x ? x.state : "out", hasT = tasksList().length > 0;
  let h = `<h3>${WDL[dow(d)]} ${dm(d)}</h3><p class="small muted" style="margin:-6px 0 12px">${st === "duty" ? TD() + " " + JL() : st === "home" ? JL() + " בבית" : "מחוץ לקו"}${eventOn(d) ? " · " + esc(eventOn(d).label) : ""}</p>`;
  if (x && st === "duty"){
    h += `<div class="stats" style="margin-bottom:12px">
      <div class="stat"><div class="v">${x.sup}${hasT ? `<small> / ${x.need}</small>` : ""}</div><div class="l">נוכחים ${JL()}</div></div>
      ${hasT ? `<div class="stat"><div class="v" style="color:var(--${x.slack > 0 ? "ok" : x.slack === 0 ? "warn" : "crit"})">${x.slack > 0 ? "+" : ""}${x.slack}</div><div class="l">רזרבה</div></div>` : ""}
      <div class="stat"><div class="v">${x.p1}</div><div class="l">${esc(plName(myPl()))}</div></div>
      <div class="stat"><div class="v">${x.p1Cmd}</div><div class="l">מפקדים</div></div></div>`;
    const pk = pakalim().map(k => ({ k, n: x.tagSup[k.name] || 0 })).filter(o => o.n > 0 || (o.k.min || 0) > 0);
    if (pk.length) h += `<div class="eyebrow" style="margin-bottom:6px">פק״לים בפנים</div><div class="chips" style="margin-bottom:12px">${pk.map(o => `<span class="pill ${o.n < (o.k.min || 0) ? "crit" : "ok"}">${esc(o.k.name)} <span class="num">${o.n}</span></span>`).join("")}</div>`;
    h += `<div class="eyebrow" style="margin-bottom:6px">בחוץ · ${x.absent.length}</div>${x.absent.length ? `<div class="chips" style="margin-bottom:12px">${x.absent.map(p => { const a = absOn(p, d); return `<span class="pill ${a && a.status === "request" ? "warn" : "crit"}">${esc(p.name)} · ${esc(KIND[a && a.kind] || "")}</span>`; }).join("")}</div>` : `<p class="small muted" style="margin:0 0 12px">אף אחד</p>`}`;
    const mine = people().filter(p => p.platoon === myPl() && present(p, d));
    h += `<div class="eyebrow" style="margin-bottom:6px">${esc(plName(myPl()))} בפנים · ${mine.length}</div><div class="chips" style="margin-bottom:12px">${mine.map(p => `<span class="pill">${esc(p.name)}</span>`).join("")}</div>`;
    const r = S.rosters[d];
    h += `<p class="small" style="margin:0 0 4px">${r ? (rosterGaps(r) ? `<span class="pill crit">שבצ״ק עם ${rosterGaps(r)} משבצות ריקות</span>` : `<span class="pill ok">יש שבצ״ק מלא</span>`) : `<span class="pill">אין עדיין שבצ״ק</span>`}</p>`;
    if (canEdit()){
      const cands = people().filter(p => jointPl().includes(p.platoon) && present(p, d));
      h += `<div class="row" style="margin-top:12px"><select id="dayP" aria-label="חייל" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface2);min-height:40px">${cands.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><button class="btn" data-a="dayAbs" data-v="${d}">סימון יציאה</button></div>`;
    }
  }
  h += `<div class="sheet-acts">${x && st === "duty" ? `<button class="btn primary" data-a="goDay" data-v="${d}">לשבצ״ק של היום</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`;
  openSheet(h);
}
