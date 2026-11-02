"use strict";
/* ================= view: חוקת משימות (task rulebook) ================= */
/* One place for the rules the roster follows: general rest and caps, per-task rules
   (who may serve, required per shift, exempt people, fixed queue), and personal exemptions.
   The engine side lives in 02-engine.js: ruleReasons(), restAfter(), the caps and the queue in fillSlot(). */
const SCOPE_LBL = { all:"מכל המשימות", night:"ממשמרות לילה", task:"ממשימה" };
const rbNum = (id, def) => { const v = val(id); return v === "" ? def : Math.max(0, Number(v) || 0); };

function taskRuleBits(t){
  const w = t.who || {}, bits = [];
  bits.push(w.mode === "tags" ? `רק ${(w.tags || []).join(" / ") || "מוסמכים"}` : w.mode === "cmd" ? "רק מפקדים" : w.mode === "list" ? `${(w.list || []).length} מורשים` : "כל החיילים");
  const need = []; if (t.cmd) need.push(`${t.cmd} מפקד`); (t.needs || []).forEach(n => need.push(`${n.count} ${n.tag}`));
  if (need.length) bits.push("חובה: " + need.join(", "));
  bits.push(`מנוחה ${t.rest ?? settings().minRest} ש׳`);
  if (t.queue && t.queue.on) bits.push("תור קבוע");
  if ((t.exempt || []).length) bits.push(`${t.exempt.length} פטורים`);
  return bits;
}
function exemptionRows(){
  const out = [];
  for (const p of people()) (p.exempt || []).forEach((x, i) => out.push({ p, x, i }));
  return out;
}
function exemptText(x){
  const what = x.scope === "task" ? `ממשימה: ${(S.tasks[x.task] || {}).name || "?"}` : SCOPE_LBL[x.scope] || "";
  return `פטור ${what}${x.until ? ` · עד ${dm(x.until)}` : ""}${x.reason ? ` · ${x.reason}` : ""}`;
}
/* the next people in a fixed queue, as the engine will pick them */
function queueNext(t, n = 5){
  const c = cfg(), last = {}, order = (t.queue && t.queue.order) || [];
  for (const [d, r] of Object.entries(S.rosters)) (r.slots || []).forEach(sl => { if (sl.t !== t.id) return; const at = diffDays(c.lineStart, d) * 24 + sl.s; (sl.p || []).forEach(pid => { if (pid) last[pid] = Math.max(last[pid] ?? -1e9, at); }); });
  const idx = id => { const i = order.indexOf(id); return i < 0 ? order.length + 1 : i; };
  return order.filter(id => S.soldiers[id]).sort((a, b) => ((last[a] ?? -1e9) - (last[b] ?? -1e9)) || idx(a) - idx(b)).slice(0, n);
}
function vRulebook(){
  const s = settings(), ed = canEdit(), dis = ed ? "" : " disabled";
  const field = (id, label, v, hint) => `<label class="fld"><span>${label}</span><input type="number" min="0" max="48" id="${id}" value="${v || 0}"${dis}>${hint ? `<small class="muted">${hint}</small>` : ""}</label>`;
  const ex = exemptionRows(), R = Object.values(S.rules).filter(r => r.on !== false);
  let h = `<section class="panel stack">
    <div class="sec-h" style="margin:0"><h2>כללי לכל המשימות</h2></div>
    <div class="fgrid">
      ${field("rbMR", "מנוחה מינימלית בין משימות (ש׳)", s.minRest)}
      ${field("rbRN", "מנוחה אחרי משמרת לילה (ש׳)", s.restAfterNight, "0 = כמו מנוחה רגילה")}
      ${field("rbPD", "מקסימום משמרות ביום", s.maxPerDay, "0 = בלי הגבלה")}
      ${field("rbPW", "מקסימום משמרות בשבוע", s.maxPerWeek, "0 = בלי הגבלה")}
      ${field("rbNW", "מקסימום לילות בשבוע", s.maxNightsWeek, "0 = בלי הגבלה")}
      <label class="fld"><span>לילה (משעה עד שעה)</span><span class="row" style="gap:6px"><input type="number" min="0" max="23" id="rbNF" value="${s.nightFrom}" style="width:70px"${dis}><span>עד</span><input type="number" min="0" max="23" id="rbNT" value="${s.nightTo}" style="width:70px"${dis}></span></label>
    </div>
    ${ed ? `<div class="row"><button class="btn primary sm" data-a="rbSaveGeneral">שמירת הכללים</button></div>` : ""}
  </section>`;
  h += `<section><div class="sec-h"><h2>לכל משימה</h2><span class="aside">מי רשאי, מה חובה, פטורים ותור</span></div>
    ${tasksList().length ? `<div class="list">${tasksList().map(t => `<button class="li" data-a="taskRule" data-v="${t.id}"><span class="tbar" style="background:${esc(t.color || "var(--accent)")};height:34px"></span><div class="main"><div class="n">${esc(t.name)}</div><div class="s">${esc(taskRuleBits(t).join(" · "))}</div></div><span class="muted" aria-hidden="true">‹</span></button>`).join("")}</div>`
      : `<div class="empty-state">עוד אין משימות. מוסיפים אותן בעוד ← משימות.</div>`}
  </section>`;
  h += `<section><div class="sec-h"><h2>פטורים אישיים</h2><span class="aside">${ex.length}</span>${ed ? `<div class="end"><button class="btn ghost sm" data-a="exemptNew">+ פטור</button></div>` : ""}</div>
    ${ex.length ? `<div class="list">${ex.map(({ p, x, i }) => `<button class="li" data-a="exemptEdit" data-v="${p.id}" data-i="${i}"><div class="main"><div class="n">${esc(p.name)}</div><div class="s">${esc(exemptText(x))}</div></div><span class="muted" aria-hidden="true">‹</span></button>`).join("")}</div>`
      : `<p class="small muted" style="margin:0">אין פטורים. פטור מלילות, ממשימה מסוימת או מהכול, עם תאריך סיום אם צריך.</p>`}
  </section>`;
  h += `<section><div class="list"><button class="li" data-a="openMore" data-v="rules"><div class="main"><div class="n">אילוצים בין חיילים</div><div class="s">${R.length} · חייבים יחד, לא באותה משמרת, חובה במשימה ועוד</div></div><span class="muted" aria-hidden="true">‹</span></button></div></section>
  <div class="row"><button class="btn" data-a="rbCopy">העתקת החוקה לוואטסאפ</button></div>`;
  return h;
}
function rulebookText(){
  const s = settings(), L = [`חוקת משימות · ${plName(myPl())}`];
  L.push(`כללי: מנוחה ${s.minRest} ש׳${s.restAfterNight ? `, אחרי לילה ${s.restAfterNight} ש׳` : ""}${s.maxPerDay ? `, עד ${s.maxPerDay} משמרות ביום` : ""}${s.maxPerWeek ? `, עד ${s.maxPerWeek} בשבוע` : ""}${s.maxNightsWeek ? `, עד ${s.maxNightsWeek} לילות בשבוע` : ""}. לילה ${hh(s.nightFrom)}–${hh(s.nightTo)}.`);
  for (const t of tasksList()){
    let line = `• ${t.name}: ${taskRuleBits(t).join(" · ")}`;
    if ((t.exempt || []).length) line += ` (פטורים: ${t.exempt.map(nm).join(", ")})`;
    if (t.queue && t.queue.on) line += ` · הבאים בתור: ${queueNext(t, 4).map(nm).join(", ")}`;
    L.push(line);
  }
  const ex = exemptionRows();
  if (ex.length){ L.push("פטורים:"); ex.forEach(({ p, x }) => L.push(`• ${p.name}: ${exemptText(x)}`)); }
  return L.join("\n");
}

