'use strict';
// Quick renderer checks: node scripts/test-render.js
const fs = require('fs');
const path = require('path');
const { renderPublic } = require('./render');
const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'league.json'), 'utf8'));
let fails = 0;
function ok(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

s.league.subtitle = '';
const a = renderPublic(s);
ok('blank subtitle uses the automatic sentence', /<div class="meta">Saturdays at 9:00 AM, 11:00 AM and 1:00 PM Mountain time\. \d+ rounds, .* with .* off\.<\/div>/.test(a));
s.league.subtitle = 'Custom <line> here';
const b = renderPublic(s);
ok('custom subtitle replaces it, escaped', b.includes('<div class="meta">Custom &lt;line&gt; here</div>'));
ok('public page loads no external scripts', !/<script[^>]*src=/i.test(b));
process.exitCode = fails ? 1 : 0;

// inactive teams stay off the board
const s2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'league.json'), 'utf8'));
s2.teams[0].active = false; s2.teams[0].name = 'Ghost Team'; s2.teams[0].players = 'Ghost/Players';
const c = renderPublic(s2);
ok('inactive team is not listed anywhere', !c.includes('Ghost Team') && !c.includes('Ghost/Players'));
ok('its tee-time spot shows as open', /\d spots? open/.test(c) && c.includes('class="m openspot"') && c.includes('class="openchip"'));
process.exitCode = fails ? 1 : 0;

// team name + players, filter sections, sortable standings
const s3 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'league.json'), 'utf8'));
const d = renderPublic(s3);
ok('nickname shows with players', d.includes('Ham and Eggs <span class="pl">&ndash; Tim/Dakota</span>'));
ok('team without nickname shows players only', d.includes('<div class="m">Matt/Dom</div>'));
ok('one schedule section per active team', (d.match(/class="teamsched"/g) || []).length === s3.teams.filter(t => t.active !== false).length);
ok('filter lists the team', d.includes('<option value="t3">Ham and Eggs - Tim/Dakota</option>'));
ok('standings headers are sort buttons', (d.match(/data-sort="/g) || []).length === 6);
process.exitCode = fails ? 1 : 0;

// blocked spots show as Blocked, not open, and never hide a placed team
const s4 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'league.json'), 'utf8'));
s4.teams.forEach(x => { if (x.id === 't11' || x.id === 't12') x.active = false; }); // back to 10 teams
s4.weeks.forEach(w => Object.values(w.entries || {}).forEach(e => { delete e.pos; }));
s4.league.blocked = { '1:00 PM': 2 };
const e = renderPublic(s4);
ok('blocked 1:00 spots are not advertised as open', !e.includes('openspot"') && !e.includes('class="openchip"') && (e.match(/class="pair blockedpair"/g) || []).length === 6);
s4.league.blocked = { '1:00 PM': 9 };
ok('blocking more than the free room never hides teams', (renderPublic(s4).match(/class="pair blockedpair"/g) || []).length === 6);
s4.league.blocked = {};
ok('unblocked shows them open again', (renderPublic(s4).match(/class="m openspot"/g) || []).length === 12);
process.exitCode = fails ? 1 : 0;

// simulator pairs: first two listed play each other, next two play each other
const s5 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'league.json'), 'utf8'));
const g = renderPublic(s5);
const dec5 = g.slice(g.indexOf('Sat, Dec 5')); const nine = dec5.slice(dec5.indexOf('9:00 AM'), dec5.indexOf('11:00 AM'));
ok('tee time shows two vs pairs', (nine.match(/class="pair"/g) || []).length === 2 && (nine.match(/class="vs">vs</g) || []).length === 2);
ok('Dec 5 9:00 pairs Jebs/Cole with Matt/Dom', nine.includes('Jebs/Cole</span></div><div class="vs">vs</div><div class="m">Matt/Dom</div></li>'));
const sched = g.slice(g.indexOf('data-team="t9"')); const row = sched.slice(sched.indexOf('Dec 5'), sched.indexOf('</tr>', sched.indexOf('Dec 5')));
ok('team schedule shows the opponent only', g.includes('<th>Opponent</th>') && row.includes('Asphalt Assholes') && !row.includes('Ham and Eggs'));
const s6 = JSON.parse(JSON.stringify(s5)); const w6 = s6.weeks.find(w => w.date === '2026-12-05'); w6.entries.t5.slot = 'makeup';
const h6 = renderPublic(s6); const sch6 = h6.slice(h6.indexOf('data-team="t9"')); const row6 = sch6.slice(sch6.indexOf('Dec 5'), sch6.indexOf('</tr>', sch6.indexOf('Dec 5')));
const d6 = h6.slice(h6.indexOf('Sat, Dec 5')); const nine6 = d6.slice(d6.indexOf('9:00 AM'), d6.indexOf('11:00 AM'));
ok('a partner on makeup leaves vs Open spot, other pair untouched', row6.includes('oppopen') && nine6.includes('<div class="m openspot">Open spot</div><div class="vs">vs</div><div class="m">Matt/Dom</div>') && nine6.indexOf('Ham and Eggs') < nine6.indexOf('Hole Lotta') && nine6.indexOf('Hole Lotta') < nine6.indexOf('openspot'));
const s7 = JSON.parse(JSON.stringify(s5)); const w7 = s7.weeks.find(w => w.date === '2026-12-05'); w7.entries.t3.slot = 'makeup';
const n7 = renderPublic(s7).split('Sat, Dec 5')[1]; const nine7 = n7.slice(n7.indexOf('9:00 AM'), n7.indexOf('11:00 AM'));
ok('first-pair makeup does not slide the second pair up', nine7.includes('Jebs/Cole</span></div><div class="vs">vs</div><div class="m">Matt/Dom</div>') && nine7.includes('<div class="m openspot">Open spot</div><div class="vs">vs</div><div class="m">Hole Lotta'));
process.exitCode = fails ? 1 : 0;
