"use strict";
/* ================= engine: calendar & presence ================= */
const DEF_SETTINGS = { minRest:8, minCmd:2, nightFrom:22, nightTo:6, restAfterNight:0, maxPerDay:0, maxPerWeek:0, maxNightsWeek:0 };
const cfg = () => S.config;
const settings = () => Object.assign({}, DEF_SETTINGS, (S.config && S.config.settings) || {});
const myPl = () => (S.config && S.config.myPlatoon) || 1;
/* rotation groups: platoons that go home together. Block "home" holds the key of the group at home (e.g. "12"), or "none". */
function groupsCfg(){ const g = S.config && S.config.groups; return Array.isArray(g) ? g : [[1,2],[3]]; }
function groupOf(pl){ const g = groupsCfg().find(x => x.includes(Number(pl))); return g ? g.join("") : "p" + pl; }
const groupLabel = key => { const g = groupsCfg().find(x => x.join("") === key); return g ? groupName(g) : key; };
function allPlatoons(){ const s = new Set(Object.keys((S.config && S.config.platoonNames) || {}).map(Number)); groupsCfg().forEach(g => g.forEach(n => s.add(Number(n)))); s.add(Number(myPl())); Object.values(S.soldiers).forEach(p => s.add(Number(p.platoon))); return [...s].filter(Boolean).sort((a, b) => a - b); }
function nextHome(key){ const keys = groupsCfg().map(g => g.join("")); if (keys.length < 2) return key === "none" ? keys[0] : "none"; const i = keys.indexOf(key); return i < 0 ? "none" : keys[(i + 1) % keys.length]; }
function terms(){ const t = (S.config && S.config.terms) || {}; return { u: t.u || "מחלקה", us: t.us || "מחלקות", duty: t.duty || "תעסוקה" }; }
const TU = () => terms().u, TUS = () => terms().us, TD = () => terms().duty;
const plName = pl => ((S.config && S.config.platoonNames) || {})[pl] || (TU() + " " + pl);
const shortName = n => { const nm = plName(n); return nm.startsWith(TU() + " " + n) ? String(n) : nm; };
const groupName = g => g.length === 1 ? plName(g[0]) : g.map(shortName).join("+");
function roleNames(){ const r = (S.config && S.config.roleNames) || {}, std = TU() === "מחלקה";
  return { mm: r.mm || (std ? "מ״מ" : "מפקד " + TU()), smm: r.smm || (std ? "סמל מחלקה" : "סגן מפקד"), cmd: r.cmd || "מפקד", cmdp: r.cmdp || "מפקד פוטנציאלי", soldier: r.soldier || "לוחם" }; }
function inLine(d){ const c = cfg(); return !!c && d >= c.lineStart && d <= c.lineEnd; }
function blockOf(d){ const c = cfg(); return c ? (c.blocks || []).find(b => d >= b.start && d <= b.end) || null : null; }
function platoonIn(pl, d){ if (!inLine(d)) return false; const b = blockOf(d); if (!b || b.home === "none") return true; return b.home !== groupOf(pl); }
function dayState(d, pl = myPl()){ if (!inLine(d)) return "out"; return platoonIn(pl, d) ? "duty" : "home"; }
function lineDays(){ const c = cfg(); return c ? range(c.lineStart, c.lineEnd) : []; }
/* units that share my rotation; if my unit is "always in", every always-in unit counts together */
const jointPl = () => {
  const g = groupsCfg().find(x => x.includes(Number(myPl())));
  const free = allPlatoons().filter(n => !groupsCfg().some(x => x.includes(n)));   // "always in" units serve with every rotation
  const out = [...new Set((g ? g.map(Number) : []).concat(free))];
  return out.length ? out : [Number(myPl())];
};
const JL = () => groupName(jointPl());
function eventOn(d){ const c = cfg(); return c ? (c.events || []).find(e => e.date === d) || null : null; }

const ROLE_RANK = { mm:0, smm:1, cmd:2, cmdp:3, soldier:4 };
function people(){
  return Object.values(S.soldiers).sort((a,b) => (a.platoon - b.platoon) || (ROLE_RANK[a.role]??9) - (ROLE_RANK[b.role]??9) || String(a.name).localeCompare(String(b.name), "he"));
}
const OVR = { ignoreAbs: null, extraAbs: null };
function absOn(p, d){
  if (OVR.extraAbs && OVR.extraAbs.pid === p.id && d >= OVR.extraAbs.from && d <= OVR.extraAbs.to) return OVR.extraAbs;
  return (p.absences || []).find(a => a.id !== OVR.ignoreAbs && a.from && a.to && d >= a.from && d <= a.to) || null;
}
function inWindow(p, d){ return inLine(d) && !(p.from && d < p.from) && !(p.to && d > p.to); }
function personStatus(p, d){
  if (!inWindow(p, d)) return "out";
  if (!platoonIn(p.platoon, d)) return "home";
  const a = absOn(p, d); if (a) return a.status === "request" ? "req" : "abs";
  if (p.tentative) return "tent";
  return "in";
}
const present = (p, d) => personStatus(p, d) === "in";
const hasTag = (p, tag) => (p.tags || []).includes(tag);

