'use strict';
// Builds the site into _site/: the public board from league.json plus the
// edit page. Run by the GitHub Action on every push, or locally: node scripts/build.js
const fs = require('fs');
const path = require('path');
const { renderPublic } = require('./render');

const root = path.join(__dirname, '..');
const out = path.join(root, '_site');
const state = JSON.parse(fs.readFileSync(path.join(root, 'league.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'edit'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), renderPublic(state));
for (const f of fs.readdirSync(path.join(root, 'edit'))) fs.copyFileSync(path.join(root, 'edit', f), path.join(out, 'edit', f));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('built _site/index.html for', state.league.name, 'updated', state.updatedAt);
