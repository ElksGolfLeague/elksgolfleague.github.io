'use strict';
// Rename teams in league.json by position: node scripts/set-teams.js "Name 1" "Name 2" ...
// Names are applied to t1, t2, ... in order; teams beyond the list keep their names.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'league.json');
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const names = process.argv.slice(2).map(n => n.trim()).filter(Boolean);
names.forEach((n, i) => { if (s.teams[i]) { console.log(`${s.teams[i].id}: "${s.teams[i].name}" -> "${n}"`); s.teams[i].name = n; } });
s.updatedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(s, null, 1));
console.log('updated', names.length, 'team names');