/* ================= פק״לים ================= */
const PAKAL_DEF = ["מאג","נגב","נגב 7","חובש","רחפן איבו","רחפן אווטה","רחפן עטלף","כדור ברזל","נהג","קשר","מטול","קלע"];
function pakalim(){ const p = S.config && S.config.pakalim; return Array.isArray(p) && p.length ? p : PAKAL_DEF.map((n, i) => ({ id:"k" + i, name:n, min: n === "חובש" ? 1 : 0 })); }
function pakalHolders(name, pl){ return people().filter(p => hasTag(p, name) && (pl == null || p.platoon === pl)); }
function pakalShort(x){ if (!x || x.state !== "duty") return []; return pakalim().filter(k => (k.min || 0) > 0 && (x.tagSup[k.name] || 0) < k.min); }

/* ================= per-unit headcount ================= */
/* A unit's count comes from its named people, unless a manual number was entered
   (fixed for every day it is in, or for one specific day) because its roster is incomplete. */
function unitManual(pl){ const u = S.config && S.config.unitCounts; return u && u[pl] ? u[pl] : null; }
function unitNamed(pl, d){ return people().filter(p => p.platoon === Number(pl) && present(p, d)).length; }
function unitManualOn(pl, d){ const m = unitManual(pl); if (!m) return null; if (m.days && m.days[d] != null) return Number(m.days[d]); if (m.base != null && m.base !== "") return Number(m.base); return null; }
function unitCount(pl, d){ if (!platoonIn(pl, d)) return 0; const m = unitManualOn(pl, d); return m != null ? m : unitNamed(pl, d); }

/* ================= engine: demand ================= */
function tasksList(){ return Object.values(S.tasks).sort((a,b) => (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name), "he")); }
function taskActive(t, d){ return (t.days || [0,1,2,3,4,5,6]).includes(dow(d)) && (t.platoons || jointPl()).some(pl => platoonIn(pl, d)); }
/* A task runs `hours` a day (max 24) starting at `start`, split into shifts of `len` hours.
   Older records only have `count`; hours = count × len, capped at 24. */
function taskShape(t){
  const len = Math.max(1, Math.min(24, Number(t.len) || 8));
  const hours = Math.max(1, Math.min(24, Number(t.hours) || (Number(t.count) || 1) * len));
  const count = Math.ceil(hours / len);
  const rest = t.rest ?? settings().minRest;
  const teams = Math.max(1, Math.min(count, Math.ceil((len + rest) / len)));   // crews that rotate so each gets its rest
  return { len, hours, count, rest, teams, start: Number(t.start) || 0, size: Number(t.size) || 1 };
}
function taskMult(t){ return taskShape(t).teams; }
function taskNeed(t){ const s = taskShape(t); return s.size * s.teams; }
function taskShiftsText(t){ const s = taskShape(t); const out = []; for (let i = 0; i < s.count; i++){ const a = s.start + i * s.len, b = a + Math.min(s.len, s.hours - i * s.len); out.push(hh(a) + "–" + hh(b)); } return out; }
function demand(d){
  let need = 0, cmd = 0; const tags = {};
  for (const t of tasksList()) if (taskActive(t, d)){
    const m = taskMult(t); need += (t.size || 0) * m; cmd += (t.cmd || 0) * m;
    for (const n of (t.needs || [])) if (n.tag) tags[n.tag] = (tags[n.tag] || 0) + (n.count || 1) * m;
  }
  return { need, cmd, tags };
}
function buildCtx(){
  const days = lineDays(), all = people(), jp = jointPl(), map = {};
  for (const d of days){
    const st = dayState(d), dm_ = demand(d);
    const pres = all.filter(p => jp.includes(p.platoon) && present(p, d));
    const tagSup = {}; for (const p of pres) for (const t of (p.tags || [])) tagSup[t] = (tagSup[t] || 0) + 1;
    const mine = pres.filter(p => p.platoon === myPl());
    const byPl = {}; for (const pl of jp) byPl[pl] = { n: unitCount(pl, d), named: unitNamed(pl, d), manual: platoonIn(pl, d) && unitManualOn(pl, d) != null };
    const info = {
      d, state: st, need: st === "duty" ? dm_.need : 0, cmdNeed: st === "duty" ? dm_.cmd : 0, tagNeed: st === "duty" ? dm_.tags : {},
      sup: jp.reduce((a, pl) => a + byPl[pl].n, 0), byPl, cmdSup: pres.filter(isCmd).length, cmdpSup: pres.filter(isCmdP).length, tagSup,
      p1: mine.length, p1Cmd: mine.filter(isCmd).length,
      tent: all.filter(p => jp.includes(p.platoon) && personStatus(p, d) === "tent").length,
      absent: all.filter(p => jp.includes(p.platoon) && ["abs","req"].includes(personStatus(p, d))),
    };
    info.slack = info.sup - info.need;
    map[d] = info;
  }
  return { days: days.map(d => map[d]), map, all };
}

