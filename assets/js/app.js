/* Metallic — shared shell and page behaviour (no dependencies) */
(function () {
  'use strict';

  var M = window.METALLIC || {};
  var GAMES = M.games || [];
  var state = { balance: 1450, equipped: {}, owned: {} };

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

  var ICONS = {
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    bag: '<path d="M6 8h12l1.5 12H4.5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    play: '<path d="M8 5l11 7-11 7z"/>'
  };

  function ico(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }

  var NAV = [
    { href: 'index.html', label: 'Home', page: 'home', icon: 'home' },
    { href: 'explore.html', label: 'Explore', page: 'explore', icon: 'compass' },
    { href: 'avatar.html', label: 'Avatar', page: 'avatar', icon: 'user' },
    { href: 'marketplace.html', label: 'Market', page: 'market', icon: 'bag' },
    { href: 'servers.html', label: 'Servers', page: 'servers', icon: 'server' },
    { href: 'creators.html', label: 'Create', page: 'create', icon: 'plus' },
    { href: 'safety.html', label: 'Safety', page: 'safety', icon: 'shield' },
    { href: 'features.html', label: 'Features', page: 'features', icon: 'list' },
    { href: 'docs.html', label: 'Docs', page: 'docs', icon: 'code' }
  ];

  /* ---------- shell ---------- */
  function shell() {
    var page = document.body.getAttribute('data-page');
    var rail = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.page === page ? ' class="on" aria-current="page"' : '') + '>' +
        ico(n.icon) + '<span>' + n.label + '</span></a>';
    }).join('');

    document.body.insertAdjacentHTML('afterbegin',
      '<header class="topbar">' +
        '<a class="brand" href="index.html"><span class="brand-mark">M</span><span>METALLIC</span></a>' +
        '<form class="search" role="search" onsubmit="return false">' +
          ico('search') +
          '<input id="q" type="search" placeholder="Search games, creators, items" aria-label="Search" autocomplete="off"/>' +
        '</form>' +
        '<div class="topbar-right">' +
          '<span class="pill"><span class="dot"></span> 6.2M online</span>' +
          '<span class="balance" title="Alloy balance"><span class="diamond"></span><span id="balance-v">' + num(state.balance) + '</span><span>alloy</span></span>' +
          '<a class="avatar-chip" href="avatar.html" title="Your avatar">RD</a>' +
        '</div>' +
      '</header>' +
      '<nav class="rail" aria-label="Primary">' + rail + '</nav>' +
      '<div id="toast" aria-live="polite"></div>' +
      '<div class="modal" id="play-modal" role="dialog" aria-modal="true" aria-labelledby="pm-title">' +
        '<div class="modal-card">' +
          '<span class="badge mint">Sandbox reserved</span>' +
          '<h3 id="pm-title">Launching…</h3>' +
          '<p id="pm-sub" style="color:var(--muted);font-size:12px">Requesting a server instance…</p>' +
          '<div class="progress"><span id="pm-bar"></span></div>' +
          '<button class="btn btn-ghost btn-sm" data-close-modal>Cancel</button>' +
        '</div>' +
      '</div>');

    document.body.insertAdjacentHTML('beforeend',
      '<footer class="footer">' +
        '<div>© 2026 Metallic · design concept, mock data, no live accounts or payments.</div>' +
        '<nav><a href="features.html">Feature scope</a><a href="safety.html">Safety</a>' +
        '<a href="creators.html">Creators</a><a href="docs.html">API</a></nav>' +
      '</footer>');

    var q = el('q');
    if (q) {
      var incoming = new URLSearchParams(location.search).get('q');
      if (incoming) q.value = incoming;
      q.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          location.href = 'explore.html?q=' + encodeURIComponent(q.value.trim());
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
    }, 2600);
  }

  var playTimer = null;
  function play(title, meta) {
    var modal = el('play-modal');
    if (!modal) return;
    var bar = el('pm-bar');
    el('pm-title').textContent = 'Launching ' + title;
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
        el('pm-title').textContent = title + ' is ready';
        el('pm-sub').textContent = meta || 'Sandbox isolated · hard limit enforced · region US-East';
      }
    }, 110);
  }

  /* ---------- shared markup ---------- */
  function card(g) {
    return '<a class="gcard" href="game.html?id=' + g.id + '">' +
      '<div class="art" style="--g:' + g.art + '">' +
        '<span class="badge' + (g.firstParty ? '' : ' gray') + '">' + (g.firstParty ? 'First-party' : 'Community') + '</span>' +
        '<span class="live"><span class="dot"></span>' + short(g.players) + '</span>' +
        '<span class="glyph">' + initials(g.title) + '</span>' +
      '</div>' +
      '<div class="gcard-body">' +
        '<h3>' + g.title + '</h3>' +
        '<div class="sub"><span>' + g.genre + '</span><span>' + g.rating + '% · ' + short(g.players) + '</span></div>' +
      '</div>' +
    '</a>';
  }

  function capacity(players, limit) {
    var p = pct(players, limit);
    return '<div class="row" style="gap:8px;flex-wrap:nowrap">' +
      '<div class="cap' + (p > 85 ? ' hot' : '') + '" style="flex:1"><span style="width:' + p + '%"></span></div>' +
      '<span class="pill" style="padding:2px 6px">' + players + '/' + limit + '</span>' +
    '</div>';
  }

  function serverRow(s) {
    var g = gameById(s.gameId);
    return '<tr>' +
      '<td><strong>' + s.name + '</strong></td>' +
      '<td><a href="game.html?id=' + g.id + '" style="color:var(--muted)">' + g.title + '</a></td>' +
      '<td><span class="pill">' + s.region + '</span></td>' +
      '<td>' + s.ping + 'ms</td>' +
      '<td style="min-width:150px">' + capacity(s.players, s.limit) + '</td>' +
      '<td style="text-align:right"><button class="btn btn-mint btn-sm" data-play="' + g.title + '">Join</button></td>' +
    '</tr>';
  }

  /* ---------- pages ---------- */
  function renderHome() {
    var g = GAMES[0];
    el('hero').innerHTML =
      '<div class="hero-body">' +
        '<span class="eyebrow">Spotlight · first-party</span>' +
        '<h1>' + g.title.toUpperCase() + '</h1>' +
        '<p>' + g.desc + '</p>' +
        '<div class="meta-row">' +
          '<span><b>' + g.rating + '%</b> rating</span>' +
          '<span><b>' + num(g.players) + '</b> playing now</span>' +
          '<span><b>' + g.servers + '</b> live servers</span>' +
          '<span><b>64</b> player hard limit</span>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-primary" data-play="' + g.title + '">' + ico('play') + 'Play now</button>' +
          '<a class="btn btn-ghost" href="game.html?id=' + g.id + '">Game page</a>' +
        '</div>' +
      '</div>' +
      '<div class="hero-art"><div class="art" style="--g:' + g.art + '"><span class="glyph">' + initials(g.title) + '</span></div></div>';

    el('shelf-continue').innerHTML = GAMES.slice(0, 6).map(card).join('');
    el('shelf-trending').innerHTML = GAMES.slice().sort(function (a, b) { return b.players - a.players; }).slice(0, 8).map(card).join('');

    var grid = el('grid-recommended');
    var chips = el('home-genres');
    var genre = 'All';

    function draw() {
      var list = genre === 'All' ? GAMES.slice() : GAMES.filter(function (x) { return x.genre === genre; });
      list.sort(function (a, b) { return b.rating - a.rating; });
      grid.innerHTML = list.length
        ? list.map(card).join('')
        : '<div class="empty" style="grid-column:1/-1">No games in this category yet.</div>';
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
      { k: 'Peak concurrent', v: '6.2M', d: 'modelled platform ceiling, not a live figure' },
      { k: 'Match satisfaction', v: '98.7%', d: 'post-match rating across all games' },
      { k: 'Marketplace fee', v: '5%', d: 'flat, no listing fee, no hidden spread' },
      { k: 'Ads & loot boxes', v: '0', d: 'cosmetics only, never stat advantages' }
    ].map(function (s) {
      return '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + s.v + '</div><div class="d">' + s.d + '</div></div>';
    }).join('');

    el('home-firstparty').innerHTML =
      '<div class="h-sec"><h2>From Metallic Studio</h2><a href="explore.html">All games</a></div>' +
      '<div class="grid-cards">' + GAMES.filter(function (x) { return x.firstParty; }).map(card).join('') + '</div>';
  }

  function renderExplore() {
    var params = new URLSearchParams(location.search);
    var q = (params.get('q') || '').toLowerCase();
    var genre = params.get('genre') || 'All';
    var sort = 'rating';
    var grid = el('grid-explore');
    var count = el('explore-count');
    var chips = el('genre-chips');
    var search = el('explore-q');

    if (search) search.value = params.get('q') || '';

    chips.innerHTML = M.genres.map(function (name) {
      return '<button class="chip' + (name === genre ? ' on' : '') + '" data-genre="' + name + '">' + name + '</button>';
    }).join('');

    function draw() {
      var list = GAMES.filter(function (g) {
        var text = (g.title + ' ' + g.creator + ' ' + g.genre + ' ' + g.tags.join(' ')).toLowerCase();
        return (genre === 'All' || g.genre === genre) && (!q || text.indexOf(q) > -1);
      });
      if (sort === 'players') list.sort(function (a, b) { return b.players - a.players; });
      else if (sort === 'new') list.sort(function (a, b) { return b.id - a.id; });
      else list.sort(function (a, b) { return b.rating - a.rating; });

      count.textContent = list.length + (list.length === 1 ? ' game' : ' games');
      grid.innerHTML = list.length
        ? list.map(card).join('')
        : '<div class="empty" style="grid-column:1/-1">Nothing matches that search. Try a genre chip or a shorter query.</div>';
    }

    chips.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-genre]');
      if (!btn) return;
      genre = btn.getAttribute('data-genre');
      $$('.chip', chips).forEach(function (b) { b.classList.toggle('on', b === btn); });
      draw();
    });

    if (search) {
      search.addEventListener('input', function () { q = search.value.trim().toLowerCase(); draw(); });
    }
    var sortEl = el('sort');
    if (sortEl) sortEl.addEventListener('change', function () { sort = sortEl.value; draw(); });

    draw();
  }

  function renderGame() {
    var host = el('game-detail');
    if (!host || !GAMES.length) return;
    var g = gameById(new URLSearchParams(location.search).get('id'));
    document.title = g.title + ' — Metallic';

    var servers = M.servers.filter(function (s) { return s.gameId === g.id; });
    var similar = GAMES.filter(function (x) { return x.id !== g.id && x.genre === g.genre; })
      .concat(GAMES.filter(function (x) { return x.id !== g.id && x.genre !== g.genre; }))
      .slice(0, 6);
    var liveTotal = servers.reduce(function (sum, s) { return sum + s.players; }, 0);

    host.innerHTML =
      '<section class="detail-hero">' +
        '<div class="art" style="--g:' + g.art + '"><span class="glyph">' + initials(g.title) + '</span></div>' +
        '<div class="inner">' +
          '<div class="row">' +
            '<span class="badge' + (g.firstParty ? '' : ' gray') + '">' + (g.firstParty ? 'First-party' : 'Community') + '</span>' +
            '<span class="pill"><span class="dot"></span>' + num(g.players) + ' playing</span>' +
            '<span class="pill">' + g.rating + '% rating</span>' +
            '<span class="pill">' + g.genre + '</span>' +
          '</div>' +
          '<h1>' + g.title + '</h1>' +
          '<div class="row" style="color:var(--muted);font-size:12px">by <strong style="color:var(--text)">' + g.creator + '</strong></div>' +
          '<div class="row">' +
            '<button class="btn btn-primary" data-play="' + g.title + '">' + ico('play') + 'Play</button>' +
            '<button class="btn btn-ghost btn-sm" data-fav="' + g.id + '">' + (state.owned['fav' + g.id] ? 'In favourites' : 'Add to favourites') + '</button>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<div class="detail-grid">' +
        '<div class="stack">' +
          '<div class="panel"><div class="panel-head"><h3>About this game</h3><span class="badge gray">' + g.tags.length + ' tags</span></div>' +
            '<p style="color:var(--muted);font-size:13px;line-height:1.7">' + g.desc + '</p>' +
            '<div class="chips" style="margin-top:12px">' + g.tags.map(function (t) { return '<span class="pill">' + t + '</span>'; }).join('') + '</div>' +
          '</div>' +
          '<div class="panel"><div class="panel-head"><h3>Live servers</h3><span class="pill">' + num(liveTotal) + ' players · ' + servers.length + ' shown</span></div>' +
            (servers.length
              ? '<div class="table-wrap"><table><thead><tr><th>Server</th><th>Game</th><th>Region</th><th>Ping</th><th>Capacity</th><th></th></tr></thead>' +
                '<tbody>' + servers.map(serverRow).join('') + '</tbody></table></div>'
              : '<div class="empty">No servers online for this game right now.</div>') +
          '</div>' +
          '<div><div class="h-sec"><h2>Similar games</h2><a href="explore.html?genre=' + encodeURIComponent(g.genre) + '">More ' + g.genre + '</a></div>' +
            '<div class="shelf">' + similar.map(card).join('') + '</div></div>' +
        '</div>' +
        '<aside class="side">' +
          '<div class="panel"><div class="panel-head"><h3>Server model</h3><span class="badge mint">Sandboxed</span></div>' +
            '<div class="kv"><span>Players per server</span><b>' + g.maxPlayers + ' hard limit</b></div>' +
            '<div class="kv"><span>Server count</span><b>' + g.servers + '</b></div>' +
            '<div class="kv"><span>Provisioned</span><b>on request</b></div>' +
            '<div class="kv"><span>Scaling</span><b>to players, capped</b></div>' +
            '<div class="note" style="margin-top:12px">Every server is an isolated sandbox with a published resource ceiling. Capacity is shown before you join, never after.</div>' +
          '</div>' +
          '<div class="panel"><div class="panel-head"><h3>Play safely</h3></div>' +
            '<ul class="list">' +
              '<li><span class="tick">✓</span><span>Cosmetics only: no paid stat advantages.</span></li>' +
              '<li><span class="tick">✓</span><span>Reports reviewed by humans, with an appeal window.</span></li>' +
              '<li><span class="tick">✓</span><span>Alt accounts are linked, so bans stick.</span></li>' +
            '</ul>' +
          '</div>' +
          '<div class="panel"><div class="panel-head"><h3>Creator</h3></div>' +
            '<div class="kv"><span>Studio</span><b>' + g.creator + '</b></div>' +
            '<div class="kv"><span>Revenue share</span><b>70% to creator</b></div>' +
            '<div class="kv"><span>Payout schedule</span><b>weekly</b></div>' +
          '</div>' +
        '</aside>' +
      '</div>';
  }

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
      var face = itemFor('face').color || '#a78bfa';
      var back = itemFor('back').color || '#8b5cf6';
      var fx = itemFor('fx').color || '#a78bfa';

      el('avatar-stage').innerHTML =
        '<svg viewBox="0 0 220 270" width="240" height="294" role="img" aria-label="Avatar preview" ' +
          'style="--suit:' + suit + ';--hat:' + hat + ';--face:' + face + ';--back:' + back + ';--fx:' + fx + '">' +
          '<ellipse cx="110" cy="243" rx="54" ry="9" fill="#000" opacity=".45"/>' +
          '<circle cx="110" cy="132" r="88" fill="var(--fx)" opacity=".2"/>' +
          '<path d="M74 150C46 132 40 108 52 92c6 26 18 36 34 44z" fill="var(--back)" opacity=".8"/>' +
          '<path d="M146 150c28-18 34-42 22-58-6 26-18 36-34 44z" fill="var(--back)" opacity=".8"/>' +
          '<rect x="52" y="150" width="17" height="62" rx="8" fill="var(--suit)" opacity=".85"/>' +
          '<rect x="151" y="150" width="17" height="62" rx="8" fill="var(--suit)" opacity=".85"/>' +
          '<rect x="72" y="140" width="76" height="88" rx="24" fill="var(--suit)"/>' +
          '<rect x="84" y="216" width="22" height="26" rx="9" fill="#231d33"/>' +
          '<rect x="114" y="216" width="22" height="26" rx="9" fill="#231d33"/>' +
          '<circle cx="110" cy="102" r="36" fill="#f1dccb"/>' +
          '<rect x="82" y="94" width="56" height="17" rx="8" fill="var(--face)" opacity=".92"/>' +
          '<path d="M72 66h76l-15-24H87z" fill="var(--hat)"/>' +
          '<circle cx="110" cy="102" r="56" fill="var(--fx)" opacity=".22"/>' +
        '</svg>' +
        '<div class="pill" style="position:absolute;top:12px;left:12px">Avatar preview</div>';

      el('equipped').innerHTML = slots.map(function (slot) {
        var it = itemFor(slot);
        return '<div class="kv"><span style="text-transform:capitalize">' + slot + '</span><b>' + (it.name || 'empty') + '</b></div>';
      }).join('');

      el('wardrobe-count').textContent = items.length + ' items';

      el('wardrobe').innerHTML = items.map(function (i) {
        return '<div class="witem' + (state.equipped[i.slot] === i.name ? ' on' : '') + '" data-item="' + i.name + '" data-slot="' + i.slot + '">' +
          '<div class="swatch" style="background:linear-gradient(140deg,' + i.color + ',#0b0912)">' + i.rarity.charAt(0) + '</div>' +
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

  function renderMarket() {
    var rarities = ['All', 'Common', 'Rare', 'Epic', 'Legendary'];
    var rarity = 'All';
    var chips = el('mkt-filters');

    chips.innerHTML = rarities.map(function (r) {
      return '<button class="chip' + (r === rarity ? ' on' : '') + '" data-rarity="' + r + '">' + r + '</button>';
    }).join('');

    function draw() {
      var list = (M.market || []).filter(function (i) { return rarity === 'All' || i.rarity === rarity; });
      el('mkt-grid').innerHTML = list.map(function (i, idx) {
        var owned = state.owned[i.name];
        return '<div class="panel stack" style="gap:9px">' +
          '<div class="art" style="--g:linear-gradient(140deg,' + i.color + ',#0b0912);aspect-ratio:1;border-radius:11px;border:1px solid var(--line)">' +
            '<span class="badge' + (i.rarity === 'Legendary' ? ' amber' : '') + '">' + i.rarity + '</span>' +
            '<span class="glyph" style="font-size:30px">' + i.slot.charAt(0).toUpperCase() + '</span>' +
          '</div>' +
          '<div><div style="font-size:12.5px;font-weight:800">' + i.name + '</div>' +
          '<div style="font-size:10.5px;color:var(--dim);text-transform:capitalize">' + i.slot + '</div></div>' +
          '<div class="row" style="justify-content:space-between">' +
            '<span class="pill"><span class="diamond"></span>' + num(i.price) + '</span>' +
            (owned
              ? '<span class="badge mint">Owned</span>'
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
        toast('Not enough alloy — earn more from rewards or sell an item.');
        return;
      }
      state.balance -= price;
      state.owned[name] = true;
      el('balance-v').textContent = num(state.balance);
      el('mkt-balance').textContent = num(state.balance) + ' alloy available';
      draw();
      toast(name + ' added to your wardrobe');
    });

    el('mkt-balance').textContent = num(state.balance) + ' alloy available';
    draw();
  }

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
        '<div class="stat"><div class="k">Live players</div><div class="v">' + num(players) + '</div><div class="d">across ' + M.servers.length + ' sampled servers</div></div>' +
        '<div class="stat"><div class="k">Seat usage</div><div class="v">' + pct(players, limit) + '%</div><div class="d">' + players + ' of ' + limit + ' seats used</div></div>' +
        '<div class="stat"><div class="k">Avg ping</div><div class="v">' +
          Math.round(M.servers.reduce(function (a, s) { return a + s.ping; }, 0) / M.servers.length) + 'ms</div>' +
          '<div class="d">best-fit region chosen per player</div></div>' +
        '<div class="stat"><div class="k">Podding</div><div class="v">On request</div><div class="d">new sandboxes spin up under load</div></div>';
    }

    var regionEl = el('server-region');
    var searchEl = el('server-q');
    if (regionEl) regionEl.addEventListener('change', function () { region = regionEl.value; draw(); });
    if (searchEl) searchEl.addEventListener('input', function () { q = searchEl.value.trim().toLowerCase(); draw(); });

    draw();
  }

  function renderCreators() {
    var stats = el('creator-stats');
    var games = M.myGames;

    stats.innerHTML =
      '<div class="stat"><div class="k">Monthly revenue</div><div class="v">$' + num(games.reduce(function (a, g) { return a + g.revenue; }, 0)) + '</div><div class="d">70% share, paid weekly</div></div>' +
      '<div class="stat"><div class="k">Live players</div><div class="v">' + num(games.reduce(function (a, g) { return a + g.players; }, 0)) + '</div><div class="d">across ' + games.length + ' published games</div></div>' +
      '<div class="stat"><div class="k">Active replicas</div><div class="v">' + games.reduce(function (a, g) { return a + g.replicas; }, 0) + '</div><div class="d">sandboxed, autoscaled to players</div></div>' +
      '<div class="stat"><div class="k">Payout hold</div><div class="v">0 days</div><div class="d">no withheld balances or minimums</div></div>';

    el('creator-games').innerHTML = games.map(function (g, i) {
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
          '<strong style="font-size:12.5px">' + g.title + '</strong>' +
          '<span class="badge mint">Live</span>' +
        '</div>' +
        '<div class="kv"><span>Replicas</span><b data-replicas="' + i + '">' + g.replicas + '</b></div>' +
        '<div class="kv"><span>Player cap / replica</span><b>64</b></div>' +
        '<div class="kv"><span>Est. compute</span><b data-cost="' + i + '">$' + (g.replicas * 0.04).toFixed(2) + '/hr</b></div>' +
        '<input type="range" min="0" max="' + g.maxReplicas + '" value="' + g.replicas + '" data-range="' + i + '" aria-label="Replicas for ' + g.title + '"/>' +
        '<div class="note">Hard limits apply per sandbox: CPU, memory and egress are capped, then replicas scale with connected players.</div>' +
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
      '<span class="badge mint">' + (total - design) + ' planned</span>';

    el('features-groups').innerHTML = groups.map(function (g) {
      return '<div class="panel stack">' +
        '<div class="panel-head" style="margin-bottom:0"><h3>' + g.area + '</h3><span class="pill">' + g.items.length + '</span></div>' +
        '<ul class="list" style="margin-top:4px">' + g.items.map(function (i) {
          var cls = i.s === 'design' ? 'amber' : 'gray';
          var label = i.s === 'design' ? 'In design' : 'Planned';
          return '<li><span class="tick">•</span><span style="flex:1">' + i.t + '</span>' +
            '<span class="badge ' + cls + '">' + label + '</span></li>';
        }).join('') + '</ul>' +
      '</div>';
    }).join('');
  }

  /* ---------- global events ---------- */
  function bindGlobal() {
    document.addEventListener('click', function (e) {
      var playBtn = e.target.closest('[data-play]');
      if (playBtn) {
        e.preventDefault();
        play(playBtn.getAttribute('data-play'));
        return;
      }
      var fav = e.target.closest('[data-fav]');
      if (fav) {
        var id = fav.getAttribute('data-fav');
        state.owned['fav' + id] = !state.owned['fav' + id];
        fav.textContent = state.owned['fav' + id] ? 'In favourites' : 'Add to favourites';
        toast(state.owned['fav' + id] ? 'Added to favourites' : 'Removed from favourites');
        return;
      }
      if (e.target.closest('[data-close-modal]')) {
        el('play-modal').classList.remove('on');
        clearInterval(playTimer);
        return;
      }
      if (e.target.id === 'play-modal') {
        el('play-modal').classList.remove('on');
        clearInterval(playTimer);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var modal = el('play-modal');
        if (modal) modal.classList.remove('on');
        clearInterval(playTimer);
      }
    });
  }

  function init() {
    shell();
    bindGlobal();
    var page = document.body.getAttribute('data-page');
    var render = {
      home: renderHome,
      explore: renderExplore,
      game: renderGame,
      avatar: renderAvatar,
      market: renderMarket,
      servers: renderServers,
      create: renderCreators,
      features: renderFeatures
    }[page];
    if (render) render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
