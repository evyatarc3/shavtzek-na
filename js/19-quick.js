"use strict";
/* ================= soldier quick sheet =================
   Tapping a soldier (roster "by person", the free-today chips, the presence table, the soldiers list) opens one sheet:
   role and פק״לים in one tap, and a manual assignment for a day that the app then plans around
   (the seat is locked; with "לסדר מחדש" on, the rest of that day is generated again around it). */
function quickDay(){
  const ok = d => d && inLine(d) && dayState(d) === "duty";
  if (ok(UI.qDay)) return UI.qDay;
  if (ok(UI.rosterDate)) return UI.rosterDate;
  return CTX ? focusDay(CTX) : todayStr();
}
const ST_TXT = { in:"בפנים", home:"בבית (סבב)", abs:"ביציאה", req:"ביקש לצאת", tent:"לא ודאי", out:"לא בקו" };
function openQuick(pid, d){
  const p = S.soldiers[pid]; if (!p) return;
  d = d || quickDay(); UI.qDay = d;
  const ed = canEdit(), dis = ed ? "" : " disabled", rn = roleNames();
  const duty = lineDays().filter(x => dayState(x) === "duty");
  let h = `<h3>${esc(p.name)}</h3><p class="small muted" style="margin:-6px 0 12px">${esc(plName(p.platoon))}${p.note ? " · " + esc(p.note) : ""}</p><div class="stack">
  <div class="fld"><span>תפקיד</span><div class="kchips">${Object.entries(rn).map(([k, v]) => `<button class="kchip" data-a="qRole" data-v="${k}" data-pid="${pid}" aria-pressed="${p.role === k}"${dis}>${esc(v)}</button>`).join("")}</div></div>
  <div class="fld"><span>פק״לים</span><div class="kchips">${allTags().map(tg => `<button class="kchip" data-a="qTag" data-v="${esc(tg)}" data-pid="${pid}" aria-pressed="${hasTag(p, tg)}"${dis}>${esc(tg)}</button>`).join("")}</div></div>
  <div class="fld"><span>שיבוץ ידני</span>
    <div class="inrow"><select id="qDay" data-ch="qDay" data-pid="${pid}" aria-label="יום">${duty.map(x => `<option value="${x}"${x === d ? " selected" : ""}>${WDL[dow(x)]} ${dm(x)}${S.rosters[x] ? "" : " · אין שבצ״ק"}</option>`).join("")}</select>
    <span class="small muted" style="align-self:center">${ST_TXT[personStatus(p, d)] || ""}</span></div>
    ${quickSlots(p, d)}</div>
  </div>
  <div class="sheet-acts"><button class="btn" data-a="editPerson" data-v="${pid}">עריכה מלאה</button><span class="sp"></span><button class="btn" data-a="closeSheet">סגירה</button></div>`;
  openSheet(h);
}
function quickSlots(p, d){
  if (!tasksList().some(t => taskActive(t, d))) return `<p class="small muted" style="margin:6px 0 0">אין משימות ביום הזה.</p>`;
  const r = S.rosters[d];
  if (!r) return `<p class="small muted" style="margin:6px 0">עוד אין שבצ״ק ליום הזה.</p>${canEdit() ? `<button class="btn sm" data-a="qGen" data-v="${d}" data-pid="${p.id}" style="align-self:flex-start">ג׳נרט יום</button>` : ""}`;
  const mine = (r.slots || []).map((sl, si) => [sl, si]).filter(([sl]) => (sl.p || []).includes(p.id));
  const rows = (r.slots || []).map((sl, si) => [sl, si]).sort((a, b) => a[0].s - b[0].s || String(a[0].t).localeCompare(String(b[0].t)));
  return `<p class="small" style="margin:6px 0">${mine.length ? `משובץ: ${mine.map(([sl]) => `${esc((S.tasks[sl.t] || {}).name || "")} <span class="ltr num">${tmRange(sl)}</span>`).join(", ")}` : "בלי משמרות ביום הזה"} · ${Math.round(rotLoad(p.id, d))} ש׳ בסבב</p>
    ${canEdit() ? `<div class="checks" style="margin-bottom:6px"><label><input type="checkbox" id="qRe" checked>לסדר מחדש את שאר היום סביב השיבוץ</label></div>` : ""}
    <div class="stack" style="max-height:44vh;overflow:auto;gap:6px">${rows.map(([sl, si]) => {
      const t = S.tasks[sl.t] || {}, here = (sl.p || []).includes(p.id), comp = slotComp(t, sl);
      const w = here ? [] : (comp.pls.includes(p.platoon) ? [] : [`לא מ${plName(comp.pl || comp.pls[0])}`]).concat(present(p, d) ? [] : [ST_TXT[personStatus(p, d)]]).concat(slotConflicts(p, d, sl));
      const ppl = (sl.p || []).map(x => x ? nm(x) : "ריק").join(", ");
      return `<button class="qslot${here ? " here" : w.length ? " bad" : ""}" data-a="${here ? "qOut" : "qPut"}" data-v="${d}" data-si="${si}" data-pid="${p.id}"${canEdit() ? "" : " disabled"}>
        <span class="tbar" style="background:${esc(t.color || "var(--accent)")};height:30px"></span><div class="main"><b>${esc(t.name || "")}</b> <span class="ltr num small">${tmRange(sl)}</span>${sl.part ? ` <span class="small muted">${esc(partLabel(t, sl))}</span>` : ""}
        <br><small>${here ? "משובץ כאן · לחיצה מוציאה" : esc(ppl)}${w.length ? ` · <span class="warn-t">${esc(w.join(" · "))}</span>` : ""}</small></div>${sl.lock ? `<span class="pill">נעול</span>` : ""}</button>`; }).join("")}</div>`;
}
/* put pid in seat (d, si, pi): locked, and optionally the rest of the day planned again around it */
function forcePlace(pid, d, si, pi, re){
  const r = JSON.parse(JSON.stringify(S.rosters[d])), sl = r.slots[si], t = S.tasks[sl.t] || {};
  sl.p[pi] = pid; sl.lock = true; sl.w = [];
  if (re){
    // other unlocked seats of this person that day are freed, then everything unlocked is generated again
    r.slots.forEach((o, i) => { if (i !== si && !o.lock) o.p = o.p.map(x => x === pid ? null : x); });
    put("rosters/" + d, r);
    const res = generate([d]); put("rosters/" + d, res[d]);
  } else put("rosters/" + d, r);
  toast(`${nm(pid)} שובץ ל${t.name || ""} \u2066${tmRange(sl)}\u2069${re ? ". שאר היום סודר מחדש" : ""}`);
  openQuick(pid, d);
}
Object.assign(ACT, {
  quick: (v, el) => openQuick(v, el.dataset.d || null),
  qRole: (v, el) => { const pid = el.dataset.pid; updPerson(pid, p => { p.role = v; }); toast(`${nm(pid)}: ${roleNames()[v]}`); openQuick(pid, UI.qDay); },
  qTag: (v, el) => { const pid = el.dataset.pid; updPerson(pid, p => { p.tags = p.tags || []; p.tags = p.tags.includes(v) ? p.tags.filter(x => x !== v) : p.tags.concat(v); }); openQuick(pid, UI.qDay); },
  qGen: (v, el) => { genDates([v]); openQuick(el.dataset.pid, v); },
  qPut: (v, el) => {
    const d = v, si = Number(el.dataset.si), pid = el.dataset.pid, sl = S.rosters[d].slots[si], re = chk("qRe");
    const empty = (sl.p || []).indexOf(null);
    if (empty >= 0) return forcePlace(pid, d, si, empty, re);
    const t = S.tasks[sl.t] || {};
    openSheet(`<h3>במקום מי?</h3><p class="small muted" style="margin-top:-6px">${esc(t.name || "")} · <span class="ltr num">${tmRange(sl)}</span> · ${esc(nm(pid))} נכנס במקום:</p>
      <div class="stack">${sl.p.map((x, pi) => `<button class="cand" data-a="qSwap" data-v="${d}" data-si="${si}" data-pi="${pi}" data-pid="${pid}" data-re="${re ? 1 : 0}"><div class="main"><b>${esc(nm(x))}</b></div></button>`).join("")}</div>
      <div class="sheet-acts"><span class="sp"></span><button class="btn" data-a="quick" data-v="${pid}" data-d="${d}">חזרה</button></div>`);
  },
  qSwap: (v, el) => forcePlace(el.dataset.pid, v, Number(el.dataset.si), Number(el.dataset.pi), el.dataset.re === "1"),
  qOut: (v, el) => {
    const d = v, si = Number(el.dataset.si), pid = el.dataset.pid, r = JSON.parse(JSON.stringify(S.rosters[d])), sl = r.slots[si];
    sl.p = sl.p.map(x => x === pid ? null : x); sl.lock = true; sl.w = [];
    put("rosters/" + d, r); toast(`${nm(pid)} הוצא מ${(S.tasks[sl.t] || {}).name || "המשמרת"}. המשבצת נשארת ריקה ונעולה`); openQuick(pid, d);
  },
});
