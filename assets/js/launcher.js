/* Metallic — launcher layer: installs, download queue, search, featured block.
   Runs after app.js has rendered the page, and adds only what a launcher needs
   on top of the platform chrome. */
(function () {
  'use strict';

  var UI = window.MetallicUI || {};
  var state = UI.state, save = UI.save, toast = UI.toast;
  var el = UI.el, $ = UI.$, $$ = UI.$$;
  var GAMES = UI.games || [], M = UI.data || {};
  var num = UI.num, ico = UI.ico, gameById = UI.gameById, poster = UI.poster;
  var LEFT = UI.left || [];
  if (!state || !save || !GAMES.length) return;

  if (!state.installed) state.installed = {};
  if (!state.downloads) state.downloads = [];

  var DISK_GB = 128;      // the library budget this demo pretends to have
  var TICK_MS = 900;

  /* Sizes and speeds are derived from the game id so a title always reports the
     same numbers; they are demo values, and the UI says so. */
  function sizeOf(g) { return Math.round((1.4 + (g.id % 7) * 0.7) * 10) / 10; }
  function speedOf(g) { return 30 + (g.id % 9) * 7; }

  function isInstalled(id) { return !!state.installed[id]; }
  function active() {
    return state.downloads.filter(function (d) { return d.status !== 'done'; });
  }
  function queued(id) {
    return state.downloads.filter(function (d) { return d.id === id && d.status !== 'done'; })[0];
  }

  function install(g) {
    if (isInstalled(g.id)) { toast(g.title + ' is already installed'); return; }
    var job = queued(g.id);
    if (job) {
      job.status = 'downloading';
      save();
      repaint();
      toast('Resuming ' + g.title);
      return;
    }
    state.downloads.unshift({
      id: g.id, size: sizeOf(g), speed: speedOf(g),
      progress: 0, status: 'downloading', added: Date.now()
    });
    save();
    repaint();
    toast('Downloading ' + g.title + ' · ' + sizeOf(g) + ' GB');
  }

  function toggle(id) {
    var job = queued(id);
    if (!job) return;
    job.status = job.status === 'paused' ? 'downloading' : 'paused';
    save();
    repaint();
  }

  function remove(id) {
    state.downloads = state.downloads.filter(function (d) { return d.id !== id; });
    save();
    repaint();
    toast('Removed from the queue');
  }

  function uninstall(id) {
    delete state.installed[id];
    save();
    repaint();
    toast(gameById(id).title + ' uninstalled');
  }

  function tick() {
    var finished = 0;
    state.downloads.forEach(function (d) {
      if (d.status !== 'downloading') return;
      var perTickMb = d.speed * (TICK_MS / 1000);
      d.progress = Math.min(100, d.progress + (perTickMb / (d.size * 1024)) * 100);
      if (d.progress >= 100) {
        d.status = 'done';
        state.installed[d.id] = { size: d.size, at: Date.now() };
        finished++;
      }
    });
    if (finished) {
      state.downloads = state.downloads.filter(function (d) { return d.status !== 'done'; });
      save();
      toast(finished === 1 ? 'Download finished' : finished + ' downloads finished');
    }
    paintDock();
    paintGameButtons();
    if (el('downloads-root')) renderDownloads();
  }

  function repaint() {
    paintDock();
    paintGameButtons();
    if (el('downloads-root')) renderDownloads();
  }

  /* ---------- persistent dock ---------- */
  function buildDock() {
    if (el('dl-dock')) return;
    var node = document.createElement('aside');
    node.id = 'dl-dock';
    node.className = 'dl-dock';
    node.hidden = true;
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-label', 'Downloads');
    document.body.appendChild(node);
  }

  function paintDock() {
    var host = el('dl-dock');
    if (!host) return;
    var jobs = active();
    if (!jobs.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = jobs.slice(0, 2).map(function (d) {
      var g = gameById(d.id);
      return '<div class="dl-item">' +
        '<span class="dl-thumb" aria-hidden="true">' + g.title.charAt(0) + '</span>' +
        '<span class="dl-body"><strong>' + g.title + '</strong>' +
          '<span class="dl-meta">' + (d.status === 'paused' ? 'Paused' : 'Downloading') + ' · ' +
            Math.round(d.progress) + '% · ' + d.speed + ' MB/s</span>' +
          '<span class="dl-bar"><span style="width:' + d.progress.toFixed(1) + '%"></span></span></span>' +
        '<button class="dl-toggle" type="button" data-dl-toggle="' + d.id + '" aria-label="' +
          (d.status === 'paused' ? 'Resume' : 'Pause') + ' ' + g.title + '">' +
          (d.status === 'paused' ? 'Resume' : 'Pause') + '</button>' +
      '</div>';
    }).join('') +
    '<a class="dl-all" href="downloads.html">' +
      (jobs.length > 2 ? '+' + (jobs.length - 2) + ' more · ' : '') + 'All downloads</a>';
  }

  /* ---------- downloads page ---------- */
  function renderDownloads() {
    var root = el('downloads-root');
    if (!root) return;
    var jobs = active();
    var installed = Object.keys(state.installed).map(function (id) { return gameById(id); });
    var used = installed.reduce(function (a, g) {
      return a + ((state.installed[g.id] && state.installed[g.id].size) || 0);
    }, 0);
    var free = Math.max(0, DISK_GB - used);

    var queue = jobs.length ? jobs.map(function (d) {
      var g = gameById(d.id);
      return '<div class="dl-row">' +
        '<span class="dl-thumb" aria-hidden="true">' + g.title.charAt(0) + '</span>' +
        '<span class="dl-info"><strong>' + g.title + '</strong>' +
          '<span class="dl-meta">' + d.size + ' GB · ' + d.speed + ' MB/s · ' +
            (d.status === 'paused' ? 'Paused' : 'Downloading') + '</span>' +
          '<span class="dl-bar"><span style="width:' + d.progress.toFixed(1) + '%"></span></span></span>' +
        '<span class="dl-pct">' + Math.round(d.progress) + '%</span>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-dl-toggle="' + d.id + '">' +
          (d.status === 'paused' ? 'Resume' : 'Pause') + '</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-dl-remove="' + d.id + '">Cancel</button>' +
      '</div>';
    }).join('') : '<div class="empty">Nothing queued. Open an experience and install it.</div>';

    var library = installed.length ? '<div class="grid-cards">' + installed.map(function (g) {
      var meta = state.installed[g.id] || {};
      return '<div class="thumb-card">' +
        '<a class="thumb" href="game.html?id=' + g.id + '">' + poster(g) +
          '<span class="players">' + meta.size + ' GB</span></a>' +
        '<h3>' + g.title + '</h3>' +
        '<div class="meta"><span class="rating">' + ico('thumb') + g.rating + '% Rating</span>' +
          '<span class="playing">Installed</span></div>' +
        '<div class="row" style="gap:6px;margin-top:2px">' +
          '<button class="btn btn-play btn-sm" type="button" data-play="' + g.title + '">Play</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-uninstall="' + g.id + '">Uninstall</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>' : '<div class="empty">Your library is empty. Install something to see it here.</div>';

    root.innerHTML =
      '<section class="stats">' + [
        { k: 'Queue', v: jobs.length ? jobs.length : 'Empty', d: 'one download at a time per device' },
        { k: 'Installed', v: installed.length, d: 'titles ready to launch' },
        { k: 'Disk used', v: used.toFixed(1) + ' GB', d: 'of ' + DISK_GB + ' GB budget' },
        { k: 'Free space', v: free.toFixed(1) + ' GB', d: 'before installs are blocked' }
      ].map(function (s) {
        return '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + s.v + '</div><div class="d">' + s.d + '</div></div>';
      }).join('') + '</section>' +

      '<div class="panel"><div class="panel-head"><h3>Download queue</h3>' +
        '<div class="row"><span class="pill">' + jobs.length + ' active</span>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-dl-all="pause">Pause all</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-dl-all="resume">Resume all</button></div></div>' +
        queue +
      '</div>' +

      '<div class="panel"><div class="panel-head"><h3>Installed</h3>' +
        '<span class="pill">' + installed.length + ' titles · ' + used.toFixed(1) + ' GB</span></div>' +
        library +
      '</div>' +

      '<section class="two-col">' +
        '<div class="panel"><div class="panel-head"><h3>How the queue behaves</h3><span class="badge green">Published</span></div>' +
          '<ul class="list">' +
            '<li><span class="tick">1</span><span>A new install joins the queue instead of interrupting the active one.</span></li>' +
            '<li><span class="tick">2</span><span>Pause keeps partial data, so resuming does not start over.</span></li>' +
            '<li><span class="tick">3</span><span>Installs are refused, not half-written, when the disk budget is full.</span></li>' +
            '<li><span class="tick">4</span><span>Progress here is simulated for the demo; no bytes leave your browser.</span></li>' +
          '</ul>' +
        '</div>' +
        '<div class="panel"><div class="panel-head"><h3>Disk budget</h3><span class="pill">' + DISK_GB + ' GB</span></div>' +
          '<div class="dl-bar tall"><span style="width:' + Math.min(100, (used / DISK_GB) * 100) + '%"></span></div>' +
          '<div class="kv" style="margin-top:10px"><span>Used by installs</span><b>' + used.toFixed(1) + ' GB</b></div>' +
          '<div class="kv"><span>Still free</span><b>' + free.toFixed(1) + ' GB</b></div>' +
          '<div class="note" style="margin-top:10px">Sizes are derived from each title for the demo, not measured downloads.</div>' +
        '</div>' +
      '</section>';
  }

  /* ---------- game page install control ---------- */
  function paintGameButtons() {
    $$('[data-install]').forEach(function (btn) {
      var id = Number(btn.getAttribute('data-install'));
      var g = gameById(id);
      var job = queued(id);
      if (isInstalled(id)) {
        btn.textContent = 'Installed · ' + sizeOf(g) + ' GB';
        btn.disabled = true;
        btn.className = 'btn btn-ghost btn-wide btn-sm';
      } else if (job) {
        btn.textContent = (job.status === 'paused' ? 'Paused' : 'Downloading') + ' · ' + Math.round(job.progress) + '%';
        btn.disabled = false;
        btn.className = 'btn btn-ghost btn-wide btn-sm';
      } else {
        btn.textContent = 'Install · ' + sizeOf(g) + ' GB';
        btn.disabled = false;
        btn.className = 'btn btn-ghost btn-wide btn-sm';
      }
    });
  }

  function decorateGame() {
    var side = document.querySelector('#game-detail .side-card');
    if (!side || side.querySelector('[data-install]')) return;
    var id = new URLSearchParams(location.search).get('id');
    var g = gameById(id);
    var first = side.querySelector('.panel');
    if (!first) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-wide btn-sm';
    btn.setAttribute('data-install', String(g.id));
    first.insertBefore(btn, first.firstChild);

    var info = document.createElement('div');
    info.className = 'panel';
    info.innerHTML = '<div class="panel-head"><h3>Install</h3><span class="badge green">Sandboxed</span></div>' +
      '<div class="kv"><span>Download size</span><b>' + sizeOf(g) + ' GB</b></div>' +
      '<div class="kv"><span>Speed cap</span><b>' + speedOf(g) + ' MB/s</b></div>' +
      '<div class="kv"><span>Patch</span><b>1.' + (g.id % 4) + '.' + (g.id % 7) + '</b></div>' +
      '<div class="kv"><span>Cloud saves</span><b>included</b></div>' +
      '<div class="note" style="margin-top:10px">Demo values derived from the title, not a measurement.</div>';
    side.appendChild(info);

    var notes = document.createElement('div');
    notes.className = 'panel';
    notes.innerHTML = '<div class="panel-head"><h3>Patch notes</h3><span class="pill">latest</span></div>' +
      '<ul class="list">' +
        '<li><span class="tick">·</span><span>Server browser now shows seats used before you join.</span></li>' +
        '<li><span class="tick">·</span><span>Reconnect keeps your session when a replica is replaced.</span></li>' +
        '<li><span class="tick">·</span><span>Load times on the first launch of a new sandbox are shorter.</span></li>' +
      '</ul>';
    side.appendChild(notes);

    paintGameButtons();
  }

  /* ---------- featured block on the home page ---------- */
  function decorateHome() {
    var wrap = document.querySelector('.wrap.page');
    if (!wrap || wrap.querySelector('.feature')) return;
    var anchor = wrap.querySelector('.page-head');
    if (!anchor) return;

    var g = GAMES.slice().sort(function (a, b) {
      return (b.rating + (b.firstParty ? 2 : 0)) - (a.rating + (a.firstParty ? 2 : 0));
    })[0];

    var node = document.createElement('section');
    node.className = 'feature';
    node.innerHTML =
      '<div class="feature-art" aria-hidden="true">' + poster(g) + '</div>' +
      '<div class="feature-body">' +
        '<span class="feature-eyebrow">' + (g.firstParty ? 'Metallic Studio' : g.creator) + ' · ' + g.genre + '</span>' +
        '<h2>' + g.title + '</h2>' +
        '<p>' + g.desc + '</p>' +
        '<div class="row" style="gap:10px">' +
          '<button class="btn btn-play" type="button" data-play="' + g.title + '">' + ico('play') + 'Play now</button>' +
          '<a class="btn btn-ghost" href="game.html?id=' + g.id + '">Experience page</a>' +
        '</div>' +
        '<div class="feature-meta">' + ico('thumb') + g.rating + '% rating · ' +
          num(g.players) + ' playing · ' + sizeOf(g) + ' GB to install</div>' +
      '</div>';

    anchor.insertAdjacentElement('afterend', node);
  }

  /* ---------- search ---------- */
  var searchResults = [];
  var searchIndex = 0;

  function buildSearch() {
    if (el('search-overlay')) return;
    var node = document.createElement('div');
    node.id = 'search-overlay';
    node.className = 'search-overlay';
    node.hidden = true;
    node.innerHTML =
      '<div class="search-panel" role="dialog" aria-modal="true" aria-label="Search Metallic">' +
        '<div class="search-head">' + ico('search') +
          '<input id="search-input" type="search" placeholder="Search experiences, people, sections" aria-label="Search" autocomplete="off"/>' +
          '<kbd>Esc</kbd>' +
        '</div>' +
        '<div class="search-results" id="search-results"></div>' +
        '<div class="search-foot">Arrow keys to move · Enter to open</div>' +
      '</div>';
    document.body.appendChild(node);

    node.addEventListener('click', function (e) {
      if (e.target === node) closeSearch();
      var hit = e.target.closest('[data-hit]');
      if (hit) { e.preventDefault(); go(searchResults[Number(hit.getAttribute('data-hit'))]); }
    });
    el('search-input').addEventListener('input', function () { renderSearch(this.value); });
  }

  function openSearch() {
    var overlay = el('search-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add('search-open');
    var input = el('search-input');
    input.value = '';
    input.focus();
    renderSearch('');
  }

  function closeSearch() {
    var overlay = el('search-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('search-open');
  }

  function renderSearch(q) {
    var term = q.trim().toLowerCase();
    var hits = [];
    var sections = LEFT.filter(function (s) { return s.href; });
    var friends = ((M.profile || {}).friends || []);

    GAMES.forEach(function (g) {
      var text = (g.title + ' ' + g.creator + ' ' + g.genre + ' ' + g.tags.join(' ')).toLowerCase();
      if (!term || text.indexOf(term) > -1) {
        hits.push({ label: g.title, sub: g.genre + ' · ' + g.rating + '% · ' + UI.short(g.players) + ' playing', href: 'game.html?id=' + g.id, kind: 'Experience' });
      }
    });
    sections.forEach(function (s) {
      if (!term || s.label.toLowerCase().indexOf(term) > -1) {
        hits.push({ label: s.label, sub: 'Section', href: s.href, kind: 'Section' });
      }
    });
    friends.forEach(function (f) {
      if (term && f.name.toLowerCase().indexOf(term) > -1) {
        hits.push({ label: f.name, sub: f.status, href: 'profile.html#friends', kind: 'Friend' });
      }
    });

    searchResults = hits.slice(0, 12);
    searchIndex = 0;
    var host = el('search-results');
    host.innerHTML = searchResults.length ? searchResults.map(function (h, i) {
      return '<a class="search-hit' + (i === 0 ? ' on' : '') + '" href="' + h.href + '" data-hit="' + i + '">' +
        '<span class="hit-kind">' + h.kind + '</span>' +
        '<span class="hit-label">' + h.label + '</span>' +
        '<span class="hit-sub">' + h.sub + '</span></a>';
    }).join('') : '<div class="empty" style="border:0">No matches for “' + q + '”.</div>';
  }

  function moveSearch(step) {
    if (!searchResults.length) return;
    searchIndex = (searchIndex + step + searchResults.length) % searchResults.length;
    $$('.search-hit').forEach(function (n, i) { n.classList.toggle('on', i === searchIndex); });
    var active = $('.search-hit.on');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function go(hit) {
    if (!hit) return;
    closeSearch();
    location.href = hit.href;
  }

  /* The header search belongs to app.js; intercept it before focus takes hold
     so the overlay opens without rewriting that markup. */
  document.addEventListener('mousedown', function (e) {
    if (e.target.closest('.search')) { e.preventDefault(); openSearch(); }
  }, true);
  document.addEventListener('focusin', function (e) {
    if (e.target.closest('.search input')) { e.target.blur(); openSearch(); }
  });

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-search-open]')) { e.preventDefault(); openSearch(); return; }
    var ins = e.target.closest('[data-install]');
    if (ins) { install(gameById(ins.getAttribute('data-install'))); return; }
    var toggleBtn = e.target.closest('[data-dl-toggle]');
    if (toggleBtn) { e.preventDefault(); toggle(Number(toggleBtn.getAttribute('data-dl-toggle'))); return; }
    var rm = e.target.closest('[data-dl-remove]');
    if (rm) { remove(Number(rm.getAttribute('data-dl-remove'))); return; }
    var un = e.target.closest('[data-uninstall]');
    if (un) { uninstall(Number(un.getAttribute('data-uninstall'))); return; }
    var all = e.target.closest('[data-dl-all]');
    if (all) {
      var mode = all.getAttribute('data-dl-all');
      state.downloads.forEach(function (d) { if (d.status !== 'done') d.status = mode === 'pause' ? 'paused' : 'downloading'; });
      save();
      repaint();
      toast(mode === 'pause' ? 'All downloads paused' : 'All downloads resumed');
    }
  });

  document.addEventListener('keydown', function (e) {
    var overlay = el('search-overlay');
    var open = overlay && !overlay.hidden;
    if (open) {
      if (e.key === 'Escape') { closeSearch(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSearch(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSearch(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); go(searchResults[searchIndex]); return; }
    }
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); openSearch(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  });

  /* ---------- boot ---------- */
  function boot() {
    buildDock();
    buildSearch();
    decorateGame();
    decorateHome();
    paintDock();
    paintGameButtons();
    if (el('downloads-root')) renderDownloads();
    setInterval(tick, TICK_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
