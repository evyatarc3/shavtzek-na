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
/* Task kinds: regular (size/cmd/needs per shift), company (t.parts: a part per platoon, each with its own
   size/cmd/needs) and ghost (t.ghost = {of:[task ids], note}: whoever holds those tasks holds this one too;
   no slots, no demand, no load). t.dates (one-time dates) replaces t.days when set. */
/* ghost ("רפאים") task: its own seats, but its people are not taken by it. They may hold the tasks in ghost.ok at
   the same time (e.g. כרמל with ש״ג and תורן, not with סיור); it needs no rest, adds no load, caps or demand. */
const isGhost = t => !!(t && t.ghost);
const ghostOk = t => (t && t.ghost && (t.ghost.ok || t.ghost.of)) || [];
/* may one person hold tasks a and b at the same time? only a ghost task and what it allows */
const parOK = (a, b) => !!a && !!b && ((isGhost(a) && ghostOk(a).includes(b.id)) || (isGhost(b) && ghostOk(b).includes(a.id)));
const taskParts = t => (t && Array.isArray(t.parts) && t.parts.length) ? t.parts : null;
function taskComp(t){
  const parts = taskParts(t);
  if (!parts) return { size: Math.max(1, Number(t.size) || 1), cmd: Number(t.cmd) || 0, needs: t.needs || [] };
  const needs = {}; for (const pt of parts) for (const n of (pt.needs || [])) if (n.tag) needs[n.tag] = (needs[n.tag] || 0) + (Number(n.count) || 1);
  return { size: parts.reduce((a, pt) => a + Math.max(1, Number(pt.size) || 1), 0), cmd: parts.reduce((a, pt) => a + (Number(pt.cmd) || 0), 0), needs: Object.entries(needs).map(([tag, count]) => ({ tag, count })) };
}
function taskPlatoons(t){
  const parts = taskParts(t); if (!parts) return t.platoons || jointPl();
  const s = new Set(); for (const pt of parts) (pt.pl ? [Number(pt.pl)] : (t.platoons || jointPl())).forEach(n => s.add(Number(n))); return [...s];
}
const taskOnDay = (t, d) => (t.dates && t.dates.length) ? t.dates.includes(d) : (t.days || [0,1,2,3,4,5,6]).includes(dow(d));
function taskActive(t, d){ return taskOnDay(t, d) && taskPlatoons(t).some(pl => platoonIn(pl, d)); }
const parNames = t => ghostOk(t).map(id => (S.tasks[id] || {}).name).filter(Boolean);
/* the first ghost version mirrored its hosts ({ghost:{of}}, no seats). Turn those into ghost tasks with their own
   seats: same hours and days as the first host, as many people as the hosts had per shift */
function migrateTasks(){
  for (const t of Object.values(S.tasks)) if (t && t.ghost && t.ghost.of && !t.ghost.ok){
    const hosts = t.ghost.of.map(id => S.tasks[id]).filter(Boolean), h = hosts[0] || {};
    const u = Object.assign({}, t, { ghost: { ok: t.ghost.of.slice(), note: t.ghost.note || "" },
      size: Math.max(1, hosts.reduce((a, x) => a + (taskParts(x) ? 0 : Number(x.size) || 1), 0)), cmd: 0, needs: [], weight: 0,
      start: h.start ?? 0, len: h.len ?? 24, hours: h.hours ?? 24, days: (h.days && h.days.length) ? h.days.slice() : [0,1,2,3,4,5,6],
      dates: (h.dates || []).slice(), platoons: h.id ? taskPlatoons(h) : jointPl() });
    put("tasks/" + t.id, u);
  }
}
/* A task runs `hours` a day (max 24) starting at `start`, split into shifts of `len` hours.
   Older records only have `count`; hours = count × len, capped at 24. */
