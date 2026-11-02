"use strict";
/* ================= install & offline (PWA) ================= */
/* sw.js keeps every file of the app on the phone, so it opens with no signal. A new version
   waits until the commander taps "עדכון". Installing to the home screen also tells the browser
   not to clear the data on its own (navigator.storage.persist). */
const STANDALONE = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ANDROID = /android/i.test(navigator.userAgent);
const PWA = { prompt:null, update:null, persisted:null };
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); PWA.prompt = e; scheduleRender(); });
window.addEventListener("appinstalled", () => { PWA.prompt = null; toast("האפליקציה הותקנה"); scheduleRender(); });

function swRegister(){
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    const ready = w => { if (w && navigator.serviceWorker.controller){ PWA.update = w; scheduleRender(); } };
    if (reg.waiting) ready(reg.waiting);
    reg.addEventListener("updatefound", () => { const w = reg.installing; if (w) w.addEventListener("statechange", () => { if (w.state === "installed") ready(w); }); });
    setInterval(() => reg.update().catch(() => {}), 6 * 3600e3);
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded){ reloaded = true; location.reload(); } });
}
async function askPersist(){
  try { if (navigator.storage && navigator.storage.persist){ PWA.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); scheduleRender(); } } catch(e){}
}
const installHidden = () => { try { return localStorage.getItem(LS_KEY + "-noinstall") === "1"; } catch(e){ return false; } };
/* the line under the header: a waiting update first, then the install hint */
function pwaBanner(){
  if (PWA.update) return `יש גרסה חדשה של האפליקציה. <button class="btn sm" style="margin-inline-start:6px" data-a="pwaUpdate">עדכון</button>`;
  if (!STANDALONE && !installHidden() && (IOS || ANDROID || PWA.prompt))
    return `כדאי להתקין את האפליקציה במסך הבית, כדי שתעבוד גם בלי קליטה. <button class="btn sm" style="margin-inline-start:6px" data-a="pwaInstall">איך מתקינים</button><button class="btn ghost sm" data-a="pwaNoInstall">לא עכשיו</button>`;
  return "";
}
function openInstall(){
  if (PWA.prompt){ const p = PWA.prompt; PWA.prompt = null; p.prompt(); p.userChoice.finally(() => scheduleRender()); return; }
  const ios = `<ol class="alist" style="gap:6px">
      <li>פותחים את הקישור ב-<b>Safari</b>. אם הוא נפתח בתוך וואטסאפ: לוחצים על ··· או על סמל המצפן ובוחרים "פתיחה ב-Safari".</li>
      <li>לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה), ובוחרים <b>"הוספה למסך הבית"</b>.</li>
      <li>מעכשיו פותחים רק מהאייקון "שבצ״ק נא" במסך הבית.</li></ol>
    <p class="small muted">ב-iPhone האפליקציה שבמסך הבית שומרת את הנתונים בנפרד מ-Safari. לכן מתקינים קודם, ומקימים את הקו או מקבלים עדכון מתוך האייקון.</p>`;
  const android = `<ol class="alist" style="gap:6px">
      <li>פותחים את הקישור ב-<b>Chrome</b>.</li>
      <li>לוחצים על ⋮ למעלה, ובוחרים <b>"התקנת אפליקציה"</b> או "הוספה למסך הבית".</li>
      <li>אחרי ההתקנה אפשר לשתף עדכון מוואטסאפ ישר לאפליקציה: לוחצים לחיצה ארוכה על ההודעה ← שיתוף ← שבצ״ק נא.</li></ol>`;
  openSheet(`<h3>התקנה במסך הבית</h3>${IOS ? ios : ANDROID ? android : `<p>בטלפון: פותחים את הקישור ב-Safari (iPhone) או ב-Chrome (אנדרואיד) ומוסיפים למסך הבית.</p>${android}`}
    <p class="small muted">האפליקציה לא מתחברת לשום שרת. הכול נשמר בטלפון, ולכן חשוב לשמור גיבוי לקובץ מדי פעם.</p>
    <div class="sheet-acts"><button class="btn" data-a="closeSheet">הבנתי</button></div>`);
}
function afterBoot(){
  swRegister();
  if (cfg() || STANDALONE) askPersist();
  const t = shareTargetText();
  if (t){ UI.tab = "more"; UI.more = "share"; render(); setTimeout(() => openUpdate(t, null), 80); }
}
Object.assign(ACT, {
  pwaUpdate: () => { if (PWA.update) PWA.update.postMessage("skip"); },
  pwaInstall: () => openInstall(),
  pwaNoInstall: () => { try { localStorage.setItem(LS_KEY + "-noinstall", "1"); } catch(e){} render(); },
});
