/* Metallic — shared shell and page behaviour (no dependencies) */
(function () {
  'use strict';

  var M = window.METALLIC || {};
  var GAMES = M.games || [];
  var state = { balance: 1450, equipped: {}, owned: {}, fav: {} };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(id) { return document.getElementById(id); }
  function num(n) { return n.toLocaleString('en-US'); }
  function short(n) {
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  }
  function initials(title) {
    return title.split(/[\s:]+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  }
  function gameById(id) {
    var hit = GAMES.filter(function (g) { return g.id === Number(id); })[0];
    return hit || GAMES[0];
  }
  function pct(a, b) { return Math.min(100, Math.round((a / b) * 100)); }
  function visits(g) { return g.players * 37 + g.rating * 1200; }

  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    bag: '<path d="M6 8h12l1.5 12H4.5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
    bell: '<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z"/><path d="M10 21h4"/>'
  };

  function ico(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }

  var NAV = [
    { href: 'charts.html', label: 'Charts', page: 'charts' },
    { href: 'marketplace.html', label: 'Marketplace', page: 'market' },
    { href: 'create.html', label: 'Create', page: 'create' },
    { href: 'marketplace.html', label: 'Alloy', page: 'alloy' }
  ];

  var LEFT = [
    { href: 'index.html', label: 'Home', page: 'home', icon: 'home' },
    { href: 'charts.html', label: 'Charts', page: 'charts', icon: 'compass' },
    { href: 'marketplace.html', label: 'Marketplace', page: 'market', icon: 'bag' },
    { label: 'Messages', icon: 'bell', action: 'notify', count: 6 },
    { href: 'servers.html', label: 'Servers', page: 'servers', icon: 'server' },
    { href: 'avatar.html', label: 'Avatar', page: 'avatar', icon: 'user' },
    { href: 'create.html', label: 'Creator hub', page: 'create', icon: 'plus' },
    { href: 'safety.html', label: 'Safety', page: 'safety', icon: 'shield' },
    { href: 'features.html', label: 'Feature scope', page: 'features', icon: 'list' },
    { href: 'docs.html', label: 'API docs', page: 'docs', icon: 'code' }
  ];

  /* ---------- shell ---------- */
  function shell() {
    var page = document.body.getAttribute('data-page');
    var nav = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.page === page ? ' class="active" aria-current="page"' : '') + '>' + n.label + '</a>';
    }).join('');

    var leftNav = '<a class="leftnav-user" href="avatar.html">' +
        '<span class="avatar-chip">RD</span><span>RavenDev</span></a>' +
      LEFT.map(function (item) {
        var inner = ico(item.icon) + '<span>' + item.label + '</span>' +
          (item.count ? '<span class="count">' + item.count + '</span>' : '');
        if (item.action) {
          return '<button type="button" class="nav-row" data-' + item.action + '>' + inner + '</button>';
        }
        return '<a class="nav-row' + (item.page === page ? ' on' : '') + '" href="' + item.href + '"' +
          (item.page === page ? ' aria-current="page"' : '') + '>' + inner + '</a>';
      }).join('');

    document.body.insertAdjacentHTML('afterbegin',
      '<header class="topbar"><div class="topbar-inner">' +
        '<a class="brand" href="index.html"><span class="brand-mark">M</span><span>Metallic</span></a>' +
        '<nav class="topnav" aria-label="Primary">' + nav + '</nav>' +
        '<form class="search" role="search" onsubmit="return false">' + ico('search') +
          '<input id="q" type="search" placeholder="Search" aria-label="Search" autocomplete="off"/>' +
        '</form>' +
        '<div class="top-actions">' +
          '<button class="icon-btn" type="button" data-notify title="Notifications" aria-label="Notifications">' + ico('bell') + '</button>' +
          '<span class="balance" title="Alloy balance"><span class="coin"></span><span id="balance-v">' + num(state.balance) + '</span></span>' +
          '<a class="avatar-chip" href="avatar.html" title="Your avatar">RD</a>' +
        '</div>' +        '</div></header>' +
      '<nav class="leftnav" aria-label="Sections">' + leftNav + '</nav>' +
      '<div id="toast" aria-live="polite"></div>' +
      '<div class="modal" id="play-modal" role="dialog" aria-modal="true" aria-labelledby="pm-title">' +
        '<div class="modal-card">' +
          '<span class="badge green">Server reserved</span>' +
          '<h3 id="pm-title">Joining…</h3>' +
          '<p id="pm-sub" style="color:var(--text-2);font-size:13px">Requesting a sandboxed server…</p>' +
          '<div class="progress"><span id="pm-bar"></span></div>' +
          '<button class="btn btn-ghost btn-sm" data-close-modal>Cancel</button>' +
        '</div>' +
      '</div>' +
      '<aside class="notify-panel" id="notify-panel" aria-label="Messages">' +
        '<div class="panel-head" style="margin-bottom:8px;padding-bottom:8px">' +
          '<h3>Messages</h3><span class="badge blue">6 new</span></div>' +
        [['Cyber Raven crew', 'Your server is ready — join US-East #01.', '2m'],
         ['NovaFox', 'Sent you Obsidian Wings as a gift.', '18m'],
         ['Metallic Studio', 'Rift Hunters patch 1.4 is live.', '1h']].map(function (m) {
          return '<div class="notify-item"><span class="dot-badge"></span><div class="body"><b>' + m[0] +
            '</b><br>' + m[1] + '<div class="time">' + m[2] + '</div></div></div>';
        }).join('') +
      '</aside>');

    document.body.insertAdjacentHTML('beforeend',
      '<footer class="footer"><div class="footer-inner">' +
        '<div class="footer-top">' +
          '<a class="brand" href="index.html"><span class="brand-mark">M</span><span>Metallic</span></a>' +
          '<div class="footer-cols">' +
            '<div><h4>Play</h4><ul>' +
              '<li><a href="index.html">Home</a></li>' +
              '<li><a href="charts.html">Charts</a></li>' +
              '<li><a href="servers.html">Servers</a></li>' +
              '<li><a href="avatar.html">Avatar</a></li></ul></div>' +
            '<div><h4>Create</h4><ul>' +
              '<li><a href="create.html">Creator hub</a></li>' +
              '<li><a href="docs.html">API docs</a></li>' +
              '<li><a href="features.html">Feature scope</a></li></ul></div>' +
            '<div><h4>Trust</h4><ul>' +
              '<li><a href="safety.html">Safety</a></li>' +
              '<li><a href="safety.html">Moderation</a></li>' +
              '<li><a href="marketplace.html">Marketplace</a></li></ul></div>' +
            '<div><h4>Support</h4><ul>' +
              '<li><a href="docs.html">API docs</a></li>' +
              '<li><a href="features.html">Feature scope</a></li>' +
              '<li><a href="servers.html">Server status</a></li></ul></div>' +
          '</div>' +
        '</div>' +
        '<div class="footer-legal">© 2026 Metallic · concept with mock data. No accounts, payments or live servers.</div>' +
      '</div></footer>');

    var q = el('q');
    if (q) {
      var incoming = new URLSearchParams(location.search).get('q');
      if (incoming) q.value = incoming;
      q.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          location.href = 'charts.html?q=' + encodeURIComponent(q.value.trim());
        }
      });
    }
  }

  function toast(msg) {
    var host = el('toast');
    if (!host) return;
    var node = document.createElement('div');
    node.className = 'toast';
    node.textContent = msg;
    host.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transition = 'opacity .3s';
      setTimeout(function () { node.remove(); }, 320);
    }, 2400);
  }

  var playTimer = null;
  function play(title, meta) {
    var modal = el('play-modal');
    if (!modal) return;
    var bar = el('pm-bar');
    el('pm-title').textContent = 'Joining ' + title;
    el('pm-sub').textContent = 'Requesting a sandboxed server…';
    bar.style.width = '0%';
    modal.classList.add('on');
    clearInterval(playTimer);
    var v = 0;
    playTimer = setInterval(function () {
      v += 14;
      bar.style.width = Math.min(v, 100) + '%';
      if (v >= 100) {
        clearInterval(playTimer);
        el('pm-title').textContent = title;
        el('pm-sub').textContent = meta || 'Sandbox isolated · 64 player hard limit · region US-East';
      }
    }, 110);
  }

  /* ---------- shared markup ---------- */
  function card(g) {
    return '<a class="thumb-card" href="game.html?id=' + g.id + '">' +
      '<div class="thumb art" style="--g:' + g.art + '">' +
        (g.firstParty ? '<span class="badge blue flag">Metallic</span>' : '') +
        '<span class="players"><span class="dot"></span>' + short(g.players) + '</span>' +
        '<span class="glyph">' + initials(g.title) + '</span>' +
        '<span class="veil">' + ico('play') + '</span>' +
      '</div>' +
      '<h3>' + g.title + '</h3>' +
      '<div class="meta"><span class="creator">' + g.creator + '</span><span class="sep">·</span><span>' + g.rating + '%</span></div>' +
    '</a>';
  }

  function capacity(players, limit) {
    var p = pct(players, limit);
    return '<div class="row" style="gap:8px;flex-wrap:nowrap">' +
      '<div class="cap' + (p > 85 ? ' hot' : '') + '" style="flex:1"><span style="width:' + p + '%"></span></div>' +
      '<span style="font-size:12px;font-weight:700;color:var(--text)">' + players + '/' + limit + '</span>' +
    '</div>';
  }

  function serverRow(s) {
    var g = gameById(s.gameId);
    return '<tr>' +
      '<td><strong>' + s.name + '</strong></td>' +
      '<td><a href="game.html?id=' + g.id + '" style="color:var(--blue)">' + g.title + '</a></td>' +
      '<td>' + s.region + '</td>' +
      '<td>' + s.ping + 'ms</td>' +
      '<td style="min-width:160px">' + capacity(s.players, s.limit) + '</td>' +
      '<td style="text-align:right"><button class="btn btn-play btn-sm" data-play="' + g.title + '">Join</button></td>' +
    '</tr>';
  }

  /* ---------- home ---------- */
  function renderHome() {
    var g = GAMES[0];
    el('hero').innerHTML =
      '<div class="hero-art"><div class="art" style="--g:' + g.art + '"><span class="glyph">' + initials(g.title) + '</span></div></div>' +
      '<div class="hero-body">' +
        '<span class="hero-eyebrow">Featured experience</span>' +
        '<h1>' + g.title + '</h1>' +
        '<p>' + g.desc + '</p>' +
        '<div class="meta-row">' +
          '<span><b>' + g.rating + '%</b> rating</span>' +
          '<span><b>' + num(g.players) + '</b> playing</span>' +
          '<span><b>' + g.servers + '</b> live servers</span>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-play" data-play="' + g.title + '">' + ico('play') + 'Play</button>' +
          '<a class="btn btn-ghost" href="game.html?id=' + g.id + '" style="background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3);color:#fff">View details</a>' +
        '</div>' +
      '</div>';

    el('shelf-continue').innerHTML = GAMES.slice(0, 6).map(card).join('');
    el('shelf-popular').innerHTML = GAMES.slice().sort(function (a, b) { return b.players - a.players; }).slice(0, 8).map(card).join('');
    el('shelf-toprated').innerHTML = GAMES.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, 8).map(card).join('');

    var grid = el('grid-recommended');
    var chips = el('home-genres');
    var genre = 'All';

    function draw() {
      var list = genre === 'All' ? GAMES.slice() : GAMES.filter(function (x) { return x.genre === genre; });
      list.sort(function (a, b) { return b.rating - a.rating; });
      grid.innerHTML = list.length
        ? list.map(card).join('')
        : '<div class="empty" style="grid-column:1/-1">Nothing in this category yet.</div>';
    }

    chips.innerHTML = M.genres.map(function (name) {
      return '<button class="chip' + (name === genre ? ' on' : '') + '" data-genre="' + name + '">' + name + '</button>';
    }).join('');

    chips.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-genre]');
      if (!btn) return;
      genre = btn.getAttribute('data-genre');
      $$('.chip', chips).forEach(function (b) { b.classList.toggle('on', b === btn); });
      draw();
    });

    draw();

    el('home-stats').innerHTML = [
      { k: 'Experiences', v: '14', d: 'first-party and community, hand-picked' },
      { k: 'Live servers', v: '2,318', d: 'provisioned on request, not pre-bought' },
      { k: 'Marketplace fee', v: '5%', d: 'flat, no listing fee' },
      { k: 'Ads on this site', v: '0', d: 'no trackers, no sponsored ranking' }
    ].map(function (s) {
      return '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + s.v + '</div><div class="d">' + s.d + '</div></div>';
    }).join('');

    el('home-firstparty').innerHTML =
      '<div class="section-head"><h2>Made by Metallic Studio</h2><a class="link" href="charts.html">See all charts</a></div>' +
      '<div class="grid-cards">' + GAMES.filter(function (x) { return x.firstParty; }).map(card).join('') + '</div>';
  }

  /* ---------- charts ---------- */
  function renderCharts() {
    var params = new URLSearchParams(location.search);
    var q = (params.get('q') || '').toLowerCase();
    var genre = params.get('genre') || 'All';
    var tab = 'popular';
    var tabs = el('chart-tabs');
    var list = el('chart-list');
    var meta = el('chart-meta');
    var chips = el('chart-genres');

    var TABS = [
      { id: 'popular', label: 'Popular' },
      { id: 'toprated', label: 'Top rated' },
      { id: 'earning', label: 'Top earning' },
      { id: 'upcoming', label: 'Up and coming' }
    ];

    function ranking() {
      var rows = GAMES.filter(function (g) {
        var text = (g.title + ' ' + g.creator + ' ' + g.genre + ' ' + g.tags.join(' ')).toLowerCase();
        return (genre === 'All' || g.genre === genre) && (!q || text.indexOf(q) > -1);
      });
      if (tab === 'popular') rows.sort(function (a, b) { return b.players - a.players; });
      if (tab === 'toprated') rows.sort(function (a, b) { return b.rating - a.rating; });
      if (tab === 'earning') rows.sort(function (a, b) { return visits(b) * b.rating - visits(a) * a.rating; });
      if (tab === 'upcoming') rows.sort(function (a, b) { return b.id - a.id; });
      return rows.slice(0, 10);
    }

    function draw() {
      var rows = ranking();
      if (meta) meta.textContent = rows.length + (rows.length === 1 ? ' experience' : ' experiences');
      list.innerHTML = rows.length ? rows.map(function (g, i) {
        return '<a class="rank-row" href="game.html?id=' + g.id + '">' +
          '<div class="rank-num">' + (i + 1) + '</div>' +
          '<div class="rank-thumb art" style="--g:' + g.art + '"><span class="glyph" style="font-size:20px">' + initials(g.title) + '</span></div>' +
          '<div class="rank-body"><h3>' + g.title + '</h3><div class="by">by ' + g.creator + ' · ' + g.genre + '</div></div>' +
          '<div class="rank-side">' +
            '<span><b>' + short(g.players) + '</b> playing</span>' +
            '<span><b>' + g.rating + '%</b> rating</span>' +
            '<span class="badge' + (g.firstParty ? ' blue' : ' gray') + '">' + (g.firstParty ? 'Metallic' : 'Community') + '</span>' +
          '</div>' +
        '</a>';
      }).join('') : '<div class="empty">No experiences match that filter.</div>';
    }

    tabs.innerHTML = TABS.map(function (t) {
      return '<button class="tab' + (t.id === tab ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');

    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tab]');
      if (!btn) return;
      tab = btn.getAttribute('data-tab');
      $$('.tab', tabs).forEach(function (b) { b.classList.toggle('active', b === btn); });
      draw();
    });

    chips.innerHTML = M.genres.map(function (name) {
      return '<button class="chip' + (name === genre ? ' on' : '') + '" data-genre="' + name + '">' + name + '</button>';
    }).join('');

    chips.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-genre]');
      if (!btn) return;
      genre = btn.getAttribute('data-genre');
      $$('.chip', chips).forEach(function (b) { b.classList.toggle('on', b === btn); });
      draw();
    });

    draw();
  }

  /* ---------- experience detail ---------- */
  function renderGame() {
    var host = el('game-detail');
    if (!host || !GAMES.length) return;
    var g = gameById(new URLSearchParams(location.search).get('id'));
    document.title = g.title + ' — Metallic';

    var servers = M.servers.filter(function (s) { return s.gameId === g.id; });
    var similar = GAMES.filter(function (x) { return x.id !== g.id && x.genre === g.genre; })
      .concat(GAMES.filter(function (x) { return x.id !== g.id && x.genre !== g.genre; }))
      .slice(0, 6);
    var likes = Math.round(g.rating * 128);
    var dislikes = Math.round(12800 - likes);

    host.innerHTML =
      '<div class="detail">' +
        '<div>' +
          '<div class="detail-hero art" style="--g:' + g.art + '"><span class="glyph" style="font-size:60px">' + initials(g.title) + '</span></div>' +
          '<div class="detail-head">' +
            '<h1>' + g.title + '</h1>' +
            '<div class="row" style="font-size:13.5px;color:var(--text-2)">by <a href="#" style="color:var(--blue);font-weight:600">' + g.creator + '</a>' +
              '<span class="badge' + (g.firstParty ? ' blue' : ' gray') + '">' + (g.firstParty ? 'Metallic' : 'Community') + '</span></div>' +
            '<div class="vote"><span class="vote-up">' + ico('up') + ' ' + num(likes) + '</span>' +
              '<span class="vote-down">' + num(dislikes) + ' ' + ico('down') + '</span></div>' +
          '</div>' +
          '<div class="tabs" data-dtabs>' +
            '<button class="tab active" data-dtab="about">About</button>' +
            '<button class="tab" data-dtab="servers">Servers</button>' +
            '<button class="tab" data-dtab="recommended">Recommended</button>' +
            '<button class="tab" data-dtab="reviews">Reviews</button>' +
          '</div>' +
          '<div class="tab-panel on" data-dpanel="about">' +
            '<p style="color:var(--text-2);font-size:14px;line-height:1.65">' + g.desc + '</p>' +
            '<div class="chips" style="margin-top:10px">' + g.tags.map(function (t) { return '<span class="pill">' + t + '</span>'; }).join('') + '</div>' +
            '<div class="divider" style="margin:14px 0"></div>' +
            '<div class="two-col">' +
              '<div>' +
                '<div class="kv"><span>Active</span><b>' + num(g.players) + '</b></div>' +
                '<div class="kv"><span>Visits</span><b>' + num(visits(g)) + '</b></div>' +
                '<div class="kv"><span>Favourites</span><b>' + num(Math.round(g.rating * 214)) + '</b></div>' +
              '</div>' +
              '<div>' +
                '<div class="kv"><span>Max players</span><b>' + g.maxPlayers + '</b></div>' +
                '<div class="kv"><span>Genre</span><b>' + g.genre + '</b></div>' +
                '<div class="kv"><span>Created</span><b>2026</b></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="tab-panel" data-dpanel="servers">' +
            (servers.length
              ? '<div class="table-wrap"><table class="servers-table"><thead><tr><th>Server</th><th>Experience</th><th>Region</th><th>Ping</th><th>Capacity</th><th></th></tr></thead>' +
                '<tbody>' + servers.map(serverRow).join('') + '</tbody></table></div>'
              : '<div class="empty">No public servers right now. Join to spin one up.</div>') +
          '</div>' +
          '<div class="tab-panel" data-dpanel="recommended"><div class="shelf">' + similar.map(card).join('') + '</div></div>' +
          '<div class="tab-panel" data-dpanel="reviews">' +
            [['NovaFox', 5, 'Movement feels sharp and the server never dropped under load.'],
             ['PixelHarbor', 4, 'Ranked ladder is honest about its numbers, which is rare.'],
             ['HexWave', 5, 'Capacity was exactly what the page said. Joined in seconds.']].map(function (r) {
              return '<div class="panel" style="margin-bottom:10px">' +
                '<div class="row" style="justify-content:space-between"><strong style="font-size:13.5px">' + r[0] + '</strong>' +
                '<span class="badge green">' + r[1] + '/5</span></div>' +
                '<p style="color:var(--text-2);font-size:13.5px;margin-top:6px">' + r[2] + '</p></div>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<aside class="side-card">' +
          '<div class="panel stack">' +
            '<button class="btn btn-play btn-wide" data-play="' + g.title + '">' + ico('play') + 'Play</button>' +
            '<button class="btn btn-ghost btn-wide btn-sm" data-fav="' + g.id + '">' + (state.fav[g.id] ? 'In favourites' : 'Add to favourites') + '</button>' +
            '<div class="kv"><span>Active</span><b>' + num(g.players) + '</b></div>' +
            '<div class="kv"><span>Visits</span><b>' + num(visits(g)) + '</b></div>' +
            '<div class="kv"><span>Rating</span><b>' + g.rating + '%</b></div>' +
            '<div class="kv"><span>Servers</span><b>' + g.servers + '</b></div>' +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel-head"><h3>Server model</h3><span class="badge green">Sandboxed</span></div>' +
            '<div class="kv"><span>Per server</span><b>' + g.maxPlayers + ' players</b></div>' +
            '<div class="kv"><span>Provisioning</span><b>on request</b></div>' +
            '<div class="kv"><span>Scaling</span><b>to players, capped</b></div>' +
            '<div class="note" style="margin-top:10px">Capacity and resource ceilings are published before you join.</div>' +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel-head"><h3>Safety</h3></div>' +
            '<ul class="list">' +
              '<li><span class="tick">✓</span><span>Cosmetics only — no stat advantages.</span></li>' +
              '<li><span class="tick">✓</span><span>Human review on reports, with an appeal.</span></li>' +
              '<li><span class="tick">✓</span><span>Bans apply to every linked alt.</span></li>' +
            '</ul>' +
          '</div>' +
        '</aside>' +
      '</div>';

    var tabsHost = host.querySelector('[data-dtabs]');
    if (tabsHost) {
      tabsHost.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dtab]');
        if (!btn) return;
        var name = btn.getAttribute('data-dtab');
        $$('.tab', tabsHost).forEach(function (b) { b.classList.toggle('active', b === btn); });
        $$('[data-dpanel]', host).forEach(function (p) {
          p.classList.toggle('on', p.getAttribute('data-dpanel') === name);
        });
      });
    }
  }

  /* ---------- avatar ---------- */
  function renderAvatar() {
    var items = M.wardrobe || [];
    var slots = ['suit', 'hat', 'face', 'back', 'fx'];

    slots.forEach(function (slot) {
      if (!state.equipped[slot]) {
        var first = items.filter(function (i) { return i.slot === slot; })[0];
        if (first) state.equipped[slot] = first.name;
      }
    });

    function itemFor(slot) {
      return items.filter(function (i) { return i.slot === slot && i.name === state.equipped[slot]; })[0] || {};
    }

    function paint() {
      var suit = itemFor('suit').color || '#3b2f66';
      var hat = itemFor('hat').color || '#a78bfa';
      var face = itemFor('face').color || '#5eead4';
      var back = itemFor('back').color || '#8b5cf6';
      var fx = itemFor('fx').color || '#a78bfa';

      el('avatar-stage').innerHTML =
        '<svg viewBox="0 0 220 270" width="228" height="280" role="img" aria-label="Avatar preview" ' +
          'style="--suit:' + suit + ';--hat:' + hat + ';--face:' + face + ';--back:' + back + ';--fx:' + fx + '">' +
          '<ellipse cx="110" cy="243" rx="54" ry="9" fill="#0d1220" opacity=".12"/>' +
          '<circle cx="110" cy="132" r="88" fill="var(--fx)" opacity=".16"/>' +
          '<path d="M74 150C46 132 40 108 52 92c6 26 18 36 34 44z" fill="var(--back)" opacity=".8"/>' +
          '<path d="M146 150c28-18 34-42 22-58-6 26-18 36-34 44z" fill="var(--back)" opacity=".8"/>' +
          '<rect x="52" y="150" width="17" height="62" rx="8" fill="var(--suit)" opacity=".85"/>' +
          '<rect x="151" y="150" width="17" height="62" rx="8" fill="var(--suit)" opacity=".85"/>' +
          '<rect x="72" y="140" width="76" height="88" rx="24" fill="var(--suit)"/>' +
          '<rect x="84" y="216" width="22" height="26" rx="9" fill="#1f2436"/>' +
          '<rect x="114" y="216" width="22" height="26" rx="9" fill="#1f2436"/>' +
          '<circle cx="110" cy="102" r="36" fill="#f1dccb"/>' +
          '<rect x="82" y="94" width="56" height="17" rx="8" fill="var(--face)" opacity=".95"/>' +
          '<path d="M72 66h76l-15-24H87z" fill="var(--hat)"/>' +
        '</svg>';

      el('equipped').innerHTML = slots.map(function (slot) {
        var it = itemFor(slot);
        return '<div class="kv"><span style="text-transform:capitalize">' + slot + '</span><b>' + (it.name || 'empty') + '</b></div>';
      }).join('');

      el('wardrobe-count').textContent = items.length + ' items';

      el('wardrobe').innerHTML = items.map(function (i) {
        return '<div class="witem' + (state.equipped[i.slot] === i.name ? ' on' : '') + '" data-item="' + i.name + '" data-slot="' + i.slot + '">' +
          '<div class="swatch" style="background:linear-gradient(140deg,' + i.color + ',#1b2233)">' + i.rarity.charAt(0) + '</div>' +
          '<div class="name">' + i.name + '</div>' +
          '<div class="slot">' + i.slot + ' · ' + i.rarity + '</div>' +
        '</div>';
      }).join('');
    }

    paint();

    el('wardrobe').addEventListener('click', function (e) {
      var node = e.target.closest('[data-item]');
      if (!node) return;
      state.equipped[node.getAttribute('data-slot')] = node.getAttribute('data-item');
      paint();
      toast(node.getAttribute('data-item') + ' equipped');
    });
  }

  /* ---------- marketplace ---------- */
  function renderMarket() {
    var rarities = ['All', 'Common', 'Rare', 'Epic', 'Legendary'];
    var rarity = 'All';
    var chips = el('mkt-filters');

    chips.innerHTML = rarities.map(function (r) {
      return '<button class="chip' + (r === rarity ? ' on' : '') + '" data-rarity="' + r + '">' + r + '</button>';
    }).join('');

    function draw() {
      var list = (M.market || []).filter(function (i) { return rarity === 'All' || i.rarity === rarity; });
      el('mkt-grid').innerHTML = list.map(function (i) {
        var owned = state.owned[i.name];
        return '<div class="stack" style="gap:7px">' +
          '<div class="thumb art" style="--g:linear-gradient(140deg,' + i.color + ',#151a28)">' +
            '<span class="badge flag">' + i.rarity + '</span>' +
            '<span class="glyph" style="font-size:26px">' + i.slot.charAt(0).toUpperCase() + '</span>' +
          '</div>' +
          '<div style="font-size:13.5px;font-weight:700">' + i.name + '</div>' +
          '<div class="row" style="justify-content:space-between">' +
            '<span class="pill"><span class="coin"></span>' + num(i.price) + '</span>' +
            (owned
              ? '<span class="badge green">Owned</span>'
              : '<button class="btn btn-primary btn-sm" data-buy="' + i.price + '" data-name="' + i.name + '">Buy</button>') +
          '</div>' +
        '</div>';
      }).join('');
    }

    chips.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-rarity]');
      if (!btn) return;
      rarity = btn.getAttribute('data-rarity');
      $$('.chip', chips).forEach(function (b) { b.classList.toggle('on', b === btn); });
      draw();
    });

    el('mkt-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-buy]');
      if (!btn) return;
      var price = Number(btn.getAttribute('data-buy'));
      var name = btn.getAttribute('data-name');
      if (price > state.balance) {
        toast('Not enough alloy. Earn it from rewards or sell an item.');
        return;
      }
      state.balance -= price;
      state.owned[name] = true;
      el('balance-v').textContent = num(state.balance);
      el('mkt-balance').textContent = num(state.balance) + ' alloy';
      draw();
      toast(name + ' added to your inventory');
    });

    el('mkt-balance').textContent = num(state.balance) + ' alloy';
    draw();
  }

  /* ---------- servers ---------- */
  function renderServers() {
    var region = 'ALL';
    var q = '';
    var stats = el('server-stats');
    var body = el('server-rows');

    function draw() {
      var list = M.servers.filter(function (s) {
        var g = gameById(s.gameId);
        var text = (s.name + ' ' + g.title).toLowerCase();
        return (region === 'ALL' || s.region === region) && (!q || text.indexOf(q) > -1);
      });
      body.innerHTML = list.length
        ? list.map(serverRow).join('')
        : '<tr><td colspan="6"><div class="empty">No servers match that filter.</div></td></tr>';

      var players = M.servers.reduce(function (a, s) { return a + s.players; }, 0);
      var limit = M.servers.reduce(function (a, s) { return a + s.limit; }, 0);
      stats.innerHTML =
        '<div class="stat"><div class="k">Players online</div><div class="v">' + num(players) + '</div><div class="d">across ' + M.servers.length + ' sampled servers</div></div>' +
        '<div class="stat"><div class="k">Seats used</div><div class="v">' + pct(players, limit) + '%</div><div class="d">' + players + ' of ' + limit + '</div></div>' +
        '<div class="stat"><div class="k">Average ping</div><div class="v">' +
          Math.round(M.servers.reduce(function (a, s) { return a + s.ping; }, 0) / M.servers.length) + 'ms</div>' +
          '<div class="d">closest region per player</div></div>' +
        '<div class="stat"><div class="k">Provisioning</div><div class="v">On request</div><div class="d">new sandboxes under load</div></div>';
    }

    var regionEl = el('server-region');
    var searchEl = el('server-q');
    if (regionEl) regionEl.addEventListener('change', function () { region = regionEl.value; draw(); });
    if (searchEl) searchEl.addEventListener('input', function () { q = searchEl.value.trim().toLowerCase(); draw(); });

    draw();
  }

  /* ---------- create ---------- */
  function renderCreators() {
    var games = M.myGames;
    el('creator-stats').innerHTML =
      '<div class="stat"><div class="k">Monthly revenue</div><div class="v">$' + num(games.reduce(function (a, g) { return a + g.revenue; }, 0)) + '</div><div class="d">70% share, weekly</div></div>' +
      '<div class="stat"><div class="k">Players</div><div class="v">' + num(games.reduce(function (a, g) { return a + g.players; }, 0)) + '</div><div class="d">across ' + games.length + ' experiences</div></div>' +
      '<div class="stat"><div class="k">Active replicas</div><div class="v">' + games.reduce(function (a, g) { return a + g.replicas; }, 0) + '</div><div class="d">autoscaled to players</div></div>' +
      '<div class="stat"><div class="k">Payout hold</div><div class="v">0 days</div><div class="d">no withheld balance</div></div>';

    el('creator-games').innerHTML = games.map(function (g) {
      return '<tr>' +
        '<td><strong>' + g.title + '</strong></td>' +
        '<td>' + num(g.players) + '</td>' +
        '<td>$' + num(g.revenue) + '</td>' +
        '<td>' + g.replicas + '</td>' +
        '<td>' + g.cpu + '%</td>' +
        '<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-play="' + g.title + '">Open</button></td>' +
      '</tr>';
    }).join('');

    el('orchestrator').innerHTML = games.map(function (g, i) {
      return '<div class="panel stack">' +
        '<div class="row" style="justify-content:space-between">' +
          '<strong style="font-size:13.5px">' + g.title + '</strong>' +
          '<span class="badge green">Live</span>' +
        '</div>' +
        '<div class="kv"><span>Replicas</span><b data-replicas="' + i + '">' + g.replicas + '</b></div>' +
        '<div class="kv"><span>Players per replica</span><b>64</b></div>' +
        '<div class="kv"><span>Compute</span><b data-cost="' + i + '">$' + (g.replicas * 0.04).toFixed(2) + '/hr</b></div>' +
        '<input type="range" min="0" max="' + g.maxReplicas + '" value="' + g.replicas + '" data-range="' + i + '" aria-label="Replicas for ' + g.title + '"/>' +
        '<div class="note">Hard CPU, memory and egress ceilings per sandbox, then replicas follow players.</div>' +
      '</div>';
    }).join('');

    el('orchestrator').addEventListener('input', function (e) {
      var range = e.target.closest('[data-range]');
      if (!range) return;
      var i = Number(range.getAttribute('data-range'));
      var replicas = Number(range.value);
      var node = $('[data-replicas="' + i + '"]');
      var cost = $('[data-cost="' + i + '"]');
      if (node) node.textContent = replicas;
      if (cost) cost.textContent = '$' + (replicas * 0.04).toFixed(2) + '/hr';
    });
  }

  /* ---------- features ---------- */
  function renderFeatures() {
    var groups = M.featureGroups || [];
    var total = groups.reduce(function (a, g) { return a + g.items.length; }, 0);
    var design = groups.reduce(function (a, g) {
      return a + g.items.filter(function (i) { return i.s === 'design'; }).length;
    }, 0);

    el('features-meta').innerHTML =
      '<span class="badge">' + groups.length + ' areas</span>' +
      '<span class="badge gray">' + total + ' items</span>' +
      '<span class="badge amber">' + design + ' in design</span>' +
      '<span class="badge green">' + (total - design) + ' planned</span>';

    el('features-groups').innerHTML = groups.map(function (g) {
      return '<div class="panel stack">' +
        '<div class="panel-head" style="margin-bottom:0"><h3>' + g.area + '</h3><span class="pill">' + g.items.length + '</span></div>' +
        '<ul class="list" style="margin-top:4px">' + g.items.map(function (i) {
          var cls = i.s === 'design' ? 'amber' : 'gray';
          var label = i.s === 'design' ? 'In design' : 'Planned';
          return '<li><span class="tick">•</span><span style="flex:1">' + i.t + '</span><span class="badge ' + cls + '">' + label + '</span></li>';
        }).join('') + '</ul>' +
      '</div>';
    }).join('');
  }

  /* ---------- global events ---------- */
  function bindGlobal() {
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-notify]')) {
        var panel = el('notify-panel');
        if (panel) panel.classList.toggle('on');
        return;
      }
      var openPanel = el('notify-panel');
      if (openPanel && openPanel.classList.contains('on') && !e.target.closest('#notify-panel')) {
        openPanel.classList.remove('on');
      }
      var playBtn = e.target.closest('[data-play]');
      if (playBtn) {
        e.preventDefault();
        play(playBtn.getAttribute('data-play'));
        return;
      }
      var fav = e.target.closest('[data-fav]');
      if (fav) {
        var id = fav.getAttribute('data-fav');
        state.fav[id] = !state.fav[id];
        fav.textContent = state.fav[id] ? 'In favourites' : 'Add to favourites';
        toast(state.fav[id] ? 'Added to favourites' : 'Removed from favourites');
        return;
      }
      if (e.target.closest('[data-close-modal]') || e.target.id === 'play-modal') {
        var modal = el('play-modal');
        if (modal) modal.classList.remove('on');
        clearInterval(playTimer);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var modal = el('play-modal');
        if (modal) modal.classList.remove('on');
        var panel = el('notify-panel');
        if (panel) panel.classList.remove('on');
        clearInterval(playTimer);
      }
    });
  }

  function init() {
    shell();
    bindGlobal();
    var render = {
      home: renderHome,
      charts: renderCharts,
      game: renderGame,
      avatar: renderAvatar,
      market: renderMarket,
      servers: renderServers,
      create: renderCreators,
      features: renderFeatures
    }[document.body.getAttribute('data-page')];
    if (render) render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