function taskShape(t){
  const len = Math.max(1, Math.min(24, Number(t.len) || 8));
  const hours = Math.max(1, Math.min(24, Number(t.hours) || (Number(t.count) || 1) * len));
  const count = Math.ceil(hours / len);
  const rest = isGhost(t) ? 0 : (t.rest ?? settings().minRest);
  const teams = Math.max(1, Math.min(count, Math.ceil((len + rest) / len)));   // crews that rotate so each gets its rest
  return { len, hours, count, rest, teams, start: Number(t.start) || 0, size: taskComp(t).size };
}
function taskMult(t){ return taskShape(t).teams; }
function taskNeed(t){ const s = taskShape(t); return s.size * s.teams; }
function taskShiftsText(t){ const s = taskShape(t); const out = []; for (let i = 0; i < s.count; i++){ const a = s.start + i * s.len, b = a + Math.min(s.len, s.hours - i * s.len); out.push(hh(a) + "–" + hh(b)); } return out; }
function demand(d){
  let need = 0, cmd = 0; const tags = {};
  for (const t of tasksList()) if (taskActive(t, d) && !isGhost(t)){   // a ghost task's people are counted elsewhere
    const m = taskMult(t), c = taskComp(t); need += c.size * m; cmd += c.cmd * m;
    for (const n of c.needs) if (n.tag) tags[n.tag] = (tags[n.tag] || 0) + (n.count || 1) * m;
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
    const sh = taskShape(t), parts = taskParts(t);
    for (let i = 0; i < sh.count; i++){
      const st = sh.start + i * sh.len, ln = Math.min(sh.len, sh.hours - i * sh.len);
      const base = { t: t.id, s: st, len: ln, S: di * 24 + st, E: di * 24 + st + ln, night: nightHours(st, ln) * 2 >= ln };
      if (parts) for (const pt of parts){
        const size = Math.max(1, Number(pt.size) || 1), cmd = Number(pt.cmd) || 0, needs = pt.needs || [];
        out.push(Object.assign({}, base, { k: t.id + "@" + st + "#" + pt.id, part: pt.id, pl: Number(pt.pl) || 0, size, cmd, needs, pri: cmd * 10 + needs.length * 5 + size + 20 }));
      }
      else out.push(Object.assign(base, { k: t.id + "@" + st, size: sh.size, cmd: Number(t.cmd) || 0, needs: t.needs || [], pri: (t.cmd || 0) * 10 + (t.needs || []).length * 5 + sh.size }));
    }
  }
  return out.sort((a,b) => a.S - b.S || b.pri - a.pri);
}
/* what one slot needs and who may fill it: a company part has its own numbers and its own platoon */
function slotComp(t, sl){
  const pt = sl && sl.part && taskParts(t) ? taskParts(t).find(x => x.id === sl.part) : null;
  if (pt) return { cmd: Number(pt.cmd) || 0, needs: pt.needs || [], pls: pt.pl ? [Number(pt.pl)] : (t.platoons || jointPl()), name: pt.name || "", pl: Number(pt.pl) || 0 };
  return { cmd: Number(t && t.cmd) || 0, needs: (t && t.needs) || [], pls: (t && t.platoons) || jointPl(), name: "", pl: 0 };
}
const partLabel = (t, sl) => { const c = slotComp(t, sl); return [c.pl ? plName(c.pl) : "", c.name].filter(Boolean).join(" · "); };
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
function slotLoad(t, sl){ if (isGhost(t)) return 0; const w = t ? (t.weight ?? 1) : 1; return sl.len * w + (sl.night ? sl.len * 0.5 * w : 0); }

/* ================= חוקת משימות (task rulebook) ================= */
/* Per task: who may serve (t.who), who is exempt (t.exempt), fixed queue (t.queue), rest after it (t.rest).
   Per person: exemptions (p.exempt: all / nights / one task, optionally until a date).
   General (settings): rest after a night shift, caps per day / week / nights a week. */