/* ================= engine: generator ================= */
function nightHours(st, len){ const s = settings(); let n = 0; for (let h = st; h < st + len; h++){ const x = ((h % 24) + 24) % 24; if (x >= s.nightFrom || x < s.nightTo) n++; } return n; }
function buildSlots(d){
  const c = cfg(), di = diffDays(c.lineStart, d), out = [];
  for (const t of tasksList()) if (taskActive(t, d)){
    const sh = taskShape(t);
    for (let i = 0; i < sh.count; i++){
      const st = sh.start + i * sh.len, ln = Math.min(sh.len, sh.hours - i * sh.len);
      out.push({ k: t.id + "@" + st, t: t.id, s: st, len: ln, S: di * 24 + st, E: di * 24 + st + ln, size: sh.size,
        night: nightHours(st, ln) * 2 >= ln, pri: (t.cmd || 0) * 10 + (t.needs || []).length * 5 + sh.size });
    }
  }
  return out.sort((a,b) => a.S - b.S || b.pri - a.pri);
}
function ruleMaps(){
  const R = { notTask:{}, only:{}, noNight:new Set(), apart:[], together:{}, maxDay:{}, must:{} };
  for (const r of Object.values(S.rules)){
    if (r.on === false) continue; const a = r.a || [];
    if (r.type === "notTask") a.forEach(p => (R.notTask[p] = R.notTask[p] || new Set()).add(r.task));
    if (r.type === "onlyTask") a.forEach(p => (R.only[p] = R.only[p] || new Set()).add(r.task));
    if (r.type === "noNight") a.forEach(p => R.noNight.add(p));
    if (r.type === "apart" && a.length > 1) R.apart.push(new Set(a));
    if (r.type === "together" && a.length > 1) a.forEach(p => (R.together[p] = R.together[p] || new Set(), a.forEach(q => q !== p && R.together[p].add(q))));
    if (r.type === "maxPerDay") a.forEach(p => R.maxDay[p] = Math.min(R.maxDay[p] ?? 99, r.n || 1));
    if (r.type === "mustIn" && a.length) (R.must[r.task] = R.must[r.task] || []).push(a);
  }
  return R;
}
function slotLoad(t, sl){ const w = t ? (t.weight ?? 1) : 1; return sl.len * w + (sl.night ? sl.len * 0.5 * w : 0); }

/* ================= חוקת משימות (task rulebook) ================= */
/* Per task: who may serve (t.who), who is exempt (t.exempt), fixed queue (t.queue), rest after it (t.rest).
   Per person: exemptions (p.exempt: all / nights / one task, optionally until a date).
   General (settings): rest after a night shift, caps per day / week / nights a week. */
const weekOf = d => addDays(d, -dow(d));
function restAfter(t, sl){ const s = settings(), base = (t && t.rest != null) ? t.rest : s.minRest; return sl.night ? Math.max(base, s.restAfterNight || 0) : base; }
function exemptionsOn(p, d){ return (p.exempt || []).filter(x => !x.until || d <= x.until); }
/* rulebook reasons this person may not take this slot (static: qualifications and exemptions) */
function ruleReasons(p, t, sl, d){
  const out = [], w = t.who || {};
  if (w.mode === "tags" && (w.tags || []).length && !(w.tags || []).some(tg => hasTag(p, tg))) out.push(`לא מוסמך (${w.tags.join(" / ")})`);
  if (w.mode === "cmd" && !isCmd(p) && !isCmdP(p)) out.push("רק מפקדים");
  if (w.mode === "list" && !(w.list || []).includes(p.id)) out.push("לא ברשימת המורשים");
  if ((t.exempt || []).includes(p.id)) out.push("פטור מהמשימה");
  for (const x of exemptionsOn(p, d)){
    const until = x.until ? ` עד ${dm(x.until)}` : "", why = x.reason ? ` (${x.reason})` : "";
    if (x.scope === "all") out.push(`פטור מכל המשימות${until}${why}`);
    else if (x.scope === "task" && x.task === t.id) out.push(`פטור מהמשימה${until}${why}`);
    else if (x.scope === "night" && sl.night) out.push(`פטור מלילות${until}${why}`);
  }
  return out;
}
const capOf = (R, pid) => { const s = settings(), own = R.maxDay[pid]; return own != null ? own : (s.maxPerDay || 0); };

