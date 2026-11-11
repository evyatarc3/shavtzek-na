"use strict";
/* ================= sheets & forms ================= */
let DRAFT = null;
function openSheet(html){ $("#sheetHost").innerHTML = `<div class="scrim" data-a="scrim"><div class="sheet" role="dialog" aria-modal="true" dir="rtl">${html}</div></div>`; const f = $("#sheetHost .sheet input, #sheetHost .sheet select"); if (f && window.matchMedia("(min-width:700px)").matches) f.focus(); }
function closeSheet(){ $("#sheetHost").innerHTML = ""; DRAFT = null; }
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
const chk = id => { const el = document.getElementById(id); return !!(el && el.checked); };
const checkedVals = name => [...document.querySelectorAll(`#sheetHost input[name="${name}"]:checked`)].map(e => e.value);
function allTags(){ const s = new Set(pakalim().map(k => k.name)); Object.values(S.soldiers).forEach(p => (p.tags || []).forEach(t => s.add(t))); Object.values(S.tasks).forEach(t => (t.needs || []).forEach(n => n.tag && s.add(n.tag))); return [...s]; }
function delBtn(a, extra = ""){ return `<button class="btn danger" data-a="${a}" ${extra}>מחיקה</button>`; }

/* person */
function openPerson(id){ DRAFT = id && S.soldiers[id] ? JSON.parse(JSON.stringify(S.soldiers[id])) : { name:"", platoon:myPl(), role:"soldier", tags:[], absences:[] }; personSheet(); }
function readPerson(){
  const p = DRAFT; p.name = val("fN"); p.platoon = Number(val("fP")) || 1; p.role = val("fR");
  p.tags = checkedVals("ftag"); val("fT2").split(/[,،]/).map(s => s.trim()).filter(Boolean).forEach(t => { if (!p.tags.includes(t)) p.tags.push(t); });
  p.from = val("fF") || null; p.to = val("fTo") || null; p.tentative = chk("fTe"); p.noAuto = chk("fNA"); p.note = val("fNo");
  p.absences = (p.absences || []).map((a, i) => ({ id: a.id || uid("a_"), kind: val("ak" + i) || "other", from: val("af" + i) || null, to: val("at" + i) || val("af" + i) || null, status: val("as" + i) || "fixed", reason: val("ar" + i) }));
  p.absences.forEach(a => { if (a.from && a.to && a.to < a.from){ const x = a.from; a.from = a.to; a.to = x; } });
}
function personSheet(){
  const p = DRAFT, ed = canEdit() ? "" : " disabled", tags = allTags();
  openSheet(`<h3>${p.id ? esc(p.name) : "חייל חדש"}</h3><div class="stack">
  <div class="fgrid"><label class="fld"><span>שם</span><input id="fN" value="${esc(p.name)}"${ed}></label>
  <label class="fld"><span>${TU()}</span><select id="fP"${ed}>${allPlatoons().map(n => `<option value="${n}"${p.platoon === n ? " selected" : ""}>${esc(plName(n))}</option>`).join("")}</select></label>
  <label class="fld"><span>תפקיד</span><select id="fR"${ed}>${Object.entries(roleNames()).map(([k,v]) => `<option value="${k}"${p.role === k ? " selected" : ""}>${v}</option>`).join("")}</select></label></div>
  <div class="fld"><span>פק״לים</span><div class="checks">${tags.map(t => `<label><input type="checkbox" name="ftag" value="${esc(t)}"${(p.tags||[]).includes(t) ? " checked" : ""}${ed}>${esc(t)}</label>`).join("")}</div>
  <input id="fT2" placeholder="פק״ל אחר (מופרדים בפסיק)" style="margin-top:6px"${ed}></div>
  <div class="fgrid"><label class="fld"><span>מגיע מ- (ריק = תחילת הקו)</span><input type="date" id="fF" value="${p.from || ""}"${ed}></label>
  <label class="fld"><span>עד (ריק = סוף הקו)</span><input type="date" id="fTo" value="${p.to || ""}"${ed}></label></div>
  <div class="checks"><label><input type="checkbox" id="fTe"${p.tentative ? " checked" : ""}${ed}>לא ודאי שמגיע (לא נספר)</label><label><input type="checkbox" id="fNA"${p.noAuto ? " checked" : ""}${ed}>לא לשבץ אוטומטית</label></div>
  <label class="fld"><span>הערה</span><input id="fNo" value="${esc(p.note || "")}"${ed}></label>
  ${p.id ? `<div class="fld"><span>פטורים</span><div class="row" style="gap:6px">${(p.exempt || []).map((x, i) => `<button class="chip" data-a="exemptEdit" data-v="${p.id}" data-i="${i}">${esc(exemptText(x))}</button>`).join("") || `<span class="small muted">אין</span>`}${canEdit() ? `<button class="btn ghost sm" data-a="exemptNew" data-v="${p.id}">+ פטור</button>` : ""}</div></div>` : ""}
  <div class="eyebrow" style="margin-top:6px">יציאות, טיסות ובקשות</div>
  ${(p.absences || []).map((a, i) => `<div class="panel" style="padding:10px"><div class="fgrid">
    <label class="fld"><span>סוג</span><select id="ak${i}"${ed}>${Object.entries(KIND).map(([k,v]) => `<option value="${k}"${a.kind === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="fld"><span>מ-</span><input type="date" id="af${i}" value="${a.from || ""}"${ed}></label>
    <label class="fld"><span>עד</span><input type="date" id="at${i}" value="${a.to || ""}"${ed}></label>
    <label class="fld"><span>סטטוס</span><select id="as${i}"${ed}><option value="fixed"${a.status !== "request" ? " selected" : ""}>מאושר / קבוע</option><option value="request"${a.status === "request" ? " selected" : ""}>בקשה</option></select></label></div>
    <div class="row" style="margin-top:8px"><input id="ar${i}" placeholder="סיבה" value="${esc(a.reason || "")}" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface2)"${ed}>${canEdit() ? `<button class="btn ghost sm" data-a="delAbsRow" data-i="${i}">הסרה</button>` : ""}</div>
    ${!a.from ? `<p class="small muted" style="margin:6px 0 0">בלי תאריכים: המערכת תמליץ על סופ״ש מתאים בלשונית תובנות.</p>` : ""}</div>`).join("")}
  ${canEdit() ? `<button class="btn sm" data-a="addAbsRow" style="align-self:flex-start">הוספת יציאה</button>` : ""}
  </div><div class="sheet-acts">${canEdit() ? `<button class="btn primary" data-a="savePerson">שמירה</button>${p.id ? delBtn("delPerson") : ""}` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`);
}
/* task: three kinds. Regular (shifts; soldiers, commanders and פק״לים per shift), company (one time slot, a part per
   platoon, each with its own numbers) and ghost (rides on other tasks: whoever holds them holds it too). */
const TASK_TPL = [
  { n:"ש״ג", t:{ kind:"guard", size:1, cmd:0, start:6, len:4, hours:24 } },
  { n:"סיור", t:{ kind:"mission", size:4, cmd:1, start:6, len:8, hours:24 } },
  { n:"תצפית", t:{ kind:"guard", size:2, cmd:0, start:0, len:4, hours:24 } },
  { n:"כרמל", mode:"ghost" },
  { n:"סריקה", t:{ kind:"mission", size:8, cmd:1, start:6, len:4, hours:4, needs:[{ tag:"חובש", count:1 }] }, once:true },
  { n:"פיצוץ מבנים", t:{ kind:"mission", size:6, cmd:1, start:7, len:6, hours:6 }, once:true },
  { n:"שס״מ", t:{ kind:"mission", size:2, cmd:0, start:6, len:8, hours:24 } },
  { n:"משימה פלוגתית", mode:"company", t:{ kind:"mission", start:6, len:4, hours:4 }, once:true },
];
const taskMode = t => t.ghost ? "ghost" : (t.parts && t.parts.length) ? "company" : "shifts";
function defaultDay(){ const d = UI.rosterDate && inLine(UI.rosterDate) ? UI.rosterDate : todayStr(); return inLine(d) ? d : (cfg() && cfg().lineStart) || todayStr(); }
const newPart = pl => ({ id: uid("pt_"), name:"", pl: pl || 0, size:4, cmd:1, needs:[] });
function openTask(id){
  DRAFT = id && S.tasks[id] ? JSON.parse(JSON.stringify(S.tasks[id])) : { name:"", kind:"guard", size:1, cmd:0, start:6, len:4, hours:24, count:6, days:[0,1,2,3,4,5,6], dates:[], platoons:jointPl(), needs:[], weight:1, rest:settings().minRest, color:TASK_COLORS[Object.keys(S.tasks).length % TASK_COLORS.length] };
  const t = DRAFT; t.mode = taskMode(t); t.dates = t.dates || []; t.when = t.dates.length ? "dates" : "days"; t.needs = t.needs || [];
  t.gh = t.ghost || { of:[], note:"" }; delete t.ghost; t.parts = (t.parts || []).map(x => Object.assign({ needs:[] }, x));
  if (!t.days || (!t.days.length && t.when === "days")) t.days = [0,1,2,3,4,5,6];
  taskSheet();
}
const LEN_OPTS = [1,2,3,4,6,8,12,24];
/* the draft as the engine would see it in its current kind (parts only for company, ghost only for ghost) */
const draftAs = t => Object.assign({}, t, { parts: t.mode === "company" ? t.parts : null, ghost: t.mode === "ghost" ? t.gh : null });
function taskPreview(t){
  if (t.mode === "ghost") return "";
  const s = taskShape(t), shifts = taskShiftsText(t), c = taskComp(t);
  const comp = `${c.size} חיילים${c.cmd ? `, ${c.cmd} מפקדים` : ""}${c.needs.length ? ", " + c.needs.map(n => `${n.count} ${n.tag}`).join(", ") : ""}`;
  return `<div class="tp-need"><b class="num">${taskNeed(t)}</b><span>חיילים נדרשים ביום</span></div>
    <div class="small">${s.count === 1 ? "משמרת אחת" : s.count + " משמרות"}: <span class="ltr num">${shifts.join(" · ")}</span></div>
    <div class="small muted">${t.mode === "company" ? `${comp} ב-${(t.parts || []).length} חלקים` : s.teams > 1 ? `${s.size} במשמרת × ${s.teams} צוותים מתחלפים, כדי שלכל אחד יהיו ${s.rest} ש׳ מנוחה` : `${s.size} במשמרת, אותו צוות לכל המשמרות`}${t.mode !== "company" && (c.cmd || c.needs.length) ? ` · בכל משמרת: ${comp}` : ""}</div>`;
}
function stepper(id, v, min, max, ed){
  return `<span class="stepper"><button type="button" class="btn" data-a="stp" data-v="${id}" data-d="-1" aria-label="פחות"${ed}>−</button><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${v}" data-ch="tPrev"${ed}><button type="button" class="btn" data-a="stp" data-v="${id}" data-d="1" aria-label="יותר"${ed}>+</button></span>`;
}
function pakChips(needs, act, i, ed){
  return `<div class="kchips">${allTags().map(tag => { const n = ((needs || []).find(x => x.tag === tag) || {}).count || 0;
    return `<button type="button" class="kchip" data-a="${act}" data-v="${esc(tag)}"${i != null ? ` data-i="${i}"` : ""} aria-pressed="${n > 0}"${ed}>${esc(tag)}${n ? ` ×${n}` : ""}</button>`; }).join("")}</div>`;
}
function taskSheet(){
  const t = DRAFT, ed = canEdit() ? "" : " disabled", s = taskShape(draftAs(t)), end = (s.start + s.hours) % 24, mode = t.mode;
  const hrs = sel => Array.from({ length:24 }, (_, h) => `<option value="${h}"${h === sel ? " selected" : ""}>${hh(h)}</option>`).join("");
  const seg = (a, v, cur, l) => `<button type="button" data-a="${a}" data-v="${v}" aria-pressed="${cur === v}"${ed}>${l}</button>`;
  const hint = { shifts:"משמרות קבועות: כמה חיילים, מפקדים ופק״לים בכל משמרת.", company:`משימה אחת שמתחלקת בין ה${TUS()}: לכל חלק ${TU()}, כמות, מפקדים ופק״לים משלו.`, ghost:"צמודה למשימה אחרת: מי שתופס אותה תופס גם את זו. בלי חיילים נוספים ובלי עומס נוסף." }[mode];
  let h = `<h3>${t.id ? esc(t.name) : "משימה חדשה"}</h3><div class="stack">`;
  if (!t.id && canEdit()) h += `<div class="fld"><span>התחלה מהירה</span><div class="kchips">${TASK_TPL.map((x, i) => `<button type="button" class="kchip" data-a="tTpl" data-v="${i}">${esc(x.n)}</button>`).join("")}</div></div>`;
  h += `<label class="fld"><span>שם המשימה</span><input id="tN" value="${esc(t.name)}" placeholder="ש״ג, סיור, סריקה…"${ed}></label>
  <div class="fld"><span>סוג</span><div class="seg" role="group" aria-label="סוג משימה">${seg("tMode", "shifts", mode, "משמרות")}${seg("tMode", "company", mode, "פלוגתית")}${seg("tMode", "ghost", mode, "רפאים")}</div><small class="muted">${hint}</small></div>`;
  if (mode === "ghost"){
    const hosts = tasksList().filter(x => !isGhost(x) && x.id !== t.id);
    const sample = ghostLine({ name: t.name || "…", ghost:{ of: t.gh.of, note:"" } });
    h += `<div class="fld"><span>צמודה ל-</span><div class="checks">${hosts.map(x => `<label><input type="checkbox" name="tgh" value="${x.id}"${(t.gh.of || []).includes(x.id) ? " checked" : ""}${ed}>${esc(x.name)}</label>`).join("") || `<span class="small muted">קודם מגדירים את המשימה שהיא צמודה אליה</span>`}</div></div>
    <label class="fld"><span>משפט להודעת הוואטסאפ</span><input id="tGn" value="${esc(t.gh.note || "")}" placeholder="${esc(sample)}"${ed}></label>
    <small class="muted" style="margin-top:-6px">ריק = "${esc(sample)}"</small>`;
  } else {
    if (mode === "shifts") h += `<div class="fgrid">
      <div class="fld"><span>חיילים במשמרת</span>${stepper("tS", s.size, 1, 40, ed)}</div>
      <div class="fld"><span>מתוכם מפקדים</span>${stepper("tC", t.cmd || 0, 0, 9, ed)}</div></div>
      <div class="fld"><span>פק״לים בכל משמרת</span>${pakChips(t.needs, "tPak", null, ed)}<small class="muted">לחיצה מוסיפה אחד (עד 4), ואז חוזר לאפס.</small></div>`;
    else h += `<div class="fld"><span>החלקים</span><div class="stack">${(t.parts || []).map((pt, i) => `<div class="panel part-ed">
        <div class="inrow"><select id="tpPl${i}" aria-label="${TU()}"${ed}>${[0, ...allPlatoons()].map(n => `<option value="${n}"${Number(pt.pl) === n ? " selected" : ""}>${n ? esc(plName(n)) : "כל " + esc(TUS())}</option>`).join("")}</select>
        <input id="tpN${i}" value="${esc(pt.name || "")}" placeholder="מה עושים: ציר צפוני, אבטחה…" style="flex:1;min-width:0"${ed}>${canEdit() ? `<button type="button" class="btn ghost sm" data-a="tPartDel" data-i="${i}" aria-label="הסרת החלק">✕</button>` : ""}</div>
        <div class="fgrid"><div class="fld"><span>חיילים</span>${stepper("tpS" + i, pt.size, 1, 60, ed)}</div><div class="fld"><span>מתוכם מפקדים</span>${stepper("tpC" + i, pt.cmd || 0, 0, 9, ed)}</div></div>
        <div class="fld"><span>פק״לים</span>${pakChips(pt.needs, "tPartPak", i, ed)}</div></div>`).join("")}
      ${canEdit() ? `<button type="button" class="btn sm" data-a="tPartAdd" style="align-self:flex-start">+ חלק</button>` : ""}</div></div>`;
    h += `<div class="fgrid">
      <label class="fld"><span>${mode === "company" ? "מ-" : "פעילה מ-"}</span><select id="tSt" data-ch="tPrev"${ed}>${hrs(s.start)}</select></label>
      <label class="fld"><span>עד</span><select id="tEn" data-ch="tPrev"${ed}>${hrs(end)}</select></label>
      ${mode === "shifts" ? `<label class="fld"><span>אורך משמרת</span><select id="tL" data-ch="tPrev"${ed}>${LEN_OPTS.map(n => `<option value="${n}"${s.len === n ? " selected" : ""}>${n} ש׳</option>`).join("")}</select></label>` : ""}
    </div>
    <div class="fld"><span>מתי</span><div class="seg" role="group" aria-label="מתי">${seg("tWhen", "days", t.when, "קבוע בימים")}${seg("tWhen", "dates", t.when, "בתאריכים מסוימים")}</div></div>
    ${t.when === "dates" ? `<div class="stack" style="gap:6px">${t.dates.map((d, i) => `<div class="inrow"><input type="date" id="tDt${i}" value="${d}" style="flex:1;min-width:0"${ed}>${canEdit() ? `<button type="button" class="btn ghost sm" data-a="tDateDel" data-i="${i}" aria-label="הסרת התאריך">✕</button>` : ""}</div>`).join("")}${canEdit() ? `<button type="button" class="btn sm" data-a="tDateAdd" style="align-self:flex-start">+ תאריך</button>` : ""}</div>`
      : `<div class="checks">${WD.map((w,i) => `<label><input type="checkbox" name="tday" value="${i}"${(t.days || []).includes(i) ? " checked" : ""}${ed}>${w}</label>`).join("")}</div>`}
    <div id="tPrevBox" class="panel tprev">${taskPreview(draftAs(t))}</div>`;
  }
  h += `<details><summary style="cursor:pointer;font-weight:600;padding:4px 0">הגדרות נוספות</summary><div class="stack" style="margin-top:10px">
    ${mode !== "ghost" ? `<div class="fgrid">
      <label class="fld"><span>סוג</span><select id="tK"${ed}><option value="guard"${t.kind === "guard" ? " selected" : ""}>שמירה</option><option value="mission"${t.kind !== "guard" ? " selected" : ""}>משימה</option></select></label>
      <label class="fld"><span>מנוחה אחרי (ש׳)</span><input type="number" min="0" max="24" id="tR" value="${s.rest}" data-ch="tPrev"${ed}></label>
      <label class="fld"><span>משקל עומס</span><select id="tW"${ed}>${[[1,"רגיל"],[1.5,"כבד"],[0.5,"קל"],[0.3,"כוננות/המתנה"]].map(([v,l]) => `<option value="${v}"${Number(t.weight ?? 1) === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>` : ""}
    ${mode === "shifts" ? `<div class="fld"><span>מי מאייש</span><div class="checks">${allPlatoons().map(n => `<label><input type="checkbox" name="tpl" value="${n}"${(t.platoons || []).includes(n) ? " checked" : ""}${ed}>${esc(plName(n))}</label>`).join("")}</div></div>` : ""}
    <div class="fld"><span>צבע</span><div class="checks">${TASK_COLORS.map(c => `<label><input type="radio" name="tcol" value="${c}"${t.color === c ? " checked" : ""}${ed}><span class="sw" style="background:${c}"></span></label>`).join("")}</div></div>
    ${mode !== "ghost" ? `<small class="muted">מי מוסמך, פטורים ותור קבוע: בעוד ← חוקת משימות.</small>` : ""}
  </div></details>
  </div><div class="sheet-acts">${canEdit() ? `<button class="btn primary" data-a="saveTask">שמירה</button>${t.id ? delBtn("delTask") : ""}` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`;
  openSheet(h);
}
/* read whatever fields the sheet shows into DRAFT */
function syncTask(){
  const t = DRAFT; if (!t) return t;
  const has = id => !!document.getElementById(id), num = (id, d) => { const v = Number(val(id)); return has(id) && val(id) !== "" && Number.isFinite(v) ? v : d; };
  if (has("tN")) t.name = val("tN");
  if (has("tS")) t.size = Math.max(1, num("tS", t.size || 1));
  if (has("tC")) t.cmd = Math.max(0, num("tC", t.cmd || 0));
  if (has("tSt")){ t.start = num("tSt", t.start || 0); const en = num("tEn", (t.start + (t.hours || 24)) % 24); t.hours = ((en - t.start + 24) % 24) || 24; }
  if (has("tL")) t.len = Math.max(1, num("tL", t.len || 8));
  if (t.mode === "company") t.len = t.hours || t.len;
  t.count = Math.ceil((t.hours || 24) / (t.len || 8));
  if (has("tR")) t.rest = num("tR", t.rest ?? settings().minRest);
  if (has("tK")) t.kind = val("tK") || t.kind;
  if (has("tW")) t.weight = Number(val("tW")) || 1;
  if (document.querySelector('#sheetHost input[name="tday"]')) t.days = checkedVals("tday").map(Number);
  if (document.querySelector('#sheetHost input[name="tpl"]')) t.platoons = checkedVals("tpl").map(Number);
  const col = checkedVals("tcol")[0]; if (col) t.color = col;
  t.dates = (t.dates || []).map((x, i) => has("tDt" + i) ? val("tDt" + i) : x);
  if (document.querySelector('#sheetHost input[name="tgh"]')) t.gh.of = checkedVals("tgh");
  if (has("tGn")) t.gh.note = val("tGn");
  (t.parts || []).forEach((pt, i) => { if (!has("tpS" + i)) return; pt.pl = Number(val("tpPl" + i)) || 0; pt.name = val("tpN" + i); pt.size = Math.max(1, num("tpS" + i, pt.size)); pt.cmd = Math.max(0, num("tpC" + i, pt.cmd || 0)); });
  return t;
}
/* redraw the sheet from DRAFT (callers read the fields first with syncTask, then change DRAFT) */
function reTask(){ const a = $("#sheetHost .sheet"), y = a ? a.scrollTop : 0; taskSheet(); const b = $("#sheetHost .sheet"); if (b) b.scrollTop = y; }
function updTaskPrev(){ const box = document.getElementById("tPrevBox"); if (box && DRAFT) box.innerHTML = taskPreview(draftAs(syncTask())); }
function applyTaskTpl(i){
  syncTask(); const tp = TASK_TPL[i], t = DRAFT; if (!tp) return;
  t.name = tp.n; t.mode = tp.mode || "shifts";
  if (tp.t) Object.assign(t, { needs:[], cmd:0, size:1 }, JSON.parse(JSON.stringify(tp.t)));
  if (t.mode === "ghost"){ const gate = tasksList().find(x => !isGhost(x) && /^ש.?ג$/.test(String(x.name).replace(/\s/g, ""))); t.gh = { of: gate ? [gate.id] : [], note:"" }; }
  if (t.mode === "company" && !(t.parts || []).length) t.parts = allPlatoons().map(pl => newPart(pl));
  if (tp.once){ t.when = "dates"; if (!t.dates.filter(Boolean).length) t.dates = [defaultDay()]; } else t.when = "days";
  reTask();
}
const cycleNeed = (needs, tag) => { const x = needs.find(n => n.tag === tag); if (!x) needs.push({ tag, count:1 }); else if (x.count >= 4) needs.splice(needs.indexOf(x), 1); else x.count++; };
/* checks, then shapes the record for saving. Returns an error text, or null */
function finishTask(){
  const t = syncTask(), mode = t.mode, dates = [...new Set((t.dates || []).filter(Boolean))].sort();
  if (!(t.name || "").trim()) return "חסר שם משימה";
  if (mode === "ghost" && !(t.gh.of || []).length) return "בחרו לאיזו משימה היא צמודה";
  if (mode !== "ghost" && t.when === "dates" && !dates.length) return "בחרו תאריך";
  if (mode !== "ghost" && t.when !== "dates" && !(t.days || []).length) return "בחרו לפחות יום אחד";
  if (mode === "company" && !(t.parts || []).length) return "הוסיפו לפחות חלק אחד";
  if (mode === "shifts" && !(t.platoons || []).length) return "בחרו מי מאייש";
  t.name = t.name.trim();
  if (mode === "ghost"){ t.ghost = { of: t.gh.of, note: (t.gh.note || "").trim() }; t.days = []; t.dates = []; delete t.parts; t.size = 0; t.cmd = 0; t.needs = []; }
  else {
    delete t.ghost;
    if (t.when === "dates"){ t.dates = dates; t.days = []; } else t.dates = [];
    if (mode === "company"){
      t.parts.forEach(pt => { pt.cmd = Math.min(pt.cmd || 0, pt.size); pt.needs = (pt.needs || []).filter(n => n.count > 0); });
      const c = taskComp(t); t.size = c.size; t.cmd = c.cmd; t.needs = []; t.platoons = taskPlatoons(t);   // totals for older app versions
    } else { delete t.parts; t.cmd = Math.min(t.cmd || 0, t.size); }
  }
  delete t.mode; delete t.when; delete t.gh; t.example = false;
  return null;
}
/* after saving: offer to put the task into the roster right away */
function afterTaskSave(t){
  if (isGhost(t) || !canEdit()) return toast(isGhost(t) ? "נשמרה. היא תופיע בשבצ״ק ובהודעה" : "המשימה נשמרה");
  const duty = lineDays().filter(d => dayState(d) === "duty" && taskActive(t, d));
  if (!duty.length) return toast("המשימה נשמרה");
  const today = todayStr(), pref = UI.rosterDate && duty.includes(UI.rosterDate) ? UI.rosterDate : (duty.find(d => d >= today) || duty[0]);
  const blk = blockDutyDays(pref).filter(d => taskActive(t, d) && d >= today);
  openSheet(`<h3>${esc(t.name)} נשמרה</h3><p style="margin-top:0">לשבץ אותה עכשיו? שיבוצים שנעשו ידנית נשמרים, וכל השאר מסתדר מחדש סביב המשימה.</p>
    <div class="sheet-acts"><button class="btn primary" data-a="genGo" data-v="${pref}">שיבוץ ל${WDL[dow(pref)]} ${dm(pref)}</button>${blk.length > 1 ? `<button class="btn" data-a="genGo" data-v="${blk.join(",")}">כל הסבב (${blk.length} ימים)</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">אחר כך</button></div>`);
}
/* rule */
function openRule(id){ DRAFT = id && S.rules[id] ? JSON.parse(JSON.stringify(S.rules[id])) : { type:"notBothOut", a:[], on:true, n:1, platoon:myPl() }; ruleSheet(); }
function readRule(){ const r = DRAFT; r.type = val("rT") || r.type; r.a = checkedVals("ra"); r.task = val("rTask") || null; r.n = Number(val("rN")) || 1; r.platoon = Number(val("rP")) || myPl(); r.note = val("rNo"); r.on = !chk("rOff"); }
function ruleSheet(){
  const r = DRAFT, f = (RULE_TYPES[r.type] || RULE_TYPES.apart).f, ed = canEdit() ? "" : " disabled";
  const groups = {}; people().forEach(p => (groups[p.platoon] = groups[p.platoon] || []).push(p));
  openSheet(`<h3>${r.id ? "עריכת אילוץ" : "אילוץ חדש"}</h3><div class="stack">
  <label class="fld"><span>סוג</span><select id="rT" data-ch="ruleType"${ed}>${Object.entries(RULE_TYPES).map(([k,v]) => `<option value="${k}"${r.type === k ? " selected" : ""}>${v.l}</option>`).join("")}</select></label>
  <p class="small muted" style="margin:0">${esc((RULE_TYPES[r.type] || {}).h || "")}</p>
  ${f.includes("task") ? `<label class="fld"><span>משימה</span><select id="rTask"${ed}>${tasksList().map(t => `<option value="${t.id}"${r.task === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>` : ""}
  ${f.includes("n") ? `<label class="fld"><span>${r.type === "minPresent" ? "מינימום נוכחים" : "מקסימום משמרות ביום"}</span><input type="number" min="0" id="rN" value="${r.n || 1}"${ed}></label>` : ""}
  ${f.includes("platoon") ? `<label class="fld"><span>${TU()}</span><select id="rP"${ed}>${allPlatoons().map(n => `<option value="${n}"${Number(r.platoon) === n ? " selected" : ""}>${esc(plName(n))}</option>`).join("")}</select></label>` : ""}
  ${f.includes("a") ? Object.keys(groups).sort().map(pl => `<div class="fld"><span>${esc(plName(pl))}</span><div class="checks">${groups[pl].map(p => `<label><input type="checkbox" name="ra" value="${p.id}"${(r.a || []).includes(p.id) ? " checked" : ""}${ed}>${esc(p.name)}</label>`).join("")}</div></div>`).join("") : ""}
  <label class="fld"><span>הערה</span><input id="rNo" value="${esc(r.note || "")}"${ed}></label>
  <div class="checks"><label><input type="checkbox" id="rOff"${r.on === false ? " checked" : ""}${ed}>כבוי זמנית</label></div>
  </div><div class="sheet-acts">${canEdit() ? `<button class="btn primary" data-a="saveRule">שמירה</button>${r.id ? delBtn("delRule") : ""}` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`);
}
/* one cell of the matrix */
function openCell(pid, d){
  const p = S.soldiers[pid]; if (!p) return; const st = personStatus(p, d), a = absOn(p, d);
  const stTxt = { in:"בפנים", home:"בבית (סבב)", abs:"ביציאה", req:"ביקש לצאת", tent:"לא ודאי", out:"לא בקו" }[st];
  let body = `<h3>${esc(p.name)} · ${dmw(d)}</h3><p class="small muted">${stTxt}${a ? ` · ${KIND[a.kind]} ${dm(a.from)}–${dm(a.to)}${a.reason ? " · " + esc(a.reason) : ""}` : ""}</p>`;
  if (!canEdit()) return openSheet(body + `<div class="sheet-acts"><button class="btn" data-a="closeSheet">סגירה</button></div>`);
  if (a) body += `<div class="sheet-acts"><button class="btn danger" data-a="delAbs" data-pid="${pid}" data-aid="${a.id}">ביטול היציאה</button><button class="btn" data-a="editPerson" data-v="${pid}">עריכה מלאה</button><span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`;
  else body += `<div class="stack"><div class="fgrid"><label class="fld"><span>סוג</span><select id="qK">${Object.entries(KIND).map(([k,v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
    <label class="fld"><span>מ-</span><input type="date" id="qF" value="${d}"></label><label class="fld"><span>עד</span><input type="date" id="qT" value="${d}"></label>
    <label class="fld"><span>סטטוס</span><select id="qS"><option value="fixed">מאושר</option><option value="request">בקשה</option></select></label></div>
    <label class="fld"><span>סיבה</span><input id="qR"></label></div>
    <div class="sheet-acts"><button class="btn primary" data-a="saveCellAbs" data-pid="${pid}">סימון יציאה</button><span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`;
  openSheet(body);
}
