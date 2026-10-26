// Pong BD \u2014 DOM-free game logic. Pure functions + a mutable state object,
// so the same code runs in the browser and under Node unit tests.
'use strict';

var W = 600, H = 400;
var PADDLE_W = 10, PADDLE_H = 80, BALL_R = 7;
var BASE_SPEED = 300, MAX_SPEED = 720, SPEED_GAIN = 1.05;
var PLAYER_SPEED = 460, PLAYER_TRACK_SPEED = 900;
var MAX_ANGLE = Math.PI / 3; // 60 degrees

var AI_PARAMS = {
  easy:   { speed: 190, interval: 0.18, error: 60 },
  medium: { speed: 320, interval: 0.08, error: 25 },
  hard:   { speed: 460, interval: 0.03, error: 0 }
};

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// Mirror-fold a y coordinate into [0, H] across repeated wall bounces.
function foldY(y) {
  var period = 2 * H;
  var m = ((y % period) + period) % period;
  return m > H ? period - m : m;
}

// Where will the ball be vertically when it reaches x = targetX?
// Returns H/2 when the ball is moving away from that side.
function predictY(ball, targetX) {
  if (targetX > W / 2 && ball.vx <= 0) return H / 2;
  if (targetX < W / 2 && ball.vx >= 0) return H / 2;
  var t = (targetX - ball.x) / ball.vx;
  if (t < 0) return H / 2;
  return foldY(ball.y + ball.vy * t);
}

function createGame(opts) {
  opts = opts || {};
  var difficulty = AI_PARAMS[opts.difficulty] ? opts.difficulty : 'medium';
  var target = opts.target || 7;
  if (target !== 5 && target !== 7 && target !== 11) target = 7;
  return {
    phase: 'ready',
    difficulty: difficulty,
    target: target,
    playerScore: 0,
    aiScore: 0,
    playerY: H / 2,
    aiY: H / 2,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    speed: BASE_SPEED,
    rally: 0,
    serveDir: 1,
    winner: null,
    aiTargetY: H / 2,
    aiTimer: 0,
    lastScorer: null, // 'player' | 'ai' \u2014 set by scorePoint
    lastEvent: null // 'paddle' | 'wall' | 'point' | 'win' | null
  };
}

function serve(state, dir, angleDeg) {
  var angle = (angleDeg || 0) * Math.PI / 180;
  state.ball.x = W / 2;
  state.ball.y = H / 2;
  state.speed = BASE_SPEED;
  state.rally = 0;
  state.serveDir = dir >= 0 ? 1 : -1;
  state.ball.vx = state.serveDir * BASE_SPEED * Math.cos(angle);
  state.ball.vy = BASE_SPEED * Math.sin(angle);
  // Note: serve deliberately does NOT clear lastEvent \u2014 step() clears it
  // once per frame, and scorePoint sets 'point' before calling serve.
}

function start(state) {
  if (state.phase === 'ready' || state.phase === 'over') {
    state.playerScore = 0;
    state.aiScore = 0;
    state.winner = null;
    state.playerY = H / 2;
    state.aiY = H / 2;
  }
  state.phase = 'playing';
  serve(state, state.serveDir, 0);
}

function togglePause(state) {
  if (state.phase === 'playing') state.phase = 'paused';
  else if (state.phase === 'paused') state.phase = 'playing';
}

function resetMatch(state) {
  var fresh = createGame({ difficulty: state.difficulty, target: state.target });
  Object.keys(fresh).forEach(function (k) { state[k] = fresh[k]; });
}

function movePaddleToward(state, which, targetY, maxDelta) {
  var cur = which === 'player' ? state.playerY : state.aiY;
  var diff = targetY - cur;
  var step = clamp(diff, -maxDelta, maxDelta);
  var next = clamp(cur + step, PADDLE_H / 2, H - PADDLE_H / 2);
  if (which === 'player') state.playerY = next; else state.aiY = next;
}

