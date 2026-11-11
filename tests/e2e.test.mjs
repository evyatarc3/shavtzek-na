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

console.log('first phone: tabs and rulebook');
const A = await phone('A', fixture());
const screens = [];
for (const tab of ['ask', 'matrix', 'roster', 'more', 'today']){ await A.p.click(`#nav button[data-tab="${tab}"]`); await wait(150); screens.push(await ev(A.p, () => UI.tab + ':' + document.querySelector('#main').innerHTML.length)); }
ok(new Set(screens.map(s => s.split(':')[1])).size === 5 && screens.every((s, i) => s.startsWith(['ask', 'matrix', 'roster', 'more', 'today'][i])), 'each tab in the bottom bar opens its own screen');
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
ok(await B.p.isVisible('text=איך מתחילים?') && await B.p.isVisible('[data-a="startNew"]') && await B.p.isVisible('[data-a="startJoin"]') && await B.p.isVisible('label[for="impFile"]'), 'a new phone offers three ways to start: new line, join, restore');
ok(!(await B.p.isVisible('#shIn')), 'the box for an update is not the center of the first screen');
ok(!(await B.p.isVisible('#nav')), 'no tab bar before there is a line (nothing to switch to yet)');
ok(await B.p.isVisible('text=כדאי להתקין את האפליקציה'), 'on iPhone it suggests installing to the home screen');
await B.p.screenshot({ path: path.join(SHOTS, 'new-phone.png') });
await B.p.click('[data-a="helpOpen"]'); await wait(150);
ok(await B.p.isVisible('text=מדריך שימוש') && await B.p.isVisible('#help-start[open]'), 'the guide opens before there is a line');
await B.p.click('#help-share summary'); await wait(100);
ok(await B.p.isVisible('text=שני דברים מחברים בין הטלפונים'), 'the guide explains the line id and the unit password');
await B.p.screenshot({ path: path.join(SHOTS, 'guide.png'), fullPage:true });
await B.p.click('[data-a="helpBack"]'); await wait(150);
ok(await B.p.isVisible('text=איך מתחילים?'), '…and goes back to the first screen');
await B.p.click('[data-a="startJoin"]'); await wait(150);
ok(await B.p.isVisible('text=הצטרפות לקו של מפקד אחר') && await B.p.isVisible('#sheetHost #shIn') && await B.p.isVisible('#sheetHost >> text=סיסמת היחידה'), 'joining opens a short how-to with the box for the update');
await B.p.screenshot({ path: path.join(SHOTS, 'join.png') });
await B.p.fill('#shIn', text); await B.p.click('[data-a="shOpen"]'); await wait(200);
await B.p.fill('#apPass', 'not-the-password'); await B.p.click('[data-a="shPassGo"]'); await wait(1500);
ok(await B.p.isVisible('text=הסיסמה לא מתאימה'), 'a wrong password is refused with a clear message');
await B.p.fill('#apPass', 'unit-pass-2026'); await B.p.click('[data-a="shPassGo"]'); await wait(1500);
ok(await B.p.isVisible('[data-a="shReplace"]'), 'the right password shows what will be received');
await B.p.click('[data-a="shReplace"]'); await wait(300);
ok(await ev(B.p, () => Object.keys(S.soldiers).length === 26 && S.tasks.t_gate.queue.on && S.soldiers.s1_5.exempt.length === 1), 'B now has the whole line, rulebook included');
ok(await ev(B.p, () => cfg().lineId) === await ev(A.p, () => cfg().lineId), 'both phones share the same line id');
ok(await B.p.isVisible('#nav'), 'the tab bar appears once the line is in');

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

console.log('guide and password generator');
await ev(A.p, () => ACT.openMore('help')); await wait(150);
ok(await A.p.isVisible('text=מדריך שימוש') && await A.p.isVisible('#help-start[open]') && await A.p.isVisible('#nav'), 'the guide is in עוד');
await ev(A.p, () => ACT.openMore('share')); await wait(150);
await A.p.click('[data-a="shGen"]'); await wait(120);
ok(await A.p.isVisible('text=סיסמה חדשה?'), 'replacing an existing unit password asks first');
await A.p.click('[data-a="shGenGo"]'); await wait(120);
ok(await ev(A.p, () => /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(document.getElementById('shPass').value) && document.getElementById('shPass').type === 'text' && /^\d{4}-/.test(shareCfg().pass)), 'a generated password is shown and remembered');
await A.p.click('[data-a="helpOpen"][data-v="share"]'); await wait(150);
ok(await A.p.isVisible('#help-share[open]'), '"איך זה עובד?" on the share screen opens the sharing part of the guide');

console.log('roster and export');
await ev(A.p, () => { UI.tab = 'roster'; UI.rosterDate = '2026-11-03'; render(); }); await wait(200);
await A.p.screenshot({ path: path.join(SHOTS, 'roster.png') });
const [dl] = await Promise.all([A.p.waitForEvent('download', { timeout:8000 }).catch(() => null), ev(A.p, () => exportXlsx())]);
ok(dl && /\.xlsx$/.test(dl.suggestedFilename()) && fs.statSync(await dl.path()).size > 5000, 'Excel export works under the strict security policy');

