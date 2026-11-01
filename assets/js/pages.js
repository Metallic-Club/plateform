/* Metallic — renderers for the account, discovery and community surfaces.
   Loaded after app.js; app.js calls these through window.MetallicPages. */
(function () {
  'use strict';

  var UI = window.MetallicUI || {};
  var state = UI.state || {};
  var M = UI.data || {};
  var GAMES = UI.games || [];
  var card = UI.card, gameById = UI.gameById, num = UI.num, ico = UI.ico;
  var toast = UI.toast, el = UI.el, $ = UI.$, $$ = UI.$$, save = UI.save, setTheme = UI.setTheme;

  function label(txt, top) {
    return '<div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;' +
      'color:var(--text-3);margin:' + (top === false ? '0' : '8px 0 4px') + '">' + txt + '</div>';
  }

  function ago(ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  function metrics() {
    var distinct = {};
    (state.history || []).forEach(function (h) { distinct[h.id] = 1; });
    var socials = Object.keys(state.socials || {}).filter(function (k) { return state.socials[k]; }).length;
    return {
      plays: (state.history || []).length,
      distinct: Object.keys(distinct).length,
      favs: Object.keys(state.fav || {}).filter(function (k) { return state.fav[k]; }).length,
      owned: Object.keys(state.owned || {}).length,
      gifts: (state.gifts || []).length,
      trades: (state.trades || []).length,
      ratings: Object.keys(state.ratings || {}).length,
      claims: Object.keys(state.claimed || {}).length,
      profile: (state.bio || socials) ? 1 : 0
    };
  }

  function achDone() {
    var m = metrics();
    return (M.achievements || []).filter(function (a) { return (m[a.metric] || 0) >= a.target; }).length;
  }

  function achList() {
    var m = metrics();
    return (M.achievements || []).map(function (a) {
      var v = m[a.metric] || 0;
      var done = v >= a.target;
      return '<div class="ach-card' + (done ? '' : ' locked') + '">' +
        '<div class="ach-medal">' + (done ? 'OK' : Math.min(v, 99)) + '</div>' +
        '<h4>' + a.name + '</h4><p>' + a.desc + '</p>' +
        '<div class="meter"><span style="width:' + Math.min(100, Math.round(v / a.target * 100)) + '%"></span></div>' +
        '<div class="row" style="justify-content:space-between;font-size:11.5px;color:var(--text-3)">' +
          '<span>' + Math.min(v, a.target) + '/' + a.target + '</span><span>+' + a.reward + ' alloy</span></div>' +
      '</div>';
    }).join('');
  }

  /* ---------- explore ---------- */
  function renderExplore() {
    var grid = el('explore-grid');
    if (!grid) return;
    var chips = el('explore-cats');
    var meta = el('explore-meta');
    var blurb = el('explore-blurb');
    var rec = el('explore-rec');
    var qEl = el('explore-q');
    var sortEl = el('explore-sort');
    var cats = [{ name: 'All', blurb: 'Everything, ordered by how well it fits what you already play.', match: null }]
      .concat(M.categories || []);
    var cat = new URLSearchParams(location.search).get('cat') || 'All';
    var sort = 'fit';
    var q = '';

    function inCat(g, c) {
      if (!c.match) return true;
      return c.match.some(function (k) { return g.genre === k || g.tags.indexOf(k) > -1; });
    }
    function topGenre() {
      var tally = {}, best = '', n = 0;
      (state.history || []).forEach(function (h) {
        var g = gameById(h.id);
        if (g) tally[g.genre] = (tally[g.genre] || 0) + 1;
      });
      for (var k in tally) if (tally[k] > n) { best = k; n = tally[k]; }
      return best;
    }
    function fit(g) {
      var v = g.rating;
      if (g.genre === topGenre()) v += 20;
      if (state.fav[g.id]) v += 12;
      if (g.firstParty) v += 3;
      return v;
    }
    function draw() {
      var c = cats.filter(function (x) { return x.name === cat; })[0] || cats[0];
      var list = GAMES.filter(function (g) {
        var text = (g.title + ' ' + g.creator + ' ' + g.genre + ' ' + g.tags.join(' ')).toLowerCase();
        return inCat(g, c) && (!q || text.indexOf(q) > -1);
      });
      if (sort === 'players') list.sort(function (a, b) { return b.players - a.players; });
      else if (sort === 'rating') list.sort(function (a, b) { return b.rating - a.rating; });
      else if (sort === 'new') list.sort(function (a, b) { return b.id - a.id; });
      else list.sort(function (a, b) { return fit(b) - fit(a); });

      if (meta) meta.textContent = list.length + ' in ' + cat.toLowerCase();
      if (blurb) blurb.textContent = c.blurb;
      grid.innerHTML = list.length ? list.map(card).join('')
        : '<div class="empty" style="grid-column:1/-1">Nothing in this category yet. Try another one.</div>';

      if (rec) {
        var base = (state.history || []).map(function (h) { return gameById(h.id); })[0] || GAMES[0];
        var like = GAMES.filter(function (g) { return g.id !== base.id && g.genre === base.genre; }).slice(0, 4);
        GAMES.forEach(function (g) {
          if (like.length < 4 && g.id !== base.id && like.indexOf(g) === -1) like.push(g);
        });
        rec.innerHTML = '<div class="section-head" style="margin:4px 0 10px">' +
          '<h2 style="font-size:15px">Because you played ' + base.title + '</h2>' +
          '<span class="badge gray">' + base.genre + ' &middot; closest match</span></div>' +
          '<div class="shelf">' + like.map(card).join('') + '</div>';
      }
    }

    if (chips) {
      chips.innerHTML = cats.map(function (c) {
        return '<button class="chip' + (c.name === cat ? ' on' : '') + '" data-cat="' + c.name + '">' + c.name + '</button>';
      }).join('');
      chips.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cat]');
        if (!b) return;
        cat = b.getAttribute('data-cat');
        $$('.chip', chips).forEach(function (x) { x.classList.toggle('on', x === b); });
        draw();
      });
    }
    if (qEl) qEl.addEventListener('input', function () { q = qEl.value.trim().toLowerCase(); draw(); });
    if (sortEl) sortEl.addEventListener('change', function () { sort = sortEl.value; draw(); });
    draw();
  }

  /* ---------- library ---------- */
  function renderLibrary() {
    var root = el('library-root');
    if (!root) return;
    var tab = 'continue';
    var TABS = [['continue', 'Continue'], ['history', 'History'], ['favourites', 'Favourites'], ['achievements', 'Achievements']];

    function uniqueIds() {
      var seen = [], out = [];
      (state.history || []).forEach(function (h) {
        if (seen.indexOf(h.id) === -1) { seen.push(h.id); out.push(h.id); }
      });
      return out;
    }
    function body() {
      if (tab === 'favourites') {
        var favs = Object.keys(state.fav || {}).filter(function (k) { return state.fav[k]; });
        return favs.length ? '<div class="grid-cards">' + favs.map(gameById).map(card).join('') + '</div>'
          : '<div class="empty">No favourites yet. Open an experience and add it.</div>';
      }
      if (tab === 'achievements') return '<div class="ach">' + achList() + '</div>';
      if (tab === 'history') {
        return (state.history || []).length
          ? '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Experience</th><th>When</th><th>Genre</th><th></th></tr></thead><tbody>' +
            state.history.slice(0, 20).map(function (h) {
              var g = gameById(h.id);
              return '<tr><td><a href="game.html?id=' + g.id + '" style="color:var(--blue);font-weight:600">' + g.title + '</a></td>' +
                '<td>' + ago(h.at) + '</td><td>' + g.genre + '</td>' +
                '<td style="text-align:right"><button class="btn btn-play btn-sm" data-play="' + g.title + '">Play again</button></td></tr>';
            }).join('') + '</tbody></table></div></div>'
          : '<div class="empty">No sessions recorded on this device yet.</div>';
      }
      var ids = uniqueIds().slice(0, 8);
      return ids.length ? '<div class="grid-cards">' + ids.map(gameById).map(card).join('') + '</div>'
        : '<div class="empty">Nothing yet. Start an experience and it lands here.</div>';
    }
    function draw() {
      root.innerHTML =
        '<section class="stats">' + [
          { k: 'Sessions', v: (state.history || []).length, d: 'recorded on this device' },
          { k: 'Experiences played', v: uniqueIds().length, d: 'of ' + GAMES.length + ' available' },
          { k: 'Achievements', v: achDone() + ' / ' + (M.achievements || []).length, d: 'unlocked so far' },
          { k: 'Alloy balance', v: num(state.balance), d: 'earned, gifted or bought' }
        ].map(function (s) {
          return '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + s.v + '</div><div class="d">' + s.d + '</div></div>';
        }).join('') + '</section>' +
        '<div class="tabs" style="margin-top:18px">' + TABS.map(function (t) {
          return '<button class="tab' + (t[0] === tab ? ' active' : '') + '" data-ltab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div><div style="margin-top:14px">' + body() + '</div>';
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ltab]');
      if (!b) return;
      tab = b.getAttribute('data-ltab');
      draw();
    });
    draw();
  }

  /* ---------- wallet ---------- */
  function renderWallet() {
    var root = el('wallet-root');
    if (!root) return;
    var friends = ((M.profile || {}).friends || []).map(function (f) { return f.name; });

    function owned() { return Object.keys(state.owned || {}).filter(function (k) { return state.owned[k]; }); }
    function draw() {
      var tx = (state.tx || []).concat(M.transactions || []);
      var own = owned();
      root.innerHTML =
        '<div class="panel stack">' +
          '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
            '<div>' + label('Alloy balance', false) +
              '<div class="big-balance">' + num(state.balance) + '<small>alloy</small></div></div>' +
            '<div class="row"><a class="btn btn-ghost btn-sm" href="marketplace.html">Marketplace</a>' +
              '<a class="btn btn-ghost btn-sm" href="avatar.html">Wardrobe</a></div>' +
          '</div>' +
          '<div class="note">Alloy is earned, gifted or traded. Nothing on this prototype is bought with real money.</div>' +
        '</div>' +

        '<div class="two-col">' +
          '<div class="panel"><div class="panel-head"><h3>Ways to earn free alloy</h3><span class="badge green">No purchase</span></div>' +
            (M.quests || []).map(function (q) {
              return '<div class="quest"><div><h4>' + q.label + '</h4><p>' + q.detail + '</p></div>' +
                (state.claimed[q.id] ? '<span class="badge gray">Claimed</span>'
                  : '<button class="btn btn-primary btn-sm" data-claim="' + q.id + '" data-reward="' + q.reward + '">+' + q.reward + '</button>') +
              '</div>';
            }).join('') +
            '<p style="font-size:12px;color:var(--text-3);margin-top:10px">Rewards reset on the daily rollover. No crates, no spins, no odds.</p>' +
          '</div>' +

          '<div class="panel"><div class="panel-head"><h3>Send a gift</h3><span class="pill">currency or accessory</span></div>' +
            label('To') +
            '<select class="field" data-gift-to style="width:100%">' +
              friends.map(function (n) { return '<option>' + n + '</option>'; }).join('') + '</select>' +
            label('Alloy amount') +
            '<input class="field" data-gift-amount type="number" min="1" value="100" style="width:100%"/>' +
            (own.length ? label('Or send an accessory') +
              '<select class="field" data-gift-item style="width:100%"><option value="">none, currency only</option>' +
              own.map(function (n) { return '<option>' + n + '</option>'; }).join('') + '</select>' : '') +
            '<button class="btn btn-primary btn-sm btn-wide" data-send-gift style="margin-top:10px">Send gift</button>' +
            '<div class="note" style="margin-top:10px">Gifts are final. The recipient always sees who sent it.</div>' +
          '</div>' +
        '</div>' +

        '<div class="panel"><div class="panel-head"><h3>Trade</h3><span class="pill">5% flat fee on listed value</span></div>' +
          '<div class="trade">' +
            '<div class="side">' + label('You give', false) +
              '<select class="field" data-trade-mine style="width:100%">' +
                (own.length ? own.map(function (n) { return '<option>' + n + '</option>'; }).join('') : '<option value="">nothing owned yet</option>') +
              '</select></div>' +
            '<div class="arrow">&#8646;</div>' +
            '<div class="side">' + label('You get', false) +
              '<select class="field" data-trade-theirs style="width:100%">' +
                (M.market || []).slice(0, 6).map(function (i) { return '<option>' + i.name + ' - ' + i.price + ' alloy</option>'; }).join('') +
              '</select></div>' +
          '</div>' +
          '<div class="kv" style="margin-top:12px"><span>Fee</span><b>5% of listed value, each side</b></div>' +
          '<div class="kv"><span>Trade lock</span><b>none</b></div>' +
          '<button class="btn btn-primary btn-sm" data-trade style="margin-top:12px">Send trade offer</button>' +
        '</div>' +

        '<div class="panel"><div class="panel-head"><h3>Transactions</h3><span class="pill">' + tx.length + ' entries</span></div>' +
          '<div class="timeline">' + tx.slice(0, 12).map(function (t) {
            return '<div class="tl-row"><span>' + t.what + '</span><span style="color:var(--text-3)">' + t.when + '</span>' +
              '<span class="amt ' + (t.amount < 0 ? 'neg' : 'pos') + '">' + (t.amount < 0 ? '-' : '+') + num(Math.abs(t.amount)) + '</span></div>';
          }).join('') + '</div>' +
        '</div>';
    }

    root.addEventListener('click', function (e) {
      var claim = e.target.closest('[data-claim]');
      if (claim) {
        var id = claim.getAttribute('data-claim');
        var reward = Number(claim.getAttribute('data-reward'));
        state.claimed[id] = Date.now();
        state.balance += reward;
        state.tx.unshift({ what: 'Reward claimed', amount: reward, when: 'just now' });
        save();
        draw();
        toast('+' + reward + ' alloy claimed');
        return;
      }
      if (e.target.closest('[data-send-gift]')) {
        var to = $('[data-gift-to]').value;
        var itemEl = $('[data-gift-item]');
        var item = itemEl ? itemEl.value : '';
        var amount = Number($('[data-gift-amount]').value || 0);
        if (item) {
          delete state.owned[item];
          state.gifts.unshift({ to: to, item: item });
          save();
          draw();
          toast(item + ' sent to ' + to);
          return;
        }
        if (!amount || amount > state.balance) {
          toast('That is more than your balance.');
          return;
        }
        state.balance -= amount;
        state.gifts.unshift({ to: to, amount: amount });
        state.tx.unshift({ what: 'Gift to ' + to, amount: -amount, when: 'just now' });
        save();
        draw();
        toast(num(amount) + ' alloy sent to ' + to);
        return;
      }
      if (e.target.closest('[data-trade]')) {
        var give = $('[data-trade-mine]').value;
        var get = $('[data-trade-theirs]').value;
        if (!give) {
          toast('Own an item first, then you can trade it.');
          return;
        }
        state.trades.unshift({ give: give, get: get });
        save();
        draw();
        toast('Trade offer sent');
      }
    });
    draw();
  }

  /* ---------- profile ---------- */
  function renderProfile() {
    var root = el('profile-root');
    if (!root) return;
    var p = M.profile || { socials: [], friends: [], alts: [] };

    function handle(name) {
      if (state.socials && state.socials[name]) return state.socials[name];
      var hit = (p.socials || []).filter(function (s) { return s.name === name; })[0];
      return hit ? hit.handle : '';
    }
    function alts() { return (p.alts || []).slice(0, Math.max(1, Math.min(5, state.alts || 4))); }

    function draw() {
      var friends = (p.friends || []).filter(function (f) { return state.friendsOn[f.name] !== false; })
        .concat((state.friendsExtra || []).map(function (n) { return { name: n, status: 'Request sent', color: '#64748b' }; }));
      root.innerHTML =
        '<div class="panel profile-head">' +
          '<div class="avatar-xl">RD</div>' +
          '<div style="flex:1;min-width:220px">' +
            '<div class="row" style="gap:8px"><h1 class="page-title" style="font-size:24px">RavenDev</h1>' +
              '<span class="badge blue">Verified</span><span class="badge green">Plus</span></div>' +
            '<p class="page-sub" style="margin-top:5px">' + p.joined + ' &middot; ' + alts().length +
              ' of 5 linked accounts &middot; ' + achDone() + ' achievements</p>' +
          '</div>' +
          '<div class="row"><a class="btn btn-ghost btn-sm" href="library.html">Library</a>' +
            '<button class="btn btn-ghost btn-sm" data-share>Share profile</button></div>' +
        '</div>' +

        '<div class="two-col">' +
          '<div class="panel"><div class="panel-head"><h3>Bio</h3><span class="pill">public</span></div>' +
            '<textarea class="field-area" data-bio maxlength="240" aria-label="Your bio">' + (state.bio || p.bio || '') + '</textarea>' +
            '<div class="row" style="justify-content:space-between;margin-top:10px">' +
              '<span style="font-size:12px;color:var(--text-3)">Shown on your profile and in every server.</span>' +
              '<button class="btn btn-primary btn-sm" data-save-bio>Save bio</button></div>' +
          '</div>' +
          '<div class="panel"><div class="panel-head"><h3>Linked accounts</h3><span class="badge green">OAuth</span></div>' +
            (p.socials || []).map(function (s) {
              return '<div class="row" style="justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)">' +
                '<span class="social"><span class="sd" style="background:' + s.color + '"></span>' + s.name + '</span>' +
                '<input class="field" data-social="' + s.name + '" value="' + handle(s.name) + '" aria-label="' + s.name + ' handle" style="max-width:170px"/></div>';
            }).join('') +
            '<button class="btn btn-ghost btn-sm btn-wide" data-save-socials style="margin-top:10px">Save links</button>' +
            '<div class="note" style="margin-top:10px">Links are display-only here. Removing a handle revokes the token on the next sign-in.</div>' +
          '</div>' +
        '</div>' +

        '<div class="two-col">' +
          '<div class="panel" id="friends"><div class="panel-head"><h3>Friends</h3><span class="pill">' + friends.length + '</span></div>' +
            '<div class="row" style="margin-bottom:6px"><input class="field" data-friend-name placeholder="Add a friend by name" aria-label="Friend name" style="flex:1"/>' +
              '<button class="btn btn-ghost btn-sm" data-add-friend>Add</button></div>' +
            (friends.length ? friends.map(function (f) {
              return '<div class="tl-row" style="grid-template-columns:minmax(0,1fr) auto auto">' +
                '<span class="row" style="gap:9px;min-width:0"><span class="avatar-chip" style="background:linear-gradient(140deg,' + f.color + ',#151a28);color:#fff;border:0">' +
                  f.name.charAt(0).toUpperCase() + '</span>' +
                  '<span style="min-width:0"><strong style="font-size:13.5px;display:block">' + f.name + '</strong>' +
                  '<span style="font-size:11.5px;color:var(--text-3)">' + f.status + '</span></span></span>' +
                '<a class="btn btn-ghost btn-sm" href="servers.html">Join</a>' +
                '<button class="btn btn-ghost btn-sm" data-remove-friend="' + f.name + '">Remove</button></div>';
            }).join('') : '<div class="empty">No friends yet. Add one above.</div>') +
          '</div>' +

          '<div class="panel"><div class="panel-head"><h3>Linked accounts (alts)</h3>' +
            '<span class="badge ' + (alts().length >= 5 ? 'amber' : 'green') + '">' + alts().length + ' of 5</span></div>' +
            alts().map(function (a) {
              return '<div class="kv"><span>' + a.name + (a.main ? ' &middot; main' : '') + '</span><b>' + a.status + '</b></div>';
            }).join('') +
            '<button class="btn btn-ghost btn-sm btn-wide" data-add-alt style="margin-top:10px"' +
              (alts().length >= 5 ? ' disabled' : '') + '>Add a linked account</button>' +
            '<div class="warn" style="margin-top:10px">A ban on any one of these accounts applies to all of them, and to this identity.</div>' +
          '</div>' +
        '</div>' +

        '<div class="panel"><div class="panel-head"><h3>Achievements</h3>' +
          '<a class="link" href="library.html" style="font-size:13px">See all</a></div>' +
          '<div class="ach">' + achList() + '</div></div>';
    }

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-save-bio]')) {
        state.bio = $('[data-bio]').value.slice(0, 240);
        save();
        toast('Bio saved');
      } else if (e.target.closest('[data-save-socials]')) {
        state.socials = state.socials || {};
        $$('[data-social]').forEach(function (i) { state.socials[i.getAttribute('data-social')] = i.value.trim(); });
        save();
        toast('Linked accounts saved');
      } else if (e.target.closest('[data-add-friend]')) {
        var name = $('[data-friend-name]').value.trim();
        if (!name) return;
        state.friendsExtra.push(name);
        save();
        draw();
        toast('Friend request sent to ' + name);
      } else if (e.target.closest('[data-remove-friend]')) {
        var n = e.target.closest('[data-remove-friend]').getAttribute('data-remove-friend');
        state.friendsOn[n] = false;
        state.friendsExtra = (state.friendsExtra || []).filter(function (x) { return x !== n; });
        save();
        draw();
        toast(n + ' removed from friends');
      } else if (e.target.closest('[data-add-alt]')) {
        if ((state.alts || 4) >= 5) return;
        state.alts = Math.min(5, (state.alts || 4) + 1);
        save();
        draw();
        toast('Linked account added. It inherits this ban history.');
      } else if (e.target.closest('[data-share]')) {
        if (navigator.clipboard) navigator.clipboard.writeText(location.href);
        toast('Profile link copied');
      }
    });
    draw();
  }

  /* ---------- community ---------- */
  function renderCommunity() {
    var root = el('community-root');
    if (!root) return;
    var c = M.community || { channels: [], events: [], integrations: [] };

    function draw() {
      var linked = !!state.discord;
      root.innerHTML =
        '<div class="panel">' +
          '<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">' +
            '<div><div class="row" style="gap:9px"><h2 style="font-size:18px">' + c.guild + '</h2>' +
              '<span class="badge ' + (linked ? 'green' : 'gray') + '">' + (linked ? 'Linked' : 'Not linked') + '</span></div>' +
              '<p class="page-sub" style="margin-top:5px">' + num(c.members) + ' members &middot; ' + num(c.online) +
                ' online now &middot; release and server-status bots post here first.</p></div>' +
            (linked ? '<button class="btn btn-ghost btn-sm" data-unlink>Unlink Discord</button>'
                    : '<button class="btn btn-primary btn-sm" data-link-discord>Connect Discord</button>') +
          '</div>' +
        '</div>' +

        '<div class="two-col">' +
          '<div class="panel"><div class="panel-head"><h3>Channels</h3><span class="pill">' + c.channels.length + '</span></div>' +
            c.channels.map(function (ch) {
              return '<div class="tl-row" style="grid-template-columns:minmax(0,1fr) auto">' +
                '<span><strong style="font-size:13.5px;display:block">' + ch.name + '</strong>' +
                '<span style="font-size:12px;color:var(--text-3)">' + ch.detail + '</span></span>' +
                (ch.unread ? '<span class="badge blue">' + ch.unread + ' new</span>' : '<span class="badge gray">read</span>') + '</div>';
            }).join('') +
          '</div>' +
          '<div class="panel"><div class="panel-head"><h3>This week</h3><span class="badge blue">' + c.events.length + ' events</span></div>' +
            c.events.map(function (ev) {
              return '<div class="kv"><span>' + ev.title +
                '<span style="display:block;font-size:11.5px;color:var(--text-3)">' + ev.where + '</span></span><b>' + ev.when + '</b></div>';
            }).join('') +
            '<div class="note" style="margin-top:10px">Events are announced in Discord and pinned on the charts page.</div>' +
          '</div>' +
        '</div>' +

        '<div class="panel"><div class="panel-head"><h3>Deeper Discord integration</h3><span class="pill">account level</span></div>' +
          '<div class="table-wrap"><table><thead><tr><th>Feature</th><th>What it does</th><th style="text-align:right">State</th></tr></thead><tbody>' +
            c.integrations.map(function (i) {
              var on = linked && i.on;
              return '<tr><td><strong>' + i.t + '</strong></td><td>' + i.d + '</td>' +
                '<td style="text-align:right">' + (on ? '<span class="badge green">On</span>' : '<span class="badge gray">Off</span>') + '</td></tr>';
            }).join('') +
          '</tbody></table></div>' +
          '<div class="note" style="margin-top:10px">Signing in with Discord links roles once; the platform never reads your message history.</div>' +
        '</div>' +

        '<div class="panel"><div class="panel-head"><h3>Moderation</h3><span class="badge blue">Human in the loop</span></div>' +
          '<p style="color:var(--text-2);font-size:14px;line-height:1.65">Reports from Discord land in the same queue as in-game reports. ' +
          'Every outcome names the rule that was applied, and appeals go to a second reviewer.</p>' +
          '<div class="row" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="safety.html">Read the rules</a>' +
            '<a class="btn btn-ghost btn-sm" href="servers.html">Server status</a></div>' +
        '</div>';
    }

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-link-discord]')) {
        state.discord = true;
        save();
        draw();
        toast('Discord linked. Roles synced.');
      } else if (e.target.closest('[data-unlink]')) {
        state.discord = false;
        save();
        draw();
        toast('Discord unlinked');
      }
    });
    draw();
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    var root = el('settings-root');
    if (!root) return;

    function draw() {
      root.innerHTML =
        '<div class="panel"><div class="panel-head"><h3>Appearance</h3><span class="pill">themes</span></div>' +
          '<div class="themes">' + (M.themes || []).map(function (t) {
            return '<button class="theme-opt' + (state.theme === t.id ? ' on' : '') + '" data-theme-pick="' + t.id + '">' +
              '<div class="sw" style="background:linear-gradient(135deg,' + t.swatch[0] + ' 0 58%,' + t.swatch[1] + ' 58% 100%)"></div>' +
              '<strong>' + t.name + '</strong><span>' + t.desc + '</span></button>';
          }).join('') + '</div>' +
          '<div class="row" style="justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);gap:12px">' +
            '<div><strong style="font-size:13.5px">Reduce motion</strong>' +
            '<p style="font-size:12.5px;color:var(--text-3);margin-top:2px">Turns off transitions across the interface.</p></div>' +
            '<button class="btn btn-ghost btn-sm" data-motion>' + (state.motion === 'reduced' ? 'On' : 'Off') + '</button>' +
          '</div>' +
        '</div>' +

        '<div class="two-col">' +
          '<div class="panel"><div class="panel-head"><h3>Verification and deletion</h3><span class="badge green">Verified</span></div>' +
            '<div class="kv"><span>Account created</span><b>14 Sep 2026</b></div>' +
            '<div class="kv"><span>Verified</span><b>16 Sep 2026</b></div>' +
            '<div class="kv"><span>Deletion timer</span><b>Cleared</b></div>' +
            '<div class="kv"><span>If unverified</span><b>deleted on day 30</b></div>' +
            '<div class="note" style="margin-top:10px">Reminders go out on day 7, 21 and 28. Deletion leaves a 7-day recovery window before data is purged.</div>' +
          '</div>' +
          '<div class="panel"><div class="panel-head"><h3>Active sessions</h3><span class="pill">' + (M.sessions || []).length + '</span></div>' +
            (M.sessions || []).map(function (s) {
              return '<div class="tl-row" style="grid-template-columns:minmax(0,1fr) auto">' +
                '<span><strong style="font-size:13px;display:block">' + s.device + '</strong>' +
                '<span style="font-size:11.5px;color:var(--text-3)">' + s.where + ' &middot; ' + s.when + '</span></span>' +
                (s.current ? '<span class="badge green">This device</span>'
                  : '<button class="btn btn-ghost btn-sm" data-signout>Sign out</button>') + '</div>';
            }).join('') +
            '<button class="btn btn-ghost btn-sm btn-wide" data-signout-all style="margin-top:10px">Sign out everywhere else</button>' +
          '</div>' +
        '</div>' +

        '<div class="panel"><div class="panel-head"><h3>Your data</h3><span class="pill">stored on this device</span></div>' +
          '<p style="color:var(--text-2);font-size:13.5px;line-height:1.6">This prototype keeps your balance, favourites, history and ' +
          'preferences in local storage. Nothing is sent anywhere.</p>' +
          '<div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-export>Export as JSON</button>' +
            '<button class="btn btn-ghost btn-sm" data-reset>Reset demo data</button></div>' +
        '</div>';
    }

    root.addEventListener('click', function (e) {
      var pick = e.target.closest('[data-theme-pick]');
      if (pick) {
        state.theme = pick.getAttribute('data-theme-pick');
        save();
        setTheme();
        draw();
        toast('Theme set to ' + state.theme);
        return;
      }
      if (e.target.closest('[data-motion]')) {
        state.motion = state.motion === 'reduced' ? 'full' : 'reduced';
        save();
        setTheme();
        draw();
        toast('Motion ' + (state.motion === 'reduced' ? 'reduced' : 'restored'));
        return;
      }
      if (e.target.closest('[data-signout]') || e.target.closest('[data-signout-all]')) {
        toast('Other sessions signed out');
        return;
      }
      if (e.target.closest('[data-export]')) {
        var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'metallic-account.json';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Exported metallic-account.json');
        return;
      }
      if (e.target.closest('[data-reset]')) {
        try { localStorage.removeItem('metallic.v1'); } catch (err) {}
        location.reload();
      }
    });
    draw();
  }

  /* ---------- login ---------- */
  function renderLogin() {
    var root = el('login-root');
    if (!root) return;
    var step = 1;

    function strength(v) {
      var score = 0;
      if (v.length >= 8) score++;
      if (v.length >= 12) score++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
      if (/[0-9]/.test(v) || /[^A-Za-z0-9]/.test(v)) score++;
      return Math.min(4, score);
    }

    function draw() {
      root.innerHTML =
        '<div class="auth">' +
          '<div class="panel auth-card stack">' +
            '<div class="steps"><span class="' + (step >= 1 ? 'on' : '') + '"></span><span class="' + (step >= 2 ? 'on' : '') + '"></span></div>' +
            (step === 1
              ? '<div class="auth-head">' + ico('lock') + 'Sign in to Metallic</div>' +
                '<p style="font-size:13px;color:var(--text-2);line-height:1.55">Passwords are checked against breached-password lists before they are stored.</p>' +
                label('Email or username', false) +
                '<input class="field" id="login-user" value="ravendev" autocomplete="username" aria-label="Email or username" style="width:100%"/>' +
                label('Password') +
                '<input class="field" id="login-pass" type="password" value="correct-horse-92" autocomplete="current-password" aria-label="Password" style="width:100%"/>' +
                '<div class="strength"><span id="login-bar"></span></div>' +
                '<div id="login-hint" style="font-size:12px;color:var(--text-3)">Strong enough for this prototype</div>' +
                '<button class="btn btn-primary btn-wide" data-login-next>Continue</button>' +
                '<button class="btn btn-ghost btn-wide btn-sm" data-passkey>Use a passkey instead</button>' +
                '<div class="divider" style="margin:2px 0"></div>' +
                '<p style="font-size:12.5px;color:var(--text-3);text-align:center">No account? ' +
                  '<a href="profile.html" style="color:var(--blue);font-weight:600">Create one</a> and verify it within 30 days.</p>'
              : '<div class="auth-head">' + ico('shield') + 'Two-factor check</div>' +
                '<p style="font-size:13px;color:var(--text-2);line-height:1.55">Enter the six-digit code from your authenticator, ' +
                  'or the one we emailed to r***@ravendev.dev.</p>' +
                '<div class="otp">' + [0, 1, 2, 3, 4, 5].map(function (i) {
                  return '<input class="otp-digit" inputmode="numeric" maxlength="1" aria-label="Digit ' + (i + 1) + '" value="' + (i < 4 ? '4' : '') + '"/>';
                }).join('') + '</div>' +
                '<button class="btn btn-primary btn-wide" data-login-verify>Verify and sign in</button>' +
                '<div class="row" style="justify-content:space-between"><button class="btn btn-ghost btn-sm" data-login-back>Back</button>' +
                  '<button class="btn btn-ghost btn-sm" data-resend>Resend code</button></div>' +
                '<div class="note">New device? We ask for a code again and tell you by email.</div>') +
          '</div>' +
          '<div class="panel stack">' +
            '<div class="panel-head" style="margin-bottom:0"><h3>How this stays safe</h3><span class="badge green">Published</span></div>' +
            '<ul class="list">' +
              '<li><span class="tick">OK</span><span>Rate limited per account and per device, with exponential backoff.</span></li>' +
              '<li><span class="tick">OK</span><span>Passkeys supported, so there is no password to phish.</span></li>' +
              '<li><span class="tick">OK</span><span>Session list you can revoke from settings at any time.</span></li>' +
              '<li><span class="tick">OK</span><span>Unverified accounts are removed 30 days after creation.</span></li>' +
            '</ul>' +
          '</div>' +
        '</div>';

      var pass = el('login-pass');
      if (pass) {
        var paint = function () {
          var sc = strength(pass.value);
          var bar = el('login-bar'), hint = el('login-hint');
          if (!bar) return;
          bar.style.width = (sc * 25) + '%';
          bar.style.background = sc < 2 ? '#f87171' : sc < 4 ? '#f0b93b' : '#3ddc84';
          if (hint) hint.textContent = ['Too short', 'Weak', 'Fair', 'Strong', 'Excellent'][sc];
        };
        pass.addEventListener('input', paint);
        paint();
      }
    }

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-login-next]')) {
        step = 2;
        draw();
      } else if (e.target.closest('[data-login-back]')) {
        step = 1;
        draw();
      } else if (e.target.closest('[data-login-verify]')) {
        var digits = $$('.otp-digit').map(function (i) { return i.value; }).join('');
        if (digits.length < 6) {
          toast('Enter all six digits');
          return;
        }
        toast('Signed in as RavenDev');
        setTimeout(function () { location.href = 'library.html'; }, 800);
      } else if (e.target.closest('[data-passkey]')) {
        toast('Passkey prompt would open here');
      } else if (e.target.closest('[data-resend]')) {
        toast('Code resent. It expires in 10 minutes.');
      }
    });
    draw();
  }

  window.MetallicPages = {
    explore: renderExplore,
    library: renderLibrary,
    wallet: renderWallet,
    profile: renderProfile,
    community: renderCommunity,
    settings: renderSettings,
    login: renderLogin
  };
})();