const WEEK_MEMO = new Map();
const weekOf = d => { let w = WEEK_MEMO.get(d); if (w === undefined){ w = addDays(d, -dow(d)); WEEK_MEMO.set(d, w); } return w; };
function restAfter(t, sl){ if (isGhost(t)) return 0; const s = settings(), base = (t && t.rest != null) ? t.rest : s.minRest; return sl.night ? Math.max(base, s.restAfterNight || 0) : base; }
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

/* ---- the generator ----
   1. Every other roster counts: its load (for fairness), its shifts near these dates (rest, both before and after)
      and its weekly counts (caps). Seats locked by hand on these dates are booked first, so the rest is planned around them.
   2. Slots are filled in time order. Within the rules, the pick goes to whoever has the fewest shifts today, then the
      lowest load relative to the days they were in (someone who came late or went out isn't made to catch up).
   3. A balancing pass then moves and swaps seats while that evens out load, nights and shifts per day. */
const FAIR = { day: 10, cmdW: 1.15, wNight: 8, wDay: 30, ms: 250, passes: 10 };
const cmdLike = p => !!p && (isCmd(p) || isCmdP(p));
function restOK(st, pid, sl, rest, skipKey){
  for (const o of (st.iv[pid] || [])){
    if (skipKey && o.key === skipKey) continue;
    if (o.S < sl.E && sl.S < o.E) return false;
    if (o.E <= sl.S && sl.S - o.E < o.R) return false;
    if (sl.E <= o.S && o.S - sl.E < rest) return false;
  }
  return true;
}
/* a seat is locked when it was set by hand: per seat (sl.lk[i]). A slot locked as a whole (sl.lock with no seat
   marked: older rosters, or a phone with an older version) locks every filled seat */
