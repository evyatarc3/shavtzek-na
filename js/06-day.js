"use strict";
/* ================= view: the day (home) ================= */
/* status of one day as the calendar, week strip and day view all show it */
function dayBadge(x){
  if (!x) return { cls:"out", big:"", small:"" };
  if (x.state === "home") return { cls:"home", big:"בית", small:"" };
  if (!tasksList().length) return { cls:"duty", big:String(x.sup), small:"נוכחים" };
  return x.slack >= 0 ? { cls:"ok", big:"+" + x.slack, small:`${x.sup}/${x.need}` } : { cls:"bad", big:String(x.slack), small:`${x.sup}/${x.need}` };
}
/* פק״ל shortage worth flagging: a minimum is set and someone holds it, but not enough are in */
function pakalAlerts(x){ return pakalShort(x).filter(k => pakalHolders(k.name).some(p => jointPl().includes(p.platoon))); }
function vDay(ctx){
  const t = todayStr(), c = cfg();
  if (!UI.day || !inLine(UI.day)) UI.day = inLine(t) ? t : (focusDay(ctx) || c.lineStart);
  const d = UI.day, x = ctx.map[d], b = dayBadge(x), hasT = tasksList().length > 0;
  const prevOk = d > c.lineStart, nextOk = d < c.lineEnd;
  let h = `<section class="daynav">
    <button class="btn sm" data-a="dayMove" data-v="-1" aria-label="יום קודם"${prevOk ? "" : " disabled"}>›</button>
    <div class="daylbl"><b>${WDL[dow(d)]} ${dm(d)}</b><span>${d === t ? "היום" : eventOn(d) ? esc(eventOn(d).label) : ""}</span></div>
    <button class="btn sm" data-a="dayMove" data-v="1" aria-label="יום הבא"${nextOk ? "" : " disabled"}>‹</button>
    ${d !== t && inLine(t) ? `<button class="btn ghost sm" data-a="dayGo" data-v="${t}">להיום</button>` : ""}
  </section>`;
  // the answer
  if (x.state === "home"){
    const ns = nextSwitch(d);
    h += `<section class="verdict home"><div class="vt">יום בית</div><div class="vs">${esc(JL())} בבית${ns ? ` · חוזרים ל${TD()} ב-${dmw(ns.date)}` : ""}</div></section>`;
  } else if (!hasT){
    h += `<section class="verdict duty"><div class="vt">${x.sup} נוכחים</div><div class="vs">כדי לדעת אם חסרים, הגדירו משימות: כמה חיילים וכמה שעות.</div>${canEdit() ? `<button class="btn primary" data-a="editTask">הוספת משימה</button>` : ""}</section>`;
  } else {
    h += `<section class="verdict ${b.cls}">
      <div class="vt">${x.slack >= 0 ? "יש מספיק חיילים" : `חסרים ${-x.slack} חיילים`}</div>
      ${jointPl().length > 1 ? `<div class="ubreak">${jointPl().map(pl => { const u = x.byPl[pl]; return `<button class="chip" data-a="unitCount" data-v="${d}" data-pid="${pl}">${esc(plName(pl))}: <b class="num">${u.n}</b>${u.manual ? " ✎" : ""}</button>`; }).join("")}</div>` : ""}
      <div class="vnums"><div><b class="num">${x.sup}</b><span>נוכחים</span></div><div><b class="num">${x.need}</b><span>נדרשים</span></div><div><b class="num">${x.slack > 0 ? "+" : ""}${x.slack}</b><span>${x.slack >= 0 ? "אפשר לשחרר" : "חסר"}</span></div></div>
    </section>`;
  }
  // what drives the need
  if (x.state === "duty" && hasT){
    const act = tasksList().filter(tk => taskActive(tk, d));
    h += `<section><div class="sec-h"><h2>משימות</h2><span class="aside">חיילים × שעות → כמה צריך</span>${canEdit() ? `<div class="end"><button class="btn ghost sm" data-a="editTask">+ משימה</button></div>` : ""}</div>
      <div class="list">${act.map(tk => { const s = taskShape(tk);
        return `<button class="li" data-a="editTask" data-v="${tk.id}"><span class="tbar" style="background:${esc(tk.color || "var(--accent)")};height:34px"></span>
          <div class="main"><div class="n">${esc(tk.name)}</div><div class="s">${s.size} חיילים · ${s.hours === 24 ? "כל היממה" : s.hours + " ש׳"} · משמרות של ${s.len} ש׳${s.teams > 1 ? ` · ${s.teams} צוותים מתחלפים` : ""}</div></div>
          <div class="need"><b class="num">${taskNeed(tk)}</b><span>צריך</span></div></button>`; }).join("")}
        <div class="li tot"><div class="main"><div class="n">סה״כ נדרשים</div><div class="s">צוותים מתחלפים = כדי שלכל אחד תהיה מנוחה בין משמרות</div></div><div class="need"><b class="num">${x.need}</b></div></div>
      </div></section>`;
  }
  // who is out + quick leave
  if (x.state === "duty"){
    const outP = x.absent;
    h += `<section><div class="sec-h"><h2>בחוץ</h2><span class="aside">${outP.length}</span></div>
      ${outP.length ? `<div class="chips">${outP.map(p => { const a = absOn(p, d); return `<button class="chip" data-a="editPerson" data-v="${p.id}">${esc(p.name)} <span class="small muted">${esc(KIND[a && a.kind] || "")}</span></button>`; }).join("")}</div>` : `<p class="small muted" style="margin:0">כולם בפנים</p>`}
      ${canEdit() ? `<div class="row" style="margin-top:10px"><button class="btn" data-a="newConstraint" data-v="${d}">+ יציאה או אילוץ</button></div>` : ""}
    </section>`;
    const warn = [];
    pakalAlerts(x).forEach(k => warn.push(`חסר ${esc(k.name)} בפנים (${x.tagSup[k.name] || 0} מתוך ${k.min})`));
    if (x.p1Cmd < settings().minCmd) warn.push(`רק ${x.p1Cmd} מפקדים ב${esc(plName(myPl()))}`);
    if (warn.length) h += `<section class="warnbox">${warn.map(w => `<div>⚠ ${w}</div>`).join("")}</section>`;
  }
  // the next days at a glance
  const strip = range(d, addDays(d, 9)).filter(inLine);
  h += `<section><div class="sec-h"><h2>הימים הקרובים</h2></div><div class="dates">${strip.map(y => { const bb = dayBadge(ctx.map[y]);
    return `<button class="dchip st-${bb.cls}" data-a="dayGo" data-v="${y}" aria-pressed="${y === d}"><span class="wd">${WD[dow(y)]} ${dm(y)}</span><span class="dn">${bb.big}</span></button>`; }).join("")}</div></section>`;
  if (x.state === "duty" && hasT) h += `<div class="row"><button class="btn" data-a="goRoster" data-v="${d}">לשבצ״ק של היום</button></div>`;
  const imp = buildInsights(ctx).filter(i => i.sev === "crit" || i.sev === "warn").length;
  if (imp) h += `<button class="li moretip" data-a="openMore" data-v="insights"><div class="main"><div class="n">${imp} תובנות שדורשות תשומת לב</div><div class="s">יציאות, מפקדים, פק״לים וימים עמוסים</div></div><span aria-hidden="true">‹</span></button>`;
  return h;
}

