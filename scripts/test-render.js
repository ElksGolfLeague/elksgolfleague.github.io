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
ok('public page has no scripts', !/<script/i.test(b));
process.exitCode = fails ? 1 : 0;

// inactive teams stay off the board
const s2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'league.json'), 'utf8'));
s2.teams[11].active = false; s2.teams[11].name = 'Ghost Team';
const c = renderPublic(s2);
ok('inactive team is not listed anywhere', !c.includes('Ghost Team'));
ok('its tee-time spot shows as open', /\d open/.test(c));
process.exitCode = fails ? 1 : 0;
