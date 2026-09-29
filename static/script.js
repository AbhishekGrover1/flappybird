/*
 * Flappy Bird -- classic, human-playable.
 * Vanilla JavaScript + HTML5 Canvas. No libraries, no AI, no server logic.
 *
 * Controls  : Space or ArrowUp to flap (click / tap works too).
 * Game flow : ready -> playing -> game over -> (flap input) -> ready -> ...
 * Scoring   : +1 only when the bird has fully cleared a pair of pipes.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
   * Tunables. Everything is in logical pixels on a 360 x 640 board; the
   * canvas is scaled to whatever size the page gives it.
   * ---------------------------------------------------------------- */
  const W = 360;
  const H = 640;
  const GROUND_H = 90;
  const GROUND_Y = H - GROUND_H;

  const STEP_MS = 1000 / 60;       // fixed physics step: same speed on 60 / 120 / 144 Hz screens
  const GRAVITY = 0.45;
  const FLAP_VELOCITY = -8;
  const MAX_FALL_SPEED = 11;

  const BIRD_X = 100;
  const BIRD_R = 14;               // collision radius

  const PIPE_W = 64;
  const CAP_H = 28;
  const CAP_OVER = 4;              // how far a pipe cap overhangs its body on each side
  const PIPE_GAP = 150;
  const PIPE_SPACING = 210;        // horizontal distance between consecutive pipe pairs
  const PIPE_SPEED = 2.6;
  const PIPE_MARGIN = 70;          // minimum pipe height above / below the gap
  const MAX_GAP_SHIFT = 150;       // largest vertical jump between two consecutive gaps
  const SPAWN_X = W + 10;

  const RESTART_DELAY_TICKS = 30;  // ~0.5 s before Game Over accepts input, so mashing Space can't skip it
  const BEST_KEY = "flappy-best-score";

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  /* ------------------------------------------------------------------
   * Geometry helpers (shared by collision detection AND drawing, so what
   * you see is exactly what you can hit).
   * ---------------------------------------------------------------- */
  function pipeRects(p) {
    const bottomTop = p.gapY + PIPE_GAP;
    return [
      { x: p.x, y: 0, w: PIPE_W, h: p.gapY - CAP_H },                                  // top body
      { x: p.x - CAP_OVER, y: p.gapY - CAP_H, w: PIPE_W + CAP_OVER * 2, h: CAP_H },    // top cap
      { x: p.x - CAP_OVER, y: bottomTop, w: PIPE_W + CAP_OVER * 2, h: CAP_H },         // bottom cap
      { x: p.x, y: bottomTop + CAP_H, w: PIPE_W, h: GROUND_Y - (bottomTop + CAP_H) },  // bottom body
    ];
  }

  function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  /* ------------------------------------------------------------------
   * Game core: pure logic, no DOM, fully deterministic given `rand`.
   * ---------------------------------------------------------------- */
  function createGame(options) {
    const opts = options || {};
    const rand = opts.rand || Math.random;
    const onGameOver = opts.onGameOver || function () {};

    const game = {
      state: "ready",   // "ready" | "playing" | "over"
      score: 0,         // live score; resets to 0 the moment the game ends
      finalScore: 0,    // score of the run that just ended (shown on the Game Over panel)
      overTicks: 0,     // ticks spent on the Game Over screen
      scroll: 0,        // world scroll distance (drives ground / parallax)
      bird: null,
      pipes: [],
    };
    let lastGapY = null;

    function reset() {
      game.state = "ready";
      game.score = 0;
      game.overTicks = 0;
      game.pipes = [];
      game.bird = { y: 290, vy: 0 };
      lastGapY = null;
    }

    function spawnPipe() {
      const minY = PIPE_MARGIN;
      const maxY = GROUND_Y - PIPE_GAP - PIPE_MARGIN;
      let lo = minY;
      let hi = maxY;
      if (lastGapY !== null) {
        // keep consecutive gaps reachable: random, but never an impossible jump
        lo = Math.max(minY, lastGapY - MAX_GAP_SHIFT);
        hi = Math.min(maxY, lastGapY + MAX_GAP_SHIFT);
      }
      const gapY = lo + rand() * (hi - lo);
      lastGapY = gapY;
      game.pipes.push({ x: SPAWN_X, gapY: gapY, passed: false });
    }

    function endGame() {
      game.state = "over";
      game.finalScore = game.score;
      game.score = 0;
      game.overTicks = 0;
      onGameOver(game.finalScore);
    }

    // The single input action: Space / ArrowUp / click / tap all end up here.
    function flap() {
      if (game.state === "ready") {
        game.state = "playing";
        game.bird.vy = FLAP_VELOCITY;
      } else if (game.state === "playing") {
        game.bird.vy = FLAP_VELOCITY;
      } else if (game.state === "over" && game.overTicks >= RESTART_DELAY_TICKS) {
        reset();
      }
    }

    // Advance the world by one fixed tick.
    function step() {
      const bird = game.bird;

      if (game.state === "ready" || game.state === "playing") game.scroll += PIPE_SPEED;

      if (game.state === "playing") {
        bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL_SPEED);
        bird.y += bird.vy;

        // Ceiling: like the original, the bird just can't leave the screen.
        if (bird.y < BIRD_R) {
          bird.y = BIRD_R;
          if (bird.vy < 0) bird.vy = 0;
        }

        // Move pipes, spawn the next pair, drop pairs that left the screen.
        for (let i = 0; i < game.pipes.length; i++) game.pipes[i].x -= PIPE_SPEED;
        const last = game.pipes[game.pipes.length - 1];
        if (!last || last.x <= SPAWN_X - PIPE_SPACING) spawnPipe();
        while (game.pipes.length && game.pipes[0].x + PIPE_W + CAP_OVER < -2) game.pipes.shift();

        // Score: exactly +1 per pair, and only once the bird has fully cleared it.
        for (let i = 0; i < game.pipes.length; i++) {
          const p = game.pipes[i];
          if (!p.passed && p.x + PIPE_W + CAP_OVER < BIRD_X - BIRD_R) {
            p.passed = true;
            game.score += 1;
          }
        }

        // Ground.
        if (bird.y + BIRD_R >= GROUND_Y) {
          bird.y = GROUND_Y - BIRD_R;
          endGame();
          return;
        }

        // Pipes.
        for (let i = 0; i < game.pipes.length; i++) {
          const rects = pipeRects(game.pipes[i]);
          for (let k = 0; k < rects.length; k++) {
            const r = rects[k];
            if (circleHitsRect(BIRD_X, bird.y, BIRD_R, r.x, r.y, r.w, r.h)) {
              endGame();
              return;
            }
          }
        }
      } else if (game.state === "over") {
        game.overTicks += 1;
        // After hitting a pipe the bird still drops to the ground.
        if (bird.y + BIRD_R < GROUND_Y) {
          bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL_SPEED);
          bird.y = Math.min(bird.y + bird.vy, GROUND_Y - BIRD_R);
        }
      }
    }

    game.reset = reset;
    game.flap = flap;
    game.step = step;
    reset();
    return game;
  }

  /* ------------------------------------------------------------------
   * Rendering. Draws in logical coordinates; the caller sets the scale.
   * ---------------------------------------------------------------- */
  const SKYLINE = [   // x, width, height -- one seamless 400px tile
    [0, 34, 60], [38, 26, 92], [68, 40, 70], [112, 28, 112], [144, 36, 64], [184, 30, 86],
    [218, 42, 102], [264, 26, 58], [294, 38, 94], [336, 30, 72], [370, 30, 66],
  ];
  const SKYLINE_TILE = 400;
  const CLOUDS = [[30, 95, 1], [200, 150, 0.75], [320, 70, 0.9], [110, 235, 0.6]];   // x, y, scale
  const CLOUD_TILE = 460;

  const SCORE_FONT = '800 50px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  const TITLE_FONT = '600 34px Fraunces, Georgia, serif';
  const UI_FONT = '500 15px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const SMALL_FONT = '500 13px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

  function createRenderer(ctx) {
    let wing = 0;    // wing-flap phase
    let angle = 0;   // smoothed bird tilt (radians)

    function roundRectPath(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function text(str, x, y, font, fill, align, outline) {
      ctx.font = font;
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      if (outline) {
        ctx.lineWidth = outline.width;
        ctx.strokeStyle = outline.color;
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = fill;
      ctx.fillText(str, x, y);
    }

    function cloud(x, y, s) {
      const puffs = [[0, 0, 18], [20, -8, 22], [44, 0, 18], [22, 6, 20]];
      for (let i = 0; i < puffs.length; i++) {
        ctx.beginPath();
        ctx.arc(x + puffs[i][0] * s, y + puffs[i][1] * s, puffs[i][2] * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function background(scroll) {
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, "#38b3c8");
      sky.addColorStop(0.6, "#7fd6dc");
      sky.addColorStop(1, "#cdf1e6");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < CLOUDS.length; i++) {
        const c = CLOUDS[i];
        cloud(mod(c[0] - scroll * 0.12, CLOUD_TILE) - 70, c[1], c[2]);
      }

      ctx.fillStyle = "#a9ddd5";
      const off = -mod(scroll * 0.3, SKYLINE_TILE);
      for (let k = 0; k < 2; k++) {
        for (let j = 0; j < SKYLINE.length; j++) {
          const b = SKYLINE[j];
          ctx.fillRect(off + k * SKYLINE_TILE + b[0], GROUND_Y - 20 - b[2], b[1], b[2] + 20);
        }
      }

      ctx.fillStyle = "#67d071";
      const hedge = -mod(scroll * 0.6, 40);
      for (let x = hedge - 40; x < W + 40; x += 40) {
        ctx.beginPath();
        ctx.arc(x + 20, GROUND_Y - 4, 24, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillRect(0, GROUND_Y - 6, W, 6);
    }

    function pipes(list) {
      for (let i = 0; i < list.length; i++) {
        const rects = pipeRects(list[i]);
        for (let k = 0; k < rects.length; k++) {
          const q = rects[k];
          const g = ctx.createLinearGradient(q.x, 0, q.x + q.w, 0);
          g.addColorStop(0, "#4b8a1c");
          g.addColorStop(0.3, "#a8e050");
          g.addColorStop(0.55, "#86c62e");
          g.addColorStop(1, "#4b8a1c");
          ctx.fillStyle = g;
          ctx.fillRect(q.x, q.y, q.w, q.h);
          ctx.strokeStyle = "#2f5a12";
          ctx.lineWidth = 2;
          ctx.strokeRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2);
        }
      }
    }

    function ground(scroll) {
      ctx.fillStyle = "#ded895";
      ctx.fillRect(0, GROUND_Y, W, GROUND_H);
      ctx.fillStyle = "#73bf2e";
      ctx.fillRect(0, GROUND_Y, W, 16);
      ctx.fillStyle = "#8fd644";
      const off = -mod(scroll, 24);
      for (let x = off - 24; x < W + 24; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y);
        ctx.lineTo(x + 12, GROUND_Y);
        ctx.lineTo(x + 4, GROUND_Y + 16);
        ctx.lineTo(x - 8, GROUND_Y + 16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#2f5a12";
      ctx.fillRect(0, GROUND_Y, W, 2);
      ctx.fillStyle = "#c9c07a";
      ctx.fillRect(0, GROUND_Y + 16, W, 3);
    }

    function bird(y, vy, state) {
      const target = state === "over" ? 1.35 : clamp(vy * 0.09, -0.5, 1.0);
      angle += (target - angle) * 0.25;
      wing += state === "playing" ? 0.45 : state === "ready" ? 0.22 : 0;

      ctx.save();
      ctx.translate(BIRD_X, y);
      ctx.rotate(angle);

      const body = ctx.createLinearGradient(0, -13, 0, 13);
      body.addColorStop(0, "#ffe27a");
      body.addColorStop(1, "#f6a51f");
      ctx.fillStyle = body;
      ctx.strokeStyle = "#6b3f0f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 12.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(1, 5, 10, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(-5, 3);
      ctx.rotate(Math.sin(wing) * 0.6 - 0.2);
      ctx.fillStyle = "#fff0b8";
      ctx.strokeStyle = "#6b3f0f";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(-3, 0, 8.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#6b3f0f";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(7, -5, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1d1d1f";
      ctx.beginPath();
      ctx.arc(9, -5, 2.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ff6a3d";
      ctx.strokeStyle = "#6b3f0f";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(14, 3.5, 6.5, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    function hudScore(score) {
      text(String(score), W / 2, 84, SCORE_FONT, "#ffffff", "center", { width: 8, color: "#1c2b3a" });
    }

    function readyOverlay(best) {
      text("Get ready", W / 2, 170, TITLE_FONT, "#ffffff", "center", { width: 8, color: "#1c2b3a" });
      text("Press Space or tap to flap", W / 2, 372, UI_FONT, "#ffffff", "center", { width: 5, color: "#1c2b3a" });
      if (best > 0) text("Best " + best, W / 2, 402, SMALL_FONT, "#ffffff", "center", { width: 4, color: "#1c2b3a" });
    }

    function gameOverOverlay(game, ui, now) {
      const t = game.overTicks;

      if (t < 10) {   // quick white flash on impact
        ctx.fillStyle = "rgba(255,255,255," + (0.7 * (1 - t / 10)).toFixed(3) + ")";
        ctx.fillRect(0, 0, W, H);
      }

      const fade = clamp((t - 8) / 12, 0, 1);
      if (fade <= 0) return;
      ctx.save();
      ctx.globalAlpha = fade;

      const px = 36, py = 150, pw = W - 72, ph = 250;
      roundRectPath(px, py, pw, ph, 18);
      ctx.fillStyle = "rgba(18,20,26,0.9)";
      ctx.fill();
      ctx.strokeStyle = "#2a2e3b";
      ctx.lineWidth = 2;
      ctx.stroke();

      text("Game Over", W / 2, py + 42, TITLE_FONT, "#e8e6e0", "center");

      text("Score", px + 34, py + 108, UI_FONT, "#8b8e9c", "left");
      text(String(game.finalScore), px + pw - 34, py + 108, '600 26px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace', "#e8e6e0", "right");
      text("Best", px + 34, py + 152, UI_FONT, "#8b8e9c", "left");
      text(String(ui.best), px + pw - 34, py + 152, '600 26px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace', "#e3a857", "right");
      if (ui.newBest) text("New best!", W / 2, py + 186, SMALL_FONT, "#e3a857", "center");

      const ready = t >= RESTART_DELAY_TICKS;
      const pulse = ready ? 0.65 + 0.35 * Math.sin(now / 260) : 0.25;
      ctx.globalAlpha = fade * pulse;
      text("Press Space to play again", W / 2, py + 222, UI_FONT, "#e8e6e0", "center");
      ctx.restore();
    }

    function pausedOverlay() {
      ctx.fillStyle = "rgba(18,20,26,0.62)";
      ctx.fillRect(0, 0, W, H);
      text("Paused", W / 2, 290, TITLE_FONT, "#e8e6e0", "center");
      text("Press Space to resume", W / 2, 336, UI_FONT, "#8b8e9c", "center");
    }

    function draw(game, ui, now) {
      background(game.scroll);
      pipes(game.pipes);
      ground(game.scroll);

      const b = game.bird;
      const y = b.y + (game.state === "ready" ? Math.sin(now / 220) * 6 : 0);
      bird(y, b.vy, game.state);

      if (game.state === "playing") hudScore(game.score);
      else if (game.state === "ready") readyOverlay(ui.best);
      else gameOverOverlay(game, ui, now);

      if (ui.paused) pausedOverlay();
    }

    return { draw: draw };
  }

  /* ------------------------------------------------------------------
   * Page wiring: canvas sizing, keyboard / pointer input, main loop.
   * ---------------------------------------------------------------- */
  function readBest() {
    try {
      return parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function writeBest(v) {
    try {
      window.localStorage.setItem(BEST_KEY, String(v));
    } catch (e) {
      /* storage blocked (private mode): the best score just won't persist */
    }
  }

  function boot() {
    const canvas = document.getElementById("game");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");

    const ui = { best: readBest(), newBest: false, paused: false };

    const game = createGame({
      onGameOver: function (finalScore) {
        ui.newBest = finalScore > ui.best;
        if (ui.newBest) {
          ui.best = finalScore;
          writeBest(ui.best);
        }
      },
    });
    if (window.__FLAPPY_DEBUG__) window.__flappy = { game: game, ui: ui };   // test hook only

    const renderer = createRenderer(ctx);

    // Crisp on high-DPI screens: back the canvas with real device pixels.
    let scale = 1;
    function fit() {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width || W;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      scale = (cssWidth * dpr) / W;
      const pw = Math.round(W * scale);
      const ph = Math.round(H * scale);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    }
    fit();
    window.addEventListener("resize", fit);
    if (window.ResizeObserver) new window.ResizeObserver(fit).observe(canvas);

    // Input: one action, three ways to trigger it.
    function onInput() {
      if (ui.paused) {
        ui.paused = false;   // first press after coming back just resumes
        return;
      }
      game.flap();
    }

    window.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // leave browser shortcuts alone
      const isFlapKey = e.code === "Space" || e.code === "ArrowUp" || e.key === " " || e.key === "ArrowUp";
      if (!isFlapKey) return;
      e.preventDefault();       // stop Space / ArrowUp from scrolling the page
      if (e.repeat) return;     // holding the key must not machine-gun flaps
      onInput();
    });
    canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      onInput();
    });

    // Don't let the bird die while the tab is in the background.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && game.state === "playing") ui.paused = true;
    });

    // Main loop: fixed-timestep physics, draw every animation frame.
    let last = null;
    let acc = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (last === null) last = now;
      let dt = now - last;
      last = now;
      if (dt > 100) dt = 100;   // returning from a throttled tab: don't fast-forward the game

      if (ui.paused) {
        acc = 0;
      } else {
        acc += dt;
        while (acc >= STEP_MS) {
          game.step();
          acc -= STEP_MS;
        }
      }

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderer.draw(game, ui, now);
    }
    requestAnimationFrame(frame);
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") boot();
  if (typeof module !== "undefined" && module.exports) module.exports = { createGame: createGame };
})();