const seatLocked = (sl, i) => !!(sl && sl.p && sl.p[i]) && (!!(sl.lk && sl.lk[i]) || (!!sl.lock && !(sl.lk || []).some(Boolean)));
function generate(dates, opt = {}){
  const c = cfg(), R = ruleMaps(), excl = opt.exclude || new Set();
  const all = people().filter(p => !excl.has(p.id));
  const byId = Object.fromEntries(all.map(p => [p.id, p]));
  dates = [...new Set(dates)].sort(); const set = new Set(dates);
  const st = { iv:{}, piv:{}, parN:{}, load:{}, nightN:{}, perDay:{}, perWeek:{}, nights:{}, last:{}, f:{}, w:{} };
  if (!dates.length) return {};
  const weeks = new Set(dates.map(weekOf)), lo = addDays(dates[0], -2), hi = addDays(dates[dates.length - 1], 2);
  const histDays = [];
  if (!opt.fresh){
    for (const [dk, r] of Object.entries(S.rosters)){
      if (set.has(dk) || !r) continue; histDays.push(dk);
      const di = diffDays(c.lineStart, dk), wk = weekOf(dk);
      for (const sl of (r.slots || [])){
        const t = S.tasks[sl.t];
        for (const pid of (sl.p || [])) if (pid){
          if (isGhost(t)){   // ghost seats: only who-was-it-last (fairness) and clashes near these dates
            st.parN[t.id + "|" + pid] = (st.parN[t.id + "|" + pid] || 0) + 1;
            if (dk >= lo && dk <= hi) (st.piv[pid] = st.piv[pid] || []).push({ S: di * 24 + sl.s, E: di * 24 + sl.s + sl.len, t: t.id });
            continue;
          }
          st.load[pid] = (st.load[pid] || 0) + slotLoad(t, sl); if (sl.night) st.nightN[pid] = (st.nightN[pid] || 0) + 1;
          if (dk >= lo && dk <= hi) (st.iv[pid] = st.iv[pid] || []).push({ S: di * 24 + sl.s, E: di * 24 + sl.s + sl.len, R: restAfter(t, sl), t: sl.t });
          if (weeks.has(wk)){ st.perWeek[wk + pid] = (st.perWeek[wk + pid] || 0) + 1; if (sl.night) st.nights[wk + pid] = (st.nights[wk + pid] || 0) + 1; }
          if (dk < dates[0] && t) st.last[t.id + "|" + pid] = Math.max(st.last[t.id + "|" + pid] ?? -1e9, di * 24 + sl.s);
        }
      }
    }
  }
  // fairness is relative to the days a person was in: f scales load to the average presence
  const pres = {}; for (const d of histDays.concat(dates)) for (const p of all) if (present(p, d)) pres[p.id] = (pres[p.id] || 0) + 1;
  const pv = Object.values(pres), P = pv.length ? pv.reduce((a, b) => a + b, 0) / pv.length : 1;
  for (const p of all){ st.f[p.id] = P / Math.max(1, pres[p.id] || 0); st.w[p.id] = cmdLike(p) ? FAIR.cmdW : 1; }
  // what was there before on these dates: seats set by hand are booked before anything else; people taken out of a
  // seat by hand (sl.x) are not put back into it
  const prevBy = {};
  for (const d of dates){
    const prev = opt.fresh ? null : S.rosters[d]; if (!prev) continue;
    const keys = new Set(buildSlots(d).map(x => x.k)), di = diffDays(c.lineStart, d);
    for (const sl of (prev.slots || [])) if (keys.has(sl.k)){
      prevBy[d + "|" + sl.k] = sl;
      const t = S.tasks[sl.t], abs = Object.assign({}, sl, { S: di * 24 + sl.s, E: di * 24 + sl.s + sl.len });
      (sl.p || []).forEach((pid, i) => { if (pid && byId[pid] && seatLocked(sl, i)) (isGhost(t) ? bookPar : bookSeat)(st, pid, t, abs, d, d + "|" + sl.k); });
    }
  }
  // fixed-queue slots ahead: the people next in line are kept free for them where possible
  const built = {}; st.qs = [];
  for (const d of dates){ built[d] = buildSlots(d); for (const x of built[d]){ const t = S.tasks[x.t]; if (t.queue && t.queue.on) st.qs.push({ t: t.id, S: x.S }); } }
  const result = {};
  for (const d of dates){
    // regular slots now; a ghost task's seats wait until everyone's real shifts are known
    const slots = built[d].map(sl => isGhost(S.tasks[sl.t]) ? null : fillSlot(sl, d, all, byId, R, st, prevBy[d + "|" + sl.k]));
    result[d] = { date: d, slots, gen: Date.now() };
  }
  if (opt.polish !== false) balanceRoster(result, dates, all, byId, R, st, built);
  for (const d of dates){
    built[d].forEach((sl, i) => { if (!result[d].slots[i]) result[d].slots[i] = fillSlot(sl, d, all, byId, R, st, prevBy[d + "|" + sl.k]); });
  }
  return result;
}
function bookSeat(st, id, t, sl, d, key){
  const wk = weekOf(d);
  (st.iv[id] = st.iv[id] || []).push({ S: sl.S, E: sl.E, R: restAfter(t, sl), key, t: t.id });
  st.load[id] = (st.load[id] || 0) + slotLoad(t, sl); if (sl.night) st.nightN[id] = (st.nightN[id] || 0) + 1;
  st.perDay[d + id] = (st.perDay[d + id] || 0) + 1; st.perWeek[wk + id] = (st.perWeek[wk + id] || 0) + 1;
  if (sl.night) st.nights[wk + id] = (st.nights[wk + id] || 0) + 1;
}
function unbookSeat(st, id, t, sl, d, key){
  const wk = weekOf(d);
  st.iv[id] = (st.iv[id] || []).filter(o => o.key !== key);
  st.load[id] = (st.load[id] || 0) - slotLoad(t, sl); if (sl.night) st.nightN[id] = (st.nightN[id] || 0) - 1;
  st.perDay[d + id] = (st.perDay[d + id] || 0) - 1; st.perWeek[wk + id] = (st.perWeek[wk + id] || 0) - 1;
  if (sl.night) st.nights[wk + id] = (st.nights[wk + id] || 0) - 1;
}
/* a ghost seat: no load, rest, day or week count; only what may overlap it, and how often each person had it */
function bookPar(st, id, t, sl, d, key){
  (st.piv[id] = st.piv[id] || []).push({ S: sl.S, E: sl.E, key, t: t.id });
  st.parN[t.id + "|" + id] = (st.parN[t.id + "|" + id] || 0) + 1;
}
/* would a seat of task t at [sl.S, sl.E) clash with this person's other seats (regular or ghost)? */
function parClash(st, pid, t, sl){
  if (isGhost(t)) for (const o of (st.iv[pid] || [])) if (o.S < sl.E && sl.S < o.E && !parOK(t, S.tasks[o.t])) return true;
  for (const o of (st.piv[pid] || [])) if (o.S < sl.E && sl.S < o.E && !parOK(t, S.tasks[o.t])) return true;
  return false;
}

