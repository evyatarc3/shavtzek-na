"use strict";
/* ================= utils ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = p => p + Math.random().toString(36).slice(2, 9);
const WD = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const WDL = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
function pd(s){ const [y,m,d] = s.split("-").map(Number); return new Date(Date.UTC(y, m-1, d)); }
function fd(dt){ return dt.toISOString().slice(0,10); }
function addDays(s, n){ const d = pd(s); d.setUTCDate(d.getUTCDate()+n); return fd(d); }
function diffDays(a, b){ return Math.round((pd(b)-pd(a))/864e5); }
function dow(s){ return pd(s).getUTCDay(); }
function dm(s){ const d = pd(s); return d.getUTCDate() + "/" + (d.getUTCMonth()+1); }
function dmw(s){ return WD[dow(s)] + " " + dm(s); }
function range(a, b){ const out=[]; if(!a||!b) return out; for(let d=a; d<=b; d=addDays(d,1)) out.push(d); return out; }
function todayStr(){ const n = new Date(); const t = new Date(n.getTime() - n.getTimezoneOffset()*6e4); return t.toISOString().slice(0,10); }
function hh(h){ const x = ((h%24)+24)%24; return String(Math.floor(x)).padStart(2,"0") + ":" + String(Math.round((x%1)*60)).padStart(2,"0"); }
function hash(s){ let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0)/4294967296; }
const isCmd = p => p && (p.role==="mm"||p.role==="smm"||p.role==="cmd");
const isCmdP = p => p && p.role==="cmdp";
const KIND = { flight:"טיסה", request:"בקשת יציאה", weekend:"סופ״ש", release:"שחרור", other:"היעדרות" };
const TASK_COLORS = ["#5B7FD8","#C4577A","#3E8E6A","#B07A1E","#7C5CC4","#2E8FA3","#B5563A","#6A7A2A"];
function toast(msg){ const h=$("#toastHost"); h.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`; clearTimeout(toast.t); toast.t=setTimeout(()=>h.innerHTML="",2600); }
async function copyText(txt){
  try { await navigator.clipboard.writeText(txt); toast("הועתק — אפשר להדביק בוואטסאפ"); }
  catch(e){ openSheet(`<h3>העתקה</h3><p class="small muted">ההעתקה האוטומטית נחסמה. סמנו את הטקסט והעתיקו ידנית.</p><textarea id="cpy" class="mono" style="width:100%;min-height:260px;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface2)">${esc(txt)}</textarea><div class="sheet-acts"><button class="btn" data-a="closeSheet">סגירה</button></div>`); setTimeout(()=>{const t=$("#cpy"); t&&t.select();},50); }
}

/* ================= store ================= */
/* Everything lives on this device (localStorage). Nothing is ever sent to a server: the page's
   Content-Security-Policy blocks outside connections. Each record carries _t (time of its last
   change) and a deletion leaves a tombstone in S.tomb, so encrypted updates from other commanders
   can be merged record by record (see 15-share.js). */
const APP_MODE = "local";
const APP_NAME = "שבצ״ק נא";
const NATIVE = false;   // the web app has no native shell; kept so shared code reads the same
const nativePlugin = () => null;
const COLLS = ["soldiers","tasks","rules","rosters"];
const S = { mode:"loading", downloads:null, sample:null, aiOff:true, readOnly:false, config:null, soldiers:{}, tasks:{}, rules:{}, rosters:{}, tomb:{}, loaded:{} };
const LS_KEY = "shabtzak-app-v1";
function lastBackup(){ try { return localStorage.getItem(LS_KEY + "-bk"); } catch(e){ return null; } }
function markBackup(){ try { localStorage.setItem(LS_KEY + "-bk", todayStr()); } catch(e){} }
function lastBackupText(){ const b = lastBackup(); return b ? `גיבוי אחרון: ${dm(b)}.` : "עוד לא נשמר גיבוי."; }
function backupDue(){ const b = lastBackup(); return !b || diffDays(b, todayStr()) >= 3; }
function backupObj(){ return { app:"shabtzak", v:2, at:new Date().toISOString(), config:S.config, soldiers:S.soldiers, tasks:S.tasks, rules:S.rules, rosters:S.rosters, tomb:S.tomb }; }
let renderPending = false;
function scheduleRender(){ if (renderPending) return; renderPending = true; requestAnimationFrame(()=>{ renderPending=false; render(); }); }

function applyLocal(path, obj){
  if (path === "line/config"){ S.config = obj; return; }
  const [c, id] = path.split("/"); const m = S[c];
  if (!m) return;
  if (obj === null) delete m[id]; else m[id] = Object.assign({ id }, obj);
}
let persistTimer = null, persistWarned = false;
function persistNow(){
  try { localStorage.setItem(LS_KEY, JSON.stringify({ config:S.config, soldiers:S.soldiers, tasks:S.tasks, rules:S.rules, rosters:S.rosters, tomb:S.tomb })); }
  catch(e){ if (!persistWarned){ persistWarned = true; toast("המכשיר חוסם שמירה. שמרו גיבוי לקובץ"); } }
}
function persistLocal(){ clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 60); }
function strip(obj){ const o = Object.assign({}, obj); delete o.id; return JSON.parse(JSON.stringify(o)); }
/* opts.keepTime: the record already carries its _t (merging someone else's change); opts.t: tombstone time */
function put(path, obj, opts){
  const body = obj === null ? null : strip(obj);
  if (body && !(opts && opts.keepTime)) body._t = Date.now();
  if (body === null) S.tomb[path] = Math.max(S.tomb[path] || 0, (opts && opts.t) || Date.now());
  else delete S.tomb[path];
  applyLocal(path, body); scheduleRender(); persistLocal();
}
function bulkPut(entries){ for (const [p,o] of entries) put(p,o); }
/* save a file the way phones like it: the share sheet when it can take files, a download otherwise */
async function saveFile(name, data, type, latinName){
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:name }); return "shared"; }
  } catch(e){ if (e && e.name === "AbortError") return "cancel"; }
  // some browsers drop Hebrew names on a download link, so the download gets a Latin one
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = latinName || name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  return "downloaded";
}

async function initStore(){
  S.mode = "local";
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw){ const o = JSON.parse(raw); Object.assign(S, { config:o.config||null, soldiers:o.soldiers||{}, tasks:o.tasks||{}, rules:o.rules||{}, rosters:o.rosters||{}, tomb:o.tomb||{} }); }
  } catch(e){}
  // a line gets a stable id so updates from another line can be told apart (no new _t: nothing changed)
  if (S.config && !S.config.lineId){ S.config.lineId = uid("L"); persistNow(); }
  S.loaded = { config:true, soldiers:true, tasks:true, rules:true, rosters:true };
  scheduleRender();
}
function isLoaded(){ return S.loaded.config && S.loaded.soldiers && S.loaded.tasks && S.loaded.rules; }
