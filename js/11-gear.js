"use strict";
/* ================= view: gear (צל״ם) ================= */
const GEAR_DEF = ["נשק","רומיאו","ליאור","טריג׳","אמר״ל","אולר","משקפת","מצפן"];
const GEAR_LBL = { none:"לא חתום", ok:"חתום", bad:"תקלה / חסר" };
UI.gearQuick = UI.gearQuick || false;
function gearItems(){ const g = cfg() && cfg().gearItems; return Array.isArray(g) && g.length ? g : GEAR_DEF.map((n, i) => ({ id:"g" + i, name:n })); }
function gearOf(p, gid){ return (p && p.gear && p.gear[gid]) || null; }
function gearState(e){ return !e ? "none" : e.st === "bad" ? "bad" : e.st === "ok" ? "ok" : "none"; }
function gearPeople(){ return people().filter(p => p.platoon === myPl()); }
function vGear(){
  const items = gearItems(), ppl = gearPeople();
  if (!ppl.length) return `<div class="empty-state"><b>אין חיילים ב${esc(plName(myPl()))}</b>הוסיפו חיילים בלשונית ניהול.</div>`;
  const tot = items.map(it => ({ it, ok: ppl.filter(p => gearState(gearOf(p, it.id)) === "ok").length, bad: ppl.filter(p => gearState(gearOf(p, it.id)) === "bad").length }));
  const all = ppl.length * items.length, done = tot.reduce((a, t) => a + t.ok, 0), bad = tot.reduce((a, t) => a + t.bad, 0);
  let h = `<section><div class="sec-h"><h2>צל״ם · ${esc(plName(myPl()))}</h2><span class="aside">${done} מתוך ${all} חתומים${bad ? ` · ${bad} תקלות` : ""}</span>
    <div class="end"><button class="btn sm" data-a="copyGear">העתק חוסרים</button>${canEdit() ? `<button class="btn sm" data-a="editGearItems">עריכת פריטים</button><button class="btn sm primary" data-a="editPerson">הוספת חייל</button>` : ""}</div></div>
    <div class="row" style="margin-bottom:10px">${tot.map(t => `<span class="pill ${t.ok === ppl.length ? "ok" : t.bad ? "crit" : ""}">${esc(t.it.name)} <span class="num">${t.ok}/${ppl.length}</span></span>`).join("")}</div>
    ${canEdit() ? `<div class="row" style="margin-bottom:10px"><div class="seg" role="group" aria-label="מצב עריכה"><button data-a="gearQuick" data-v="0" aria-pressed="${!UI.gearQuick}">עריכה מלאה</button><button data-a="gearQuick" data-v="1" aria-pressed="${UI.gearQuick}">סימון מהיר</button></div><span class="small muted">${UI.gearQuick ? "כל לחיצה מחליפה: לא חתום ← חתום ← תקלה" : "לחיצה פותחת מספר צ׳ והערה · לחיצה על כותרת מסמנת עמודה"}</span></div>` : ""}
    <div class="mx-wrap" id="gxw"><table class="gx"><thead><tr><th class="nm">שם</th>${items.map(it => `<th><button class="gh" data-a="gearCol" data-v="${it.id}">${esc(it.name)}</button></th>`).join("")}<th style="padding:8px 10px">סה״כ</th></tr></thead><tbody>`;
  for (const p of ppl){
    const n = items.filter(it => gearState(gearOf(p, it.id)) === "ok").length;
    h += `<tr><th class="nm" scope="row"><button class="gh" style="text-align:start;padding:8px 0;font-size:13px" data-a="editPerson" data-v="${p.id}">${esc(p.name)}${isCmd(p) ? ` <span class="pill cmd" style="padding:0 5px">מ׳</span>` : ""}</button></th>`;
    for (const it of items){
      const e = gearOf(p, it.id), s = gearState(e);
      h += `<td class="g-${s}"><button class="gcell" data-a="gearCell" data-pid="${p.id}" data-v="${it.id}" aria-label="${esc(p.name)} · ${esc(it.name)} · ${GEAR_LBL[s]}" title="${esc(e && e.note ? e.note : GEAR_LBL[s])}"><span class="ic">${s === "ok" ? "✓" : s === "bad" ? "!" : "—"}</span>${e && e.sn ? `<span class="sn">${esc(e.sn)}</span>` : ""}</button></td>`;
    }
    h += `<td class="cnt" style="color:var(--${n === items.length ? "ok" : "muted"})">${n}/${items.length}</td></tr>`;
  }
  h += `</tbody><tfoot><tr><td class="nm">חתומים</td>${tot.map(t => `<td>${t.ok}/${ppl.length}</td>`).join("")}<td>${done}/${all}</td></tr></tfoot></table></div>
    <p class="small muted">✓ חתום · ! תקלה או חסר · — לא חתום</p></section>`;
  return h;
}
function openGear(pid, gid){
  const p = S.soldiers[pid], it = gearItems().find(i => i.id === gid); if (!p || !it) return;
  const e = gearOf(p, gid) || {}, s = gearState(e), ed = canEdit() ? "" : " disabled";
  openSheet(`<h3>${esc(it.name)} · ${esc(p.name)}</h3><div class="stack">
    <div class="fld"><span>סטטוס</span><div class="checks">${Object.entries(GEAR_LBL).map(([k, l]) => `<label><input type="radio" name="gst" value="${k}"${s === k ? " checked" : ""}${ed}>${l}</label>`).join("")}</div></div>
    <div class="fgrid"><label class="fld"><span>מספר צ׳ (מילוי מסמן כחתום)</span><input id="gSn" class="mono" dir="ltr" value="${esc(e.sn || "")}"${ed}></label>
    <label class="fld"><span>הערה</span><input id="gNo" value="${esc(e.note || "")}"${ed}></label></div>
    ${e.at ? `<p class="small muted" style="margin:0">עודכן ב-${dm(e.at)}</p>` : ""}
  </div><div class="sheet-acts">${canEdit() ? `<button class="btn primary" data-a="saveGear" data-pid="${pid}" data-v="${gid}">שמירה</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`);
}
function setGear(pid, gid, st, sn, note){
  updPerson(pid, p => {
    p.gear = p.gear || {};
    if (st === "none" && !sn && !note) delete p.gear[gid];
    else p.gear[gid] = { st, sn: sn || "", note: note || "", at: todayStr() };
  });
}
function openGearCol(gid){
  const it = gearItems().find(i => i.id === gid); if (!it) return;
  const ppl = gearPeople(), notOk = ppl.filter(p => gearState(gearOf(p, gid)) !== "ok");
  openSheet(`<h3>${esc(it.name)}</h3><p class="small muted">${ppl.length - notOk.length} מתוך ${ppl.length} חתומים.${notOk.length ? ` לא חתומים: ${esc(notOk.map(p => p.name).join(", "))}` : ""}</p>
  <div class="sheet-acts">${canEdit() && notOk.length ? `<button class="btn primary" data-a="gearColOk" data-v="${gid}">סמן את כל ${notOk.length} כחתומים</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`);
}
function gearText(){
  const items = gearItems(), ppl = gearPeople(); let s = `*צל״ם ${plName(myPl())} · חוסרים*\n`, any = false;
  for (const it of items){
    const miss = ppl.filter(p => gearState(gearOf(p, it.id)) !== "ok");
    if (miss.length){ any = true; s += `\n*${it.name}* (${miss.length}): ${miss.map(p => p.name + (gearState(gearOf(p, it.id)) === "bad" ? " (!)" : "")).join(", ")}`; }
  }
  return any ? s : s + "\nאין חוסרים, הכול חתום";
}
function openGearItems(){ DRAFT = { items: JSON.parse(JSON.stringify(gearItems())) }; gearItemsSheet(); }
function readGearItems(){ DRAFT.items = DRAFT.items.map((it, i) => ({ id: it.id, name: val("gi" + i) })); }
/* ================= פק״לים view ================= */
UI.gearSeg = UI.gearSeg || "gear";
function vGearTab(ctx){
  return `<div class="seg" role="group" aria-label="תצוגה" style="margin-bottom:12px"><button data-a="gearSeg" data-v="gear" aria-pressed="${UI.gearSeg !== "pk"}">ציוד</button><button data-a="gearSeg" data-v="pk" aria-pressed="${UI.gearSeg === "pk"}">פק״לים</button></div>`
    + (UI.gearSeg === "pk" ? vPakal(ctx) : vGear(ctx));
}
function vPakal(ctx){
  const list = pakalim(), pl = UI.pkPl || myPl(), ppl = people().filter(p => p.platoon === pl);
  const fdy = focusDay(ctx), x = fdy ? ctx.map[fdy] : null;
  let h = `<section><div class="sec-h"><h2>פק״לים</h2><span class="aside">${canEdit() ? "לחיצה מסמנת או מורידה" : ""}</span>
    <div class="end"><button class="btn sm" data-a="copyPakal">העתק רשימה</button>${canEdit() ? `<button class="btn sm" data-a="editPakal">עריכת פק״לים</button><button class="btn sm primary" data-a="editPerson">הוספת חייל</button>` : ""}</div></div>
    <div class="chips" style="margin-bottom:10px">${list.map(k => { const tot = pakalHolders(k.name).filter(p => jointPl().includes(p.platoon)).length, n = x ? (x.tagSup[k.name] || 0) : 0, short = (k.min || 0) > 0 && n < k.min;
      return `<span class="pill ${short ? "crit" : tot ? "ok" : ""}" title="${tot} מחזיקים ב-${JL()} · ${n} בפנים ב-${fdy ? dm(fdy) : ""}${k.min ? ` · מינימום ${k.min}` : ""}">${esc(k.name)} <span class="num">${tot}</span>${k.min ? ` <span class="num" style="opacity:.75">(${n}/${k.min})</span>` : ""}</span>`; }).join("")}</div>
    <p class="small muted" style="margin:0 0 10px">המספר = כמה מחזיקים ב-${JL()}. בסוגריים: כמה בפנים ב-${fdy ? dm(fdy) : "יום ה" + TD() + " הבא"} מול המינימום שהגדרת.</p>
    <div class="seg" role="group" aria-label="${TU()}" style="margin-bottom:10px">${jointPl().filter(n => people().some(p => p.platoon === n)).map(n => `<button data-a="pkPl" data-v="${n}" aria-pressed="${pl === n}">${esc(plName(n))}</button>`).join("")}</div>
    <div class="mx-wrap" id="gxw"><table class="gx"><thead><tr><th class="nm">שם</th>${list.map(k => `<th style="padding:8px 6px">${esc(k.name)}</th>`).join("")}</tr></thead><tbody>`;
  for (const p of ppl){
    h += `<tr><th class="nm" scope="row"><button class="gh" style="text-align:start;padding:8px 0;font-size:13px" data-a="editPerson" data-v="${p.id}">${esc(p.name)}</button></th>`;
    for (const k of list){ const has = hasTag(p, k.name);
      h += `<td class="g-${has ? "ok" : "none"}"><button class="gcell" data-a="pkCell" data-pid="${p.id}" data-v="${esc(k.name)}" aria-pressed="${has}" aria-label="${esc(p.name)} · ${esc(k.name)}"><span class="ic">${has ? "✓" : ""}</span></button></td>`; }
    h += `</tr>`;
  }
  h += `</tbody><tfoot><tr><td class="nm">סה״כ</td>${list.map(k => `<td>${ppl.filter(p => hasTag(p, k.name)).length}</td>`).join("")}</tr></tfoot></table></div>
    <p class="small muted">משימה שדורשת פק״ל (למשל "חובש:1") תשובץ רק עם מי שמסומן כאן. מינימום לפק״ל מתריע בתובנות ובלוח השנה על ימים שאין מספיק בפנים.</p></section>`;
  return h;
}
function pakalText(){
  let s = `*פק״לים ${JL()}*\n`;
  for (const k of pakalim()){ const hs = pakalHolders(k.name).filter(p => jointPl().includes(p.platoon)); s += `\n*${k.name}* (${hs.length}): ${hs.map(p => p.name).join(", ") || "—"}`; }
  return s;
}
function openPakalEdit(){ DRAFT = { items: JSON.parse(JSON.stringify(pakalim())), orig: JSON.parse(JSON.stringify(pakalim())) }; pakalSheet(); }
function readPakal(){ DRAFT.items = DRAFT.items.map((k, i) => ({ id: k.id, name: val("pk" + i), min: Math.max(0, Number(val("pm" + i)) || 0) })); }
function pakalSheet(){
  openSheet(`<h3>פק״לים</h3><p class="small muted" style="margin-top:-6px">מינימום = כמה צריכים להיות בפנים בכל יום ${TD()} (0 = בלי התראה).</p><div class="stack">${DRAFT.items.map((k, i) => `<div class="row"><input id="pk${i}" value="${esc(k.name)}" aria-label="שם פק״ל" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--surface2);min-height:40px"><label class="small muted" style="display:flex;align-items:center;gap:4px">מינ׳<input id="pm${i}" type="number" min="0" max="20" value="${k.min || 0}" style="width:56px;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface2);min-height:40px"></label><button class="btn ghost sm" data-a="pakalDel" data-i="${i}" aria-label="הסרה">✕</button></div>`).join("")}
  <button class="btn sm" data-a="pakalAdd" style="align-self:flex-start">הוספת פק״ל</button></div>
  <div class="sheet-acts"><button class="btn primary" data-a="savePakal">שמירה</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
}
function savePakal(){
  readPakal();
  const items = DRAFT.items.filter(k => k.name);
  const names = new Set(); for (const k of items){ if (names.has(k.name)) return toast(`"${k.name}" מופיע פעמיים`); names.add(k.name); }
  // carry renames into soldiers' marks and task requirements
  const ren = {}; for (const k of items){ const o = DRAFT.orig.find(z => z.id === k.id); if (o && o.name !== k.name) ren[o.name] = k.name; }
  if (Object.keys(ren).length){
    for (const p of Object.values(S.soldiers)) if ((p.tags || []).some(t => ren[t])) updPerson(p.id, q => { q.tags = q.tags.map(t => ren[t] || t); });
    for (const t of Object.values(S.tasks)) if ((t.needs || []).some(n => ren[n.tag])){ const c = JSON.parse(JSON.stringify(t)); c.needs = c.needs.map(n => ren[n.tag] ? Object.assign(n, { tag: ren[n.tag] }) : n); put("tasks/" + t.id, c); }
  }
  saveCfg({ pakalim: items }); closeSheet(); toast("רשימת הפק״לים נשמרה");
}
function gearItemsSheet(){
  openSheet(`<h3>פריטי צל״ם</h3><div class="stack">${DRAFT.items.map((it, i) => `<div class="row"><input id="gi${i}" value="${esc(it.name)}" aria-label="פריט ${i + 1}" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--surface2);min-height:40px"><button class="btn ghost sm" data-a="gearItemDel" data-i="${i}" aria-label="הסרה">✕</button></div>`).join("")}
  <button class="btn sm" data-a="gearItemAdd" style="align-self:flex-start">הוספת פריט</button></div>
  <div class="sheet-acts"><button class="btn primary" data-a="saveGearItems">שמירה</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
}