function generate(dates, opt = {}){
  const s = settings(), c = cfg(), R = ruleMaps(), excl = opt.exclude || new Set();
  const all = people().filter(p => !excl.has(p.id));
  const byId = Object.fromEntries(all.map(p => [p.id, p]));
  const st = { busy:{}, load:{}, perDay:{}, perWeek:{}, nights:{}, last:{} };
  const set = new Set(dates); dates = [...dates].sort();
  const weeks = new Set(dates.map(weekOf));
  if (!opt.fresh){
    for (const [dk, r] of Object.entries(S.rosters)){
      if (set.has(dk)) continue; const di = diffDays(c.lineStart, dk), wk = weekOf(dk);
      for (const sl of (r.slots || [])){
        const t = S.tasks[sl.t], E = di * 24 + sl.s + sl.len, night = sl.night;
        for (const pid of (sl.p || [])) if (pid){
          st.load[pid] = (st.load[pid] || 0) + slotLoad(t, sl);
          if (dk < dates[0]) st.busy[pid] = Math.max(st.busy[pid] ?? -1e9, E + restAfter(t, sl));
          if (weeks.has(wk)){ st.perWeek[wk + pid] = (st.perWeek[wk + pid] || 0) + 1; if (night) st.nights[wk + pid] = (st.nights[wk + pid] || 0) + 1; }
          if (dk < dates[0] && t) st.last[t.id + "|" + pid] = Math.max(st.last[t.id + "|" + pid] ?? -1e9, di * 24 + sl.s);
        }
      }
    }
  }
  const result = {};
  for (const d of dates){
    const prev = opt.fresh ? null : S.rosters[d], locked = {};
    if (prev) for (const sl of (prev.slots || [])) if (sl.lock) locked[sl.k] = sl;
    const slots = buildSlots(d).map(sl => fillSlot(sl, d, all, byId, R, st, locked[sl.k]));
    result[d] = { date: d, slots, gen: Date.now() };
  }
  return result;
}
const WHY_TXT = { out:"לא בפנים", unit:"", rest:"במנוחה", rule:"לפי החוקה", cap:"הגיעו לתקרה", pair:"אילוץ זוגות", busy:"" };
function fillSlot(sl, d, all, byId, R, st, lockedSlot){
  const t = S.tasks[sl.t], s = settings(), wk = weekOf(d);
  const chosen = [], warns = [];
  const commit = () => {
    for (const id of chosen){
      st.busy[id] = sl.E + restAfter(t, sl); st.load[id] = (st.load[id] || 0) + slotLoad(t, sl);
      st.perDay[d + id] = (st.perDay[d + id] || 0) + 1; st.perWeek[wk + id] = (st.perWeek[wk + id] || 0) + 1;
      if (sl.night) st.nights[wk + id] = (st.nights[wk + id] || 0) + 1;
      st.last[t.id + "|" + id] = sl.S;
    }
  };
  if (lockedSlot){
    for (const id of (lockedSlot.p || [])) if (id && byId[id]) chosen.push(id);
    commit(); const p = (lockedSlot.p || []).slice(0, sl.size); while (p.length < sl.size) p.push(null);
    return { k: sl.k, t: sl.t, s: sl.s, len: sl.len, night: sl.night, p, lock: true, w: [] };
  }
  /* why this person can't take the slot now, or null */
  const why = p => {
    if (chosen.includes(p.id) || p.noAuto) return "busy";
    if (!(t.platoons || jointPl()).includes(p.platoon)) return "unit";
    if (!present(p, d)) return "out";
    if ((st.busy[p.id] ?? -1e9) > sl.S) return "rest";
    if (R.notTask[p.id] && R.notTask[p.id].has(t.id)) return "rule";
    if (R.only[p.id] && !R.only[p.id].has(t.id)) return "rule";
    if (sl.night && R.noNight.has(p.id)) return "rule";
    if (ruleReasons(p, t, sl, d).length) return "rule";
    const cap = capOf(R, p.id);
    if (cap && (st.perDay[d + p.id] || 0) >= cap) return "cap";
    if (s.maxPerWeek && (st.perWeek[wk + p.id] || 0) >= s.maxPerWeek) return "cap";
    if (sl.night && s.maxNightsWeek && (st.nights[wk + p.id] || 0) >= s.maxNightsWeek) return "cap";
    for (const g of R.apart) if (g.has(p.id) && chosen.some(c => g.has(c))) return "pair";
    return null;
  };
  const elig = p => !why(p);
  const tagged = new Set((t.needs || []).map(n => n.tag));
  /* fixed queue: whoever did this task longest ago goes next; never yet → by the queue's order */
  const q = t.queue && t.queue.on ? t.queue.order || [] : null;
  const qIdx = p => { const i = q.indexOf(p.id); return i < 0 ? q.length + 1 : i; };
  const score = q ? (p => { const last = st.last[t.id + "|" + p.id]; return (last == null ? -1e9 : last) + qIdx(p) * 1e-3; })
    : ((p, seat) => (st.load[p.id] || 0)
      + (seat !== "cmd" && isCmd(p) ? 6 : 0) + (seat !== "cmd" && isCmdP(p) ? 2 : 0)
      + (seat !== "tag" && (p.tags || []).some(x => !tagged.has(x)) ? 1.5 : 0)
      + hash(p.id + sl.k + d) * 0.8);
  const pick = (fn, seat) => {
    const room = sl.size - chosen.length; if (room <= 0) return false;
    let best = null, bestS = Infinity;
    for (const p of all){
      if (!fn(p) || !elig(p)) continue;
      const unit = [p];
      for (const qq of (R.together[p.id] || [])){ const qp = byId[qq]; if (qp && !chosen.includes(qq)) unit.push(qp); }
      if (unit.length > room || !unit.every(u => u === p || elig(u))) continue;
      const sc = unit.reduce((a,u) => a + score(u, seat), 0) / unit.length;
      if (sc < bestS){ bestS = sc; best = unit; }
    }
    if (!best) return false; best.forEach(u => chosen.push(u.id)); return true;
  };
  for (const pool of (R.must[t.id] || [])){
    if (!chosen.some(c => pool.includes(c)) && !pick(p => pool.includes(p.id), "must")) warns.push("חסר: " + pool.map(id => (byId[id] || S.soldiers[id] || {}).name || "?").join(" / "));
  }
  let needCmd = (t.cmd || 0) - chosen.filter(id => isCmd(byId[id])).length;
  while (needCmd > 0){ if (pick(isCmd, "cmd") || pick(isCmdP, "cmd")) needCmd--; else { warns.push("חסר מפקד"); break; } }
  for (const n of (t.needs || [])){
    let miss = (n.count || 1) - chosen.filter(id => hasTag(byId[id], n.tag)).length;
    while (miss > 0){ if (pick(p => hasTag(p, n.tag), "tag")) miss--; else { warns.push("חסר " + n.tag); break; } }
  }
  while (chosen.length < sl.size){ if (!pick(() => true, "any")) break; }
  if (chosen.length < sl.size){
    // say why: how many of the people who could have come were held back, and by what
    const tally = {}; for (const p of all){ const w = why(p); if (w && WHY_TXT[w]) tally[w] = (tally[w] || 0) + 1; }
    const parts = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${WHY_TXT[k]}`);
    warns.push(`חסרים ${sl.size - chosen.length}` + (parts.length ? ` · ${parts.join(", ")}` : ""));
  }
  commit();
  const p = chosen.slice(); while (p.length < sl.size) p.push(null);
  return { k: sl.k, t: sl.t, s: sl.s, len: sl.len, night: sl.night, p, lock: false, w: warns };
}
function unfilled(res){ let n = 0; for (const r of Object.values(res)) for (const sl of r.slots) n += sl.p.filter(x => !x).length; return n; }
/* run the actual roster for those days with and without the absence — the real "can I release" test */
function simulateAbs(p, abs){
  const days = range(abs.from, abs.to).filter(d => dayState(d, p.platoon) === "duty" && inWindow(p, d));
  if (!days.length || !tasksList().length) return null;
  const run = () => unfilled(generate(days, { fresh:true }));
  let withAbs, without;
  try {
    if (abs.id) OVR.ignoreAbs = abs.id; else OVR.extraAbs = null;
    without = run();
    OVR.ignoreAbs = null; if (!abs.id) OVR.extraAbs = Object.assign({ pid:p.id, status:"fixed" }, abs);
    withAbs = run();
  } finally { OVR.ignoreAbs = null; OVR.extraAbs = null; }
  return { days, base: without, after: withAbs, delta: withAbs - without };
}
