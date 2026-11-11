"use strict";
/* ================= view: roster (שבצ״ק) ================= */
UI.rosterBy = UI.rosterBy || "task";
const nm = id => (S.soldiers[id] || {}).name || "?";
function tmRange(sl){ return `${hh(sl.s)}–${hh(sl.s + sl.len)}`; }
function rosterGaps(r){ let n = 0; for (const sl of (r.slots || [])) n += (sl.p || []).filter(x => !x).length; return n; }
function blockDutyDays(d){ const b = blockOf(d); const ds = b ? range(b.start, b.end) : [d]; return ds.filter(x => dayState(x) === "duty"); }
function vRoster(ctx){
  const duty = ctx.days.filter(x => x.state === "duty");
  if (!duty.length) return `<div class="empty-state"><b>אין ימי ${TD()} בקו</b>הגדירו סבבים בלשונית ניהול.</div>`;
  if (!UI.rosterDate || !ctx.map[UI.rosterDate] || ctx.map[UI.rosterDate].state !== "duty") UI.rosterDate = focusDay(ctx);
  const d = UI.rosterDate, x = ctx.map[d], r = S.rosters[d], t = todayStr();
  let h = `<section><div class="dates" id="dts">${duty.map(y => { const rr = S.rosters[y.d]; const mk = rr ? (rosterGaps(rr) ? "gap" : "full") : "";
    return `<button class="dchip${y.d < t ? " dim" : ""}" data-a="pickDate" data-v="${y.d}" aria-pressed="${y.d === d}"><span class="wd">${WD[dow(y.d)]}</span><span class="dn">${dm(y.d)}</span><span class="mk ${mk}"></span></button>`; }).join("")}</div></section>`;
  const hasT = tasksList().length > 0;
  h += `<section><div class="sec-h"><h2>${WDL[dow(d)]} ${dm(d)}</h2><span class="aside">${x.sup} נוכחים${hasT ? ` · דרישה ${x.need}` : ""}${eventOn(d) ? " · " + esc(eventOn(d).label) : ""}</span>
    <div class="end">${r ? `<button class="btn sm" data-a="copyDay" data-v="${d}">העתק לוואטסאפ</button>` : ""}${canEdit() && hasT ? `<button class="btn sm${r ? "" : " primary"}" data-a="genDay" data-v="${d}">${r ? "ג׳נרט מחדש" : "ג׳נרט יום"}</button><button class="btn sm" data-a="genBlockAsk" data-v="${d}">כל הסבב</button>` : ""}</div></div>`;
  if (!hasT){ h += `<div class="empty-state"><b>אין משימות</b>הגדירו משימות (כמות חיילים, משמרות, דרישות) והמערכת תשבץ.<div style="margin-top:10px">${canEdit() ? `<button class="btn primary" data-a="editTask">הוספת משימה</button>` : ""}</div></div></section>`; return h; }
  if (!r){ h += `<div class="empty-state"><b>עוד אין שבצ״ק ליום הזה</b>הג׳ינרוט מתחשב במנוחה בין משמרות, באילוצים ובחלוקה הוגנת של לילות.</div></section>`; return h; }
  const gaps = rosterGaps(r);
  h += `<div class="row" style="margin-bottom:10px">${gaps ? `<span class="pill crit">${gaps} משבצות ריקות</span>` : `<span class="pill ok">כל המשבצות מאוישות</span>`}<span class="small muted">לחיצה על שם מחליפה אותו, לחיצה על חייל ב"לפי חייל" פותחת שיבוץ ידני ותפקיד. שינוי ידני ננעל ונשמר בג׳ינרוט הבא.</span>
    <div class="seg" style="margin-inline-start:auto" role="group" aria-label="תצוגה"><button data-a="rosterBy" data-v="task" aria-pressed="${UI.rosterBy === "task"}">לפי משימה</button><button data-a="rosterBy" data-v="person" aria-pressed="${UI.rosterBy === "person"}">לפי חייל</button></div></div>`;
  const busy = new Set(); (r.slots || []).forEach(sl => (sl.p || []).forEach(id => id && busy.add(id)));
  const free = people().filter(p => present(p, d) && jointPl().includes(p.platoon) && !busy.has(p.id));
  if (free.length) h += `<div class="free-row"><span class="small muted">בלי משמרת היום (${free.length}):</span> ${free.map(p => `<button class="chip" data-a="quick" data-v="${p.id}" data-d="${d}">${esc(p.name)}${isCmd(p) ? `<span class="c">מ׳</span>` : ""}</button>`).join("")}</div>`;
  h += UI.rosterBy === "person" ? rosterByPerson(d, r) : rosterByTask(d, r);
  h += `</section>`;
  h += loadTable(d);
  return h;
}
function rosterByTask(d, r){
  const byT = {}; (r.slots || []).forEach((sl, i) => (byT[sl.t] = byT[sl.t] || []).push([sl, i]));
  return `<div class="stack">` + Object.keys(byT).map(tid => {
    const t = S.tasks[tid] || { name:"משימה שנמחקה" };
    const c = taskComp(t);
    return `<div class="task-card"><div class="th"><span class="tbar" style="background:${esc(t.color || "var(--accent)")}"></span><b>${esc(t.name)}</b><span class="pill">${taskParts(t) ? "פלוגתית" : t.kind === "guard" ? "שמירה" : "משימה"}</span><span class="small muted">${c.size || "?"} ${taskParts(t) ? "בסך הכול" : "במשמרת"}${c.cmd ? ` · ${c.cmd === 1 ? "כולל מפקד" : c.cmd + " מפקדים"}` : ""}${c.needs.map(n => ` · ${esc(n.tag)}${n.count > 1 ? "×" + n.count : ""}`).join("")}</span></div>` +
      byT[tid].map(([sl, si]) => `<div class="shift"><div class="tm">${tmRange(sl)}${sl.night ? `<span class="n">לילה</span>` : ""}</div><div class="ppl">${sl.part ? `<span class="plabel">${esc(partLabel(t, sl))}</span>` : ""}${(sl.p || []).map((pid, pi) =>
        `<button class="chip${pid ? "" : " empty"}${sl.lock ? " lock" : ""}" data-a="slot" data-v="${d}" data-si="${si}" data-pi="${pi}">${pid ? esc(nm(pid)) + (isCmd(S.soldiers[pid]) ? `<span class="c">מ׳</span>` : "") : "ריק"}</button>`).join("")}</div>${(sl.w || []).length ? `<div class="warns">${esc(sl.w.join(" · "))}</div>` : ""}</div>`).join("") + `</div>`;
  }).join("") + ghostsOn(d).map(g => {
    const hosts = g.ghost.of || [], hs = (r.slots || []).filter(sl => hosts.includes(sl.t)).sort((a, b) => a.s - b.s);
    return `<div class="task-card ghost"><div class="th"><span class="tbar" style="background:${esc(g.color || "var(--accent)")}"></span><b>${esc(g.name)}</b><span class="pill">רפאים</span><span class="small muted">${esc(ghostLine(g))}</span></div>` +
      hs.map(sl => `<div class="shift"><div class="tm">${tmRange(sl)}</div><div class="ppl small">${hosts.length > 1 ? `<span class="muted">${esc((S.tasks[sl.t] || {}).name || "")}:</span> ` : ""}${esc((sl.p || []).filter(Boolean).map(nm).join(", ") || "—")}</div></div>`).join("") + `</div>`;
  }).join("") + `</div>`;
}
function rosterByPerson(d, r){
  const m = {}; (r.slots || []).forEach(sl => (sl.p || []).forEach(pid => { if (pid) (m[pid] = m[pid] || []).push(sl); }));
  const pres = people().filter(p => present(p, d) && jointPl().includes(p.platoon));
  const rows = pres.map(p => ({ p, sls: (m[p.id] || []).sort((a,b) => a.s - b.s) })).sort((a,b) => b.sls.length - a.sls.length || a.p.name.localeCompare(b.p.name, "he"));
  return `<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>משמרות</th><th class="n">שעות</th></tr></thead><tbody>${rows.map(({p, sls}) =>
    `<tr><td><button class="tbtn" data-a="quick" data-v="${p.id}" data-d="${d}" style="text-align:start;padding:4px 0"><b>${esc(p.name)}</b> <span class="small muted">${esc(shortName(p.platoon))}</span></button></td><td style="white-space:normal">${sls.length ? sls.map(sl => `<span class="pill" style="margin:2px"><span>${esc((S.tasks[sl.t]||{}).name || "")}</span> <span class="ltr num">${tmRange(sl)}</span></span>`).join("") : `<span class="muted small">פנוי</span>`}</td><td class="n">${sls.reduce((a,s) => a + s.len, 0)}</td></tr>`).join("")}</tbody></table></div>`;
}
function loadTable(d){
  const ds = blockDutyDays(d).filter(x => S.rosters[x]);
  if (!ds.length) return "";
  const st = {};
  for (const x of ds) for (const sl of (S.rosters[x].slots || [])) for (const pid of (sl.p || [])) if (pid){
    const o = st[pid] || (st[pid] = { n:0, h:0, night:0 }); o.n++; o.h += sl.len * ((S.tasks[sl.t]||{}).weight ?? 1); if (sl.night) o.night++;
  }
  const rows = Object.entries(st).sort((a,b) => b[1].h - a[1].h);
  const pres = people().filter(p => jointPl().includes(p.platoon) && ds.some(x => present(p, x)));
  const idle = pres.filter(p => !st[p.id]);
  return `<section><details class="panel"><summary style="cursor:pointer;font-weight:600">חלוקת עומס בסבב (${ds.length} ימים עם שבצ״ק)</summary>
  <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>שם</th><th class="n">משמרות</th><th class="n">שעות משוקללות</th><th class="n">לילות</th></tr></thead><tbody>${rows.map(([id,o]) => `<tr><td>${esc(nm(id))}</td><td class="n">${o.n}</td><td class="n">${Math.round(o.h)}</td><td class="n">${o.night}</td></tr>`).join("")}</tbody></table></div>
  ${idle.length ? `<p class="small muted">לא שובצו: ${esc(idle.map(p => p.name).join(", "))}</p>` : ""}</details></section>`;
}
function dayText(d){
  const r = S.rosters[d], x = CTX.map[d]; if (!r) return "";
  let s = `*שבצ״ק · ${WDL[dow(d)]} ${dm(d)}*\nנוכחים ${x.sup} · דרישה ${x.need}\n`;
  const byT = {}; (r.slots || []).forEach(sl => (byT[sl.t] = byT[sl.t] || []).push(sl));
  for (const tid of Object.keys(byT)){
    s += `\n*${(S.tasks[tid] || {}).name || ""}*\n`;
    const t = S.tasks[tid] || {};
    for (const sl of byT[tid]) s += `${hh(sl.s)}-${hh(sl.s + sl.len)}  ${sl.part ? partLabel(t, sl) + ": " : ""}${(sl.p || []).map(p => p ? nm(p) : "____").join(", ")}\n`;
  }
  for (const g of ghostsOn(d)) s += `\n*${g.name}*\n${ghostLine(g)}\n`;
  if (x.absent.length) s += `\nבחוץ: ${x.absent.map(p => { const a = absOn(p, d); return p.name + (a ? ` (${KIND[a.kind] || ""})` : ""); }).join(", ")}\n`;
  return s;
}
/* conflicts of putting person p into slot sl on day d */
function slotConflicts(p, d, sl, skipSelf){
  const c = cfg(), s = settings(), R = ruleMaps(), out = [];
  const t = S.tasks[sl.t] || {}, di = diffDays(c.lineStart, d), A = di * 24 + sl.s, B = A + sl.len, rest = restAfter(t, sl);
  for (const dd of [addDays(d, -1), d, addDays(d, 1)]){
    const r = S.rosters[dd]; if (!r) continue; const dj = diffDays(c.lineStart, dd);
    (r.slots || []).forEach((o, oi) => {
      if (dd === d && skipSelf === oi) return;
      if (!(o.p || []).includes(p.id)) return;
      const ot = S.tasks[o.t] || {}, oA = dj * 24 + o.s, oB = oA + o.len, orest = restAfter(ot, o);
      if (oA < B && A < oB) out.push(`חופף ל${ot.name || ""} ${tmRange(o)}`);
      else if ((oB <= A && A - oB < orest) || (B <= oA && oA - B < rest)) out.push(`בלי מנוחה מ${ot.name || ""} ${tmRange(o)}`);
    });
  }
  if (R.notTask[p.id] && R.notTask[p.id].has(t.id)) out.push("אילוץ: לא במשימה הזו");
  if (R.only[p.id] && !R.only[p.id].has(t.id)) out.push("אילוץ: משובץ רק למשימה אחרת");
  if (sl.night && R.noNight.has(p.id)) out.push("אילוץ: בלי לילות");
  out.push(...ruleReasons(p, t, sl, d));
  // caps, counted over what is already in the rosters
  const wk = weekOf(d); let nDay = 0, nWeek = 0, nNight = 0;
  for (const dd of range(wk, addDays(wk, 6))){ const r = S.rosters[dd]; if (!r) continue;
    (r.slots || []).forEach((o, oi) => { if (dd === d && skipSelf === oi) return; if (!(o.p || []).includes(p.id)) return; nWeek++; if (o.night) nNight++; if (dd === d) nDay++; }); }
  const cap = capOf(R, p.id);
  if (cap && nDay >= cap) out.push(`כבר ${nDay} משמרות היום (תקרה ${cap})`);
  if (s.maxPerWeek && nWeek >= s.maxPerWeek) out.push(`כבר ${nWeek} משמרות השבוע (תקרה ${s.maxPerWeek})`);
  if (sl.night && s.maxNightsWeek && nNight >= s.maxNightsWeek) out.push(`כבר ${nNight} לילות השבוע (תקרה ${s.maxNightsWeek})`);
  return out;
}
function openSlot(d, si, pi){
  const r = S.rosters[d]; if (!r) return; const sl = r.slots[si]; const t = S.tasks[sl.t] || {};
  const cur = sl.p[pi];
  const others = sl.p.filter((x, i) => x && i !== pi);
  const comp = slotComp(t, sl);
  /* free people first: no conflicts, then fewest shifts that day, then lightest load in the rotation */
  const cands = people().filter(p => present(p, d) && comp.pls.includes(p.platoon) && !others.includes(p.id) && p.id !== cur)
    .map(p => ({ p, w: slotConflicts(p, d, sl, si), n: shiftsOn(p.id, d, si), L: rotLoad(p.id, d) }))
    .sort((a,b) => a.w.length - b.w.length || a.n - b.n || a.L - b.L || (isCmd(b.p) - isCmd(a.p)) * (comp.cmd ? 1 : -1) || a.p.name.localeCompare(b.p.name, "he"));
  openSheet(`<h3>${esc(t.name || "")} · <span class="ltr num">${tmRange(sl)}</span></h3>
  <p class="small muted">${WDL[dow(d)]} ${dm(d)}${sl.part ? " · " + esc(partLabel(t, sl)) : ""} · כרגע: ${cur ? `<button class="tbtn" data-a="quick" data-v="${cur}" data-d="${d}" style="padding:0"><b>${esc(nm(cur))}</b></button>` : "<b>ריק</b>"}${sl.lock ? " · ננעל ידנית" : ""}</p>
  ${canEdit() ? `<div class="stack" style="max-height:52vh;overflow:auto">${cands.map(({p, w, n, L}, i) => `<button class="cand${w.length ? " bad" : ""}" data-a="assign" data-v="${d}" data-si="${si}" data-pi="${pi}" data-pid="${p.id}"><div class="main"><b>${esc(p.name)}</b> ${!i && !w.length ? `<span class="pill ok">מומלץ</span> ` : ""}${isCmd(p) ? `<span class="pill cmd">מפקד</span>` : ""}${(p.tags||[]).map(x => `<span class="pill">${esc(x)}</span>`).join(" ")}<br><small>${esc(freeText(n, L))}${w.length ? ` · <span class="warn-t">${esc(w.join(" · "))}</span>` : ""}</small></div></button>`).join("")}</div>
  <div class="sheet-acts">${cur ? `<button class="btn danger" data-a="assign" data-v="${d}" data-si="${si}" data-pi="${pi}" data-pid="">השאר ריק</button>` : ""}${sl.lock ? `<button class="btn" data-a="unlock" data-v="${d}" data-si="${si}">בטל נעילה</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>` : `<div class="sheet-acts"><button class="btn" data-a="closeSheet">סגירה</button></div>`}`);
}
function shiftsOn(pid, d, skipSi){ const r = S.rosters[d]; let n = 0; if (r) (r.slots || []).forEach((sl, i) => { if (i !== skipSi && (sl.p || []).includes(pid)) n++; }); return n; }
function rotLoad(pid, d){ let L = 0; for (const x of blockDutyDays(d)){ const r = S.rosters[x]; if (r) for (const sl of (r.slots || [])) if ((sl.p || []).includes(pid)) L += slotLoad(S.tasks[sl.t], sl); } return L; }
const freeText = (n, L) => (n ? `כבר ${n === 1 ? "משמרת אחת" : n + " משמרות"} היום` : "בלי משמרות היום") + ` · ${Math.round(L)} ש׳ בסבב`;
function assign(d, si, pi, pid){
  const r = JSON.parse(JSON.stringify(S.rosters[d])); const sl = r.slots[si];
  sl.p[pi] = pid || null; sl.lock = true; sl.w = [];
  put("rosters/" + d, r); closeSheet(); toast(pid ? `${nm(pid)} שובץ` : "המשבצת רוקנה");
}
function genDates(ds){
  ds = ds.filter(d => dayState(d) === "duty"); if (!ds.length) return;
  const res = generate(ds); for (const d of ds) put("rosters/" + d, res[d]);
  const g = unfilled(res); toast(g ? `נוצר שבצ״ק ל-${ds.length} ימים · ${g} משבצות ריקות` : `נוצר שבצ״ק ל-${ds.length} ימים, הכול מאויש`);
}
