// Engine tests: the task rulebook, merging updates, and the encryption. Run: node tests/engine.test.mjs
import { loadApp, fixture } from './load.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c){ pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const tick = () => new Promise(r => setTimeout(r, 10));
async function app(mod){
  const f = fixture(); if (mod) mod(f);
  const a = loadApp({ today:'2026-11-02', fixture:f }); await tick(); return a;
}
const WEEK = ['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07'];
const slotsOf = res => Object.values(res).flatMap(r => r.slots.map(s => Object.assign({ d:r.date }, s)));

console.log('who may serve');
{
  const { run } = await app(f => { f.tasks.t_drive.who = { mode:'tags', tags:['נהג'] }; });
  const sl = slotsOf(run(`generate(${JSON.stringify(WEEK)}, { fresh:true })`)).filter(s => s.t === 't_drive');
  const who = sl.flatMap(s => s.p).filter(Boolean);
  ok(who.length > 0 && who.every(id => run(`hasTag(S.soldiers[${JSON.stringify(id)}], "נהג")`)), `נהג תורן only gets drivers (${new Set(who).size} different drivers)`);
}
{
  const { run } = await app(f => { f.tasks.t_patrol.who = { mode:'cmd' }; f.tasks.t_patrol.size = 1; f.tasks.t_patrol.cmd = 0; });
  const who = slotsOf(run(`generate(${JSON.stringify(WEEK)}, { fresh:true })`)).filter(s => s.t === 't_patrol').flatMap(s => s.p).filter(Boolean);
  ok(who.length > 0 && who.every(id => run(`isCmd(S.soldiers["${id}"]) || isCmdP(S.soldiers["${id}"])`)), '"רק מפקדים" puts only commanders on patrol');
}
console.log('exemptions');
{
  const { run } = await app(f => {
    f.soldiers.s1_5.exempt = [{ scope:'night' }];
    f.soldiers.s1_6.exempt = [{ scope:'task', task:'t_gate', until:'2026-11-03' }];
    f.soldiers.s1_8.exempt = [{ scope:'all', until:'2026-11-04' }];
    f.tasks.t_obs.exempt = ['s1_7'];
  });
  const all = slotsOf(run(`generate(${JSON.stringify(WEEK)}, { fresh:true })`));
  ok(!all.some(s => s.night && s.p.includes('s1_5')), 'night exemption: no night shifts for ויקטור');
  ok(all.some(s => !s.night && s.p.includes('s1_5')), '…but day shifts still');
  ok(!all.some(s => s.t === 't_gate' && s.d <= '2026-11-03' && s.p.includes('s1_6')), 'task exemption with an end date holds until it');
  ok(!all.some(s => s.d <= '2026-11-04' && s.p.includes('s1_8')), 'exempt from everything until 4/11');
  ok(all.some(s => s.d > '2026-11-04' && s.p.includes('s1_8')), '…and back on the roster after it');
  ok(!all.some(s => s.t === 't_obs' && s.p.includes('s1_7')), 'a task\'s own exempt list is respected');
  const why = run(`ruleReasons(S.soldiers.s1_5, S.tasks.t_gate, { night:true }, "2026-11-02")`);
  ok(why.some(x => x.includes('לילות')), 'the manual-assign sheet explains the exemption: ' + why.join(' · '));
}
console.log('rest and caps');
{
  const { run } = await app(f => { Object.assign(f.config.settings, { restAfterNight:12, maxPerWeek:5, maxNightsWeek:2 }); });
  const res = run(`generate(${JSON.stringify(WEEK)}, { fresh:true })`), all = slotsOf(res);
  const per = {}, nights = {};
  all.forEach(s => s.p.filter(Boolean).forEach(id => { per[id] = (per[id] || 0) + 1; if (s.night) nights[id] = (nights[id] || 0) + 1; }));
  ok(Math.max(...Object.values(per)) <= 5, `nobody over 5 shifts a week (max ${Math.max(...Object.values(per))})`);
  ok(Math.max(0, ...Object.values(nights)) <= 2, `nobody over 2 nights a week (max ${Math.max(0, ...Object.values(nights))})`);
  const c = run('cfg()'), di = d => Math.round((Date.parse(d) - Date.parse(c.lineStart)) / 864e5);
  let restOk = true;
  for (const id of Object.keys(per)){
    const mine = all.filter(s => s.p.includes(id)).map(s => ({ A: di(s.d) * 24 + s.s, B: di(s.d) * 24 + s.s + s.len, night:s.night, t:s.t })).sort((a, b) => a.A - b.A);
    for (let i = 1; i < mine.length; i++){ const need = mine[i - 1].night ? 12 : 8; if (mine[i].A - mine[i - 1].B < need) restOk = false; }
  }
  ok(restOk, '12 h after a night shift, 8 h after any other');
  const gaps = all.filter(s => s.p.includes(null)).flatMap(s => s.w);
  ok(gaps.length === 0 || gaps.some(w => /במנוחה|תקרה|לא בפנים/.test(w)), 'unfilled slots say why' + (gaps[0] ? ': ' + gaps[0] : ' (none unfilled)'));
}
{
  const { run } = await app(f => { f.tasks.t_patrol.size = 40; });
  const w = slotsOf(run(`generate(["2026-11-02"], { fresh:true })`)).find(s => s.t === 't_patrol').w.join(' ');
  ok(/חסרים \d+ · /.test(w) && /במנוחה|לא בפנים|הגיעו לתקרה|לפי החוקה/.test(w), 'an impossible slot explains the shortage: ' + w);
}
console.log('fixed queue');
{
  const order = ['s1_9','s1_8','s1_7','s1_6','s1_5','s2_1','s2_2','s2_3','s2_4','s2_5','s2_6','s2_7','s2_8','s2_9'];
  const { run } = await app(f => { f.tasks.t_gate.queue = { on:true, order }; f.tasks.t_gate.who = { mode:'list', list:order }; });
  const gate = slotsOf(run(`generate(${JSON.stringify(WEEK)}, { fresh:true })`)).filter(s => s.t === 't_gate').sort((a, b) => a.d.localeCompare(b.d) || a.s - b.s).map(s => s.p[0]);
  // someone repeats only when the next in line is busy on another task; everyone gets a turn early
  const seen = new Set(); let rep = 0, i = 0; for (; i < gate.length && seen.size < order.length; i++){ if (seen.has(gate[i])) rep++; seen.add(gate[i]); }
  ok(seen.size === order.length && rep <= 3, `all ${order.length} in the queue serve within the first ${i} shifts (${rep} early repeats while others were busy)`);
  const firstRound = gate.slice(0, order.length);
  ok(gate.every(id => order.includes(id)), 'only people on the list serve');
  const firstPos = firstRound.map(id => order.indexOf(id));
  const inversions = firstPos.filter((p, i) => i && p < firstPos[i - 1]).length;
  ok(inversions <= 3, `the first round follows the queue order (${inversions} skips for rest)`);
  // a second run continues from where the queue stopped
  run(`for (const [d, r] of Object.entries(generate(${JSON.stringify(WEEK)}, { fresh:true }))) put("rosters/" + d, r)`);
  const next = run(`queueNext(S.tasks.t_gate, 3)`);
  ok(next.length === 3 && next.every(id => order.includes(id)), 'queueNext shows who is up next: ' + next.join(', '));
}
console.log('merging updates');
{
  const A = await app(), B = await app();
  // B starts from A's line, then both edit different people; B also deletes one
  B.run(`replaceWith(${A.run('JSON.stringify(updatePayload())')})`);
  await tick();
  A.run(`updPerson("s1_3", p => { p.tags = ["מאג"]; })`);
  await new Promise(r => setTimeout(r, 5));
  B.run(`updPerson("s1_4", p => { p.exempt = [{ scope:"night" }]; }); put("soldiers/s2_9", null);`);
  const plan = A.run(`mergePlan(${B.run('JSON.stringify(updatePayload())')})`);
  ok(plan.upd.length === 1 && plan.upd[0][0] === 'soldiers/s1_4', 'A takes B\'s newer edit to s1_4');
  ok(plan.keptLocal >= 1, 'A keeps its own newer edit to s1_3');
  ok(plan.del.length === 1 && plan.del[0][0] === 'soldiers/s2_9', 'B\'s deletion reaches A');
  A.run(`applyPlan(mergePlan(${B.run('JSON.stringify(updatePayload())')}))`);
  ok(A.run('!S.soldiers.s2_9 && S.soldiers.s1_4.exempt.length === 1 && S.soldiers.s1_3.tags[0] === "מאג"'), 'after the merge A has both commanders\' changes');
  // an old copy can't bring a deleted soldier back
  const old = JSON.parse(B.run('JSON.stringify(updatePayload())')); old.soldiers.s2_9 = Object.assign({ id:'s2_9', name:'דניאל', platoon:2 }, { _t: 1 }); delete old.tomb['soldiers/s2_9'];
  ok(A.run(`mergePlan(${JSON.stringify(old)}).add.length`) === 0, 'a stale copy doesn\'t resurrect a deleted soldier');
  ok(A.run(`mergePlan(${B.run('JSON.stringify(updatePayload())')}).add.length + mergePlan(${B.run('JSON.stringify(updatePayload())')}).upd.length`) === 0, 'merging the same update twice changes nothing');
  const other = JSON.parse(B.run('JSON.stringify(updatePayload())')); other.line = 'Lsomeoneelse';
  ok(A.run(`mergePlan(${JSON.stringify(other)}).otherLine`) === true, 'an update from a different line is flagged');
}
console.log('fair roster');
{
  const { run } = await app(f => {
    const P = Object.values(f.soldiers);
    P[5].absences = [{ id:'a1', kind:'vacation', from:'2026-11-03', to:'2026-11-04', status:'fixed' }];
    P[9].from = '2026-11-04';
    P[14].absences = [{ id:'a2', kind:'other', from:'2026-11-16', to:'2026-11-18', status:'fixed' }];
  });
  const t0 = Date.now();
  const m = JSON.parse(run(`(() => {
    const days = lineDays().filter(d => dayState(d) === "duty"), blocks = {};
    for (const d of days) (blocks[blockOf(d).id] = blocks[blockOf(d).id] || []).push(d);
    for (const ds of Object.values(blocks)){ const r = generate(ds); for (const d of ds) put("rosters/" + d, r[d]); }
    const L = {}, N = {}, pres = {}, per = {}; let gaps = 0, idleDbl = 0;
    for (const d of days){
      for (const p of people()) if (present(p, d) && jointPl().includes(p.platoon)) pres[p.id] = (pres[p.id] || 0) + 1;
      for (const sl of S.rosters[d].slots) for (const id of sl.p) if (id){ L[id] = (L[id] || 0) + slotLoad(S.tasks[sl.t], sl); if (sl.night) N[id] = (N[id] || 0) + 1; per[d + id] = (per[d + id] || 0) + 1; } else gaps++;
      const ps = people().filter(p => present(p, d) && jointPl().includes(p.platoon));
      const zero = ps.filter(p => !per[d + p.id]).length, dbl = ps.filter(p => (per[d + p.id] || 0) >= 2).length; if (zero && dbl) idleDbl += Math.min(zero, dbl);
    }
    const ids = Object.keys(pres).filter(id => S.soldiers[id].role === "soldier"), P = ids.reduce((a, id) => a + pres[id], 0) / ids.length;
    const adj = ids.map(id => (L[id] || 0) * P / pres[id]), nights = ids.map(id => (N[id] || 0) * P / pres[id]);
    return JSON.stringify({ days: days.length, gaps, idleDbl, lo: Math.min(...adj), hi: Math.max(...adj), nlo: Math.min(...nights), nhi: Math.max(...nights) });
  })()`));
  const ms = Date.now() - t0;
  ok(m.gaps === 0, `${m.days} days of three tasks with no empty seat`);
  ok((m.hi - m.lo) / m.hi < 0.1, `soldiers' load, relative to days in, within 10% of each other (${m.lo.toFixed(0)}–${m.hi.toFixed(0)}; was 158–205)`);
  ok(m.nhi - m.nlo <= 3, `nights spread evenly (${m.nlo.toFixed(1)}–${m.nhi.toFixed(1)} per person; was 2–18)`);
  ok(m.idleDbl <= 60, `rarely someone idle while another doubles up (${m.idleDbl} times in ${m.days} days; was 145)`);
  ok(ms < 4000, `three rotations generated in ${ms} ms`);
}
console.log('manual seats are planned around');
{
  const { run } = await app();
  const d = '2026-11-03', d2 = '2026-11-04';
  run(`for (const [k, r] of Object.entries(generate(["${d}", "${d2}"]))) put("rosters/" + k, r)`);
  // force s2_4 into the 14:00 gate shift on the 3rd and the 06:00 one on the 4th, then generate both days again
  run(`(() => { for (const [dd, st] of [["${d}", 14], ["${d2}", 6]]){ const r = JSON.parse(JSON.stringify(S.rosters[dd])); const sl = r.slots.find(x => x.t === "t_gate" && x.s === st); sl.p = ["s2_4"]; sl.lock = true; put("rosters/" + dd, r); } })()`);
  run(`for (const [k, r] of Object.entries(generate(["${d}", "${d2}"]))) put("rosters/" + k, r)`);
  const mine = JSON.parse(run(`JSON.stringify(["${d}", "${d2}"].flatMap(dd => S.rosters[dd].slots.filter(sl => sl.p.includes("s2_4")).map(sl => ({ S: diffDays(cfg().lineStart, dd) * 24 + sl.s, len: sl.len, t: sl.t, lock: !!sl.lock }))).sort((a, b) => a.S - b.S))`));
  ok(mine.filter(x => x.lock).length === 2, 'both forced seats are kept');
  const gapsOk = mine.every((x, i) => !i || x.S - (mine[i - 1].S + mine[i - 1].len) >= 8);
  ok(gapsOk, `every other seat of that soldier keeps 8 hours of rest from the forced ones, before and after (${mine.length} seats)`);
}
console.log('company task');
{
  const { run } = await app(f => {
    f.tasks.t_sweep = { id:'t_sweep', name:'סריקה פלוגתית', kind:'mission', start:6, len:4, hours:4, dates:['2026-11-03'], days:[], order:10,
      parts:[ { id:'p1', name:'ציר צפוני', pl:1, size:5, cmd:1, needs:[{ tag:'חובש', count:1 }] }, { id:'p2', name:'אבטחה', pl:2, size:4, cmd:1, needs:[] }, { id:'p3', name:'פיצוץ', pl:3, size:3, cmd:0, needs:[] } ] };
  });
  const d = '2026-11-03', res = JSON.parse(run(`JSON.stringify(generate(["${d}", "2026-11-04"]))`));
  const sw = res[d].slots.filter(s => s.t === 't_sweep');
  ok(sw.length === 3 && !res['2026-11-04'].slots.some(s => s.t === 't_sweep'), 'the company task runs only on its date, one slot per part');
  const plOf = id => run(`S.soldiers["${id}"].platoon`);
  ok(sw.filter(s => s.pl).every(s => s.p.filter(Boolean).every(id => plOf(id) === s.pl)), 'each part is filled only from its own platoon');
  const p1 = sw.find(s => s.part === 'p1');
  ok(p1.p.filter(Boolean).length === 5 && p1.p.some(id => run(`isCmd(S.soldiers["${id}"])`)) && p1.p.some(id => run(`hasTag(S.soldiers["${id}"], "חובש")`)), 'a part gets its own size, commander and medic');
  const p3 = sw.find(s => s.part === 'p3');
  ok(p3.w.some(w => w.includes('אין חיילים במחלקה 3')), 'a part whose platoon has nobody says so: ' + p3.w.join(' · '));
  ok(run(`demand("${d}").need`) === run(`demand("2026-11-04").need`) + 12, 'the company task adds its 12 people to that day\'s demand only');
}
console.log('ghost task (כרמל): its own people, who stay free');
{
  const carmel = { id:'t_carmel', name:'כרמל', kind:'guard', ghost:{ ok:['t_gate', 't_drive'], note:'' }, size:3, cmd:0, start:6, len:8, hours:8, days:[0,1,2,3,4,5,6], platoons:[1,2], order:9 };
  const withC = await app(f => { f.tasks.t_carmel = carmel; });
  const without = await app();
  const d = '2026-11-03', ds = `["${d}", "2026-11-04"]`;
  const a = JSON.parse(withC.run(`JSON.stringify(generate(${ds}))`)), b = JSON.parse(without.run(`JSON.stringify(generate(${ds}))`));
  const reg = r => JSON.stringify(Object.values(r).map(x => x.slots.filter(s => s.t !== 't_carmel').map(s => s.p)));
  ok(reg(a) === reg(b), 'adding a ghost task changes nobody\'s regular shifts (no rest, load or caps from it)');
  const car = a[d].slots.filter(s => s.t === 't_carmel');
  ok(car.length === 1 && car[0].p.filter(Boolean).length === 3, `it has its own seats, filled like any task (${car[0].p.filter(Boolean).length}/3)`);
  ok(withC.run(`demand("${d}").need`) === without.run(`demand("${d}").need`), 'it adds nothing to the day\'s demand');
  const others = car[0].p.flatMap(id => a[d].slots.filter(s => s.t !== 't_carmel' && s.p.includes(id) && s.s < 14 && s.s + s.len > 6).map(s => s.t));
  ok(others.every(t => t === 't_gate' || t === 't_drive'), `its people hold only ש״ג or נהג תורן at the same time, never סיור or תצפית (${others.join(', ') || 'nothing else'})`);
  // a patrol soldier put into כרמל by hand: the generator keeps him there and plans his patrol elsewhere
  withC.run(`(() => { for (const [k, r] of Object.entries(generate(${ds}))) put("rosters/" + k, r); })()`);
  const pat = withC.run(`S.rosters["${d}"].slots.find(s => s.t === "t_patrol" && s.s === 6).p[0]`);
  withC.run(`(() => { const r = JSON.parse(JSON.stringify(S.rosters["${d}"])); setSeat(r.slots.find(s => s.t === "t_carmel"), 0, "${pat}"); put("rosters/${d}", r); for (const [k, x] of Object.entries(generate(${ds}))) put("rosters/" + k, x); })()`);
  const after = JSON.parse(withC.run(`JSON.stringify(S.rosters["${d}"].slots.filter(s => s.p.includes("${pat}")).map(s => [s.t, s.s, s.len]))`));
  ok(after.some(x => x[0] === 't_carmel') && !after.some(x => x[0] === 't_patrol' && x[1] < 14 && x[1] + x[2] > 6), `${withC.run(`nm("${pat}")`)} set into כרמל by hand is no longer in the 06:00 patrol`);
  withC.run(`CTX = buildCtx()`);
  const txt = withC.run(`dayText("${d}")`), line = txt.split('*כרמל*\n')[1].split('\n')[0];
  ok(/^06:00-14:00  \S/.test(line) && line.split(', ').length === 3, 'the WhatsApp text lists who is in כרמל: ' + line);
  // red: two tasks at once; nothing for כרמל + ש״ג; yellow: short rest
  const iss = JSON.parse(withC.run(`(() => { const r = JSON.parse(JSON.stringify(S.rosters["${d}"]));
    const gate = r.slots.find(s => s.t === "t_gate" && s.s === 6), car = r.slots.find(s => s.t === "t_carmel"), pat = r.slots.find(s => s.t === "t_patrol" && s.s === 6), g2 = r.slots.find(s => s.t === "t_gate" && s.s === 14);
    setSeat(gate, 0, car.p[1]);            // allowed together
    setSeat(pat, 1, car.p[2]);             // not allowed together
    setSeat(g2, 0, r.slots.find(s => s.t === "t_gate" && s.s === 10).p[0]);   // 10-14 then 14-18: no rest
    put("rosters/${d}", r); const x = rosterIssues("${d}"); return JSON.stringify({ red: x.redTxt, yellow: x.yellowTxt.length, redOnCarmelGate: x.red.has(r.slots.indexOf(gate) + "|0"), empty: x.empty }); })()`));
  ok(iss.red.some(t => t.includes('סיור') && t.includes('כרמל')) && !iss.redOnCarmelGate, `red: a soldier in כרמל and סיור at once (${iss.red.length} double bookings); כרמל with ש״ג is fine`);
  ok(iss.yellow >= 1, 'yellow: back-to-back gate shifts without rest');
  // legacy ghost tasks (mirror of a host) become ghost tasks with their own seats
  const old = await app(f => { f.tasks.t_old = { id:'t_old', name:'כרמל ישן', ghost:{ of:['t_gate'], note:'' }, days:[], size:0, order:9 }; });
  old.run('migrateTasks()');
  const m = JSON.parse(old.run('JSON.stringify(S.tasks.t_old)'));
  ok(m.ghost.ok[0] === 't_gate' && m.size === 1 && m.hours === 24 && m.days.length === 7, 'an old-style ghost task is converted: allowed with ש״ג, as many as the gate, same hours');
}
console.log('taking a soldier out of a seat');
{
  const { run } = await app();
  const d = '2026-11-03';
  run(`(() => { for (const [k, r] of Object.entries(generate(["${d}"]))) put("rosters/" + k, r); })()`);
  const [keep, out, si] = JSON.parse(run(`(() => { const r = JSON.parse(JSON.stringify(S.rosters["${d}"])), si = r.slots.findIndex(s => s.t === "t_obs" && s.s === 8), sl = r.slots[si];
    const keep = sl.p[0], out = sl.p[1]; setSeat(sl, 0, keep); setSeat(sl, 1, null); put("rosters/${d}", r); return JSON.stringify([keep, out, si]); })()`));
  run(`(() => { for (const [k, r] of Object.entries(generate(["${d}"]))) put("rosters/" + k, r); })()`);
  const sl = JSON.parse(run(`JSON.stringify(S.rosters["${d}"].slots[${si}])`));
  ok(sl.p[0] === keep && sl.lk[0], 'the seat set by hand stays, locked');
  ok(sl.p[1] && sl.p[1] !== out, `the emptied seat is filled again on "ג׳נרט מחדש", not with the one taken out (${run(`nm("${out}")`)} → ${run(`nm("${sl.p[1]}")`)})`);
}
console.log('encryption');
{
  const { run } = await app();
  const token = await run('seal(updatePayload(), "סיסמה-לבדיקה-123")');
  ok(/^SHBZ1\.[A-Za-z0-9_-]+$/.test(token), `token is one URL-safe block (${token.length} characters for 26 people and 4 tasks)`);
  const rawBytes = Buffer.from(token.slice(6).replace(/-/g, '+').replace(/_/g, '/'), 'base64'), names = run('people().map(p => p.name)');
  ok(names.every(n => !rawBytes.includes(Buffer.from(n, 'utf8'))), `none of the ${names.length} names can be found inside the token`);
  const back = await run(`unseal(${JSON.stringify(token)}, "סיסמה-לבדיקה-123")`);
  ok(back.soldiers.s1_0.name === 'אלון' && back.line === 'Ltestline', 'decrypts back to the same line');
  let bad = null; try { await run(`unseal(${JSON.stringify(token)}, "wrong-password")`); } catch(e){ bad = e; }
  ok(bad && bad.bad === true, 'a wrong password is refused');
  const tampered = token.slice(0, -6) + (token.slice(-6, -5) === 'A' ? 'B' : 'A') + token.slice(-5);
  let t2 = null; try { await run(`unseal(${JSON.stringify(tampered)}, "סיסמה-לבדיקה-123")`); } catch(e){ t2 = e; }
  ok(!!t2, 'a changed character makes the update unreadable (tamper-proof)');
  const msg = `🔒 עדכון שבצ״ק נא מיוסי · 2/11 18:40\nפותחים באפליקציה\n${token}\n`;
  ok(run(`TOKEN_RE.exec(${JSON.stringify(msg)})[0]`) === token, 'the token is found inside a pasted WhatsApp message');
  const gen = [...Array(20)].map(() => run('newUnitPass()'));
  ok(gen.every(g => /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(g)) && new Set(gen).size === 20, 'generated unit passwords are 16 digits in four groups, and differ');
  const pin = await run('seal(updatePayload(), "4821-0937-5562-1148")');
  const typed = await run(`unseal(${JSON.stringify(pin)}, " 4821 0937 5562 1148")`).catch(() => null);
  ok(typed && typed.line === 'Ltestline', 'a digit password opens whether typed with dashes, spaces or neither');
  let other2 = null; try { await run(`unseal(${JSON.stringify(pin)}, "4821-0937-5562-1149")`); } catch(e){ other2 = e; }
  ok(other2 && other2.bad === true, '…but one wrong digit is still refused');
  ok(run('passNorm("Unit-Pass-1")') === 'Unit-Pass-1', 'passwords with letters keep their dashes and case');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
