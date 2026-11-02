"use strict";
/* ================= שיתוף מוצפן (encrypted updates between commanders) ================= */
/* No server. A commander sends the whole line as one encrypted block of text (or a small file)
   through WhatsApp or any chat. It is encrypted on the phone with the unit password
   (PBKDF2-SHA256 → AES-GCM-256), so the chat, its backups and anyone in between see only noise.
   The receiver pastes it or picks the file; the app merges record by record: the newer change wins,
   using each record's _t and the deletion tombstones (see put() in 01-utils-store.js). */
const SHARE_KEY = LS_KEY + "-share";
const TOKEN_RE = /SHBZ1\.[A-Za-z0-9_-]{40,}/;
const PBKDF2_ITER = 250000;
function shareCfg(){ try { return Object.assign({ name:"", pass:"", keep:true, sent:null, got:null }, JSON.parse(localStorage.getItem(SHARE_KEY) || "{}")); } catch(e){ return { name:"", pass:"", keep:true, sent:null, got:null }; } }
function shareSave(patch){ const o = Object.assign(shareCfg(), patch); if (!o.keep) o.pass = ""; try { localStorage.setItem(SHARE_KEY, JSON.stringify(o)); } catch(e){} return o; }

/* ---- bytes ---- */
const b64u = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = s => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const cat = (...xs) => { const out = new Uint8Array(xs.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of xs){ out.set(x, o); o += x.length; } return out; };
async function squeeze(bytes, on){ if (!on || !window.CompressionStream) return bytes; return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()); }
async function unsqueeze(bytes){ if (!window.DecompressionStream) throw Object.assign(new Error(), { msg:"הדפדפן הזה ישן מדי לפתיחת העדכון. עדכנו את מערכת ההפעלה." }); return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); }
/* a password made only of digits (like a generated one) ignores spaces and dashes,
   so "1234-5678-…" read out over the phone and typed as "12345678…" opens the same update */
function passNorm(pass){ const p = String(pass == null ? "" : pass).normalize("NFC").trim(); return /^[\d\s-]+$/.test(p) ? p.replace(/[\s-]/g, "") : p; }
/* 16 random digits in groups of four (about 53 bits): easy to say on the phone, hard to guess */
function newUnitPass(){
  const d = [], b = new Uint8Array(32);
  while (d.length < 16){ crypto.getRandomValues(b); for (const x of b) if (x < 250 && d.length < 16) d.push(x % 10); }
  return d.join("").replace(/(\d{4})(?=\d)/g, "$1-");
}
async function keyFrom(pass, salt){
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passNorm(pass)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name:"PBKDF2", salt, iterations:PBKDF2_ITER, hash:"SHA-256" }, base, { name:"AES-GCM", length:256 }, false, ["encrypt", "decrypt"]);
}
/* token = "SHBZ1." + base64url( [1, zipped] + salt(16) + iv(12) + AES-GCM(ciphertext+tag) ); the 2 header bytes are authenticated */
async function seal(obj, pass){
  if (!crypto.subtle) throw Object.assign(new Error(), { msg:"ההצפנה זמינה רק כשהאפליקציה נפתחת מהקישור המאובטח (https)." });
  const zipped = !!window.CompressionStream, head = Uint8Array.of(1, zipped ? 1 : 0);
  const body = await squeeze(new TextEncoder().encode(JSON.stringify(obj)), zipped);
  const salt = rnd(16), iv = rnd(12), key = await keyFrom(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv, additionalData:head }, key, body));
  return "SHBZ1." + b64u(cat(head, salt, iv, ct));
}
async function unseal(token, pass){
  let raw; try { raw = unb64u(token.slice(6)); } catch(e){ throw Object.assign(new Error(), { msg:"העדכון נקטע או השתבש בהעתקה. העתיקו שוב את כל ההודעה." }); }
  if (raw.length < 46 || raw[0] !== 1) throw Object.assign(new Error(), { msg:"זה לא עדכון של שבצ״ק נא, או שהוא מגרסה חדשה יותר. עדכנו את האפליקציה." });
  const head = raw.subarray(0, 2), salt = raw.subarray(2, 18), iv = raw.subarray(18, 30), ct = raw.subarray(30);
  let body;
  try { body = new Uint8Array(await crypto.subtle.decrypt({ name:"AES-GCM", iv, additionalData:head }, await keyFrom(pass, salt), ct)); }
  catch(e){ throw Object.assign(new Error(), { msg:"הסיסמה לא מתאימה לעדכון הזה, או שההודעה נקטעה.", bad:true }); }
  if (head[1]) body = await unsqueeze(body);
  return JSON.parse(new TextDecoder().decode(body));
}