/* ---- per-task rules sheet ---- */
function taskPool(t){ return people().filter(p => (t.platoons || jointPl()).includes(p.platoon)); }
function openTaskRule(id){
  const t = S.tasks[id]; if (!t) return;
  DRAFT = { id, who: Object.assign({ mode:"all", tags:[], list:[] }, JSON.parse(JSON.stringify(t.who || {}))), exempt: (t.exempt || []).slice(), queue: Object.assign({ on:false, order:[] }, JSON.parse(JSON.stringify(t.queue || {}))),
    cmd: t.cmd || 0, needs: JSON.parse(JSON.stringify(t.needs || [])), rest: t.rest ?? settings().minRest };
  taskRuleSheet();
}
function readTaskRule(){
  if (!DRAFT || !document.getElementById("trRest")) return;
  const picks = name => [...document.querySelectorAll(`#sheetHost input[name="${name}"]:checked`)].map(x => x.value);
  if (document.querySelector('#sheetHost input[name="trTag"]')) DRAFT.who.tags = picks("trTag");
  if (document.querySelector('#sheetHost input[name="trList"]')) DRAFT.who.list = picks("trList");
  DRAFT.exempt = picks("trEx");
  DRAFT.cmd = rbNum("trCmd", 0); DRAFT.rest = rbNum("trRest", settings().minRest);
  DRAFT.needs = pakalim().map((k, i) => ({ tag:k.name, count: rbNum("trN" + i, 0) })).filter(n => n.count > 0)
    .concat((DRAFT.needs || []).filter(n => !pakalim().some(k => k.name === n.tag)));   // keep needs for tags that aren't in the פק״ל list
}
function taskRuleSheet(){
  const t = S.tasks[DRAFT.id], pool = taskPool(t), w = DRAFT.who, ed = canEdit(), dis = ed ? "" : " disabled";
  if (DRAFT.queue.on){ const ids = new Set(pool.map(p => p.id)); DRAFT.queue.order = DRAFT.queue.order.filter(id => ids.has(id)).concat(pool.map(p => p.id).filter(id => !DRAFT.queue.order.includes(id))); }
  const chip = (a, v, cur, l) => `<button class="kchip" data-a="${a}" data-v="${v}" aria-pressed="${cur === v}"${dis}>${l}</button>`;
  const box = (name, v, on, l) => `<label><input type="checkbox" name="${name}" value="${esc(v)}"${on ? " checked" : ""}${dis}>${esc(l)}</label>`;
  const needOf = tag => ((DRAFT.needs || []).find(n => n.tag === tag) || {}).count || 0;
  const nextUp = DRAFT.queue.on ? queueNext(Object.assign({}, t, { queue: DRAFT.queue }), 4) : [];
  openSheet(`<h3>חוקה · ${esc(t.name)}</h3><div class="stack">
    <div class="fld"><span>מי רשאי לשמור במשימה</span><div class="kchips">${chip("trWho", "all", w.mode || "all", "כל החיילים")}${chip("trWho", "tags", w.mode, "רק מוסמכים")}${chip("trWho", "cmd", w.mode, "רק מפקדים")}${chip("trWho", "list", w.mode, "רשימה קבועה")}</div></div>
    ${w.mode === "tags" ? `<div class="fld"><span>מוסמכים לפי פק״ל (מספיק אחד מהם)</span><div class="checks">${pakalim().map(k => box("trTag", k.name, (w.tags || []).includes(k.name), k.name)).join("")}</div></div>` : ""}
    ${w.mode === "list" ? `<div class="fld"><span>מי מורשה</span><div class="checks">${pool.map(p => box("trList", p.id, (w.list || []).includes(p.id), p.name)).join("")}</div></div>` : ""}
    <div class="fld"><span>חובה בכל משמרת</span><div class="fgrid">
      <label class="fld"><span>מפקדים</span><input type="number" min="0" max="9" id="trCmd" value="${DRAFT.cmd}"${dis}></label>
      ${pakalim().map((k, i) => `<label class="fld"><span>${esc(k.name)}</span><input type="number" min="0" max="9" id="trN${i}" value="${needOf(k.name)}"${dis}></label>`).join("")}
    </div></div>
    <label class="fld"><span>מנוחה אחרי המשימה (ש׳)</span><input type="number" min="0" max="48" id="trRest" value="${DRAFT.rest}"${dis}></label>
    <div class="fld"><span>פטורים מהמשימה</span><div class="checks">${pool.map(p => box("trEx", p.id, DRAFT.exempt.includes(p.id), p.name)).join("") || `<span class="small muted">אין חיילים במשימה</span>`}</div></div>
    <div class="fld"><span>סדר השיבוץ</span><div class="kchips">${chip("trQ", "off", DRAFT.queue.on ? "on" : "off", "אוטומטי, לפי עומס")}${chip("trQ", "on", DRAFT.queue.on ? "on" : "off", "תור קבוע")}</div>
      <small class="muted">${DRAFT.queue.on ? "התור ממשיך מאיפה שעצר. מי שדולג כי היה בחוץ או במנוחה נשאר ראשון כשהוא חוזר." : "השיבוץ מאזן שעות ולילות בין כולם."}</small></div>
    ${DRAFT.queue.on ? `<div class="fld"><span>סדר התור${nextUp.length ? ` · הבאים: ${esc(nextUp.map(nm).join(", "))}` : ""}</span>
      <div class="list">${DRAFT.queue.order.map((id, i) => `<div class="li" style="cursor:default;padding:6px 10px"><span class="num muted" style="min-width:22px">${i + 1}</span><div class="main"><div class="n">${esc(nm(id))}</div></div>${ed ? `<button class="btn ghost sm" data-a="trUp" data-i="${i}" aria-label="למעלה"${i ? "" : " disabled"}>↑</button><button class="btn ghost sm" data-a="trDown" data-i="${i}" aria-label="למטה"${i < DRAFT.queue.order.length - 1 ? "" : " disabled"}>↓</button>` : ""}</div>`).join("")}</div></div>` : ""}
  </div>
  <div class="sheet-acts">${ed ? `<button class="btn primary" data-a="trSave">שמירה</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`);
}
function saveTaskRule(){
  readTaskRule();
  const t = JSON.parse(JSON.stringify(S.tasks[DRAFT.id]));
  t.who = DRAFT.who.mode === "all" ? { mode:"all" } : DRAFT.who; t.exempt = DRAFT.exempt; t.queue = DRAFT.queue;
  t.cmd = DRAFT.cmd; t.needs = DRAFT.needs; t.rest = DRAFT.rest;
  if (t.who.mode === "tags" && !(t.who.tags || []).length) return toast("בחרו לפחות פק״ל אחד");
  if (t.who.mode === "list" && !(t.who.list || []).length) return toast("סמנו לפחות חייל אחד");
  put("tasks/" + t.id, t); closeSheet(); toast("החוקה נשמרה. השבצ״ק הבא ישובץ לפיה");
}

/* ---- personal exemptions ---- */
function openExempt(pid, i){
  const p = pid ? S.soldiers[pid] : null, x = p && i != null && i >= 0 ? (p.exempt || [])[i] : null;
  DRAFT = { pid: pid || "", i: x ? Number(i) : -1, scope: x ? x.scope : "night", task: x ? x.task || "" : "", until: x ? x.until || "" : "", reason: x ? x.reason || "" : "" };
  exemptSheet();
}
function readExempt(){ if (!DRAFT || !document.getElementById("exU")) return; DRAFT.pid = val("exP") || DRAFT.pid; DRAFT.task = val("exT"); DRAFT.until = val("exU"); DRAFT.reason = val("exR"); }
function exemptSheet(){
  const chip = v => `<button class="kchip" data-a="exScope" data-v="${v}" aria-pressed="${DRAFT.scope === v}">${SCOPE_LBL[v].replace(/^מ/, "")}</button>`;
  openSheet(`<h3>${DRAFT.i >= 0 ? "עריכת פטור" : "פטור חדש"}</h3><div class="stack">
    <label class="fld"><span>חייל</span><select id="exP"${DRAFT.i >= 0 ? " disabled" : ""}><option value="">בחירה…</option>${people().map(p => `<option value="${p.id}"${p.id === DRAFT.pid ? " selected" : ""}>${esc(p.name)} · ${esc(shortName(p.platoon))}</option>`).join("")}</select></label>
    <div class="fld"><span>פטור מ</span><div class="kchips">${chip("night")}${chip("task")}${chip("all")}</div></div>
    ${DRAFT.scope === "task" ? `<label class="fld"><span>משימה</span><select id="exT">${tasksList().map(t => `<option value="${t.id}"${t.id === DRAFT.task ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>` : `<input type="hidden" id="exT" value="">`}
    <div class="fgrid"><label class="fld"><span>עד תאריך (לא חובה)</span><input type="date" id="exU" value="${esc(DRAFT.until)}"></label>
    <label class="fld"><span>סיבה (לא חובה)</span><input id="exR" maxlength="60" value="${esc(DRAFT.reason)}" placeholder="למשל: גב, אישור רפואי"></label></div>
  </div><div class="sheet-acts"><button class="btn primary" data-a="exSave">שמירה</button>${DRAFT.i >= 0 ? `<button class="btn danger" data-a="exDel">מחיקה</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
}
function saveExempt(){
  readExempt();
  if (!DRAFT.pid) return toast("בחרו חייל");
  if (DRAFT.scope === "task" && !DRAFT.task) return toast("בחרו משימה");
  const x = { scope: DRAFT.scope }; if (DRAFT.scope === "task") x.task = DRAFT.task; if (DRAFT.until) x.until = DRAFT.until; if (DRAFT.reason) x.reason = DRAFT.reason;
  const i = DRAFT.i;
  updPerson(DRAFT.pid, p => { p.exempt = p.exempt || []; if (i >= 0) p.exempt[i] = x; else p.exempt.push(x); });
  closeSheet(); toast("הפטור נשמר");
}

Object.assign(ACT, {
  taskRule: v => openTaskRule(v),
  trWho: v => { readTaskRule(); DRAFT.who.mode = v; taskRuleSheet(); },
  trQ: v => { readTaskRule(); DRAFT.queue.on = v === "on"; taskRuleSheet(); },
  trUp: (v, el) => { readTaskRule(); const i = Number(el.dataset.i), o = DRAFT.queue.order; if (i > 0){ [o[i - 1], o[i]] = [o[i], o[i - 1]]; } taskRuleSheet(); },
  trDown: (v, el) => { readTaskRule(); const i = Number(el.dataset.i), o = DRAFT.queue.order; if (i < o.length - 1){ [o[i + 1], o[i]] = [o[i], o[i + 1]]; } taskRuleSheet(); },
  trSave: () => saveTaskRule(),
  rbSaveGeneral: () => {
    const s = settings();
    const next = Object.assign({}, (cfg().settings || {}), { minRest: rbNum("rbMR", s.minRest), restAfterNight: rbNum("rbRN", 0), maxPerDay: rbNum("rbPD", 0), maxPerWeek: rbNum("rbPW", 0), maxNightsWeek: rbNum("rbNW", 0), nightFrom: Math.min(23, rbNum("rbNF", s.nightFrom)), nightTo: Math.min(23, rbNum("rbNT", s.nightTo)) });
    saveCfg({ settings: next }); toast("הכללים נשמרו");
  },
  rbCopy: () => copyText(rulebookText()),
  exemptNew: v => openExempt(v || null, -1),
  exemptEdit: (v, el) => openExempt(v, Number(el.dataset.i)),
  exScope: v => { readExempt(); DRAFT.scope = v; exemptSheet(); },
  exSave: () => saveExempt(),
  exDel: () => { const { pid, i } = DRAFT; updPerson(pid, p => { p.exempt = (p.exempt || []).filter((_, j) => j !== i); }); closeSheet(); toast("הפטור נמחק"); },
});
