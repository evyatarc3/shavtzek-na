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
/* task */
function openTask(id){ DRAFT = id && S.tasks[id] ? JSON.parse(JSON.stringify(S.tasks[id])) : { name:"", kind:"guard", size:1, cmd:0, start:6, len:4, hours:24, count:6, days:[0,1,2,3,4,5,6], platoons:jointPl(), needs:[], weight:1, rest:settings().minRest, color:TASK_COLORS[Object.keys(S.tasks).length % TASK_COLORS.length] }; taskSheet(); }
const LEN_OPTS = [1,2,3,4,6,8,12,24];
function taskPreview(t){
  const s = taskShape(t), shifts = taskShiftsText(t);
  return `<div class="tp-need"><b class="num">${taskNeed(t)}</b><span>חיילים נדרשים ביום</span></div>
    <div class="small">${s.count === 1 ? "משמרת אחת" : s.count + " משמרות"}: <span class="ltr num">${shifts.join(" · ")}</span></div>
    <div class="small muted">${s.teams > 1 ? `${s.size} במשמרת × ${s.teams} צוותים מתחלפים, כדי שלכל אחד יהיו ${s.rest} ש׳ מנוחה` : `${s.size} במשמרת, אותו צוות לכל המשמרות`}</div>`;
}
function taskSheet(){
  const t = DRAFT, ed = canEdit() ? "" : " disabled", s = taskShape(t), end = (s.start + s.hours) % 24;
  const hrs = sel => Array.from({ length:24 }, (_, h) => `<option value="${h}"${h === sel ? " selected" : ""}>${hh(h)}</option>`).join("");
  openSheet(`<h3>${t.id ? esc(t.name) : "משימה חדשה"}</h3><div class="stack">
  <label class="fld"><span>שם המשימה</span><input id="tN" value="${esc(t.name)}" placeholder="ש״ג, סיור, כוננות…"${ed}></label>
  <div class="fgrid">
    <label class="fld"><span>חיילים במשמרת</span><input type="number" inputmode="numeric" min="1" max="40" id="tS" value="${s.size}" data-ch="tPrev"${ed}></label>
    <label class="fld"><span>מתוכם מפקדים</span><input type="number" inputmode="numeric" min="0" max="5" id="tC" value="${t.cmd || 0}"${ed}></label>
  </div>
  <div class="fgrid">
    <label class="fld"><span>פעילה מ-</span><select id="tSt" data-ch="tPrev"${ed}>${hrs(s.start)}</select></label>
    <label class="fld"><span>עד</span><select id="tEn" data-ch="tPrev"${ed}>${hrs(end)}</select></label>
    <label class="fld"><span>אורך משמרת</span><select id="tL" data-ch="tPrev"${ed}>${LEN_OPTS.map(n => `<option value="${n}"${s.len === n ? " selected" : ""}>${n} ש׳</option>`).join("")}</select></label>
  </div>
  <p class="small muted" style="margin:-4px 0 0">אותה שעה בהתחלה ובסוף = כל היממה.</p>
  <div id="tPrevBox" class="panel tprev">${taskPreview(t)}</div>
  <details><summary style="cursor:pointer;font-weight:600;padding:4px 0">הגדרות נוספות</summary><div class="stack" style="margin-top:10px">
    <div class="fgrid">
      <label class="fld"><span>סוג</span><select id="tK"${ed}><option value="guard"${t.kind === "guard" ? " selected" : ""}>שמירה</option><option value="mission"${t.kind !== "guard" ? " selected" : ""}>משימה</option></select></label>
      <label class="fld"><span>מנוחה אחרי (ש׳)</span><input type="number" min="0" max="24" id="tR" value="${s.rest}" data-ch="tPrev"${ed}></label>
      <label class="fld"><span>משקל עומס</span><select id="tW"${ed}>${[[1,"רגיל"],[1.5,"כבד"],[0.5,"קל"],[0.3,"כוננות/המתנה"]].map(([v,l]) => `<option value="${v}"${Number(t.weight ?? 1) === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    <label class="fld"><span>פק״לים נדרשים במשמרת (פק״ל:כמות)</span><input id="tNd" value="${esc((t.needs || []).map(n => n.tag + ":" + n.count).join(", "))}" placeholder="חובש:1, נגב:1"${ed}></label>
    <div class="small muted" style="margin-top:-4px">פק״לים קיימים: ${esc(pakalim().map(k => k.name).join(" · "))}</div>
    <div class="fld"><span>ימים</span><div class="checks">${WD.map((w,i) => `<label><input type="checkbox" name="tday" value="${i}"${(t.days || []).includes(i) ? " checked" : ""}${ed}>${w}</label>`).join("")}</div></div>
    <div class="fld"><span>מי מאייש</span><div class="checks">${allPlatoons().map(n => `<label><input type="checkbox" name="tpl" value="${n}"${(t.platoons || []).includes(n) ? " checked" : ""}${ed}>${esc(plName(n))}</label>`).join("")}</div></div>
    <div class="fld"><span>צבע</span><div class="checks">${TASK_COLORS.map(c => `<label><input type="radio" name="tcol" value="${c}"${t.color === c ? " checked" : ""}${ed}><span class="sw" style="background:${c}"></span></label>`).join("")}</div></div>
  </div></details>
  </div><div class="sheet-acts">${canEdit() ? `<button class="btn primary" data-a="saveTask">שמירה</button>${t.id ? delBtn("delTask") : ""}` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`);
}
function readTaskCore(t){
  const n = (id, d) => { const v = Number(val(id)); return Number.isFinite(v) && val(id) !== "" ? v : d; };
  t.size = Math.max(1, n("tS", t.size || 1)); t.start = n("tSt", t.start || 0); t.len = Math.max(1, n("tL", t.len || 8)); t.rest = n("tR", t.rest ?? settings().minRest);
  const en = n("tEn", (t.start + (t.hours || 24)) % 24); t.hours = ((en - t.start + 24) % 24) || 24; t.count = Math.ceil(t.hours / t.len);
  return t;
}
function updTaskPrev(){ const box = document.getElementById("tPrevBox"); if (box && DRAFT) box.innerHTML = taskPreview(readTaskCore(Object.assign({}, DRAFT))); }
function readTask(){
  const t = DRAFT; readTaskCore(t);
  t.name = val("tN"); t.kind = val("tK") || t.kind; t.cmd = Math.min(t.size, Number(val("tC")) || 0); t.weight = Number(val("tW")) || 1;
  t.needs = val("tNd").split(/[,،]/).map(s => s.trim()).filter(Boolean).map(s => { const [tag, c] = s.split(/[:×x*]/); return { tag: tag.trim(), count: Math.max(1, Number(c) || 1) }; }).filter(x => x.tag);
  t.days = checkedVals("tday").map(Number); t.platoons = checkedVals("tpl").map(Number); const col = checkedVals("tcol")[0]; if (col) t.color = col;
  t.example = false;
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