/* ---- what goes out, and how it comes back in ---- */
function updatePayload(){
  const sc = shareCfg();
  return { app:"shabtzak", kind:"update", v:2, from: sc.name || "", at: new Date().toISOString(), line: (S.config && S.config.lineId) || "", lineName: S.config ? plName(myPl()) : "",
    config:S.config, soldiers:S.soldiers, tasks:S.tasks, rules:S.rules, rosters:S.rosters, tomb:S.tomb };
}
const T = x => (x && x._t) || 0;
const COLL_LBL = { soldiers:"חיילים", tasks:"משימות", rules:"אילוצים", rosters:"שבצ״קים" };
function mergePlan(inc){
  const plan = { cfg:null, add:[], upd:[], del:[], tomb:{}, keptLocal:0, otherLine: !!(S.config && inc.line && S.config.lineId && inc.line !== S.config.lineId), empty: !S.config };
  if (inc.config && (!S.config || T(inc.config) > T(S.config))) plan.cfg = inc.config;
  for (const c of COLLS){
    const loc = S[c] || {};
    for (const [id, o] of Object.entries(inc[c] || {})){
      const path = c + "/" + id;
      if (S.tomb[path] && S.tomb[path] >= T(o)) continue;           // deleted here after their last change
      if (!loc[id]) plan.add.push([path, o]);
      else if (T(o) > T(loc[id])) plan.upd.push([path, o]);
      else if (T(o) < T(loc[id])) plan.keptLocal++;
    }
  }
  for (const [path, t] of Object.entries(inc.tomb || {})){
    const [c, id] = path.split("/");
    if (S[c] && S[c][id] && t > T(S[c][id])) plan.del.push([path, t]);
    else if (!S[c] || !S[c][id]) plan.tomb[path] = t;               // remember it, so an older copy can't bring it back
  }
  return plan;
}
function planCounts(plan){
  const n = {}; const bump = (path, k) => { const c = path.split("/")[0]; (n[c] = n[c] || { add:0, upd:0, del:0 })[k]++; };
  plan.add.forEach(([p]) => bump(p, "add")); plan.upd.forEach(([p]) => bump(p, "upd")); plan.del.forEach(([p]) => bump(p, "del"));
  return n;
}
function applyPlan(plan){
  if (plan.cfg) put("line/config", plan.cfg, { keepTime:true });
  for (const [path, o] of plan.add.concat(plan.upd)) put(path, o, { keepTime:true });
  for (const [path, t] of plan.del) put(path, null, { t });
  for (const [path, t] of Object.entries(plan.tomb)) S.tomb[path] = Math.max(S.tomb[path] || 0, t);
  persistLocal();
  return plan.add.length + plan.upd.length + plan.del.length + (plan.cfg ? 1 : 0);
}
/* replace this phone's line with the incoming one (a different line, or a first copy) */
function replaceWith(inc){
  S.config = null; for (const c of COLLS) S[c] = {}; S.tomb = Object.assign({}, inc.tomb || {});
  if (inc.config) put("line/config", inc.config, { keepTime:true });
  for (const c of COLLS) for (const [id, o] of Object.entries(inc[c] || {})) put(c + "/" + id, o, { keepTime:true });
  persistLocal();
}

