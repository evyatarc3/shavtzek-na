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
