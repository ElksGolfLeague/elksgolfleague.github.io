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
function isActive(t) { return !!t && t.active !== false; }
function activeTeams(st) { return st.teams.filter(isActive); }
function team(st, id) { return st.teams.find(t => t.id === id) || null; }
// A team shows as "Team name - Players" (either part may be blank).
function teamLabel(t) { if (!t) return 'Unknown team'; const n = (t.name || '').trim(), p = (t.players || '').trim(); return n && p ? n + ' - ' + p : (n || p || t.id); }
function teamHtml(t) { if (!t) return 'Unknown team'; const n = (t.name || '').trim(), p = (t.players || '').trim(); return n && p ? esc(n) + ' <span class="pl">&ndash; ' + esc(p) + '</span>' : esc(n || p || t.id); }
function teamName(st, id) { return teamLabel(team(st, id)); }
function teamCell(st, id) { return teamHtml(team(st, id)); }
function courseName(st, id) { const c = st.courses.find(c => c.id === id); return c ? c.name : 'Course TBD'; }
function hasGross(e) { return !!e && e.gross !== undefined && e.gross !== null && e.gross !== '' && !isNaN(Number(e.gross)); }
function netOf(e) { return Number(e.gross) - (e.hcp === '' || e.hcp == null ? 0 : Number(e.hcp)); }
function fmtNum(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

function standings(st) {
  const rows = activeTeams(st).map(t => {
    let rounds = 0, gross = 0, net = 0;
    for (const w of st.weeks) {
      if (w.bye) continue;
      const e = w.entries && w.entries[t.id];
      if (hasGross(e)) { rounds++; gross += Number(e.gross); net += netOf(e); }
    }
    return { team: t, rounds, gross, net };
  });
  rows.sort((a, b) => {
    if (a.rounds === 0 && b.rounds === 0) return teamLabel(a.team).localeCompare(teamLabel(b.team));
    if (a.rounds === 0) return 1;
    if (b.rounds === 0) return -1;
    return (a.net - b.net) || (a.gross - b.gross) || (b.rounds - a.rounds) || teamLabel(a.team).localeCompare(teamLabel(b.team));
  });
  return rows;
}

function slotsOf(w, st) {
  const out = {};
  for (const s of SLOTS) out[s] = [];
  out.makeup = []; out.out = [];
  const entries = w.entries || {};
  for (const tid of Object.keys(entries)) {
    if (st && !isActive(team(st, tid))) continue;
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
[hidden]{display:none!important}
.pl{color:var(--muted);font-weight:400}
.slot li .pl{display:block;font-size:12px}
#standings th button{all:unset;cursor:pointer;display:inline-flex;gap:4px;align-items:center}
#standings th button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#standings th[aria-sort=ascending] .arrow::after{content:'\\25B2';font-size:9px}
#standings th[aria-sort=descending] .arrow::after{content:'\\25BC';font-size:9px}
#standings th[aria-sort=ascending],#standings th[aria-sort=descending]{color:var(--fg)}
.filterbar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin:0 0 14px}
.filterbar label{font-family:var(--display);font-weight:700;font-size:14px}
.filterbar select{font:inherit;color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 10px;max-width:100%}
.filterbar button{font:inherit;font-family:var(--display);font-weight:700;font-size:13px;border:1.5px solid var(--line);background:var(--surface);color:var(--muted);border-radius:8px;padding:6px 12px;cursor:pointer}
.teamsched h3{margin-bottom:10px}
.teamsched td{vertical-align:top}
.byerow td{color:var(--muted);background:var(--soft)}
@media (max-width:560px){.slots{grid-template-columns:1fr}.week header h3{font-size:17px}}
`;

// One team's season as a table: shown when that team is picked in the filter.
function renderTeamSchedule(st, t) {
  let h = `<section class="teamsched" data-team="${t.id}" hidden><h3>${teamHtml(t)}</h3><div class="tablebox"><table><thead><tr><th>Week</th><th>Date</th><th>Course</th><th>Tee time</th><th>Playing with</th><th class="num">Gross</th><th class="num">Net</th></tr></thead><tbody>`;
  for (const w of st.weeks) {
    if (w.hidden) continue;
    if (w.bye) { h += `<tr class="byerow"><td>Bye</td><td>${esc(fmtDate(w.date))}</td><td colspan="5">${esc(w.note || 'No golf this week.')}</td></tr>`; continue; }
    const e = (w.entries || {})[t.id] || {}, slot = e.slot || 'out';
    let tee, mates = '';
    if (SLOTS.includes(slot)) {
      tee = `<b>${slot}</b>`;
      mates = Object.keys(w.entries || {})
        .filter(id => id !== t.id && w.entries[id].slot === slot && isActive(team(st, id)))
        .map(id => teamCell(st, id)).join('<br>') || '&ndash;';
    } else if (slot === 'makeup') tee = 'Makeup' + (e.note ? ': ' + esc(e.note) : '');
    else tee = 'Not playing';
    h += `<tr><td>${w.n}</td><td>${esc(fmtDate(w.date))}</td><td>${esc(courseName(st, w.courseId))}</td><td>${tee}</td><td>${mates}</td>` +
      `<td class="num">${hasGross(e) ? fmtNum(Number(e.gross)) : ''}</td><td class="num">${hasGross(e) ? fmtNum(netOf(e)) : ''}</td></tr>`;
  }
  return h + '</tbody></table></div></section>';
}

// Small progressive enhancement: sortable standings and the team filter.
// Without it the page still shows everything; the filter bar stays hidden.
const CLIENT_JS = `(function(){
var tbl=document.getElementById('standings');
if(tbl){var body=tbl.tBodies[0];tbl.querySelectorAll('th button').forEach(function(b){b.addEventListener('click',function(){
var th=b.parentNode,idx=Array.prototype.indexOf.call(th.parentNode.children,th),key=b.getAttribute('data-sort');
var cur=th.getAttribute('aria-sort'),dir=cur==='none'?b.getAttribute('data-dir'):(cur==='ascending'?'desc':'asc');
tbl.querySelectorAll('th').forEach(function(x){x.setAttribute('aria-sort','none')});th.setAttribute('aria-sort',dir==='asc'?'ascending':'descending');
var rows=Array.prototype.slice.call(body.rows);rows.sort(function(r1,r2){var a=r1.cells[idx].getAttribute('data-v'),c=r2.cells[idx].getAttribute('data-v');
if(a===''&&c==='')return 0;if(a==='')return 1;if(c==='')return -1;var n=key==='team'?a.localeCompare(c):Number(a)-Number(c);return dir==='asc'?n:-n});
rows.forEach(function(r){body.appendChild(r)});});});}
var sel=document.getElementById('team-filter'),bar=document.getElementById('filterbar'),clr=document.getElementById('team-clear');
if(!sel)return;bar.hidden=false;
function apply(){var v=sel.value;document.getElementById('allweeks').hidden=!!v;clr.hidden=!v;
document.querySelectorAll('.teamsched').forEach(function(s){s.hidden=s.getAttribute('data-team')!==v});
try{if(v)localStorage.setItem('elks-team',v);else localStorage.removeItem('elks-team')}catch(e){}
try{history.replaceState(null,'',v?'#'+v:location.pathname+location.search)}catch(e){}}
sel.addEventListener('change',apply);clr.addEventListener('click',function(){sel.value='';apply()});
var want=location.hash.slice(1);if(!want){try{want=localStorage.getItem('elks-team')||''}catch(e){}}
if(want&&sel.querySelector('option[value="'+want+'"]'))sel.value=want;apply();
})();`;

function renderWeekCard(st, w) {
  if (w.bye) {
    return `<section class="week bye"><header><span class="eyebrow">Bye</span><h3>${esc(fmtDate(w.date))}</h3></header><div class="weeknote">${esc(w.note || 'No golf this week.')}</div></section>`;
  }
  const cap = Number(st.league.slotCapacity) || 4, by = slotsOf(w, st);
  let h = `<section class="week"><header><span class="eyebrow">Week ${w.n}</span><h3>${esc(fmtDate(w.date))}</h3><span class="course">${esc(courseName(st, w.courseId))}</span></header><div class="slots">`;
  for (const s of SLOTS) {
    const ids = by[s], open = cap - ids.length;
    h += `<div class="slot"><div class="time">${s}</div><ul>${ids.map(id => `<li>${teamCell(st, id)}</li>`).join('')}</ul>`;
    h += open > 0 ? `<div class="open">${open} open</div>` : '<div class="full">Full</div>';
    h += '</div>';
  }
  h += '</div>';
  if (by.makeup.length) h += `<div class="makeups"><b>Makeup rounds:</b>${by.makeup.map(id => { const e = w.entries[id]; return `<span>${teamCell(st, id)}${e.note ? ' &ndash; ' + esc(e.note) : ''}</span>`; }).join('')}</div>`;
  if (by.out.length) h += `<div class="makeups"><b>Not playing:</b><span>${by.out.map(id => teamCell(st, id)).join(', ')}</span></div>`;
  const scored = Object.keys(w.entries || {}).filter(id => isActive(team(st, id)) && hasGross(w.entries[id]));
  if (scored.length) {
    scored.sort((a, b) => netOf(w.entries[a]) - netOf(w.entries[b]));
    h += '<div class="scores"><table><thead><tr><th>Scores</th><th class="num">Gross</th><th class="num">Hcp</th><th class="num">Net</th></tr></thead><tbody>';
    for (const id of scored) { const e = w.entries[id]; h += `<tr><td>${teamCell(st, id)}</td><td class="num">${fmtNum(Number(e.gross))}</td><td class="num">${fmtNum(Number(e.hcp || 0))}</td><td class="num">${fmtNum(netOf(e))}</td></tr>`; }
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

  const sortTh = (key, label, cls, dir) => `<th class="${cls}" aria-sort="${key === 'rank' ? 'ascending' : 'none'}"><button type="button" data-sort="${key}" data-dir="${dir}">${label}<span class="arrow" aria-hidden="true"></span></button></th>`;
  h += '<section><h2>Standings</h2><div class="tablebox"><table id="standings"><thead><tr>' +
    sortTh('rank', '#', 'rank', 'asc') + sortTh('team', 'Team', '', 'asc') + sortTh('rounds', 'Rounds', 'num', 'desc') +
    sortTh('gross', 'Overall (gross)', 'num', 'asc') + sortTh('net', 'Handicap (net)', 'num', 'asc') + sortTh('avg', 'Avg gross', 'num', 'asc') +
    '</tr></thead><tbody>';
  rows.forEach((r, i) => {
    const played = r.rounds > 0, v = x => (played ? x : '');
    h += `<tr${played && i === 0 ? ' class="lead"' : ''}>` +
      `<td class="rank" data-v="${i}">${played ? i + 1 : '&ndash;'}</td>` +
      `<td data-v="${esc(teamLabel(r.team).toLowerCase())}">${teamHtml(r.team)}</td>` +
      `<td class="num" data-v="${r.rounds}">${r.rounds}</td>` +
      `<td class="num" data-v="${v(r.gross)}">${played ? fmtNum(r.gross) : '&ndash;'}</td>` +
      `<td class="num" data-v="${v(r.net)}">${played ? fmtNum(r.net) : '&ndash;'}</td>` +
      `<td class="num" data-v="${v((r.gross / Math.max(r.rounds, 1)).toFixed(2))}">${played ? (r.gross / r.rounds).toFixed(1) : '&ndash;'}</td></tr>`;
  });
  h += '</tbody></table></div>';
  h += `<p class="note">${anyRounds ? 'Ranked by handicap (net) total, lowest first. Tap a column heading to sort by it.' : 'No scores posted yet. Standings fill in after the first round.'} ${esc(L.hcpRule)}</p></section>`;

  const active = activeTeams(st).slice().sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)));
  h += '<section><h2>Schedule</h2>';
  h += `<div class="filterbar" id="filterbar" hidden><label for="team-filter">Show schedule for</label><select id="team-filter"><option value="">All teams</option>${active.map(t => `<option value="${t.id}">${esc(teamLabel(t))}</option>`).join('')}</select><button type="button" id="team-clear" hidden>Show all teams</button></div>`;
  if (hiddenCount) h += `<p class="note" style="margin:0 0 10px">${hiddenCount} earlier ${hiddenCount === 1 ? 'week is' : 'weeks are'} complete and folded into the standings above.</p>`;
  h += '<div class="weeks" id="allweeks">' + st.weeks.filter(w => !w.hidden).map(w => renderWeekCard(st, w)).join('') + '</div>';
  h += active.map(t => renderTeamSchedule(st, t)).join('');
  if (L.notes) h += `<p class="note">${esc(L.notes)}</p>`;
  h += '</section>';
  h += `<footer>Courses: ${st.courses.map(c => esc(c.name)).join(' &middot; ')}${st.updatedAt ? '<br>Last updated ' + esc(fmtStamp(st.updatedAt)) + '.' : ''}</footer>`;
  h += '</div><script>' + CLIENT_JS + '</script></body></html>\n';
  return h;
}

module.exports = { renderPublic, standings, slotsOf, SLOTS };