/* ---- view ---- */
function vShare(){
  const sc = shareCfg(), has = !!cfg();
  return `<section class="panel stack">
    <p style="margin:0">בלי שרת: שולחים לשאר המפקדים <b>עדכון מוצפן</b> בוואטסאפ או בכל צ׳אט, והם פותחים אותו באפליקציה שלהם. ההצפנה נעשית בטלפון עם סיסמת היחידה, כך שבצ׳אט ובגיבויים שלו רואים רק רצף תווים. <button class="btn ghost sm" data-a="helpOpen" data-v="share" style="padding-inline:2px">איך זה עובד?</button></p>
    <div class="fgrid">
      <label class="fld" style="grid-column:1/-1"><span>סיסמת היחידה (זהה אצל כל המפקדים)</span>
        <span class="inrow"><input id="shPass" type="password" dir="auto" autocomplete="off" value="${esc(sc.pass)}" placeholder="לפחות 8 תווים" style="flex:1;min-width:0"><button class="btn" data-a="shGen" style="white-space:nowrap">יצירת סיסמה</button></span></label>
      <label class="fld"><span>השם שלך (יופיע בעדכון)</span><input id="shName" maxlength="40" value="${esc(sc.name)}" placeholder="למשל: יוסי, מ״מ 1"></label>
    </div>
    <div class="checks"><label><input type="checkbox" id="shKeep"${sc.keep ? " checked" : ""}>לזכור את הסיסמה בטלפון הזה</label><label><input type="checkbox" id="shShow" data-ch="shShow">להציג את הסיסמה</label></div>
    <p class="small muted" style="margin:0">את הסיסמה מעבירים פעם אחת בעל פה או בהודעה נפרדת, אף פעם לא יחד עם העדכון.</p>
  </section>
  <section><div class="sec-h"><h2>שליחת עדכון</h2>${sc.sent ? `<span class="aside">נשלח לאחרונה ${esc(dmTime(sc.sent))}</span>` : ""}</div>
    <div class="row"><button class="btn primary" data-a="shSendText"${has ? "" : " disabled"}>שליחה כהודעה</button><button class="btn" data-a="shSendFile"${has ? "" : " disabled"}>שליחה כקובץ</button></div>
    <p class="small muted" style="margin:6px 0 0">${has ? `נשלח הקו כולו: ${Object.keys(S.soldiers).length} חיילים, ${Object.keys(S.tasks).length} משימות, ${Object.keys(S.rosters).length} שבצ״קים, צל״ם ופק״לים. אצל המקבל נשמר מכל רשומה העדכון החדש יותר.` : "קודם מקימים קו."}</p>
  </section>
  <section><div class="sec-h"><h2>קבלת עדכון</h2>${sc.got ? `<span class="aside">התקבל לאחרונה ${esc(dmTime(sc.got))}</span>` : ""}</div>
    <textarea id="shIn" rows="4" class="mono" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface2);font-size:12px" placeholder="מדביקים כאן את כל ההודעה שהתקבלה"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary" data-a="shOpen">פתיחת העדכון</button><label class="btn" for="shFile" tabindex="0">בחירת קובץ</label><input type="file" id="shFile" accept=".txt,.shbz,text/plain" hidden data-ch="shFile"></div>
  </section>`;
}
/* the first screen's "join": a short how-to and the box for the update */
function joinSheet(){
  openSheet(`<h3>הצטרפות לקו של מפקד אחר</h3>
    <ol class="alist" style="gap:6px;margin-bottom:10px">
      <li>המפקד שכבר עובד באפליקציה נכנס אצלו ל<b>עוד ← שיתוף מוצפן עם מפקדים</b> ושולח עדכון, בוואטסאפ או כקובץ.</li>
      <li>מעתיקים את כל ההודעה ומדביקים כאן, או בוחרים את הקובץ.</li>
      <li>מקלידים את <b>סיסמת היחידה</b>. אותה מקבלים ממנו בנפרד, בעל פה או בהודעה אחרת.</li>
    </ol>
    <textarea id="shIn" rows="3" class="mono" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface2);font-size:12px" placeholder="הדביקו כאן את כל ההודעה"></textarea>
    <p class="small muted" style="margin:6px 0 0">כל הקו נטען לטלפון: חיילים, משימות, חוקת משימות, שבצ״קים וצל״ם. אחר כך שולחים ומקבלים עדכונים בעוד ← שיתוף מוצפן.</p>
    <div class="sheet-acts"><button class="btn primary" data-a="shOpen">פתיחת העדכון</button><label class="btn" for="shFile" tabindex="0">בחירת קובץ</label><input type="file" id="shFile" accept=".txt,.shbz,text/plain" hidden data-ch="shFile"><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
}
function dmTime(iso){ const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function readShareForm(){
  const pass = val("shPass"), name = val("shName"), keep = chk("shKeep");
  if (document.getElementById("shPass")) shareSave({ name, keep, pass });
  return { pass: pass || shareCfg().pass, name };
}
async function makeUpdate(){
  const { pass } = readShareForm();
  if (passNorm(pass).length < 8) throw Object.assign(new Error(), { msg:"צריך סיסמת יחידה של לפחות 8 תווים." });
  const token = await seal(updatePayload(), pass), sc = shareCfg();
  const text = `🔒 עדכון שבצ״ק נא${sc.name ? " מ" + sc.name : ""} · ${dmTime(new Date().toISOString())}\nפותחים באפליקציה: עוד ← שיתוף מוצפן ← קבלת עדכון\n${token}`;
  shareSave({ sent: new Date().toISOString() });
  return { token, text };
}
async function sendUpdate(asFile, el){
  shBusy(el, true);
  try {
    const { text } = await makeUpdate();
    if (asFile){
      const r = await saveFile(`עדכון שבצ״ק נא ${todayStr()}.txt`, text, "text/plain", `shabtzak-update-${todayStr()}.txt`);
      if (r !== "cancel") toast("העדכון מוכן לשליחה");
    } else if (text.length > 60000){
      toast("העדכון ארוך מדי להודעה אחת. שלחו כקובץ");
    } else if (navigator.share){
      try { await navigator.share({ text }); } catch(e){ if (!(e && e.name === "AbortError")) copyText(text); }
    } else copyText(text);
    render();
  } catch(e){ toast((e && e.msg) || "יצירת העדכון לא הצליחה"); }
  finally { shBusy(el, false); }
}
function shBusy(el, on){ if (!el) return; if (on){ el.dataset.t = el.textContent; el.textContent = "רגע…"; el.disabled = true; } else if (el.dataset.t){ el.textContent = el.dataset.t; el.disabled = false; } }
async function openUpdate(text, el){
  const m = TOKEN_RE.exec(String(text || ""));
  if (!m) return toast("לא נמצא עדכון בטקסט. העתיקו את כל ההודעה כמו שהיא.");
  let pass = val("shPass") || shareCfg().pass;
  if (!pass) return askPass(m[0]);
  shBusy(el, true);
  try { previewUpdate(await unseal(m[0], pass)); readShareForm(); }
  catch(e){ if (e && e.bad) askPass(m[0], true); else toast((e && e.msg) || "פתיחת העדכון לא הצליחה"); }
  finally { shBusy(el, false); }
}
function askPass(token, wrong){
  DRAFT = { token };
  openSheet(`<h3>סיסמת היחידה</h3><p class="small ${wrong ? "aerr" : "muted"}">${wrong ? "הסיסמה לא מתאימה לעדכון הזה. בדקו אותה מול המפקד ששלח." : "העדכון מוצפן. הקלידו את הסיסמה שקיבלתם מהמפקד."}</p>
    <label class="fld"><span>סיסמה</span><input id="apPass" type="password" autocomplete="off"></label>
    <div class="sheet-acts"><button class="btn primary" data-a="shPassGo">פתיחה</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
  setTimeout(() => { const i = document.getElementById("apPass"); if (i) i.focus(); }, 60);
}
function previewUpdate(inc){
  if (!inc || inc.app !== "shabtzak" || inc.kind !== "update") return toast("זה לא עדכון של שבצ״ק נא");
  const plan = mergePlan(inc), n = planCounts(plan), total = plan.add.length + plan.upd.length + plan.del.length + (plan.cfg ? 1 : 0);
  DRAFT = { inc, plan };
  const rows = Object.entries(n).map(([c, x]) => `<li><b>${COLL_LBL[c] || c}:</b> ${[x.add ? (x.add === 1 ? "1 חדש" : `${x.add} חדשים`) : "", x.upd ? (x.upd === 1 ? "1 עודכן" : `${x.upd} עודכנו`) : "", x.del ? (x.del === 1 ? "1 נמחק" : `${x.del} נמחקו`) : ""].filter(Boolean).join(", ")}</li>`).join("");
  const who = `${inc.from ? esc(inc.from) + " · " : ""}${esc(dmTime(inc.at))}${inc.lineName ? " · " + esc(inc.lineName) : ""}`;
  if (plan.empty || plan.otherLine){
    openSheet(`<h3>${plan.empty ? "קבלת הקו" : "עדכון מקו אחר"}</h3><p class="small muted">${who}</p>
      <p>${plan.empty ? `בטלפון הזה עוד אין קו. העדכון יקים אותו: ${Object.keys(inc.soldiers || {}).length} חיילים ו-${Object.keys(inc.tasks || {}).length} משימות.` : `העדכון שייך לקו אחר מזה שבטלפון. אפשר להחליף את הקו שבטלפון בקו שהתקבל. כדאי לשמור גיבוי לפני.`}</p>
      <div class="sheet-acts"><button class="btn primary" data-a="shReplace">${plan.empty ? "קבלה" : "החלפת הקו"}</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
    return;
  }
  openSheet(`<h3>${total ? "מיזוג עדכון" : "אין חדש בעדכון"}</h3><p class="small muted">${who}</p>
    ${total ? `<ul class="alist">${plan.cfg ? `<li><b>הגדרות הקו:</b> עודכנו</li>` : ""}${rows}</ul>` : `<p>כל מה שבעדכון כבר נמצא בטלפון, או ששיניתם אותו כאן אחרי ששלחו.</p>`}
    ${plan.keptLocal ? `<p class="small muted">${plan.keptLocal === 1 ? "רשומה אחת נשארת כמו שהיא" : `${plan.keptLocal} רשומות נשארות כמו שהן`}, כי השינוי בטלפון הזה חדש יותר.</p>` : ""}
    <div class="sheet-acts">${total ? `<button class="btn primary" data-a="shMerge">מיזוג</button>` : ""}<span class="sp"></span><button class="btn" data-a="closeSheet">${total ? "ביטול" : "סגירה"}</button></div>`);
}
function onShareFile(input){
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => openUpdate(String(r.result || ""), null);
  r.onerror = () => toast("לא הצלחתי לקרוא את הקובץ");
  r.readAsText(f); input.value = "";
}
/* Android: "share to שבצ״ק נא" lands here with the text in the address */
function shareTargetText(){
  try { const q = new URLSearchParams(location.search), t = q.get("text") || q.get("title") || ""; if (!TOKEN_RE.test(t)) return null; history.replaceState(null, "", location.pathname); return t; } catch(e){ return null; }
}

Object.assign(ACT, {
  shSendText: (v, el) => sendUpdate(false, el),
  shGen: () => {
    if (val("shPass")) return openSheet(`<h3>סיסמה חדשה?</h3><p>כבר יש סיסמת יחידה. אחרי החלפה, מפקדים שלא קיבלו את החדשה לא יוכלו לפתוח עדכונים ממך.</p>
      <div class="sheet-acts"><button class="btn primary" data-a="shGenGo">יצירת סיסמה חדשה</button><span class="sp"></span><button class="btn" data-a="closeSheet">ביטול</button></div>`);
    ACT.shGenGo();
  },
  shGenGo: () => {
    closeSheet(); const p = document.getElementById("shPass"), sh = document.getElementById("shShow"); if (!p) return;
    p.value = newUnitPass(); p.type = "text"; if (sh) sh.checked = true; readShareForm();
    toast("נוצרה סיסמה. העבירו אותה לשאר המפקדים בנפרד");
  },
  shSendFile: (v, el) => sendUpdate(true, el),
  shOpen: (v, el) => openUpdate(val("shIn") || (document.getElementById("shIn") || {}).value, el),
  shPassGo: (v, el) => { const pass = val("apPass"), token = DRAFT && DRAFT.token; if (!pass || !token) return; shBusy(el, true);
    unseal(token, pass).then(inc => { if (shareCfg().keep) shareSave({ pass }); previewUpdate(inc); }, e => { shBusy(el, false); askPass(token, !!(e && e.bad)); }); },
  shMerge: () => { const n = applyPlan(DRAFT.plan); shareSave({ got: new Date().toISOString() }); closeSheet(); toast(`העדכון מוזג: ${n} שינויים`); },
  shReplace: () => { replaceWith(DRAFT.inc); shareSave({ got: new Date().toISOString() }); closeSheet(); UI.tab = "today"; saveUI(); toast("הקו התקבל"); },
});
document.addEventListener("change", e => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.ch === "shFile") onShareFile(el);
  if (el.dataset.ch === "shShow"){ const p = document.getElementById("shPass"); if (p) p.type = el.checked ? "text" : "password"; }
});
