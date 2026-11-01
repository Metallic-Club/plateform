/* Metallic arcade — a small canvas engine so every listed experience is playable */
(function () {
  'use strict';

  var MODE_BY_GENRE = {
    Action: 'arena', RPG: 'arena', Strategy: 'arena',
    Platformer: 'runner',
    Racing: 'racer', Survival: 'racer',
    Simulator: 'collector', Cozy: 'collector'
  };

  var TIP = {
    arena: 'WASD or arrow keys to move — you fire automatically. Drag to move on touch.',
    runner: 'Space or arrow up to jump. Tap the canvas to jump on touch.',
    racer: 'Left and right arrows switch lanes. Tap the left or right half on touch.',
    collector: 'Click or tap the glowing targets before they fade.'
  };

  var W = 960, H = 540;
  var host, canvas, ctx, titleEl, tipEl, scoreEl, livesEl, timeEl, overPanel, overScore, overBest;
  var raf = 0, lastT = 0, keys = {};
  var pointer = { x: W / 2, y: H / 2, down: false };
  var game = null, mode = 'arena', accent = '#38bdf8', world = {};
  var score = 0, lives = 3, timeLeft = 60, over = false;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function laneX(i) { return 240 + 80 + 160 * i; }

  function accentOf(g) {
    var m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(g.art || '');
    return m ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : '#38bdf8';
  }

  /* ---------- chrome ---------- */
  function build() {
    if (host) return;
    host = document.createElement('div');
    host.className = 'arcade';
    host.id = 'arcade';
    host.hidden = true;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Game window');
    host.innerHTML =
      '<div class="arcade-bar">' +
        '<span class="arcade-title" id="arcade-title"></span>' +
        '<div class="arcade-stats">' +
          '<span>Score <b id="arcade-score">0</b></span>' +
          '<span>Lives <b id="arcade-lives">3</b></span>' +
          '<span>Time <b id="arcade-time">60</b></span>' +
        '</div>' +
        '<button class="arcade-exit" type="button" data-arcade-exit>Exit</button>' +
      '</div>' +
      '<div class="arcade-stage"><canvas id="arcade-canvas" width="960" height="540"></canvas></div>' +
      '<div class="arcade-tip" id="arcade-tip"></div>' +
      '<div class="arcade-over" id="arcade-over" hidden>' +
        '<div class="arcade-card">' +
          '<span class="arcade-eyebrow">Round over</span>' +
          '<h2 id="arcade-over-title">Nice run</h2>' +
          '<p class="arcade-card-score">Score <b id="arcade-over-score">0</b></p>' +
          '<p class="arcade-card-best">Best <b id="arcade-over-best">0</b></p>' +
          '<div class="arcade-actions">' +
            '<button class="btn btn-play" type="button" data-arcade-again>Play again</button>' +
            '<button class="btn btn-ghost" type="button" data-arcade-exit>Exit</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(host);

    canvas = host.querySelector('#arcade-canvas');
    ctx = canvas.getContext('2d');
    titleEl = host.querySelector('#arcade-title');
    tipEl = host.querySelector('#arcade-tip');
    scoreEl = host.querySelector('#arcade-score');
    livesEl = host.querySelector('#arcade-lives');
    timeEl = host.querySelector('#arcade-time');
    overPanel = host.querySelector('#arcade-over');
    overScore = host.querySelector('#arcade-over-score');
    overBest = host.querySelector('#arcade-over-best');
    host.querySelector('#arcade-over-title').textContent = 'Nice run';

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-arcade-exit]')) stop();
      else if (e.target.closest('[data-arcade-again]')) again();
    });

    canvas.addEventListener('pointerdown', function (e) {
      var p = pos(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.down = true;
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      press();
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = pos(e);
      pointer.x = p.x;
      pointer.y = p.y;
    });
    canvas.addEventListener('pointerup', function () { pointer.down = false; });
    canvas.addEventListener('pointercancel', function () { pointer.down = false; });
    canvas.addEventListener('pointerleave', function () { pointer.down = false; });
  }

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }

  function onKey(e) {
    if (!game) return;
    var k = e.key.toLowerCase();
    if (k === 'escape') { stop(); return; }
    if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
    }
    keys[k] = true;
    if (mode === 'runner' && (k === ' ' || k === 'arrowup' || k === 'w')) jump();
  }

  function offKey(e) { keys[e.key.toLowerCase()] = false; }

  function press() {
    if (over) return;
    if (mode === 'runner') jump();
    else if (mode === 'racer') world.lane = pointer.x < W / 2 ? clamp(world.lane - 1, 0, 2) : clamp(world.lane + 1, 0, 2);
    else if (mode === 'collector') grab();
  }

  /* ---------- rounds ---------- */
  function reset() {
    score = 0;
    lives = 3;
    over = false;
    timeLeft = mode === 'collector' ? 30 : 60;
    lastT = 0;
    keys = {};
    pointer.down = false;
    overPanel.hidden = true;
    world = {};

    if (mode === 'arena') {
      world.p = { x: W / 2, y: H / 2, r: 15 };
      world.foes = [];
      world.shots = [];
      world.spawn = 0.8;
      world.fire = 0.3;
    } else if (mode === 'runner') {
      world.obst = [];
      world.spawn = 1;
      world.py = 0;
      world.vy = 0;
      world.ground = H - 96;
      world.speed = 330;
    } else if (mode === 'racer') {
      world.lane = 1;
      world.x = laneX(1);
      world.cars = [];
      world.spawn = 0.7;
      world.speed = 330;
      world.road = 0;
      world.flash = 0;
    } else {
      world.targets = [];
      world.spawn = 0.45;
    }
    hud();
  }

  function start(g) {
    build();
    game = g;
    mode = MODE_BY_GENRE[g.genre] || 'arena';
    accent = accentOf(g);
    titleEl.textContent = g.title;
    tipEl.textContent = TIP[mode];
    host.hidden = false;
    document.body.classList.add('arcade-open');
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', offKey);
    reset();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function again() { if (game) reset(); }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    game = null;
    over = true;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', offKey);
    document.body.classList.remove('arcade-open');
    if (host) host.hidden = true;
  }

  function finish() {
    over = true;
    var key = 'metallic.arcade.' + game.id;
    var best = 0;
    try { best = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (err) { best = 0; }
    if (score > best) {
      best = score;
      try { localStorage.setItem(key, String(score)); } catch (err2) { /* storage blocked */ }
    }
    overScore.textContent = score;
    overBest.textContent = best;
    overPanel.hidden = false;
  }

  function loseLife() {
    lives -= 1;
    if (lives <= 0) { lives = 0; finish(); }
  }

  function jump() {
    if (mode !== 'runner' || over) return;
    if (world.py <= 0.01) { world.vy = 820; world.py = 0.02; }
  }

  function grab() {
    for (var i = world.targets.length - 1; i >= 0; i--) {
      var t = world.targets[i];
      if (Math.hypot(t.x - pointer.x, t.y - pointer.y) < t.r + 10) {
        world.targets.splice(i, 1);
        score += 15;
        return;
      }
    }
  }

  /* ---------- update ---------- */
  function update(dt) {
    if (mode === 'arena') updArena(dt);
    else if (mode === 'runner') updRunner(dt);
    else if (mode === 'racer') updRacer(dt);
    else updCollector(dt);
  }

  function updArena(dt) {
    var p = world.p, speed = 290;
    var dx = 0, dy = 0;
    if (keys.a || keys.arrowleft) dx -= 1;
    if (keys.d || keys.arrowright) dx += 1;
    if (keys.w || keys.arrowup) dy -= 1;
    if (keys.s || keys.arrowdown) dy += 1;
    if (pointer.down) {
      var tx = pointer.x - p.x, ty = pointer.y - p.y, td = Math.hypot(tx, ty) || 1;
      if (td > 8) { dx += tx / td; dy += ty / td; }
    }
    var m = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / m) * speed * dt, 22, W - 22);
    p.y = clamp(p.y + (dy / m) * speed * dt, 22, H - 22);

    world.spawn -= dt;
    if (world.spawn <= 0) {
      world.spawn = clamp(1.05 - score * 0.006, 0.32, 1.05);
      var side = Math.floor(rand(0, 4)), fx = 0, fy = 0;
      if (side === 0) { fx = rand(0, W); fy = -24; }
      else if (side === 1) { fx = W + 24; fy = rand(0, H); }
      else if (side === 2) { fx = rand(0, W); fy = H + 24; }
      else { fx = -24; fy = rand(0, H); }
      world.foes.push({ x: fx, y: fy, r: rand(11, 16), sp: rand(52, 80) + score * 0.35 });
    }

    world.fire -= dt;
    if (world.fire <= 0 && world.foes.length) {
      world.fire = 0.26;
      var best = 1e9, target = world.foes[0];
      for (var i = 0; i < world.foes.length; i++) {
        var d = Math.hypot(world.foes[i].x - p.x, world.foes[i].y - p.y);
        if (d < best) { best = d; target = world.foes[i]; }
      }
      var ang = Math.atan2(target.y - p.y, target.x - p.x);
      world.shots.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 640, vy: Math.sin(ang) * 640, life: 1.4 });
    }

    for (var s = world.shots.length - 1; s >= 0; s--) {
      var b = world.shots[s];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) world.shots.splice(s, 1);
    }

    for (var j = world.foes.length - 1; j >= 0; j--) {
      var f = world.foes[j];
      var ax = p.x - f.x, ay = p.y - f.y, ad = Math.hypot(ax, ay) || 1;
      f.x += (ax / ad) * f.sp * dt;
      f.y += (ay / ad) * f.sp * dt;
      var dead = false;
      for (var q = world.shots.length - 1; q >= 0; q--) {
        if (Math.hypot(world.shots[q].x - f.x, world.shots[q].y - f.y) < f.r + 5) {
          world.shots.splice(q, 1);
          dead = true;
          score += 10;
          break;
        }
      }
      if (dead) { world.foes.splice(j, 1); continue; }
      if (Math.hypot(p.x - f.x, p.y - f.y) < p.r + f.r) {
        world.foes.splice(j, 1);
        loseLife();
        if (over) return;
      }
    }
  }

  function updRunner(dt) {
    world.vy -= 2100 * dt;
    world.py = Math.max(0, world.py + world.vy * dt);
    if (world.py <= 0) world.vy = 0;
    world.speed = 330 + Math.min(score * 3, 300);

    world.spawn -= dt;
    if (world.spawn <= 0) {
      world.spawn = clamp(rand(0.8, 1.5) - score * 0.004, 0.42, 1.5);
      world.obst.push({ x: W + 50, w: rand(26, 48), h: rand(44, 98) });
    }

    var py = 200, pw = 34, ph = 46;
    for (var i = world.obst.length - 1; i >= 0; i--) {
      var o = world.obst[i];
      o.x -= world.speed * dt;
      if (o.x + o.w < 0) {
        world.obst.splice(i, 1);
        score += 5;
        continue;
      }
      if (o.x < py + pw && o.x + o.w > py && world.py < o.h) {
        world.obst.splice(i, 1);
        world.py = 0;
        world.vy = 0;
        loseLife();
        if (over) return;
      }
    }
  }

  function updRacer(dt) {
    if (over) return;
    world.speed = 330 + Math.min(score * 4, 340);
    world.road = (world.road + world.speed * dt) % 90;
    if (world.flash > 0) world.flash -= dt;

    world.spawn -= dt;
    if (world.spawn <= 0) {
      world.spawn = clamp(0.85 - score * 0.004, 0.3, 0.85);
      world.cars.push({ lane: Math.floor(rand(0, 3)), y: -90, sp: rand(30, 90) });
    }

    var target = laneX(world.lane);
    world.x += (target - world.x) * Math.min(1, dt * 12);

    for (var i = world.cars.length - 1; i >= 0; i--) {
      var c = world.cars[i];
      c.y += (world.speed + c.sp) * dt;
      if (c.y > H + 90) {
        world.cars.splice(i, 1);
        score += 5;
        continue;
      }
      var cx = laneX(c.lane);
      if (Math.abs(cx - world.x) < 52 && c.y + 80 > H - 150 && c.y < H - 60) {
        world.cars.splice(i, 1);
        world.flash = 0.3;
        loseLife();
        if (over) return;
      }
    }
  }

  function updCollector(dt) {
    world.spawn -= dt;
    if (world.spawn <= 0) {
      world.spawn = clamp(0.62 - score * 0.003, 0.24, 0.62);
      world.targets.push({ x: rand(70, W - 70), y: rand(70, H - 70), r: rand(18, 30), life: 1.7, max: 1.7 });
    }
    for (var i = world.targets.length - 1; i >= 0; i--) {
      world.targets[i].life -= dt;
      if (world.targets[i].life <= 0) world.targets.splice(i, 1);
    }
  }

  /* ---------- draw ---------- */
  function backdrop() {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b0d18');
    g.addColorStop(1, '#05060c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (var x = 0; x <= W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (var y = 0; y <= H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawArena() {
    var p = world.p;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (var i = 0; i < world.shots.length; i++) {
      var b = world.shots[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,120,120,0.9)';
    ctx.lineWidth = 2;
    for (var j = 0; j < world.foes.length; j++) {
      var f = world.foes[j];
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawRunner() {
    var ground = world.ground;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, ground, W, H - ground);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, ground);
    ctx.lineTo(W, ground);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (var i = 0; i < world.obst.length; i++) {
      var o = world.obst[i];
      ctx.fillRect(o.x, ground - o.h, o.w, o.h);
    }

    ctx.fillStyle = accent;
    ctx.fillRect(200, ground - 46 - world.py, 34, 46);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(214, ground - 38 - world.py, 8, 8);
  }

  function drawRacer() {
    ctx.fillStyle = '#141726';
    ctx.fillRect(240, 0, 480, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(240, 0);
    ctx.lineTo(240, H);
    ctx.moveTo(720, 0);
    ctx.lineTo(720, H);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4;
    for (var lane = 1; lane < 3; lane++) {
      var x = 240 + 160 * lane;
      for (var y = -90 + world.road; y < H; y += 90) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 46);
        ctx.stroke();
      }
    }

    for (var i = 0; i < world.cars.length; i++) {
      var c = world.cars[i];
      ctx.fillStyle = 'rgba(248,113,113,0.85)';
      ctx.fillRect(laneX(c.lane) - 32, c.y, 64, 80);
    }

    ctx.fillStyle = world.flash > 0 ? '#fca5a5' : accent;
    ctx.fillRect(world.x - 32, H - 150, 64, 90);
    ctx.fillStyle = 'rgba(10,10,16,0.75)';
    ctx.fillRect(world.x - 22, H - 138, 44, 26);
  }

  function drawCollector() {
    for (var i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      var k = t.life / t.max;
      ctx.globalAlpha = 0.25 + 0.75 * k;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 6 * (1 - k), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function draw() {
    backdrop();
    if (mode === 'arena') drawArena();
    else if (mode === 'runner') drawRunner();
    else if (mode === 'racer') drawRacer();
    else drawCollector();
  }

  function hud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    timeEl.textContent = Math.ceil(timeLeft);
  }

  function frame(t) {
    if (!game) return;
    if (!lastT) lastT = t;
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    if (!over) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        finish();
      } else {
        update(dt);
      }
    }
    draw();
    hud();
    raf = requestAnimationFrame(frame);
  }

  window.MetallicArcade = { start: start, stop: stop };
})();
