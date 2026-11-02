"use strict";
/* ================= view: insights ================= */
UI.chk = UI.chk || null;
function vInsights(ctx){
  const all = buildInsights(ctx);
  const cats = { all:"הכול", abs:"יציאות ובקשות", staff:"כוח אדם", rule:"אילוצים" };
  const pick = i => UI.insCat === "all" || (UI.insCat === "abs" && ["abs","release"].includes(i.cat)) || (UI.insCat === "staff" && ["staff","cmd","tag","setup"].includes(i.cat)) || (UI.insCat === "rule" && i.cat === "rule");
  const list = all.filter(pick);
  const ppl = people().filter(p => jointPl().includes(p.platoon));
  let h = `<section><div class="sec-h"><h2>אפשר לשחרר?</h2><span class="aside">בודק מול השבצ״ק בפועל</span></div><div class="panel"><div class="fgrid">
    <label class="fld"><span>חייל</span><select id="chkP">${ppl.map(p => `<option value="${p.id}"${UI.chk && UI.chk.pid === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
    <label class="fld"><span>מתאריך</span><input type="date" id="chkF" value="${UI.chk ? UI.chk.from : focusDay(ctx) || ""}"></label>
    <label class="fld"><span>עד תאריך</span><input type="date" id="chkT" value="${UI.chk ? UI.chk.to : focusDay(ctx) || ""}"></label>
  </div><div class="row" style="margin-top:10px"><button class="btn primary" data-a="runChk">בדיקה</button></div>${UI.chk && UI.chk.html ? `<div style="margin-top:12px">${UI.chk.html}</div>` : ""}</div></section>`;
  h += `<section><div class="sec-h"><h2>תובנות</h2><span class="aside">${list.length}</span></div>
    <div class="seg" role="group" aria-label="סינון" style="margin-bottom:10px">${Object.entries(cats).map(([k,v]) => `<button data-a="insCat" data-v="${k}" aria-pressed="${UI.insCat === k}">${v}</button>`).join("")}</div>
    <div class="stack">${list.map(insCard).join("") || `<div class="empty-state">אין תובנות בקטגוריה הזו</div>`}</div></section>`;
  // per-person presence
  const duty = ctx.days.filter(x => x.state === "duty");
  const rows = people().map(p => {
    const win = duty.filter(x => inWindow(p, x.d) && platoonIn(p.platoon, x.d));
    const inn = win.filter(x => present(p, x.d)).length;
    return { p, tot: win.length, inn, out: win.length - inn };
  });
  h += `<section><div class="sec-h"><h2>ימי ${TD()} לפי חייל</h2></div><div class="tbl-wrap"><table><thead><tr><th>שם</th><th>${TU()}</th><th class="n">בפנים</th><th class="n">בחוץ</th><th class="n">מתוך</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.p.name)}</b>${r.p.tentative ? ` <span class="pill">לא ודאי</span>` : ""}</td><td>${esc(shortName(r.p.platoon))}</td><td class="n">${r.p.tentative ? "?" : r.inn}</td><td class="n" style="color:var(--${r.out ? "warn" : "muted"})">${r.p.tentative ? "?" : r.out}</td><td class="n">${r.tot}</td></tr>`).join("")}</tbody></table></div></section>`;
  return h;
}
function runCheck(){
  const pid = $("#chkP").value, from = $("#chkF").value, to = $("#chkT").value || from;
  const p = S.soldiers[pid]; if (!p || !from){ return; }
  const a = { from: from <= to ? from : to, to: from <= to ? to : from, kind:"other" };
  const dd = range(a.from, a.to).filter(d => dayState(d, p.platoon) === "duty" && personStatus(p, d) === "in");
  let html;
  if (!dd.length) html = insCard({ sev:"ok", t:`${p.name} לא ב${TD()} בתאריכים האלה`, d:"ימי בית, יציאה קיימת או מחוץ לקו. אין מה לאשר." });
  else {
    const minSlack = Math.min(...dd.map(d => CTX.map[d].slack)) - 1;
    const sim = tasksList().length ? simulateAbs(p, a) : null;
    const v = verdictOf(minSlack, sim ? sim.delta : null);
    let extra = ""; if (isCmd(p)){ const mc = Math.min(...dd.map(d => CTX.map[d].p1Cmd)) - 1; extra = ` · יישארו ${mc} מפקדים`; if (mc < settings().minCmd && v.sev === "ok") v.sev = "warn"; }
    const pkLow = pakalim().filter(k => (k.min || 0) > 0 && hasTag(p, k.name) && dd.some(d => (CTX.map[d].tagSup[k.name] || 0) - 1 < k.min));
    if (pkLow.length){ extra += ` · יחסר ${pkLow.map(k => k.name).join(", ")}`; if (v.sev === "ok") v.sev = "warn"; }
    const clash = Object.values(S.rules).filter(r => r.on !== false && r.type === "notBothOut" && (r.a||[]).includes(pid)).flatMap(r => r.a.filter(id => id !== pid && dd.some(d => ["abs","req"].includes(personStatus(S.soldiers[id] || {}, d)))));
    if (clash.length){ v.sev = "crit"; extra += ` · ${clash.map(nm).join(", ")} כבר בחוץ ואסור ששניהם יצאו`; }
    html = insCard({ sev:v.sev, t:`${p.name}, ${fmtDays(dd)}: ${v.word}`, d:`${dd.length} ימי ${TD()}. ${v.why}${extra}.`, acts: canEdit() ? [{ l:"רשום כיציאה מאושרת", a:"addAbsQuick", pid, v: a.from + "|" + a.to }] : [] });
  }
  UI.chk = { pid, from, to, html }; render();
}

