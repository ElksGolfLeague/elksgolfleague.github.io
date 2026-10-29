'use strict';
// Builds a tee-time rotation for the ACTIVE teams and writes it into league.json.
//   node scripts/rebalance.js [--apply]
// 9:00 and 11:00 fill to capacity first, so the open spots each week land at 1:00 PM
// (Jeremy, Oct 29 2026). Teams share the 1:00 PM rounds as evenly as possible, pinned
// picks below are honoured, and repeat pairings (same two teams in one tee time) are
// minimised by random restarts. LATE_TEAM, if set, takes an extra 1:00 PM round so the
// late slot is the one left open if that team never fills in.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'league.json');
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM'];
const PINNED = { 1: { t1: '9:00 AM', t4: '11:00 AM' }, 2: { t2: '11:00 AM' } }; // week number -> team -> slot
const LATE_TEAM = 't10';
const cap = s.league.slotCapacity || 4;
const teams = s.teams.filter(t => t.active !== false).map(t => t.id);
const weeks = s.weeks.filter(w => !w.bye);
const W = weeks.length, N = teams.length;
// weekly sizes: fill 9:00, then 11:00, remainder at 1:00
const size = [Math.min(cap, N), Math.min(cap, Math.max(0, N - cap)), Math.max(0, N - 2 * cap)];
if (size[2] > cap) throw new Error('too many teams for three tee times');

const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const key = (a, b) => a < b ? a + '|' + b : b + '|' + a;

// Per-team quota of each slot over the season, spread as evenly as the totals allow.
function quotas() {
  const tot = size.map(n => n * W); // season totals per slot
  const q = {}; teams.forEach(t => q[t] = [0, 0, 0]);
  // 1:00 PM first: everyone gets floor, extras go to LATE_TEAM then random teams
  const base1 = Math.floor(tot[2] / N); let extra1 = tot[2] - base1 * N;
  const order = shuffle(teams.slice());
  if (LATE_TEAM && order.includes(LATE_TEAM)) { order.splice(order.indexOf(LATE_TEAM), 1); order.unshift(LATE_TEAM); }
  order.forEach(t => { q[t][2] = base1 + (extra1-- > 0 ? 1 : 0); });
  // split each team's remaining rounds between 9:00 and 11:00; odd ones alternate to hit the totals
  let need9 = tot[0];
  const odd = shuffle(teams.filter(t => (W - q[t][2]) % 2));
  teams.forEach(t => { const r = W - q[t][2]; q[t][0] = Math.floor(r / 2); q[t][1] = Math.floor(r / 2); need9 -= q[t][0]; });
  odd.forEach(t => { if (need9 > 0) { q[t][0]++; need9--; } else q[t][1]++; });
  return need9 === 0 ? q : null;
}

function attempt() {
  const q = quotas(); if (!q) return null;
  const rem = {}; teams.forEach(t => rem[t] = q[t].slice());
  const plan = [];
  for (let w = 0; w < W; w++) {
    const left = W - w; // weeks left including this one
    const groups = [[], [], []]; const room = size.slice();
    const pins = PINNED[weeks[w].n] || {};
    for (const [t, sl] of Object.entries(pins)) { if (!teams.includes(t)) continue; const i = SLOTS.indexOf(sl); if (rem[t][i] <= 0 || room[i] <= 0) return null; groups[i].push(t); room[i]--; rem[t][i]--; }
    // urgency: teams that must take a slot every remaining week go first
    const free = shuffle(teams.filter(t => !(t in pins)));
    free.sort((a, b) => Math.max(...rem[b]) / left - Math.max(...rem[a]) / left);
    for (const t of free) {
      const cands = [0, 1, 2].filter(i => rem[t][i] > 0 && room[i] > 0);
      if (!cands.length) return null;
      cands.sort((x, y) => rem[t][y] - rem[t][x] || rnd(3) - 1);
      const i = cands[0]; groups[i].push(t); room[i]--; rem[t][i]--;
    }
    if (room.some(r => r !== 0)) return null;
    plan.push(groups);
  }
  return { plan, q };
}
function cost(plan) {
  const seen = new Map(); let c = 0;
  for (const wk of plan) for (const g of wk) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const k = key(g[i], g[j]); const n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n > 1) c += n - 1;
  }
  // light penalty for the same tee time two weeks running
  for (const t of teams) for (let w = 1; w < plan.length; w++) for (let i = 0; i < 3; i++) if (plan[w][i].includes(t) && plan[w - 1][i].includes(t)) c += 0.2;
  return c;
}
let best = null, bestCost = Infinity;
for (let i = 0; i < 200000; i++) { const a = attempt(); if (!a) continue; const c = cost(a.plan); if (c < bestCost) { best = a; bestCost = c; } }
if (!best) throw new Error('no valid rotation found');
const label = id => { const t = s.teams.find(x => x.id === id); return [t.name, t.players].filter(Boolean).join(' - ') || id; };
best.plan.forEach((wk, i) => { console.log(`Week ${weeks[i].n} ${weeks[i].date}`); SLOTS.forEach((sl, j) => console.log(`  ${sl} (${wk[j].length}): ${wk[j].map(label).join(', ')}`)); });
console.log('per team 9/11/1:'); teams.forEach(t => console.log('  ' + t + ' ' + best.q[t].join('/') + '  ' + label(t)));
console.log('cost:', bestCost.toFixed(1));
if (process.argv.includes('--apply')) {
  best.plan.forEach((wk, i) => { const w = weeks[i]; w.entries = w.entries || {}; SLOTS.forEach((sl, j) => wk[j].forEach(t => { w.entries[t] = Object.assign({}, w.entries[t], { slot: sl }); })); });
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(s, null, 1));
  console.log('applied to league.json');
}
