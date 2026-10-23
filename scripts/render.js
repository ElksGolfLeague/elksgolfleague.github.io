'use strict';
// Renders the PUBLIC board: one complete, static, read-only HTML document
// built from the league state. No scripts, nothing to attack. The same
// function feeds the admin preview and the file pushed to GitHub.

const SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' }) + ' MT';
}
function team(st, id) { return st.teams.find(t => t.id === id) || null; }
function teamName(st, id) { const t = team(st, id); return t ? t.name : 'Unknown team'; }
function courseName(st, id) { const c = st.courses.find(c => c.id === id); return c ? c.name : 'Course TBD'; }
function hasGross(e) { return !!e && e.gross !== undefined && e.gross !== null && e.gross !== '' && !isNaN(Number(e.gross)); }
function netOf(e) { return Number(e.gross) - (e.hcp === '' || e.hcp == null ? 0 : Number(e.hcp)); }
function fmtNum(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

function standings(st) {
  const rows = st.teams.map(t => {
    let rounds = 0, gross = 0, net = 0;
    for (const w of st.weeks) {
      if (w.bye) continue;
      const e = w.entries && w.entries[t.id];
      if (hasGross(e)) { rounds++; gross += Number(e.gross); net += netOf(e); }
    }
    return { team: t, rounds, gross, net };
  });
  rows.sort((a, b) => {
    if (a.rounds === 0 && b.rounds === 0) return a.team.name.localeCompare(b.team.name);
    if (a.rounds === 0) return 1;
    if (b.rounds === 0) return -1;
    return (a.net - b.net) || (a.gross - b.gross) || (b.rounds - a.rounds) || a.team.name.localeCompare(b.team.name);
  });
  return rows;
}

function slotsOf(w) {
  const out = {};
  for (const s of SLOTS) out[s] = [];
  out.makeup = []; out.out = [];
  const entries = w.entries || {};
  for (const tid of Object.keys(entries)) {
    let s = entries[tid].slot || 'out';
    if (!out[s]) s = 'out';
    out[s].push(tid);
  }
  return out;
}

const CSS = `
:root{--bg:#f2f5ee;--surface:#ffffff;--fg:#17231a;--muted:#5c6b5e;--line:#d3dbd1;--accent:#2c6a3e;--soft:#e3ede2;--open:#a8601a;
  --display:'Archivo',system-ui,sans-serif;--body:'Public Sans',system-ui,sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#111a14;--surface:#1a2520;--fg:#e7eee6;--muted:#9fb1a3;--line:#2c3a30;--accent:#62b97a;--soft:#213126;--open:#e4a35d;color-scheme:dark}}
*{box-sizing:border-box}
html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);font-size:15px;line-height:1.45;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 56px}
.wrap{max-width:1100px;margin:0 auto}
h1,h2,h3{font-family:var(--display);text-wrap:balance;margin:0}
h1{font-size:clamp(26px,4vw,38px);font-weight:800;letter-spacing:-.01em;line-height:1.1}
h2{font-size:20px;font-weight:700;margin-bottom:10px}
h3{font-size:17px;font-weight:700}
.eyebrow{font-family:var(--display);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.top{padding:28px 0 18px;border-bottom:3px solid var(--accent)}
.top .meta{color:var(--muted);margin-top:4px}
section{margin-top:28px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
th{font-family:var(--display);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
td.num,th.num{text-align:right}
.tablebox{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px}
.tablebox table th:first-child,.tablebox table td:first-child{padding-left:14px}
.rank{color:var(--muted);width:2.5em}
.lead td{font-weight:700}
.note{color:var(--muted);font-size:13px;margin-top:8px}
.weeks{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.week{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px 16px;min-width:0}
.week.bye{background:var(--soft);border-style:dashed}
.week header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin-bottom:10px}
.week header h3{font-size:19px}
.week .course{color:var(--muted)}
.slots{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.slot{border-top:2px solid var(--accent);padding-top:6px;min-width:0}
.slot .time{font-family:var(--display);font-weight:700;font-size:14px}
.slot ul{list-style:none;margin:6px 0 0;padding:0}
.slot li{padding:3px 0;border-bottom:1px dotted var(--line);overflow-wrap:anywhere}
.slot .open{margin-top:6px;font-size:12px;font-weight:700;color:var(--open)}
.slot .full{margin-top:6px;font-size:12px;color:var(--muted)}
.makeups{margin-top:10px;font-size:14px}
.makeups span{display:block;color:var(--muted)}
.scores{margin-top:12px}
.scores table td,.scores table th{padding:5px 6px;font-size:14px}
.weeknote{margin-top:8px;font-size:14px;color:var(--muted)}
footer{margin-top:36px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px}
@media (max-width:560px){.slots{grid-template-columns:1fr}.week header h3{font-size:17px}}
`;

function renderWeekCard(st, w) {
  if (w.bye) {
    return `<section class="week bye"><header><span class="eyebrow">Bye</span><h3>${esc(fmtDate(w.date))}</h3></header><div class="weeknote">${esc(w.note || 'No golf this week.')}</div></section>`;
  }
  const cap = Number(st.league.slotCapacity) || 4, by = slotsOf(w);
  let h = `<section class="week"><header><span class="eyebrow">Week ${w.n}</span><h3>${esc(fmtDate(w.date))}</h3><span class="course">${esc(courseName(st, w.courseId))}</span></header><div class="slots">`;
  for (const s of SLOTS) {
    const ids = by[s], open = cap - ids.length;
    h += `<div class="slot"><div class="time">${s}</div><ul>${ids.map(id => `<li>${esc(teamName(st, id))}</li>`).join('')}</ul>`;
    h += open > 0 ? `<div class="open">${open} open</div>` : '<div class="full">Full</div>';
    h += '</div>';
  }
  h += '</div>';
  if (by.makeup.length) h += `<div class="makeups"><b>Makeup rounds:</b>${by.makeup.map(id => { const e = w.entries[id]; return `<span>${esc(teamName(st, id))}${e.note ? ' &ndash; ' + esc(e.note) : ''}</span>`; }).join('')}</div>`;
  if (by.out.length) h += `<div class="makeups"><b>Not playing:</b><span>${by.out.map(id => esc(teamName(st, id))).join(', ')}</span></div>`;
  const scored = Object.keys(w.entries || {}).filter(id => hasGross(w.entries[id]));
  if (scored.length) {
    scored.sort((a, b) => netOf(w.entries[a]) - netOf(w.entries[b]));
    h += '<div class="scores"><table><thead><tr><th>Scores</th><th class="num">Gross</th><th class="num">Hcp</th><th class="num">Net</th></tr></thead><tbody>';
    for (const id of scored) { const e = w.entries[id]; h += `<tr><td>${esc(teamName(st, id))}</td><td class="num">${fmtNum(Number(e.gross))}</td><td class="num">${fmtNum(Number(e.hcp || 0))}</td><td class="num">${fmtNum(netOf(e))}</td></tr>`; }
    h += '</tbody></table></div>';
  }
  if (w.note) h += `<div class="weeknote">${esc(w.note)}</div>`;
  return h + '</section>';
}

function renderPublic(st) {
  const L = st.league;
  const rows = standings(st), anyRounds = rows.some(r => r.rounds > 0);
  const hiddenCount = st.weeks.filter(w => w.hidden && !w.bye).length;
  const playing = st.weeks.filter(w => !w.bye);
  const first = playing[0] && fmtDate(playing[0].date), last = playing[playing.length - 1] && fmtDate(playing[playing.length - 1].date);
  const byes = st.weeks.filter(w => w.bye).map(w => fmtDate(w.date));
  let h = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(L.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Public+Sans:wght@400;600;700&display=swap">
<style>${CSS}</style></head><body><div class="wrap">`;
  const autoSub = `Saturdays at ${SLOTS.join(', ').replace(/, ([^,]*)$/, ' and $1')} Mountain time. ${playing.length} rounds, ${first} to ${last}${byes.length ? ', with ' + byes.join(' and ') + ' off' : ''}.`;
  const subtitle = (L.subtitle || '').trim() || autoSub;
  h += `<header class="top"><div class="eyebrow">${esc(L.season)}</div><h1>${esc(L.name)}</h1><div class="meta">${esc(subtitle)}</div></header>`;

  h += '<section><h2>Standings</h2><div class="tablebox"><table><thead><tr><th class="rank">#</th><th>Team</th><th class="num">Rounds</th><th class="num">Overall (gross)</th><th class="num">Handicap (net)</th><th class="num">Avg gross</th></tr></thead><tbody>';
  rows.forEach((r, i) => {
    const played = r.rounds > 0;
    h += `<tr${played && i === 0 ? ' class="lead"' : ''}><td class="rank">${played ? i + 1 : '&ndash;'}</td><td>${esc(r.team.name)}</td><td class="num">${r.rounds}</td><td class="num">${played ? fmtNum(r.gross) : '&ndash;'}</td><td class="num">${played ? fmtNum(r.net) : '&ndash;'}</td><td class="num">${played ? (r.gross / r.rounds).toFixed(1) : '&ndash;'}</td></tr>`;
  });
  h += '</tbody></table></div>';
  h += `<p class="note">${anyRounds ? 'Ranked by handicap (net) total, lowest first.' : 'No scores posted yet. Standings fill in after the first round.'} ${esc(L.hcpRule)}</p></section>`;

  h += '<section><h2>Schedule</h2>';
  if (hiddenCount) h += `<p class="note" style="margin:0 0 10px">${hiddenCount} earlier ${hiddenCount === 1 ? 'week is' : 'weeks are'} complete and folded into the standings above.</p>`;
  h += '<div class="weeks">' + st.weeks.filter(w => !w.hidden).map(w => renderWeekCard(st, w)).join('') + '</div>';
  if (L.notes) h += `<p class="note">${esc(L.notes)}</p>`;
  h += '</section>';
  h += `<footer>Courses: ${st.courses.map(c => esc(c.name)).join(' &middot; ')}${st.updatedAt ? '<br>Last updated ' + esc(fmtStamp(st.updatedAt)) + '.' : ''}</footer>`;
  h += '</div></body></html>\n';
  return h;
}

module.exports = { renderPublic, standings, slotsOf, SLOTS };
