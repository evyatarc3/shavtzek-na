"use strict";
/* ================= insights ================= */
function verdictOf(minSlack, delta){
  if (delta != null){
    if (delta > 0) return { sev:"crit", word:"לא מומלץ", why:`השבצ״ק מאבד ${delta} ${delta===1?"משבצת":"משבצות"}` };
    if (minSlack <= 0) return { sev:"warn", word:"אפשרי, בלי מרווח", why:"כל המשמרות מאוישות אבל אין רזרבה" };
    return { sev:"ok", word:"אפשר לאשר", why:`רזרבה של ${minSlack} לפחות בכל יום` };
  }
  if (minSlack < 0) return { sev:"crit", word:"לא מומלץ", why:`חסרים ${-minSlack} מול דרישת המשימות` };
  if (minSlack === 0) return { sev:"warn", word:"אפשרי, בלי מרווח", why:"בדיוק מספר הנדרש" };
  return { sev:"ok", word:"אפשר לאשר", why:`רזרבה של ${minSlack} לפחות בכל יום` };
}
function fmtDays(ds){
  if (!ds.length) return ""; const out = []; let a = ds[0], b = ds[0];
  for (let i = 1; i <= ds.length; i++){
    const d = ds[i]; if (d && d === addDays(b, 1)){ b = d; continue; }
    out.push(a === b ? dm(a) : dm(a) + "–" + dm(b)); if (d){ a = d; b = d; }
  }
  return out.join(", ");
}
function weekendOptions(p, ctx){
  const opts = [];
  for (const d of lineDays()){
    if (dow(d) !== 5) continue; const d2 = addDays(d, 1);
    if (!inLine(d2) || personStatus(p, d) !== "in" || personStatus(p, d2) !== "in") continue;
    const slack = Math.min(ctx.map[d].slack, ctx.map[d2].slack) - 1;
    const cmdOk = !isCmd(p) || Math.min(ctx.map[d].p1Cmd, ctx.map[d2].p1Cmd) - 1 >= settings().minCmd;
    opts.push({ from:d, to:d2, slack, cmdOk });
  }
  return opts.sort((a,b) => (b.cmdOk - a.cmdOk) || (b.slack - a.slack) || a.from.localeCompare(b.from));
}
function buildInsights(ctx){
  const out = [], s = settings(), jp = jointPl();
  if (!cfg()) return out;
  const duty = ctx.days.filter(x => x.state === "duty");
  const hasTasks = tasksList().length > 0;
  const today = todayStr();

  // staffing below task demand
  if (hasTasks){
    const short = duty.filter(x => x.slack < 0);
    if (short.length) out.push({ sev:"crit", cat:"staff", t:`${short.length} ימי ${TD()} מתחת לדרישת המשימות`,
      d: short.slice(0,8).map(x => `${dm(x.d)}: ${x.sup}/${x.need}`).join(" · ") + (short.length>8?" …":"") + ". כדאי לצמצם משימות או לדחות יציאות בימים האלה." });
    const tight = duty.filter(x => x.slack === 0);
    if (tight.length) out.push({ sev:"warn", cat:"staff", t:`${tight.length} ימים בלי רזרבה`, d:`${fmtDays(tight.map(x=>x.d))}. כל יציאה נוספת בימים האלה תפיל משמרת.` });
  } else out.push({ sev:"info", cat:"setup", t:"עוד לא הוגדרו משימות", d:"בלי משימות אין דרישת כוח אדם, ולכן אין הערכת שחרורים ואין שבצ״ק. הוסיפו משימות בלשונית ניהול.", acts:[{ l:"הוספת משימה", a:"editTask" }] });

  // commanders
  const lowCmd = duty.filter(x => x.p1Cmd < s.minCmd);
  if (lowCmd.length) out.push({ sev:"warn", cat:"cmd", t:`פחות מ-${s.minCmd} מפקדים ב${plName(myPl())} ב-${lowCmd.length} ימים`, d: fmtDays(lowCmd.map(x=>x.d)) });
  const cmdGap = duty.filter(x => x.cmdNeed > 0 && x.cmdSup + x.cmdpSup < x.cmdNeed);
  if (cmdGap.length) out.push({ sev:"crit", cat:"cmd", t:"המשימות דורשות יותר מפקדים ממה שיש", d: cmdGap.slice(0,6).map(x=>`${dm(x.d)}: ${x.cmdSup}+${x.cmdpSup} מתוך ${x.cmdNeed}`).join(" · ") });
  else { const cmdTight = duty.filter(x => x.cmdNeed > 0 && x.cmdSup < x.cmdNeed && x.cmdSup + x.cmdpSup >= x.cmdNeed);
    if (cmdTight.length) out.push({ sev:"warn", cat:"cmd", t:`ב-${cmdTight.length} ימים צריך את המפקדים הפוטנציאליים`, d:`${fmtDays(cmdTight.map(x=>x.d))}. מפקד פוטנציאלי ישובץ כמפקד משמרת.` }); }

  // tags (driver, medic...)
  const allTags = new Set(); duty.forEach(x => Object.keys(x.tagNeed).forEach(t => allTags.add(t)));
  for (const tag of allTags){
    const holders = ctx.all.filter(p => hasTag(p, tag));
    if (!holders.length){ out.push({ sev:"crit", cat:"tag", t:`אף אחד לא מסומן "${tag}"`, d:`יש משימה שדורשת ${tag}. סמנו מי מחזיק את הפק״ל.`, acts:[{ l:"לסימון פק״לים", a:"goPakal" }] }); continue; }
    const gap = duty.filter(x => (x.tagSup[tag] || 0) < (x.tagNeed[tag] || 0));
    if (gap.length) out.push({ sev:"warn", cat:"tag", t:`חוסר ב${tag} ב-${gap.length} ימים`, d:`${fmtDays(gap.map(x=>x.d))} · מחזיקים: ${holders.map(p=>p.name).join(", ")}` });
  }
  // פק״ל minimums per duty day
  for (const k of pakalim()){
    if (!((k.min || 0) > 0)) continue;
    const holders = ctx.all.filter(p => jp.includes(p.platoon) && hasTag(p, k.name));
    if (!holders.length){ out.push({ sev:"crit", cat:"tag", t:`אין אף ${k.name} מסומן`, d:`הוגדר מינימום ${k.min} ${k.name} בכל יום ${TD()}. סמנו מי מחזיק את הפק״ל.`, acts:[{ l:"לסימון פק״לים", a:"goPakal" }] }); continue; }
    const gap = duty.filter(x => x.d >= today && (x.tagSup[k.name] || 0) < k.min);
    if (gap.length) out.push({ sev:"warn", cat:"tag", t:`${k.name}: פחות מ-${k.min} בפנים ב-${gap.length} ימים`, d:`${fmtDays(gap.map(x => x.d))} · מחזיקים: ${holders.map(p => p.name).join(", ")}` });
  }

  // absences & requests
  for (const p of ctx.all){
    for (const a of (p.absences || [])){
      if (!a.from){
        const opts = weekendOptions(p, ctx);
        if (opts.length){
          const b = opts[0];
          out.push({ sev:"info", cat:"abs", pid:p.id, t:`${p.name} — ${a.reason || "צריך לצאת סופ״ש"}: מומלץ ${dm(b.from)}–${dm(b.to)}`,
            d:`אחרי יציאתו נשארת רזרבה של ${b.slack} בסופ״ש הזה. ` + opts.slice(1,4).map(o=>`${dm(o.from)}: ${o.slack}`).join(" · "),
            acts:[{ l:`קבע ${dm(b.from)}–${dm(b.to)}`, a:"setWeekend", pid:p.id, aid:a.id, v:b.from }] });
        }
        continue;
      }
      if (a.to < today) continue;
      const days = range(a.from, a.to), dd = days.filter(d => dayState(d, p.platoon) === "duty" && inWindow(p, d));
      const label = `${p.name} · ${KIND[a.kind] || "היעדרות"} ${a.from===a.to?dm(a.from):dm(a.from)+"–"+dm(a.to)}`;
      if (!dd.length){ out.push({ sev:"ok", cat:"abs", pid:p.id, t:`${label}: נופל על ימי בית`, d:`אין התנגשות עם ה${TD()}, אין צורך באישור.` }); continue; }
      const minSlack = Math.min(...dd.map(d => ctx.map[d].slack));
      const sim = hasTasks && jp.includes(p.platoon) ? simulateAbs(p, a) : null;
      const v = hasTasks ? verdictOf(minSlack, sim ? sim.delta : null) : { sev:"info", word:"חסרות משימות להערכה", why:"" };
      let extra = "";
      if (isCmd(p)){ const mc = Math.min(...dd.map(d => ctx.map[d].p1Cmd)); if (mc < s.minCmd){ extra = ` · נשארים ${mc} מפקדים בלבד`; if (v.sev === "ok") v.sev = "warn"; } }
      const pkLow = pakalim().filter(k => (k.min || 0) > 0 && hasTag(p, k.name) && dd.some(d => (ctx.map[d].tagSup[k.name] || 0) < k.min));
      if (pkLow.length){ extra += ` · יחסר ${pkLow.map(k => k.name).join(", ")}`; if (v.sev === "ok") v.sev = "warn"; }
      out.push({ sev: v.sev, cat:"abs", pid:p.id, t:`${label}: ${v.word}`, d:`מחסיר ${dd.length} ימי ${TD()} (${fmtDays(dd)}). ${v.why}${extra}.` });
    }
    if (p.to && inLine(p.to) && p.to < cfg().lineEnd){
      const lost = lineDays().filter(d => d > p.to && dayState(d, p.platoon) === "duty");
      if (lost.length) out.push({ sev:"info", cat:"abs", pid:p.id, t:`${p.name} עוזב אחרי ${dm(p.to)}`, d:`לא יהיה ב-${lost.length} ימי ${TD()} (${fmtDays(lost)}).` });
    }
  }

  // uncertain manpower
  const tent = ctx.all.filter(p => p.tentative && jp.includes(p.platoon));
  if (tent.length) out.push({ sev:"info", cat:"staff", t:`${tent.length} לא ודאיים, לא נספרים בכוח`, d: tent.map(p => p.name + (p.note ? ` (${p.note})` : "")).join(" · ") + ". כשמתברר שמגיעים, הסירו את הסימון בכרטיס." });

  // rules: not both out / min present
  for (const r of Object.values(S.rules)){
    if (r.on === false) continue;
    if (r.type === "notBothOut" && (r.a||[]).length > 1){
      const bad = duty.filter(x => (r.a).filter(id => { const p = S.soldiers[id]; return p && ["abs","req"].includes(personStatus(p, x.d)); }).length > 1);
      if (bad.length) out.push({ sev:"crit", cat:"rule", t:`${r.a.map(id => (S.soldiers[id]||{}).name).join(" ו")} בחוץ יחד`, d:`מפר את האילוץ "לא יוצאים יחד": ${fmtDays(bad.map(x=>x.d))}` });
    }
    if (r.type === "minPresent"){
      const bad = duty.filter(x => ctx.all.filter(p => p.platoon === Number(r.platoon) && present(p, x.d)).length < (r.n||0));
      if (bad.length) out.push({ sev:"crit", cat:"rule", t:`פחות מ-${r.n} נוכחים ב${plName(r.platoon)}`, d: fmtDays(bad.map(x=>x.d)) });
    }
  }

  // release capacity per upcoming duty block
  if (hasTasks){
    const blocks = (cfg().blocks || []).filter(b => b.end >= today && (b.home === "none" || b.home !== groupOf(myPl())));
    for (const b of blocks.slice(0, 4)){
      const ds = range(b.start, b.end).filter(d => ctx.map[d] && ctx.map[d].state === "duty");
      if (!ds.length) continue; const min = Math.min(...ds.map(d => ctx.map[d].slack)); const worst = ds.find(d => ctx.map[d].slack === min);
      out.push({ sev: min > 0 ? "ok" : min === 0 ? "warn" : "crit", cat:"release", t:`סבב ${dm(b.start)}–${dm(b.end)}: ${min > 0 ? `אפשר לשחרר עד ${min} ביום` : min === 0 ? "אין מקום לשחרורים" : `חסרים ${-min}`}`,
        d:`היום הצפוף: ${dmw(worst)} (${ctx.map[worst].sup} נוכחים, דרישה ${ctx.map[worst].need}).` });
    }
  }

  // events on duty days
  for (const e of (cfg().events || [])) if (ctx.map[e.date] && ctx.map[e.date].state === "duty" && e.date >= today)
    out.push({ sev:"info", cat:"event", t:`${e.label} ב-${dmw(e.date)} נופל ב${TD()}`, d: e.note || "כדאי לתכנן מראש את ההשפעה על השבצ״ק." });

  // rosters not generated for the next duty days
  if (hasTasks){
    const nextDuty = duty.filter(x => x.d >= today).slice(0, 7).map(x => x.d).filter(d => !S.rosters[d]);
    if (nextDuty.length) out.push({ sev:"info", cat:"roster", t:"אין עדיין שבצ״ק לימים הקרובים", d: fmtDays(nextDuty), acts:[{ l:"ג׳נרט עכשיו", a:"genDates", v: nextDuty.join(",") }] });
  }
  const rank = { crit:0, warn:1, info:2, ok:3 };
  return out.sort((a,b) => rank[a.sev] - rank[b.sev]);
}