const WHY_TXT = { out:"לא בפנים", unit:"", rest:"במנוחה", rule:"לפי החוקה", cap:"הגיעו לתקרה", pair:"אילוץ זוגות", clash:"במשימה אחרת באותה שעה", busy:"" };
/* why this person can't take this seat (static rules, rest, caps), or null. `skip` is a seat they are leaving */
function staticBlock(p, t, sl, d, R){
  if (p.noAuto) return "busy";
  if (!slotComp(t, sl).pls.includes(p.platoon)) return "unit";
  if (!present(p, d)) return "out";
  if (R.notTask[p.id] && R.notTask[p.id].has(t.id)) return "rule";
  if (R.only[p.id] && !R.only[p.id].has(t.id)) return "rule";
  if (sl.night && R.noNight.has(p.id)) return "rule";
  if (ruleReasons(p, t, sl, d).length) return "rule";
  return null;
}
function seatBlock(p, t, sl, d, R, st, chosen, skip){
  const s = settings(), wk = weekOf(d);
  if (chosen.includes(p.id) || (sl.x && sl.x.includes(p.id))) return "busy";
  const memo = st.sb || (st.sb = new Map()), mk = p.id + "|" + d + "|" + sl.k;
  let sb = memo.get(mk); if (sb === undefined){ sb = staticBlock(p, t, sl, d, R); memo.set(mk, sb); }
  if (sb) return sb;
  if (parClash(st, p.id, t, sl)) return "clash";
  if (isGhost(t)){ for (const g of R.apart) if (g.has(p.id) && chosen.some(c => c !== p.id && g.has(c))) return "pair"; return null; }
  if (!restOK(st, p.id, sl, restAfter(t, sl), skip && skip.key)) return "rest";
  const sd = skip && skip.d === d ? 1 : 0, sw = skip && weekOf(skip.d) === wk ? 1 : 0, sn = sw && (skip.sl || skip).night ? 1 : 0;
  const cap = capOf(R, p.id);
  if (cap && (st.perDay[d + p.id] || 0) - sd >= cap) return "cap";
  if (s.maxPerWeek && (st.perWeek[wk + p.id] || 0) - sw >= s.maxPerWeek) return "cap";
  if (sl.night && s.maxNightsWeek && (st.nights[wk + p.id] || 0) - sn >= s.maxNightsWeek) return "cap";
  for (const g of R.apart) if (g.has(p.id) && chosen.some(c => c !== p.id && g.has(c))) return "pair";
  return null;
}
function fillSlot(sl, d, all, byId, R, st, prev){
  const t = S.tasks[sl.t], comp = slotComp(t, sl), key = d + "|" + sl.k, par = isGhost(t);
  const chosen = [], warns = [];
  const extra = { }; if (sl.part){ extra.part = sl.part; extra.pl = sl.pl; }
  // seats set by hand stay where they are (already booked in generate)
  const seat = Array(sl.size).fill(null), lk = Array(sl.size).fill(false);
  if (prev) (prev.p || []).forEach((id, i) => {
    if (!seatLocked(prev, i) || !byId[id] || chosen.includes(id)) return;
    const j = i < sl.size && !seat[i] ? i : seat.indexOf(null); if (j < 0) return;
    seat[j] = id; lk[j] = true; chosen.push(id); st.last[t.id + "|" + id] = sl.S;
  });
  const xs = (prev && prev.x || []).filter(Boolean); if (xs.length){ extra.x = xs; sl = Object.assign({}, sl, { x: xs }); }
  const why = p => seatBlock(p, t, sl, d, R, st, chosen);
  const elig = p => !why(p);
  const tagged = new Set(comp.needs.map(n => n.tag));
  const reserved = new Set();
  if (!(t.queue && t.queue.on) && st.qs && st.qs.length){
    const winE = sl.E + restAfter(t, sl), cnt = {};
    for (const x of st.qs) if (x.S >= sl.S && x.S < winE) cnt[x.t] = (cnt[x.t] || 0) + 1;
    for (const [tid, m] of Object.entries(cnt)) queueNow(st, S.tasks[tid], d).slice(0, m).forEach(id => reserved.add(id));
  }
  /* fixed queue: whoever did this task longest ago goes next; never yet → by the queue's order */
  const q = t.queue && t.queue.on ? t.queue.order || [] : null;
  const qIdx = p => { const i = q.indexOf(p.id); return i < 0 ? q.length + 1 : i; };
  const score = q ? (p => { const last = st.last[t.id + "|" + p.id]; return (last == null ? -1e9 : last) + qIdx(p) * 1e-3; })
    : par ? (p => (st.parN[t.id + "|" + p.id] || 0) * (st.f[p.id] || 1) * 10 + (st.load[p.id] || 0) * (st.f[p.id] || 1) * 0.01 + hash(p.id + sl.k + d))
    : ((p, seat) => (st.load[p.id] || 0) * (st.f[p.id] || 1) * (st.w[p.id] || 1)
      + FAIR.day * (st.perDay[d + p.id] || 0) + (reserved.has(p.id) ? 60 : 0)
      + (seat !== "cmd" && isCmd(p) ? 4 : 0) + (seat !== "cmd" && isCmdP(p) ? 1.5 : 0)
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
  if (comp.pl && !platoonIn(comp.pl, d)) warns.push(`${plName(comp.pl)} לא בפנים`);
  for (const pool of (R.must[t.id] || [])){
    if (!chosen.some(c => pool.includes(c)) && !pick(p => pool.includes(p.id), "must")) warns.push("חסר: " + pool.map(id => (byId[id] || S.soldiers[id] || {}).name || "?").join(" / "));
  }
  let needCmd = comp.cmd - chosen.filter(id => isCmd(byId[id])).length;
  while (needCmd > 0){ if (pick(isCmd, "cmd") || pick(isCmdP, "cmd")) needCmd--; else { warns.push("חסר מפקד"); break; } }
  for (const n of comp.needs){
    let miss = (n.count || 1) - chosen.filter(id => hasTag(byId[id], n.tag)).length;
    while (miss > 0){ if (pick(p => hasTag(p, n.tag), "tag")) miss--; else { warns.push("חסר " + n.tag); break; } }
  }
  while (chosen.length < sl.size){ if (!pick(() => true, "any")) break; }
  if (chosen.length < sl.size){
    // say why: how many of the people who could have come were held back, and by what
    const tally = {}; for (const p of all){ const w = why(p); if (w && WHY_TXT[w]) tally[w] = (tally[w] || 0) + 1; }
    const parts = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${WHY_TXT[k]}`);
    if (!parts.length && comp.pl && !all.some(p => p.platoon === comp.pl)) parts.push(`אין חיילים ב${plName(comp.pl)}`);
    warns.push(`חסרים ${sl.size - chosen.length}` + (parts.length ? ` · ${parts.join(", ")}` : ""));
  }
  for (const id of chosen){
    if (seat.includes(id)) continue;   // locked: booked before
    (par ? bookPar : bookSeat)(st, id, t, sl, d, key); st.last[t.id + "|" + id] = sl.S;
    seat[seat.indexOf(null)] = id;
  }
  return Object.assign({ k: sl.k, t: sl.t, s: sl.s, len: sl.len, night: sl.night, p: seat, lock: lk.some(Boolean), lk, w: warns }, extra);
}
/* who the fixed queue of task t would call next (longest since served first, then the queue's order) */
function queueNow(st, t, d){
  const order = (t.queue && t.queue.order) || [];
  return order.filter(id => S.soldiers[id] && present(S.soldiers[id], d))
    .map((id, i) => [id, (st.last[t.id + "|" + id] ?? -1e9) + i * 1e-3]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}
/* ---- balancing pass: move a seat from a heavier person to a lighter one, or swap two seats,
   whenever that lowers  Σ ω·load² + wNight·Σ f·nights² + wDay·Σ (shifts per day)²  (ω, f: presence and role factors).
   Never touches locked seats, fixed-queue tasks, "together" pairs or a seat that covers a "must" rule,
   and keeps every slot's commanders and פק״לים. */
function balanceRoster(res, dates, all, byId, R, st, built){
  const c = cfg(), t0 = Date.now(), seats = [], mine = {};
  const mustIds = new Set(); Object.values(R.must).forEach(ps => ps.forEach(pool => pool.forEach(id => mustIds.add(id))));
  for (const d of dates){
    const di = diffDays(c.lineStart, d);
    res[d].slots.forEach((sl, si) => {
      const t = sl && S.tasks[sl.t]; if (!t || isGhost(t) || (t.queue && t.queue.on)) return;
      const abs = Object.assign({}, sl, { S: di * 24 + sl.s, E: di * 24 + sl.s + sl.len });
      sl.p.forEach((pid, pi) => { if (seatLocked(sl, pi)) return; const seat = { d, di, si, pi, t, sl: abs, key: d + "|" + sl.k, x: slotLoad(t, sl) }; seats.push(seat); if (pid) (mine[pid] = mine[pid] || []).push(seat); });
    });
  }
  const occ = seat => res[seat.d].slots[seat.si].p[seat.pi];
  const A = id => (st.load[id] || 0) * (st.f[id] || 1) * (st.w[id] || 1);
  const C = (id, d) => st.perDay[d + id] || 0;
  const sq = x => x * x;
  /* cost change if person `id` loses seat `out` and/or gains seat `inn` */
  /* each person's term is ω·L² with ω = presence factor × role weight: the optimum is where ω·L is equal,
     so someone who was in for half the days ends up with about half the load */
  const delta = (id, out, inn) => {
    const fN = st.f[id] || 1, om = fN * (st.w[id] || 1), L = st.load[id] || 0, Nn = st.nightN[id] || 0;
    const dL = (inn ? inn.x : 0) - (out ? out.x : 0), dN = (inn && inn.sl.night ? 1 : 0) - (out && out.sl.night ? 1 : 0);
    let v = om * (sq(L + dL) - sq(L)) + FAIR.wNight * fN * (sq(Nn + dN) - sq(Nn));
    if (out && inn && out.d === inn.d) return v;
    if (out) v += FAIR.wDay * (sq(C(id, out.d) - 1) - sq(C(id, out.d)));
    if (inn) v += FAIR.wDay * (sq(C(id, inn.d) + 1) - sq(C(id, inn.d)));
    return v;
  };
  /* can b sit in `seat` (leaving `leave`, if swapping) without breaking the slot's commanders / פק״לים */
  const fits = (b, seat, leave) => {
    const sl = res[seat.d].slots[seat.si], a = byId[occ(seat)], others = sl.p.filter((x, i) => x && i !== seat.pi);
    if (others.includes(b.id) || (R.together[b.id] && R.together[b.id].size)) return false;
    if (seatBlock(b, seat.t, seat.sl, seat.d, R, st, others, leave) ) return false;
    const comp = slotComp(seat.t, seat.sl), cnt = fn => others.filter(id => fn(byId[id] || S.soldiers[id])).length;
    if (comp.cmd){ const before = cnt(cmdLike) + (cmdLike(a) ? 1 : 0), after = cnt(cmdLike) + (cmdLike(b) ? 1 : 0); if (after < Math.min(comp.cmd, before)) return false; }
    for (const n of comp.needs){ const h = p => hasTag(p, n.tag), before = cnt(h) + (a && h(a) ? 1 : 0), after = cnt(h) + (h(b) ? 1 : 0); if (after < Math.min(n.count || 1, before)) return false; }
    return true;
  };
  const movable = id => !!byId[id] && !mustIds.has(id) && !(R.together[id] && R.together[id].size);
  const apply = (seat, from, to) => {
    res[seat.d].slots[seat.si].p[seat.pi] = to;
    if (from){ unbookSeat(st, from, seat.t, seat.sl, seat.d, seat.key); mine[from] = (mine[from] || []).filter(x => x !== seat); }
    if (to){ bookSeat(st, to, seat.t, seat.sl, seat.d, seat.key); (mine[to] = mine[to] || []).push(seat); }
  };
  for (let pass = 0; pass < FAIR.passes && Date.now() - t0 < FAIR.ms; pass++){
    let moved = 0;
    const heavy = Object.keys(mine).filter(movable).sort((a, b) => A(b) - A(a));
    for (const a of heavy){
      for (const X of (mine[a] || []).slice()){
        if (occ(X) !== a) continue;
        let best = null, bestV = -1e-6;
        for (const b of all){
          if (b.id === a || !movable(b.id) || !present(b, X.d)) continue;
          // 1. move: b takes a's seat
          const mv = delta(a, X, null) + delta(b.id, null, X);
          if (mv < bestV && fits(b, X, null)){ bestV = mv; best = [X, null, b.id]; }
          // 2. swap with one of b's seats on the same or a neighbouring day
          for (const Y of (mine[b.id] || [])){
            if (Y.key === X.key || Math.abs(X.di - Y.di) > 1 || occ(Y) !== b.id) continue;
            const v = delta(a, X, Y) + delta(b.id, Y, X); if (v >= bestV) continue;
            if (fits(b, X, Y) && fits(byId[a], Y, X)){ bestV = v; best = [X, Y, b.id]; }
          }
        }
        if (!best) continue;
        const [x, y, b] = best;
        if (y){ apply(x, a, null); apply(y, b, null); apply(x, null, b); apply(y, null, a); }
        else apply(x, a, b);
        moved++;
      }
      if (Date.now() - t0 > FAIR.ms) break;
    }
    if (!moved) break;
  }
}
function unfilled(res){ let n = 0; for (const r of Object.values(res)) for (const sl of r.slots) n += sl.p.filter(x => !x).length; return n; }
/* run the actual roster for those days with and without the absence — the real "can I release" test */
function simulateAbs(p, abs){
  const days = range(abs.from, abs.to).filter(d => dayState(d, p.platoon) === "duty" && inWindow(p, d));
  if (!days.length || !tasksList().length) return null;
  const run = () => unfilled(generate(days, { fresh:true, polish:false }));
  let withAbs, without;
  try {
    if (abs.id) OVR.ignoreAbs = abs.id; else OVR.extraAbs = null;
    without = run();
    OVR.ignoreAbs = null; if (!abs.id) OVR.extraAbs = Object.assign({ pid:p.id, status:"fixed" }, abs);
    withAbs = run();
  } finally { OVR.ignoreAbs = null; OVR.extraAbs = null; }
  return { days, base: without, after: withAbs, delta: withAbs - without };
}