function bounceOffPaddle(state, which) {
  var paddleY = which === 'player' ? state.playerY : state.aiY;
  var rel = clamp((state.ball.y - paddleY) / (PADDLE_H / 2), -1, 1);
  var angle = rel * MAX_ANGLE;
  state.speed = Math.min(state.speed * SPEED_GAIN, MAX_SPEED);
  var dir = which === 'player' ? 1 : -1;
  state.ball.vx = dir * state.speed * Math.cos(angle);
  state.ball.vy = state.speed * Math.sin(angle);
  state.rally += 1;
  state.lastEvent = 'paddle';
  // Push the ball out of the paddle so it cannot re-trigger next frame.
  if (which === 'player') state.ball.x = 20 + PADDLE_W + BALL_R;
  else state.ball.x = W - 20 - PADDLE_W - BALL_R;
}

function scorePoint(state, scorer) {
  state.lastScorer = scorer;
  if (scorer === 'player') state.playerScore += 1;
  else state.aiScore += 1;
  var won = state.playerScore >= state.target || state.aiScore >= state.target;
  if (won) {
    state.winner = state.playerScore >= state.target ? 'player' : 'ai';
    state.phase = 'over';
    state.lastEvent = 'win';
    state.ball.vx = 0;
    state.ball.vy = 0;
  } else {
    state.lastEvent = 'point';
    // Serve toward the player who just conceded the point.
    serve(state, scorer === 'player' ? 1 : -1, 0);
  }
}

// input: { dir: -1|0|1 (keyboard), targetY: number|null (pointer) }
// rng: function returning [0,1) \u2014 injectable for deterministic tests.
function step(state, dt, input, rng) {
  state.lastEvent = null;
  if (state.phase !== 'playing') return;
  input = input || {};
  rng = rng || Math.random;

  // Player paddle.
  if (typeof input.targetY === 'number') {
    movePaddleToward(state, 'player', input.targetY, PLAYER_TRACK_SPEED * dt);
  } else if (input.dir) {
    var next = state.playerY + input.dir * PLAYER_SPEED * dt;
    state.playerY = clamp(next, PADDLE_H / 2, H - PADDLE_H / 2);
  }

  // AI paddle.
  var params = AI_PARAMS[state.difficulty];
  state.aiTimer -= dt;
  if (state.aiTimer <= 0) {
    state.aiTimer = params.interval;
    var predicted = predictY(state.ball, W - 20 - PADDLE_W);
    var err = params.error ? (rng() * 2 - 1) * params.error : 0;
    state.aiTargetY = clamp(predicted + err, PADDLE_H / 2, H - PADDLE_H / 2);
  }
  movePaddleToward(state, 'ai', state.aiTargetY, params.speed * dt);

  // Ball (swept paddle checks below use the pre-move x, so a fast ball
  // cannot tunnel through a paddle between frames).
  var b = state.ball;
  var prevX = b.x;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); state.lastEvent = 'wall'; }
  if (b.y + BALL_R > H) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy); state.lastEvent = 'wall'; }

  // Player paddle collision: ball crossed the paddle plane moving left.
  if (b.vx < 0 && prevX - BALL_R > 20 + PADDLE_W && b.x - BALL_R <= 20 + PADDLE_W &&
      Math.abs(b.y - state.playerY) <= PADDLE_H / 2 + BALL_R) {
    bounceOffPaddle(state, 'player');
  }
  // AI paddle collision: ball crossed the paddle plane moving right.
  if (b.vx > 0 && prevX + BALL_R < W - 20 - PADDLE_W && b.x + BALL_R >= W - 20 - PADDLE_W &&
      Math.abs(b.y - state.aiY) <= PADDLE_H / 2 + BALL_R) {
    bounceOffPaddle(state, 'ai');
  }

  // Scoring.
  if (b.x < -BALL_R) scorePoint(state, 'ai');
  else if (b.x > W + BALL_R) scorePoint(state, 'player');
}

var PongLogic = {
  W: W, H: H, PADDLE_W: PADDLE_W, PADDLE_H: PADDLE_H, BALL_R: BALL_R,
  BASE_SPEED: BASE_SPEED, MAX_SPEED: MAX_SPEED,
  AI_PARAMS: AI_PARAMS,
  clamp: clamp, foldY: foldY, predictY: predictY,
  createGame: createGame, serve: serve, start: start,
  togglePause: togglePause, resetMatch: resetMatch, step: step
};

if (typeof module !== 'undefined' && module.exports) module.exports = PongLogic;
if (typeof window !== 'undefined') window.PongLogic = PongLogic;
