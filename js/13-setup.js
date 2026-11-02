"use strict";
/* ================= setup wizard (template mode) & backup ================= */
const EXAMPLE_TASKS = [
  { name:"ש״ג", kind:"guard", size:1, cmd:0, start:6, len:4, count:6, weight:1, rest:8, color:"#5B7FD8" },
  { name:"סיור", kind:"mission", size:4, cmd:1, start:6, len:8, count:3, weight:1, rest:8, color:"#C4577A" },
  { name:"כיתת כוננות", kind:"mission", size:5, cmd:1, start:8, len:24, count:1, weight:0.3, rest:0, color:"#3E8E6A" },
  { name:"תצפית", kind:"guard", size:2, cmd:0, start:0, len:4, count:6, weight:1, rest:8, color:"#B07A1E" },
];
const TERMS = [["צוות","צוותים"],["מחלקה","מחלקות"],["כיתה","כיתות"],["חוליה","חוליות"],["פלוגה","פלוגות"],["קבוצה","קבוצות"],["משמרת","משמרות"]];
let WZ = null;
function wzInit(){ const t = todayStr(); WZ = { t:0, duty:"תעסוקה", units:[{ name:"", rot:0 }, { name:"", rot:0 }, { name:"", rot:1 }], mine:0, people:{}, ls:t, le:addDays(t, 41), L:7, rs:t, first:"0", noRot:false, gear:GEAR_DEF.join("\n"), pk:PAKAL_DEF.join("\n"), ex:true }; }
function readWizard(){
  if (!WZ || !document.getElementById("wT")) return;
  WZ.t = Number(val("wT")) || 0; WZ.duty = val("wD") || "תעסוקה";
  WZ.units = WZ.units.map((u, i) => ({ name: val("wu" + i), rot: Number(val("wr" + i)) }));
  const m = document.querySelector('input[name="wm"]:checked'); WZ.mine = m ? Number(m.value) : 0;
  WZ.units.forEach((u, i) => { const el = document.getElementById("wp" + i); if (el) WZ.people[i] = el.value; });
  WZ.ls = val("wS"); WZ.le = val("wE"); WZ.L = Number(val("wL")) || 7; WZ.rs = val("wRS"); WZ.first = val("wF") || "0"; WZ.noRot = chk("wNo");
  WZ.gear = (document.getElementById("wGear") || {}).value ?? WZ.gear; WZ.pk = (document.getElementById("wPk") || {}).value ?? WZ.pk; WZ.ex = chk("wEx");
}
function vSetup(){
  if (!WZ) wzInit();
  const [u, us] = TERMS[WZ.t] || TERMS[0];
  const inp = "border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--surface2);width:100%;min-width:0";
  const uname = i => (WZ.units[i].name || "").trim() || `${u} ${i + 1}`;
  const used = [0,1,2].filter(r => WZ.units.some(x => x.rot === r));
  const rows = WZ.units.map((x, i) => `<tr>
    <td style="text-align:center"><input type="radio" name="wm" value="${i}" data-ch="wzRe" aria-label="שלי"${WZ.mine === i ? " checked" : ""}></td>
    <td><input id="wu${i}" value="${esc(x.name)}" placeholder="${esc(u)} ${i + 1}" aria-label="שם" style="${inp};min-width:120px"></td>
    <td><select id="wr${i}" data-ch="wzRe" aria-label="סבב" style="${inp};min-width:118px">${ROT_LBL.map((l, r) => `<option value="${r}"${x.rot === r ? " selected" : ""}>${l}</option>`).join("")}<option value="-1"${x.rot < 0 ? " selected" : ""}>תמיד בפנים</option></select></td>
    <td>${WZ.units.length > 1 ? `<button class="btn ghost sm" data-a="wzDel" data-i="${i}" aria-label="הסרה">✕</button>` : ""}</td></tr>`).join("");
  const order = [WZ.mine].concat(WZ.units.map((_, i) => i).filter(i => i !== WZ.mine));
  const ppl = order.map(i => { const ta = `<textarea id="wp${i}" rows="6" style="${inp}" placeholder="*כהן&#10;לוי&#10;מזרחי">${esc(WZ.people[i] || "")}</textarea>`;
    return i === WZ.mine ? `<label class="fld"><span>${esc(uname(i))} (שלך). שם בכל שורה, * בתחילת שורה = מפקד</span>${ta}</label>`
      : `<details class="panel" style="padding:10px"><summary style="cursor:pointer;font-weight:600">${esc(uname(i))} (לא חובה)</summary><div style="margin-top:8px">${ta}</div></details>`; }).join("");
  return receiveCard() + `<section class="panel stack" style="padding:18px">
    <div><h2 style="font-family:var(--f-display);font-weight:400;font-size:22px;margin:0 0 4px">הקמת קו חדש</h2>
    <p class="muted" style="margin:0">מתאימים את המערכת ליחידה שלכם. הכול ניתן לשינוי אחר כך בלשונית ניהול. הנתונים נשמרים רק במכשיר הזה.</p></div>
    <div class="eyebrow">המבנה</div>
    <div class="fgrid">
      <label class="fld"><span>איך קוראים ליחידות המשנה?</span><select id="wT" data-ch="wzRe">${TERMS.map(([a, b], i) => `<option value="${i}"${WZ.t === i ? " selected" : ""}>${a} / ${b}</option>`).join("")}</select></label>
      <label class="fld"><span>הזמן בפנים נקרא</span><input id="wD" value="${esc(WZ.duty)}" placeholder="תעסוקה / בסיס / קו"></label>
    </div>
    <div class="tbl-wrap"><table><thead><tr><th style="text-align:center">שלי</th><th>שם ה${esc(u)}</th><th>סבב</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row"><button class="btn sm" data-a="wzAdd">הוספת ${esc(u)}</button><span class="small muted">${esc(us)} באותו סבב יוצאות הביתה יחד.</span></div>
    <div class="eyebrow">הקו</div>
    <div class="fgrid">
      <label class="fld"><span>תחילת הקו</span><input type="date" id="wS" value="${WZ.ls}"></label>
      <label class="fld"><span>סוף הקו</span><input type="date" id="wE" value="${WZ.le}"></label>
    </div>
    <div class="eyebrow">סבבי בית</div>
    <div class="fgrid">
      <label class="fld"><span>אורך סבב (ימים)</span><input type="number" id="wL" min="1" max="60" value="${WZ.L}"></label>
      <label class="fld"><span>הסבב הראשון מתחיל ב-</span><input type="date" id="wRS" value="${WZ.rs}"></label>
      <label class="fld"><span>בסבב הראשון בבית</span><select id="wF">${used.map(r => `<option value="${r}"${WZ.first === String(r) ? " selected" : ""}>${ROT_LBL[r]} (${esc(WZ.units.map((x, i) => x.rot === r ? uname(i) : null).filter(Boolean).join(", "))})</option>`).join("")}<option value="none"${WZ.first === "none" ? " selected" : ""}>אף אחד, כולם בפנים</option></select></label>
    </div>
    <div class="checks"><label><input type="checkbox" id="wNo"${WZ.noRot ? " checked" : ""}>בלי סבבים, כולם בפנים כל הקו</label></div>
    <div class="eyebrow">אנשים</div>
    ${ppl}
    <div class="eyebrow">התאמות</div>
    <div class="fgrid">
      <label class="fld"><span>פריטי צל״ם (פריט בכל שורה)</span><textarea id="wGear" rows="7" style="${inp}">${esc(WZ.gear)}</textarea></label>
      <label class="fld"><span>פק״לים (פק״ל בכל שורה)</span><textarea id="wPk" rows="7" style="${inp}">${esc(WZ.pk)}</textarea></label>
    </div>
    <div class="checks"><label><input type="checkbox" id="wEx"${WZ.ex ? " checked" : ""}>להוסיף 4 משימות לדוגמה (ש״ג, סיור, כוננות, תצפית) שאפשר לערוך</label></div>
    <div class="row" style="margin-top:4px"><button class="btn primary" data-a="createLine">יצירת הקו</button>
      <span style="flex:1"></span><label class="btn" for="impFile" tabindex="0">יש לי גיבוי: שחזור מקובץ</label><input type="file" id="impFile" accept=".json,application/json,text/plain" hidden data-ch="impFile"></div>
  </section>`;
}
const parseNums = s => [...new Set(String(s || "").split(/[^0-9]+/).map(Number).filter(n => n > 0 && n < 10))];
const lines = s => [...new Set(String(s || "").split(/\n/).map(x => x.trim()).filter(Boolean))];
function createFromWizard(){
  readWizard();
  const [u, us] = TERMS[WZ.t] || TERMS[0];
  const units = WZ.units.map((x, i) => ({ id:i + 1, name:(x.name || "").trim() || `${u} ${i + 1}`, rot:x.rot }));
  if (!units.length) return toast(`צריך לפחות ${u} אחד`);
  const mine = (WZ.mine >= 0 && WZ.mine < units.length ? WZ.mine : 0) + 1;
  let ls = WZ.ls, le = WZ.le;
  if (!ls || !le) return toast("חסרים תאריכי קו");
  if (le < ls){ const x = ls; ls = le; le = x; }
  if (diffDays(ls, le) > 400) return toast("הקו ארוך מדי, בדקו את התאריכים");
  const slots = [0,1,2].map(r => units.filter(x => x.rot === r).map(x => x.id));
  const groups = slots.filter(g => g.length), keys = groups.map(g => g.join(""));
  const blocks = [];
  if (!WZ.noRot && keys.length){
    const L = Math.max(1, Math.min(60, WZ.L || 7));
    const firstKey = WZ.first === "none" ? "none" : (slots[Number(WZ.first)] || []).join("") || keys[0];
    const fi = keys.indexOf(firstKey);
    const homeAt = i => keys.length === 1 ? ((i % 2 === 0) === (firstKey !== "none") ? keys[0] : "none")
      : firstKey === "none" ? (i === 0 ? "none" : keys[(i - 1) % keys.length]) : keys[(fi + i) % keys.length];
    let st = WZ.rs && WZ.rs > ls ? WZ.rs : ls, i = 0;
    while (st <= le && i < 400){ const en = addDays(st, L - 1) < le ? addDays(st, L - 1) : le; blocks.push({ id:uid("b_"), start:st, end:en, home:homeAt(i) }); st = addDays(en, 1); i++; }
  }
  const names = {}; units.forEach(x => names[x.id] = x.name);
  const gear = lines(WZ.gear), pk = lines(WZ.pk);
  put("line/config", { lineStart:ls, lineEnd:le, myPlatoon:mine, groups, terms:{ u, us, duty: WZ.duty || "תעסוקה" }, platoonNames:names, blocks, events:[], settings:{},
    gearItems: (gear.length ? gear : GEAR_DEF).map((n, i) => ({ id:"g" + i, name:n })),
    pakalim: (pk.length ? pk : PAKAL_DEF).map((n, i) => ({ id:"k" + i, name:n, min: n === "חובש" ? 1 : 0 })) });
  units.forEach((x, i) => {
    for (const ln of lines(WZ.people[i])){ const cmd = ln.startsWith("*"); const nm_ = ln.replace(/^\*+\s*/, "").trim(); if (nm_) put("soldiers/" + uid("s_"), { name:nm_, platoon:x.id, role: cmd ? "cmd" : "soldier", tags:[], absences:[] }); }
  });
  if (WZ.ex) { const jp = jointPl(); EXAMPLE_TASKS.forEach((t, i) => put("tasks/" + uid("t_"), Object.assign({ days:[0,1,2,3,4,5,6], platoons:jp, needs:[], order:i, example:true }, t))); }
  WZ = null; UI.tab = "today"; saveUI(); toast("הקו נוצר"); window.scrollTo(0, 0);
}
function importData(text){
  let o; try { o = JSON.parse(text); } catch(e){ toast("הקובץ אינו גיבוי תקין"); return false; }
  if (!o || !o.config){ toast("לא נמצאו הגדרות קו בגיבוי"); return false; }
  put("line/config", o.config);
  for (const c of ["soldiers","tasks","rules","rosters"]){
    if (c === "rosters" && !o.rosters) continue;
    const inc = o[c] || {};
    for (const id of Object.keys(S[c])) if (!inc[id]) put(c + "/" + id, null);
    for (const [id, v] of Object.entries(inc)) put(c + "/" + id, v);
  }
  toast("השחזור הושלם"); return true;
}
function onImportFile(input){
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { DRAFT = { importText: String(r.result || "") }; openSheet(`<h3>שחזור מקובץ</h3><p>לשחזר מ"${esc(f.name)}"? כל הנתונים הנוכחיים במכשיר יוחלפו בתוכן הגיבוי.</p><div class="sheet-acts"><button class="btn primary" data-a="importFileGo">שחזור</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`); };
  r.onerror = () => toast("לא הצלחתי לקרוא את הקובץ");
  r.readAsText(f); input.value = "";
}
async function backupFile(){
  try {
    const r = await saveFile(`גיבוי שבצ״ק נא ${todayStr()}.json`, JSON.stringify(backupObj(), null, 1), "application/json", `shabtzak-backup-${todayStr()}.json`);
    if (r === "cancel") return;
    markBackup(); toast(r === "shared" ? "הגיבוי מוכן" : "הגיבוי ירד למכשיר"); render();
  } catch(e){ toast("הגיבוי לא הצליח, נסו העתקה כטקסט"); }
}
function resetAll(){
  for (const c of ["soldiers","tasks","rules","rosters"]) S[c] = {};
  S.tomb = {};
  S.config = null; clearTimeout(persistTimer);
  try { localStorage.removeItem(LS_KEY); } catch(e){}
  closeSheet(); UI.tab = "today"; saveUI(); render(); toast("הנתונים נמחקו");
}