/* ================= view: manage ================= */
const RULE_TYPES = {
  together:{ l:"חייבים יחד", h:"ישובצו תמיד באותה משמרת", f:["a"] },
  apart:{ l:"לא באותה משמרת", h:"לעולם לא ישובצו יחד", f:["a"] },
  mustIn:{ l:"חובה במשימה", h:"בכל משמרת של המשימה יהיה לפחות אחד מהם", f:["task","a"] },
  onlyTask:{ l:"רק במשימה", h:"ישובצו רק למשימה הזו", f:["task","a"] },
  notTask:{ l:"לא במשימה", h:"לא ישובצו למשימה הזו", f:["task","a"] },
  noNight:{ l:"בלי לילות", h:"לא ישובצו למשמרות לילה", f:["a"] },
  maxPerDay:{ l:"מקסימום משמרות ביום", h:"לא יותר מ-N משמרות ביום", f:["a","n"] },
  notBothOut:{ l:"לא יוצאים יחד", h:"התראה אם יותר מאחד מהם בחוץ באותו יום", f:["a"] },
  minPresent:{ l:"מינימום נוכחים", h:"התראה כשנוכחים פחות מ-N", f:["platoon","n"] },
};
function ruleText(r){
  const names = (r.a || []).map(nm).join(", "), tn = (S.tasks[r.task] || {}).name || "משימה";
  switch (r.type){
    case "together": return `${names}: תמיד יחד`;
    case "apart": return `${names}: לא באותה משמרת`;
    case "mustIn": return `${tn}: בכל משמרת אחד מ-${names}`;
    case "onlyTask": return `${names}: רק ${tn}`;
    case "notTask": return `${names}: לא ב${tn}`;
    case "noNight": return `${names}: בלי לילות`;
    case "maxPerDay": return `${names}: עד ${r.n} משמרות ביום`;
    case "notBothOut": return `${names}: לא יוצאים יחד`;
    case "minPresent": return `${plName(r.platoon)}: לפחות ${r.n} נוכחים`;
  }
  return "אילוץ";
}
function vManage(ctx, noSeg){
  const segs = { people:"חיילים", tasks:"משימות", rules:"אילוצים", line:"מבנה וסבבים" };
  let h = noSeg ? "" : `<div class="seg" role="group" aria-label="ניהול">${Object.entries(segs).map(([k,v]) => `<button data-a="seg" data-v="${k}" aria-pressed="${UI.seg === k}">${v}</button>`).join("")}</div>`;
  const add = (a, l) => canEdit() ? `<div class="end"><button class="btn primary sm" data-a="${a}">${l}</button></div>` : "";
  if (UI.seg === "people"){
    const groups = {}; ctx.all.forEach(p => (groups[p.platoon] = groups[p.platoon] || []).push(p));
    h += `<section><div class="sec-h"><h2>חיילים</h2><span class="aside">${ctx.all.length}</span>${add("editPerson","הוספת חייל")}</div>`;
    if (!ctx.all.length) h += `<div class="empty-state"><b>אין חיילים</b>הוסיפו את האנשים, תאריכי הגעה ויציאות.</div>`;
    for (const pl of Object.keys(groups).sort()){
      h += `<div class="eyebrow" style="margin:12px 0 6px">${esc(plName(pl))} · ${groups[pl].length}</div><div class="list">${groups[pl].map(p => {
        const abs = (p.absences || []).map(a => a.from ? `${KIND[a.kind] || ""} ${a.from === a.to ? dm(a.from) : dm(a.from) + "–" + dm(a.to)}` : `${KIND[a.kind] || ""} (לא נקבע)`);
        const win = p.from || p.to ? `${p.from ? "מ-" + dm(p.from) : ""} ${p.to ? "עד " + dm(p.to) : ""}` : "קו מלא";
        return `<button class="li" data-a="editPerson" data-v="${p.id}"><div class="main"><div class="n">${esc(p.name)}</div><div class="s">${esc(win)}${abs.length ? " · " + esc(abs.join(" · ")) : ""}${p.note ? " · " + esc(p.note) : ""}</div></div><div class="tags">${p.role !== "soldier" ? `<span class="pill${isCmd(p) ? " cmd" : ""}">${roleNames()[p.role]}</span>` : ""}${(p.tags||[]).map(t => `<span class="pill">${esc(t)}</span>`).join("")}${p.tentative ? `<span class="pill warn">לא ודאי</span>` : ""}</div></button>`; }).join("")}</div>`;
    }
    h += `</section>`;
  }
  if (UI.seg === "tasks"){
    const ts = tasksList();
    h += `<section><div class="sec-h"><h2>משימות ושמירות</h2><span class="aside">מהן נגזרת דרישת כוח האדם</span>${add("editTask","הוספת משימה")}</div>`;
    h += ts.length ? `<div class="list">${ts.map(t => `<button class="li" data-a="editTask" data-v="${t.id}"><span class="tbar" style="background:${esc(t.color || "var(--accent)")};height:34px"></span><div class="main"><div class="n">${esc(t.name)}</div><div class="s">${taskShape(t).size} חיילים${t.cmd ? " (כולל מפקד)" : ""} · ${taskShape(t).hours === 24 ? "כל היממה" : taskShape(t).hours + " ש׳ מ-" + hh(taskShape(t).start)} · משמרות של ${taskShape(t).len} ש׳ · צריך ${taskNeed(t)} ביום${(t.needs||[]).length ? " · " + (t.needs.map(n => n.tag + "×" + n.count).join(", ")) : ""}</div></div><div class="tags"><span class="pill">${t.kind === "guard" ? "שמירה" : "משימה"}</span>${t.example ? `<span class="pill warn">דוגמה</span>` : ""}</div></button>`).join("")}</div>` : `<div class="empty-state"><b>אין משימות</b>לדוגמה: ש״ג, סיור, כיתת כוננות, תצפית.</div>`;
    if (ts.some(t => t.example)) h += `<p class="small muted">משימות שמסומנות "דוגמה" הוכנסו כדי שהמערכת תעבוד מהרגע הראשון. ערכו אותן למשימות האמיתיות או מחקו.</p>`;
    h += `</section>`;
  }
  if (UI.seg === "rules"){
    const rs = Object.values(S.rules);
    h += `<section><div class="sec-h"><h2>אילוצים</h2><span class="aside">השבצ״ק והתובנות מתחשבים בהם</span>${add("editRule","הוספת אילוץ")}</div>`;
    h += rs.length ? `<div class="list">${rs.map(r => `<button class="li" data-a="editRule" data-v="${r.id}"><div class="main"><div class="n">${esc(ruleText(r))}</div><div class="s">${esc((RULE_TYPES[r.type] || {}).l || "")}${r.note ? " · " + esc(r.note) : ""}</div></div>${r.on === false ? `<span class="pill">כבוי</span>` : `<span class="pill ok">פעיל</span>`}</button>`).join("")}</div>`
      : `<div class="empty-state"><b>אין אילוצים</b>למשל: "כהן ולוי לא יוצאים יחד", "בכל סיור אחד מהנהגים", "X ו-Y תמיד יחד".</div>`;
    h += `<div class="panel" style="margin-top:12px"><div class="eyebrow" style="margin-bottom:6px">סוגי אילוצים</div><div class="stack small">${Object.values(RULE_TYPES).map(t => `<div><b>${t.l}</b> <span class="muted">— ${t.h}</span></div>`).join("")}</div></div></section>`;
  }
  if (UI.seg === "line") h += vLineSettings();
  return h;
}
const ROT_LBL = ["סבב א","סבב ב","סבב ג"];
const unitRot = n => groupsCfg().findIndex(g => g.includes(Number(n)));
function vStructure(){
  const ed = canEdit() ? "" : " disabled", t = terms(), rn = roleNames(), raw = (cfg().roleNames || {});
  const inp = "border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface2);min-height:36px;width:100%;min-width:0";
  const rows = allPlatoons().map(n => { const cnt = people().filter(p => p.platoon === n).length, r = unitRot(n);
    return `<tr><td style="text-align:center"><input type="radio" name="myU" value="${n}" aria-label="ה${esc(TU())} שלי"${Number(myPl()) === n ? " checked" : ""}${ed}></td>
      <td><input id="cN${n}" data-pl="${n}" value="${esc(plName(n))}" aria-label="שם" style="${inp};min-width:120px"${ed}></td>
      <td><select id="cR${n}" aria-label="סבב" style="${inp};min-width:118px"${ed}>${ROT_LBL.map((l, i) => `<option value="${i}"${r === i ? " selected" : ""}>${l}</option>`).join("")}<option value="-1"${r < 0 ? " selected" : ""}>תמיד בפנים</option></select></td>
      <td class="n">${cnt}</td>
      <td>${canEdit() && !cnt && Number(myPl()) !== n ? `<button class="btn ghost sm" data-a="delUnit" data-v="${n}" aria-label="מחיקה">✕</button>` : ""}</td></tr>`; }).join("");
  return `<section><div class="sec-h"><h2>מבנה היחידה</h2><span class="aside">שמות, מי יוצא עם מי, ומונחים</span>${canEdit() ? `<div class="end"><button class="btn sm" data-a="addUnit">הוספת ${esc(t.u)}</button></div>` : ""}</div>
  <div class="tbl-wrap"><table><thead><tr><th style="text-align:center">שלי</th><th>שם</th><th>סבב</th><th class="n">אנשים</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="small muted">${esc(TUS())} באותו סבב יוצאות הביתה יחד. "תמיד בפנים" = לא יוצאים לפי סבבים.</p>
  <div class="panel" style="margin-top:10px"><div class="eyebrow" style="margin-bottom:8px">מונחים</div><div class="fgrid">
    <label class="fld"><span>יחידת משנה (יחיד)</span><input id="tU" value="${esc(t.u)}" placeholder="מחלקה / צוות / כיתה"${ed}></label>
    <label class="fld"><span>יחידת משנה (רבים)</span><input id="tUS" value="${esc(t.us)}" placeholder="מחלקות / צוותים"${ed}></label>
    <label class="fld"><span>הזמן בפנים נקרא</span><input id="tD" value="${esc(t.duty)}" placeholder="תעסוקה / בסיס / קו"${ed}></label>
  </div><div class="eyebrow" style="margin:12px 0 8px">שמות תפקידים</div><div class="fgrid">
    ${[["mm","מפקד היחידה"],["smm","סגן / סמל"],["cmd","מפקד"],["cmdp","מפקד פוטנציאלי"],["soldier","לוחם"]].map(([k, l]) => `<label class="fld"><span>${l}</span><input id="rl_${k}" value="${esc(raw[k] || "")}" placeholder="${esc(rn[k])}"${ed}></label>`).join("")}
  </div>${canEdit() ? `<div class="row" style="margin-top:12px"><button class="btn primary" data-a="saveStruct">שמירת מבנה</button></div>` : ""}</div></section>`;
}
function saveStruct(){
  const ids = [...document.querySelectorAll("input[data-pl]")].map(i => Number(i.dataset.pl));
  const names = Object.assign({}, cfg().platoonNames || {});
  const newG = [[], [], []];
  for (const n of ids){ names[n] = val("cN" + n) || (TU() + " " + n); const r = Number(val("cR" + n)); if (r >= 0 && r < 3) newG[r].push(n); }
  const mineEl = document.querySelector('input[name="myU"]:checked'), mp = mineEl ? Number(mineEl.value) : Number(myPl());
  // carry each block over by rotation slot, so "סבב א בבית" stays "סבב א בבית"
  const map = {}; groupsCfg().forEach((g, i) => { map[g.join("")] = newG[i] && newG[i].length ? newG[i].join("") : "none"; });
  const blocks = (cfg().blocks || []).map(b => Object.assign({}, b, { home: b.home === "none" ? "none" : (map[b.home] || b.home) }));
  const groups = newG.filter(g => g.length);
  const rl = {}; for (const k of ["mm","smm","cmd","cmdp","soldier"]){ const v = val("rl_" + k); if (v) rl[k] = v; }
  const t = { u: val("tU") || "מחלקה", us: val("tUS") || (val("tU") ? val("tU") + "ות" : "מחלקות"), duty: val("tD") || "תעסוקה" };
  saveCfg({ platoonNames:names, groups: groups.length ? groups : [[mp]], blocks, myPlatoon:mp, terms:t, roleNames:rl });
  toast("המבנה נשמר");
}
function addUnit(){
  const ids = allPlatoons(), n = (ids.length ? Math.max(...ids) : 0) + 1;
  const names = Object.assign({}, cfg().platoonNames || {}); ids.forEach(i => { if (!names[i]) names[i] = plName(i); }); names[n] = TU() + " " + n;
  saveCfg({ platoonNames:names, groups: groupsCfg() }); toast(`נוסף ${TU()} חדש. קבעו שם וסבב ושמרו.`);
}
function delUnit(n){
  n = Number(n); if (people().some(p => p.platoon === n) || n === Number(myPl())) return;
  const names = Object.assign({}, cfg().platoonNames || {}); delete names[n];
  const map = {}, groups = groupsCfg().map(g => { const ng = g.filter(x => x !== n); map[g.join("")] = ng.length ? ng.join("") : "none"; return ng; }).filter(g => g.length);
  const blocks = (cfg().blocks || []).map(b => Object.assign({}, b, { home: b.home === "none" ? "none" : (map[b.home] || b.home) }));
  saveCfg({ platoonNames:names, groups, blocks }); toast("נמחק");
}
function vLineSettings(){
  const c = cfg(), s = settings(), ed = canEdit() ? "" : " disabled";
  const homeSel = (b, i) => `<select id="bh${i}" data-a="blk" data-i="${i}"${ed}>${groupsCfg().map(g => { const k = g.join(""), mine = g.includes(Number(myPl())); return `<option value="${k}"${b.home === k ? " selected" : ""}>${esc(groupName(g))} בבית${mine ? "" : ` (${esc(JL())} ב${TD()})`}</option>`; }).join("")}<option value="none"${b.home === "none" ? " selected" : ""}>כולם בפנים</option></select>`;
  return vStructure() + `<section><div class="sec-h"><h2>סבבי בית ו${TD()}</h2><span class="aside">לפי לוח השנה</span>${canEdit() ? `<div class="end"><button class="btn sm" data-a="swapBlocks">החלף בית ↔ ${TD()}</button><button class="btn sm primary" data-a="addBlock">הוספת סבב</button></div>` : ""}</div>
  <div class="tbl-wrap"><table><thead><tr><th>מתאריך</th><th>עד תאריך</th><th>מי בבית</th><th class="n">ימים</th><th></th></tr></thead><tbody>${(c.blocks || []).map((b, i) => `<tr style="background:${b.home === groupOf(myPl()) ? "var(--home-soft)" : "var(--duty-soft)"}"><td><input type="date" id="bs${i}" value="${b.start}" data-a="blk" data-i="${i}"${ed}></td><td><input type="date" id="be${i}" value="${b.end}" data-a="blk" data-i="${i}"${ed}></td><td>${homeSel(b, i)}</td><td class="n">${diffDays(b.start, b.end) + 1}</td><td>${canEdit() ? `<button class="btn ghost sm" data-a="delBlock" data-i="${i}" aria-label="מחיקה">✕</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
  <p class="small muted">ימים בתוך הקו שלא מכוסים בסבב נחשבים "כולם בפנים".</p></section>
  <section><div class="sec-h"><h2>הקו</h2></div><div class="panel"><div class="fgrid">
    <label class="fld"><span>תחילת הקו</span><input type="date" id="cLS" value="${c.lineStart}"${ed}></label>
    <label class="fld"><span>סוף הקו</span><input type="date" id="cLE" value="${c.lineEnd}"${ed}></label>
    <label class="fld"><span>מנוחה מינימלית (ש׳)</span><input type="number" min="0" max="24" id="sMR" value="${s.minRest}"${ed}></label>
    <label class="fld"><span>מינימום מפקדים ב${TU()}</span><input type="number" min="0" max="10" id="sMC" value="${s.minCmd}"${ed}></label>
    <label class="fld"><span>לילה משעה</span><input type="number" min="0" max="23" id="sNF" value="${s.nightFrom}"${ed}></label>
    <label class="fld"><span>לילה עד שעה</span><input type="number" min="0" max="23" id="sNT" value="${s.nightTo}"${ed}></label>
  </div>${canEdit() ? `<div class="row" style="margin-top:12px"><button class="btn primary" data-a="saveLine">שמירת הגדרות</button></div>` : ""}</div></section>
  <section><div class="sec-h"><h2>אירועים בקו</h2>${canEdit() ? `<div class="end"><button class="btn sm" data-a="addEvent">הוספת אירוע</button></div>` : ""}</div>
  ${(c.events || []).length ? `<div class="list">${c.events.map((e, i) => `<div class="li" style="cursor:default"><div class="main"><div class="n">${esc(e.label)}</div><div class="s">${dmw(e.date)} · ${dayState(e.date) === "duty" ? "ב" + TD() : "בבית"}</div></div>${canEdit() ? `<button class="btn ghost sm" data-a="delEvent" data-i="${i}" aria-label="מחיקה">✕</button>` : ""}</div>`).join("")}</div>` : `<div class="empty-state">אין אירועים</div>`}</section>
  <section><div class="sec-h"><h2>גיבוי</h2></div>
  ${APP_MODE === "local" ? `<p class="small muted" style="margin:0 0 8px">הנתונים שמורים רק במכשיר הזה. ${lastBackupText()}</p>` : ""}
  <div class="row">${true ? `<button class="btn primary" data-a="backupFile">שמירת גיבוי לקובץ</button>` : ""}<button class="btn" data-a="exportJson">העתקת גיבוי כטקסט</button>${canEdit() ? `<label class="btn" for="impFile" tabindex="0">שחזור מקובץ</label><input type="file" id="impFile" accept=".json,application/json,text/plain" hidden data-ch="impFile"><button class="btn" data-a="importAsk">שחזור מטקסט</button>` : ""}</div>
  ${APP_MODE === "local" && canEdit() ? `<div class="row" style="margin-top:14px"><button class="btn danger" data-a="resetAll">מחיקת כל הנתונים והתחלה מחדש</button></div>` : ""}</section>`;
}