/* ================= view: עוד ================= */
const MORE = {
  insights: { t:"תובנות", v: ctx => vInsights(ctx) },
  people:   { t:"חיילים", v: ctx => vManage(ctx, true) },
  tasks:    { t:"משימות", v: ctx => vManage(ctx, true) },
  rules:    { t:"אילוצים", v: ctx => vManage(ctx, true) },
  rulebook: { t:"חוקת משימות", v: ctx => vRulebook(ctx) },
  share:    { t:"שיתוף מוצפן עם מפקדים", v: ctx => vShare(ctx) },
  gear:     { t:"צל״ם", v: ctx => vGear(ctx) },
  pakal:    { t:"פק״לים", v: ctx => vPakal(ctx) },
  presence: { t:"טבלת נוכחות", v: ctx => vMatrix(ctx) },
  line:     { t:"מבנה, סבבים וגיבוי", v: ctx => vManage(ctx, true) },
  help:     { t:"מדריך שימוש", v: () => vHelp() },
};
function vMore(ctx){
  if (UI.more && MORE[UI.more]){
    if (["people","tasks","rules","line"].includes(UI.more)) UI.seg = UI.more;
    return `<div class="row" style="margin-bottom:6px"><button class="btn ghost sm" data-a="moreBack">› עוד</button><h2 class="subt">${MORE[UI.more].t}</h2></div>` + MORE[UI.more].v(ctx);
  }
  const ins = buildInsights(ctx), imp = ins.filter(i => i.sev === "crit" || i.sev === "warn").length;
  const ppl = people(), mine = gearPeople(), gi = gearItems();
  const gearDone = mine.reduce((a, p) => a + gi.filter(it => gearState(gearOf(p, it.id)) === "ok").length, 0);
  const pkMarked = ppl.filter(p => (p.tags || []).length).length;
  const fd_ = focusDay(ctx), need = fd_ ? ctx.map[fd_].need : 0;
  const rows = [
    ["insights", `${ins.length} תובנות`, imp ? `<span class="pill crit">${imp}</span>` : ""],
    ["people", `${ppl.length} אנשים ב-${allPlatoons().length} ${TUS()}`, ""],
    ["tasks", `${tasksList().length} משימות · נדרשים ${need} ביום`, ""],
    ["rulebook", `${tasksList().filter(t => (t.who && t.who.mode && t.who.mode !== "all") || (t.queue && t.queue.on) || (t.exempt || []).length).length} משימות עם כללים · ${exemptionRows().length} פטורים`, ""],
    ["rules", `${Object.keys(S.rules).length} אילוצים בין חיילים`, ""],
    ["share", shareCfg().sent || shareCfg().got ? `עדכון אחרון: ${dmTime([shareCfg().sent, shareCfg().got].filter(Boolean).sort().pop())}` : "שליחה וקבלה של עדכונים, בלי שרת", ""],
    ["gear", `${gearDone} מתוך ${mine.length * gi.length} חתומים`, ""],
    ["pakal", `${pkMarked} אנשים מסומנים`, ""],
    ["presence", "כל האנשים מול כל הימים", ""],
    ["line", "שמות, סבבים, מונחים, גיבוי", ""],
    ["help", "איך עובדים, סיסמת היחידה, שיתוף וגיבוי", ""],
  ];
  return `<section><div class="list">${rows.map(([k, s, badge]) => `<button class="li" data-a="openMore" data-v="${k}"><div class="main"><div class="n">${MORE[k].t}</div><div class="s">${esc(s)}</div></div>${badge}<span class="muted" aria-hidden="true">‹</span></button>`).join("")}</div></section>`;
}
