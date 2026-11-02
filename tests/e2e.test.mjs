// End-to-end: two phones exchange an encrypted update, the app works offline, nothing leaves the device.
// Run: node tests/e2e.test.mjs   (needs the playwright package; set PW_CHROMIUM to a Chromium binary if needed)
// Screenshots go to SHOTS (default: tests/shots, ignored by git).
import { chromium, devices } from 'playwright';
import { spawn } from 'child_process'; import fs from 'fs'; import path from 'path';
import { ROOT, fixture } from './load.mjs';
const PORT = 8790, URL_ = `http://localhost:${PORT}/`, SHOTS = process.env.SHOTS || path.join(ROOT, 'tests/shots');
fs.mkdirSync(SHOTS, { recursive:true });
let pass = 0, fail = 0; const ok = (c, m) => { if (c){ pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const srv = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), ROOT, String(PORT)], { stdio:'ignore' });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const problems = [], outside = [];
async function phone(name, seed, extra = {}){
  const ctx = await browser.newContext(Object.assign({ viewport:{ width:390, height:844 }, locale:'he-IL', timezoneId:'Asia/Jerusalem', acceptDownloads:true }, extra));
  if (seed) await ctx.addInitScript(([v]) => { if (!localStorage.getItem('shabtzak-app-v1')) localStorage.setItem('shabtzak-app-v1', v); }, [JSON.stringify(seed)]);
  await ctx.addInitScript(() => { window.__fixedToday = '2026-11-02'; });
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`); });
  p.on('request', r => { if (!r.url().startsWith(URL_)) outside.push(r.url()); });
  await p.goto(URL_); await p.waitForTimeout(500);
  await p.evaluate(() => { todayStr = () => window.__fixedToday; render(); });
  return { ctx, p };
}
const ev = (p, f, a) => p.evaluate(f, a);
const wait = ms => new Promise(r => setTimeout(r, ms));

console.log('first phone: rulebook');
const A = await phone('A', fixture());
await ev(A.p, () => ACT.openMore('rulebook')); await wait(150);
ok(await A.p.isVisible('text=כללי לכל המשימות'), 'the rulebook screen opens from עוד');
await A.p.fill('#rbRN', '10'); await A.p.fill('#rbPW', '6'); await A.p.click('[data-a="rbSaveGeneral"]'); await wait(100);
ok(await ev(A.p, () => settings().restAfterNight === 10 && settings().maxPerWeek === 6), 'general rules are saved');
await A.p.click('[data-a="taskRule"][data-v="t_gate"]'); await wait(100);
await A.p.click('[data-a="trQ"][data-v="on"]'); await wait(100);
await A.p.click('[data-a="trDown"][data-i="0"]'); await wait(50);
await A.p.screenshot({ path: path.join(SHOTS, 'task-rule.png') });
await A.p.click('[data-a="trSave"]'); await wait(100);
ok(await ev(A.p, () => S.tasks.t_gate.queue.on && S.tasks.t_gate.queue.order.length > 10), 'ש״ג switched to a fixed queue');
await A.p.click('[data-a="exemptNew"]'); await wait(80);
await A.p.selectOption('#exP', 's1_5'); await A.p.fill('#exR', 'גב'); await A.p.click('[data-a="exSave"]'); await wait(100);
ok(await ev(A.p, () => (S.soldiers.s1_5.exempt || [])[0].scope === 'night'), 'a night exemption is added for ויקטור');
await A.p.screenshot({ path: path.join(SHOTS, 'rulebook.png'), fullPage:true });

console.log('sending an encrypted update');
await ev(A.p, () => ACT.openMore('share')); await wait(150);
await A.p.fill('#shPass', 'unit-pass-2026'); await A.p.fill('#shName', 'יוסי');
const { text } = await ev(A.p, () => makeUpdate());
ok(/^🔒 עדכון שבצ״ק נא מיוסי/.test(text) && /SHBZ1\./.test(text), 'the update is a short message plus one encrypted block');
ok(!text.includes('אלון') && !text.includes('ש״ג'), 'no names or task names in the message');
await A.p.screenshot({ path: path.join(SHOTS, 'share.png'), fullPage:true });

console.log('second phone: receives the line');
const B = await phone('B', null, Object.assign({}, devices['iPhone 13'], { locale:'he-IL', timezoneId:'Asia/Jerusalem' }));
ok(await B.p.isVisible('text=קיבלתם עדכון ממפקד?'), 'a new phone offers to receive an update on the first screen');
ok(await B.p.isVisible('text=כדאי להתקין את האפליקציה'), 'on iPhone it suggests installing to the home screen');
await B.p.screenshot({ path: path.join(SHOTS, 'new-phone.png') });
await B.p.fill('#shIn', text); await B.p.click('[data-a="shOpen"]'); await wait(200);
await B.p.fill('#apPass', 'not-the-password'); await B.p.click('[data-a="shPassGo"]'); await wait(1500);
ok(await B.p.isVisible('text=הסיסמה לא מתאימה'), 'a wrong password is refused with a clear message');
await B.p.fill('#apPass', 'unit-pass-2026'); await B.p.click('[data-a="shPassGo"]'); await wait(1500);
ok(await B.p.isVisible('[data-a="shReplace"]'), 'the right password shows what will be received');
await B.p.click('[data-a="shReplace"]'); await wait(300);
ok(await ev(B.p, () => Object.keys(S.soldiers).length === 26 && S.tasks.t_gate.queue.on && S.soldiers.s1_5.exempt.length === 1), 'B now has the whole line, rulebook included');
ok(await ev(B.p, () => cfg().lineId) === await ev(A.p, () => cfg().lineId), 'both phones share the same line id');

console.log('both edit, B sends back, A merges');
await ev(B.p, () => { updPerson('s1_4', p => { p.absences = (p.absences || []).concat([{ id:'a_b', kind:'request', from:'2026-11-04', to:'2026-11-04', status:'request', reason:'חתונה' }]); }); genDates(['2026-11-03']); });
await wait(30);
await ev(A.p, () => updPerson('s1_3', p => { p.tags = ['מאג']; }));
await ev(B.p, () => ACT.openMore('share')); await wait(150);
const back = (await ev(B.p, () => makeUpdate())).text;
ok(await ev(B.p, () => shareCfg().pass === 'unit-pass-2026'), 'B remembers the unit password after the first time');
await A.p.fill('#shIn', back); await A.p.click('[data-a="shOpen"]'); await wait(1500);
ok(await A.p.isVisible('text=מיזוג עדכון'), 'A sees a merge preview');
await A.p.screenshot({ path: path.join(SHOTS, 'merge.png') });
await A.p.click('[data-a="shMerge"]'); await wait(300);
ok(await ev(A.p, () => S.soldiers.s1_4.absences.some(a => a.id === 'a_b') && !!S.rosters['2026-11-03'] && S.soldiers.s1_3.tags[0] === 'מאג'), 'A has B\'s leave request and roster, and keeps its own change');

console.log('roster and export');
await ev(A.p, () => { UI.tab = 'roster'; UI.rosterDate = '2026-11-03'; render(); }); await wait(200);
await A.p.screenshot({ path: path.join(SHOTS, 'roster.png') });
const [dl] = await Promise.all([A.p.waitForEvent('download', { timeout:8000 }).catch(() => null), ev(A.p, () => exportXlsx())]);
ok(dl && /\.xlsx$/.test(dl.suggestedFilename()) && fs.statSync(await dl.path()).size > 5000, 'Excel export works under the strict security policy');

console.log('offline');
await wait(800);
const controlled = await ev(A.p, () => navigator.serviceWorker.ready.then(() => true));
await A.ctx.setOffline(true); await A.p.reload(); await wait(700);
ok(controlled && await A.p.isVisible('#nav'), 'with no network the app still opens from the phone');
ok(await ev(A.p, () => Object.keys(S.soldiers).length === 26), '…with all the data');
await A.ctx.setOffline(false);

console.log('privacy');
ok(outside.length === 0, 'no request ever left the app' + (outside.length ? ': ' + outside.slice(0, 3).join(', ') : ''));
ok(problems.length === 0, 'no errors in the pages' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));

await browser.close(); srv.kill();
console.log(`\n${pass} passed, ${fail} failed · screenshots in ${SHOTS}`);
process.exit(fail ? 1 : 0);
