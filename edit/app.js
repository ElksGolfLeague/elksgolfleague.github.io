(function () {
  'use strict';
  // The editor is a static page. It reads league.json from the repo and saves it
  // back through the GitHub Contents API with a token kept only in this browser.
  // A push to main triggers the Action that rebuilds the public board.
  var SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM'];
  var SLOT_OPTIONS = SLOTS.concat(['makeup', 'out']);
  var SLOT_LABELS = { makeup: 'Makeup (other day)', out: 'Not playing' };
  var FILE = 'league.json', BRANCH = 'main', TOKEN_KEY = 'elks-gh-token';
  var app = document.getElementById('app');
  var draft = null, sha = null, dirty = false, repo = detectRepo();

  function detectRepo() {
    // <owner>.github.io/           -> repo <owner>.github.io
    // <owner>.github.io/<repo>/... -> repo <repo>
    var host = location.hostname, m = host.match(/^([^.]+)\.github\.io$/);
    var seg = location.pathname.split('/').filter(Boolean);
    if (m) return { owner: m[1], repo: seg.length > 1 && seg[0] !== 'edit' ? seg[0] : host };
    try { var o = JSON.parse(localStorage.getItem('elks-repo') || 'null'); if (o && o.owner && o.repo) return o; } catch (e) { /* ignore */ }
    return { owner: 'ElksGolfLeague', repo: 'elksgolfleague.github.io' };
  }
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
  function api(method, path, body) {
    var headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    var t = getToken(); if (t) headers['Authorization'] = 'Bearer ' + t;
    if (body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.text().then(function (txt) { var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { /* non-json */ } return { status: r.status, ok: r.ok, json: j }; }); });
  }
  function b64decode(s) { return decodeURIComponent(Array.prototype.map.call(atob(s.replace(/\n/g, '')), function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); }
  function b64encode(s) { return btoa(unescape(encodeURIComponent(s))); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function fmtStamp(iso) { if (!iso) return 'never'; var d = new Date(iso); return isNaN(d) ? 'unknown' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function team(id) { for (var i = 0; i < draft.teams.length; i++) if (draft.teams[i].id === id) return draft.teams[i]; return null; }
  function hasGross(e) { return e && e.gross !== undefined && e.gross !== null && e.gross !== '' && !isNaN(Number(e.gross)); }
  function netOf(e) { return Number(e.gross) - (e.hcp === '' || e.hcp == null ? 0 : Number(e.hcp)); }
  function fmtNum(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
  function isActive(t) { return !!t && t.active !== false; }
  function label(t) { if (!t) return 'Unknown team'; var n = (t.name || '').trim(), p = (t.players || '').trim(); return n && p ? n + ' - ' + p : (n || p || t.id); }
  function slotsOf(w) { var out = {}; SLOTS.forEach(function (s) { out[s] = []; }); out.makeup = []; out.out = []; var en = w.entries || {}; Object.keys(en).forEach(function (t) { if (!isActive(team(t))) return; var s = en[t].slot || 'out'; if (!out[s]) s = 'out'; out[s].push(t); }); return out; }
  function countsHtml(w) {
    var cap = Number(draft.league.slotCapacity) || 4, by = slotsOf(w);
    return SLOTS.map(function (s) { var n = by[s].length; return '<span' + (n > cap ? ' class="over"' : '') + '>' + s + ': <b>' + n + '</b>/' + cap + (n > cap ? ' over' : '') + '</span>'; }).join('') + '<span>Makeup: <b>' + by.makeup.length + '</b></span><span>Not playing: <b>' + by.out.length + '</b></span>';
  }

  function balanceHtml() {
    var h = '<div class="tablebox"><table><thead><tr><th>Team</th>' + SLOTS.map(function (s) { return '<th class="num">' + s + '</th>'; }).join('') + '<th class="num">Makeup</th><th class="num">Not playing</th></tr></thead><tbody>';
    draft.teams.forEach(function (t) {
      if (!isActive(t)) return;
      var c = { makeup: 0, out: 0 }; SLOTS.forEach(function (s) { c[s] = 0; });
      draft.weeks.forEach(function (w) { if (w.bye) return; var e = w.entries && w.entries[t.id]; var s = e && e.slot ? e.slot : 'out'; if (c[s] === undefined) s = 'out'; c[s]++; });
      var vals = SLOTS.map(function (s) { return c[s]; }), hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals);
      h += '<tr' + (hi - lo > 1 ? ' class="uneven"' : '') + '><td>' + esc(label(t)) + '</td>' + vals.map(function (n) { return '<td class="num">' + n + '</td>'; }).join('') + '<td class="num">' + c.makeup + '</td><td class="num">' + c.out + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function render() {
    var d = draft, h = '', boardUrl = location.origin + location.pathname.replace(/edit\/?(index\.html)?$/, '');
    h += '<header class="top"><div><div class="eyebrow">League editor</div><h1>' + esc(d.league.name) + '</h1><div class="meta">Public board: <a href="' + esc(boardUrl) + '" target="_blank" rel="noopener">' + esc(boardUrl) + '</a> &middot; last saved ' + esc(fmtStamp(d.updatedAt)) + ' &middot; repo ' + esc(repo.owner + '/' + repo.repo) + '</div></div>';
    h += '<div><button class="quiet" data-act="forget">Forget token on this device</button></div></header>';
    if (!getToken()) {
      h += '<div class="tokenbox"><b>Sign in with a GitHub token to save.</b><span class="note" style="margin:0">Paste a fine-grained token for ' + esc(repo.owner + '/' + repo.repo) + ' with Contents read and write. It is kept only in this browser.</span><div class="row"><input type="password" id="token-in" placeholder="github_pat_..." autocomplete="off"><button class="primary" data-act="usetoken">Use token</button></div></div>';
    }
    h += '<div class="editbar"><button class="primary" data-act="save"' + (getToken() ? '' : ' disabled') + '>Save and publish</button><button data-act="hidepast">Hide past weeks</button><button class="quiet" data-act="reload">Discard changes</button><span class="msg" id="msg"></span></div>';

    h += '<section class="grid2"><div><h2>League</h2><div class="form">';
    h += '<label>League name<input id="f-league-name" data-path="league.name" value="' + esc(d.league.name) + '"></label>';
    h += '<label>Eyebrow line (above the name)<input id="f-league-season" data-path="league.season" value="' + esc(d.league.season) + '"></label>';
    h += '<label>Subtitle (the line under the name; leave blank for the automatic tee-time sentence)<input id="f-league-subtitle" data-path="league.subtitle" value="' + esc(d.league.subtitle) + '"></label>';
    h += '<label>Teams per tee time<input class="num" type="number" min="1" max="12" id="f-league-cap" data-path="league.slotCapacity" data-type="number" value="' + esc(d.league.slotCapacity) + '"></label>';
    h += '<label>Handicap rule (shown under standings)<textarea id="f-league-hcp" data-path="league.hcpRule">' + esc(d.league.hcpRule) + '</textarea></label>';
    h += '<label>Notes (shown under the schedule)<textarea id="f-league-notes" data-path="league.notes">' + esc(d.league.notes) + '</textarea></label>';
    h += '</div></div>';
    h += '<div><h2>Teams</h2><div class="tablebox"><table><thead><tr><th>Team name</th><th>Players</th><th class="num">Handicap</th><th>Active</th></tr></thead><tbody>';
    d.teams.forEach(function (t, i) { h += '<tr' + (isActive(t) ? '' : ' class="hiddenwk"') + '><td><input id="f-team-' + i + '" data-path="teams.' + i + '.name" value="' + esc(t.name) + '" placeholder="Team name"></td><td><input id="f-team-pl-' + i + '" data-path="teams.' + i + '.players" value="' + esc(t.players) + '" placeholder="Tim/Dakota"></td><td class="num"><input class="num" type="number" step="0.5" id="f-team-hcp-' + i + '" data-path="teams.' + i + '.hcp" data-type="number" value="' + esc(t.hcp) + '"></td><td><input type="checkbox" style="width:auto" id="f-team-active-' + i + '" data-path="teams.' + i + '.active" data-type="bool"' + (isActive(t) ? ' checked' : '') + '></td></tr>'; });
    h += '</tbody></table></div><p class="note">The team handicap is copied onto a score when you enter it, so changing it later only affects future rounds. The board shows teams as "Team name - Players"; either can be blank. Untick Active to keep a team off the board (standings and tee times) until it fills; its tee-time spots show as open.</p>';
    h += '<h2 style="margin-top:18px">Courses</h2><div class="form">';
    d.courses.forEach(function (c, i) { h += '<input id="f-course-' + i + '" data-path="courses.' + i + '.name" value="' + esc(c.name) + '">'; });
    h += '</div></div></section>';

    h += '<section><h2>Tee-time balance</h2><div id="balance">' + balanceHtml() + '</div><p class="note">How many Saturdays each team has at each tee time across the season. Updates as you change tee times below; a row is flagged when one tee time is two or more ahead of another.</p></section>';

    h += '<section><h2>Weeks</h2>';
    d.weeks.forEach(function (w, wi) {
      if (w.bye) {
        h += '<div class="editweek' + (w.hidden ? ' hiddenwk' : '') + '"><div class="head"><div><span class="eyebrow">Bye</span><h3>' + esc(fmtDate(w.date)) + '</h3></div>';
        h += '<label class="check"><input type="checkbox" id="f-w' + wi + '-hidden" data-path="weeks.' + wi + '.hidden" data-type="bool"' + (w.hidden ? ' checked' : '') + '>Hidden from the board</label>';
        h += '<label>Note<input id="f-w' + wi + '-note" data-path="weeks.' + wi + '.note" value="' + esc(w.note) + '"></label></div></div>';
        return;
      }
      h += '<div class="editweek' + (w.hidden ? ' hiddenwk' : '') + '"><div class="head"><div><span class="eyebrow">Week ' + w.n + '</span><h3>' + esc(fmtDate(w.date)) + '</h3></div>';
      h += '<label>Course<select id="f-w' + wi + '-course" data-path="weeks.' + wi + '.courseId">' + d.courses.map(function (c) { return '<option value="' + c.id + '"' + (c.id === w.courseId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>';
      h += '<label class="check"><input type="checkbox" id="f-w' + wi + '-hidden" data-path="weeks.' + wi + '.hidden" data-type="bool"' + (w.hidden ? ' checked' : '') + '>Hidden from the board</label>';
      h += '<label>Week note<input id="f-w' + wi + '-note" data-path="weeks.' + wi + '.note" value="' + esc(w.note) + '"></label></div>';
      h += '<div class="counts" id="counts-' + wi + '">' + countsHtml(w) + '</div>';
      h += '<div class="tablebox"><table><thead><tr><th>Team</th><th>Tee time</th><th>Note (makeup day, etc.)</th><th class="num">Gross</th><th class="num">Hcp</th><th class="num">Net</th></tr></thead><tbody>';
      d.teams.forEach(function (t) {
        var e = (w.entries && w.entries[t.id]) || {}, base = 'weeks.' + wi + '.entries.' + t.id + '.';
        h += '<tr><td>' + esc(label(t)) + '</td>';
        h += '<td><select id="f-w' + wi + '-' + t.id + '-slot" data-path="' + base + 'slot">' + SLOT_OPTIONS.map(function (s) { return '<option value="' + s + '"' + ((e.slot || 'out') === s ? ' selected' : '') + '>' + esc(SLOT_LABELS[s] || s) + '</option>'; }).join('') + '</select></td>';
        h += '<td><input id="f-w' + wi + '-' + t.id + '-note" data-path="' + base + 'note" value="' + esc(e.note) + '"></td>';
        h += '<td class="num"><input class="num" type="number" step="1" id="f-w' + wi + '-' + t.id + '-gross" data-path="' + base + 'gross" data-type="number" value="' + esc(e.gross) + '"></td>';
        h += '<td class="num"><input class="num" type="number" step="0.5" id="f-w' + wi + '-' + t.id + '-hcp" data-path="' + base + 'hcp" data-type="number" value="' + esc(e.hcp) + '"></td>';
        h += '<td class="num" id="net-w' + wi + '-' + t.id + '">' + (hasGross(e) ? fmtNum(netOf(e)) : '') + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
    });
    h += '</section>';
    app.innerHTML = h;
  }

  function msg(text, cls, html) { var m = document.getElementById('msg'); if (m) { if (html) m.innerHTML = html; else m.textContent = text; m.className = 'msg ' + (cls || ''); } }
  function setPath(obj, path, value) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = value;
  }
  function onInput(ev) {
    var el = ev.target, path = el.getAttribute('data-path'); if (!path || !draft) return;
    var v;
    if (el.getAttribute('data-type') === 'bool') v = el.checked;
    else if (el.getAttribute('data-type') === 'number') v = el.value === '' ? '' : Number(el.value);
    else v = el.value;
    setPath(draft, path, v);
    dirty = true; el.classList.add('dirty');
    var m = path.match(/^weeks\.(\d+)\.entries\.(t\d+)\.(slot|gross|hcp)$/);
    if (m) {
      var wi = Number(m[1]), tid = m[2], w = draft.weeks[wi], e = w.entries[tid];
      if (m[3] === 'gross' && hasGross(e) && (e.hcp === undefined || e.hcp === '' || e.hcp === null)) { var t = team(tid); e.hcp = t && t.hcp !== '' ? Number(t.hcp) : 0; var hcpEl = document.getElementById('f-w' + wi + '-' + tid + '-hcp'); if (hcpEl) hcpEl.value = e.hcp; }
      var netEl = document.getElementById('net-w' + wi + '-' + tid); if (netEl) netEl.textContent = hasGross(e) ? fmtNum(netOf(e)) : '';
      var c = document.getElementById('counts-' + wi); if (c) c.innerHTML = countsHtml(w);
      if (m[3] === 'slot') { var b = document.getElementById('balance'); if (b) b.innerHTML = balanceHtml(); }
    }
    if (/^teams\.\d+\.active$/.test(path)) render();
  }

  function contentsPath() { return '/repos/' + repo.owner + '/' + repo.repo + '/contents/' + FILE; }

  async function load() {
    app.innerHTML = '<p class="note">Loading league data...</p>';
    var r = await api('GET', contentsPath() + '?ref=' + BRANCH);
    if (!r.ok) {
      app.innerHTML = '<p class="note">Could not read ' + esc(FILE) + ' from ' + esc(repo.owner + '/' + repo.repo) + ' (HTTP ' + r.status + (r.json && r.json.message ? ': ' + esc(r.json.message) : '') + ').' + (r.status === 401 ? ' The saved token was rejected. <button data-act="forget">Forget token</button>' : '') + '</p>';
      return;
    }
    sha = r.json.sha;
    draft = JSON.parse(b64decode(r.json.content));
    dirty = false;
    render();
  }

  async function save() {
    if (!getToken()) { msg('Add a token first.', 'bad'); return; }
    var buttons = app.querySelectorAll('.editbar button'); buttons.forEach(function (b) { b.disabled = true; });
    msg('Saving...');
    draft.updatedAt = new Date().toISOString();
    try {
      var r = await api('PUT', contentsPath(), { message: 'Board update ' + draft.updatedAt, content: b64encode(JSON.stringify(draft, null, 1)), sha: sha, branch: BRANCH });
      if (r.ok) {
        sha = r.json.content.sha; dirty = false;
        render();
        msg('', 'ok', 'Saved. The public board updates in about a minute. <a href="https://github.com/' + esc(repo.owner + '/' + repo.repo) + '/actions" target="_blank" rel="noopener">Watch the build</a>');
      } else if (r.status === 409 || r.status === 422) {
        msg('Someone saved a newer version since this page loaded. Copy anything important, then press Discard changes to reload.', 'bad');
      } else if (r.status === 401 || r.status === 403) {
        msg('GitHub rejected the token (HTTP ' + r.status + '). Forget it and paste a fresh one with Contents read and write on this repo.', 'bad');
      } else {
        msg('Not saved (HTTP ' + r.status + (r.json && r.json.message ? ': ' + r.json.message : '') + ').', 'bad');
      }
    } catch (e) {
      msg('Save failed: ' + e.message, 'bad');
    } finally { app.querySelectorAll('.editbar button').forEach(function (b) { b.disabled = false; }); }
  }

  function hidePast() {
    var today = todayIso(), n = 0;
    draft.weeks.forEach(function (w) { if (w.date < today && !w.hidden) { w.hidden = true; n++; } });
    if (n) dirty = true;
    render();
    msg(n ? n + ' past week' + (n === 1 ? '' : 's') + ' hidden. Press Save and publish.' : 'No past weeks to hide yet.');
  }

  app.addEventListener('input', onInput);
  app.addEventListener('change', onInput);
  app.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'save') save();
    else if (act === 'hidepast') hidePast();
    else if (act === 'reload') load();
    else if (act === 'usetoken') { var t = (document.getElementById('token-in').value || '').trim(); if (t) { setToken(t); load(); } }
    else if (act === 'forget') { setToken(''); load(); }
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