console.log('task kinds, quick sheet');
await ev(A.p, () => { genDates(['2026-11-03']); UI.tab = 'roster'; UI.rosterDate = '2026-11-03'; UI.rosterBy = 'task'; render(); }); await wait(200);
// ghost task from the template
await ev(A.p, () => ACT.editTask()); await wait(120);
await A.p.click('[data-a="tTpl"][data-v="3"]'); await wait(120);
ok(await A.p.isChecked('#sheetHost input[name="tgh"][value="t_gate"]'), 'the כרמל template is a ghost task already tied to ש״ג');
await A.p.click('[data-a="saveTask"]'); await wait(150);
ok(await ev(A.p, () => { const g = tasksList().find(t => t.ghost); return !!g && g.ghost.of[0] === 't_gate' && dayText('2026-11-03').includes('מי שתופס ש״ג תופס גם כרמל'); }), '…saved, and the WhatsApp text says "מי שתופס ש״ג תופס גם כרמל"');
// company task: a part per platoon
await ev(A.p, () => ACT.editTask()); await wait(120);
await A.p.click('[data-a="tTpl"][data-v="7"]'); await wait(150);
ok(await A.p.locator('#sheetHost .part-ed').count() === 3, 'the company template opens with a part for each platoon');
await A.p.click('[data-a="stp"][data-v="tpS0"][data-d="1"]'); await A.p.click('[data-a="tPartPak"][data-i="0"][data-v="חובש"]'); await wait(120);
ok(await ev(A.p, () => document.getElementById('tpS0').value === '5') && await A.p.isVisible('[data-a="tPartPak"][data-i="0"][aria-pressed="true"]'), 'steppers and פק״ל chips set each part');
await A.p.fill('#tpN0', 'ציר צפוני'); await A.p.fill('#tDt0', '2026-11-03');
await A.p.screenshot({ path: path.join(SHOTS, 'task-company.png'), fullPage:true });
await A.p.click('[data-a="saveTask"]'); await wait(200);
ok(await A.p.isVisible('text=לשבץ אותה עכשיו?'), 'after saving, the app offers to put it into the roster');
await A.p.click('[data-a="genGo"] >> nth=0'); await wait(300);
ok(await ev(A.p, () => UI.tab === 'roster') && await A.p.isVisible('.plabel >> text=ציר צפוני'), '…and the roster shows each part with its platoon');
ok(await ev(A.p, () => { const t = tasksList().find(x => x.parts); return S.rosters['2026-11-03'].slots.filter(sl => sl.t === t.id).every(sl => sl.p.filter(Boolean).every(id => !sl.pl || S.soldiers[id].platoon === sl.pl)); }), 'parts are manned by their own platoon');
await A.p.screenshot({ path: path.join(SHOTS, 'roster-kinds.png'), fullPage:true });
// manual slot sheet: free people first
await A.p.click('.task-card [data-a="slot"] >> nth=0'); await wait(150);
ok(/בלי משמרות היום|כבר/.test(await A.p.locator('#sheetHost .cand >> nth=0').innerText()), 'the replacement list says who has no shift that day: ' + (await A.p.locator('#sheetHost .cand >> nth=0').innerText()).split('\n').slice(-1)[0]);
await ev(A.p, () => closeSheet());
// quick sheet from the "by person" view
await ev(A.p, () => { UI.rosterBy = 'person'; render(); }); await wait(150);
const qp = await A.p.getAttribute('table [data-a="quick"] >> nth=-1', 'data-v');
await A.p.click(`table [data-a="quick"][data-v="${qp}"]`); await wait(150);
ok(await A.p.isVisible('#sheetHost >> text=שיבוץ ידני'), 'tapping a soldier opens the quick sheet');
await A.p.click('[data-a="qRole"][data-v="cmdp"]'); await wait(120);
ok(await ev(A.p, id => S.soldiers[id].role === 'cmdp', qp), 'the role changes with one tap');
await A.p.screenshot({ path: path.join(SHOTS, 'quick.png') });
const target = await A.p.getAttribute('#sheetHost .qslot[data-a="qPut"]:not(.bad) >> nth=0', 'data-si');
await A.p.click(`#sheetHost .qslot[data-a="qPut"][data-si="${target}"]`); await wait(250);
if (await A.p.isVisible('text=במקום מי?')){ await A.p.click('[data-a="qSwap"] >> nth=0'); await wait(250); }
ok(await ev(A.p, ([id, si]) => { const sl = S.rosters['2026-11-03'].slots[Number(si)]; return sl.lock && sl.p.includes(id); }, [qp, target]), 'a manual assignment is locked in');
ok(await ev(A.p, id => S.rosters['2026-11-03'].slots.every((sl, i) => !sl.p.includes(id) || slotConflicts(S.soldiers[id], '2026-11-03', sl, i).filter(w => /חופף|מנוחה/.test(w)).length === 0), qp), '…and the rest of the day was planned around it, with no clash for that soldier');
await ev(A.p, () => closeSheet());

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
