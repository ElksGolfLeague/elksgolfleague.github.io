'use strict';
// Builds a balanced tee-time rotation for the ACTIVE teams and writes it into league.json.
//   node scripts/rebalance.js [--apply]
// Each team gets each tee time the same number of times (weeks / 3 each), weekly slot
// sizes stay within one of each other, fixed week-1 picks are honoured, and repeat
// pairings (same two teams in one tee time) are minimised by random restarts.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'league.json');
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM'];
const FIXED = { t1: '9:00 AM', t4: '11:00 AM' }; // week 1 only
const teams = s.teams.filter(t => t.active !== false).map(t => t.id);
const weeks = s.weeks.filter(w => !w.bye);
const W = weeks.length, N = teams.length, per = W / SLOTS.length; // times each team sees each slot
if (!Number.isInteger(per)) throw new Error('weeks must be a multiple of 3');
const sizes = () => { const base = Math.floor(N / 3), extra = N % 3; return [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base]; };

function rnd(n) { return Math.floor(Math.random() * n); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pairCost(plan) {
  const seen = new Map(); let cost = 0;
  for (const wk of plan) for (const grp of wk) for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) {
    const k = grp[i] < grp[j] ? grp[i] + '|' + grp[j] : grp[j] + '|' + grp[i];
    const n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n > 1) cost += n - 1;
  }
  return cost;
}
function attempt() {
  // slot sequence per team: a multiset with `per` of each slot, shuffled; week sizes fixed by rotating which slot is the big one
  const plan = [];
  const remaining = {}; for (const t of teams) remaining[t] = { '9:00 AM': per, '11:00 AM': per, '1:00 PM': per };
  for (let w = 0; w < W; w++) {
    const sz = sizes(); const cap = {}; SLOTS.forEach((sl, i) => cap[sl] = sz[(i + w) % 3]);
    const groups = { '9:00 AM': [], '11:00 AM': [], '1:00 PM': [] };
    const order = shuffle(teams.slice());
    // fixed picks first
    for (const t of order) if (w === 0 && FIXED[t]) { groups[FIXED[t]].push(t); cap[FIXED[t]]--; remaining[t][FIXED[t]]--; }
    for (const t of order) {
      if (w === 0 && FIXED[t]) continue;
      // candidate slots: still needed by the team and with room this week; prefer the slot the team needs most
      const cands = SLOTS.filter(sl => remaining[t][sl] > 0 && cap[sl] > 0);
      if (!cands.length) return null;
      cands.sort((a, b) => remaining[t][b] - remaining[t][a] || rnd(3) - 1);
      const sl = cands[0]; groups[sl].push(t); cap[sl]--; remaining[t][sl]--;
    }
    plan.push(SLOTS.map(sl => groups[sl]));
  }
  for (const t of teams) for (const sl of SLOTS) if (remaining[t][sl] !== 0) return null;
  return plan;
}
let best = null, bestCost = Infinity;
for (let i = 0; i < 20000; i++) { const p = attempt(); if (!p) continue; const c = pairCost(p); if (c < bestCost) { best = p; bestCost = c; } }
if (!best) throw new Error('no valid rotation found');
const name = id => s.teams.find(t => t.id === id).name;
best.forEach((wk, i) => { console.log(`Week ${weeks[i].n} ${weeks[i].date}`); SLOTS.forEach((sl, j) => console.log(`  ${sl}: ${wk[j].map(name).join(', ')}`)); });
console.log('repeat pairings:', bestCost);
if (process.argv.includes('--apply')) {
  best.forEach((wk, i) => { const w = weeks[i]; w.entries = w.entries || {}; SLOTS.forEach((sl, j) => wk[j].forEach(t => { w.entries[t] = Object.assign({}, w.entries[t], { slot: sl }); })); });
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(s, null, 1));
  console.log('applied to league.json');
}
