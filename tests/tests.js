// Pong BD \u2014 Node unit tests for js/logic.js. Run: node tests/tests.js
'use strict';
var L = require('../js/logic.js');
var pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok:', label); }
  else { fail++; console.error('FAIL:', label, extra !== undefined ? '(' + extra + ')' : ''); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + a + ', want ' + b); }
function approx(a, b, tol, label) { ok(Math.abs(a - b) <= tol, label, 'got ' + a + ', want ~' + b); }
var R = L.BALL_R;

// --- construction ---
var g = L.createGame({});
eq(g.phase, 'ready', 'default phase ready');
eq(g.playerScore, 0, 'default player score 0');
eq(g.target, 7, 'default target 7');
eq(g.difficulty, 'medium', 'default difficulty medium');
var gBad = L.createGame({ difficulty: 'insane', target: 9 });
eq(gBad.difficulty, 'medium', 'invalid difficulty falls back to medium');
eq(gBad.target, 7, 'invalid target falls back to 7');

// --- serve / start ---
L.start(g);
eq(g.phase, 'playing', 'start sets playing');
eq(g.ball.x, 300, 'serve centers ball x');
eq(g.ball.y, 200, 'serve centers ball y');
eq(g.ball.vx, 300, 'serve dir 1 gives +300 vx');
eq(g.ball.vy, 0, 'serve angle 0 gives vy 0');

// --- wall bounce ---
var w = L.createGame({});
L.start(w);
w.ball.y = R; w.ball.vy = -200; w.ball.vx = 0;
L.step(w, 0.016, {}, function () { return 0.5; });
ok(w.ball.vy > 0, 'top wall flips vy', w.ball.vy);
eq(w.lastEvent, 'wall', 'wall sets lastEvent');

// --- player paddle bounce, center hit ---
var p = L.createGame({});
L.start(p);
p.ball.x = 40; p.ball.y = 200; p.ball.vx = -300; p.ball.vy = 0; p.playerY = 200;
L.step(p, 0.016, {}, function () { return 0.5; });
ok(p.ball.vx > 0, 'player paddle reverses ball', p.ball.vx);
approx(p.speed, 315, 0.01, 'speed grows 300 -> 315 after one hit');
eq(p.rally, 1, 'rally increments');
eq(p.lastEvent, 'paddle', 'paddle sets lastEvent');

// --- paddle angle: top-edge hit sends ball up ---
var a = L.createGame({});
L.start(a);
a.ball.x = 40; a.ball.y = 200 - 40; a.ball.vx = -300; a.ball.vy = 0; a.playerY = 200;
L.step(a, 0.016, {}, function () { return 0.5; });
ok(a.ball.vy < 0, 'top-edge hit angles ball upward', a.ball.vy);
approx(Math.abs(a.ball.vy), 315 * Math.sin(Math.PI / 3), 1, 'edge hit uses 60-degree angle');

// --- AI paddle bounce ---
var ai = L.createGame({});
L.start(ai);
ai.ball.x = 560; ai.ball.y = 200; ai.ball.vx = 300; ai.ball.vy = 0; ai.aiY = 200;
L.step(ai, 0.016, {}, function () { return 0.5; });
ok(ai.ball.vx < 0, 'AI paddle reverses ball', ai.ball.vx);

// --- swept tunneling: very fast ball still bounces ---
var t1 = L.createGame({});
L.start(t1);
t1.ball.x = 60; t1.ball.y = 200; t1.ball.vx = -720; t1.ball.vy = 0; t1.playerY = 200;
L.step(t1, 0.05, {}, function () { return 0.5; });
ok(t1.ball.vx > 0, 'fast ball cannot tunnel through player paddle', t1.ball.vx);

// --- scoring: miss on the left ---
var s = L.createGame({});
L.start(s);
s.ball.x = 5; s.ball.y = 50; s.ball.vx = -300; s.ball.vy = 0; s.playerY = 300;
L.step(s, 0.05, {}, function () { return 0.5; });
eq(s.aiScore, 1, 'left miss scores for AI');
eq(s.lastScorer, 'ai', 'lastScorer records AI');
eq(s.lastEvent, 'point', 'point sets lastEvent');
ok(s.ball.vx < 0, 'after AI point, ball serves toward the player', s.ball.vx);

// --- win at target ---
var win = L.createGame({ target: 5 });
L.start(win);
win.playerScore = 4;
win.ball.x = 595; win.ball.y = 50; win.ball.vx = 300; win.ball.vy = 0; win.aiY = 300;
L.step(win, 0.05, {}, function () { return 0.5; });
eq(win.playerScore, 5, 'reaching target scores the win point');
eq(win.phase, 'over', 'phase becomes over at target');
eq(win.winner, 'player', 'winner is player');

// --- speed cap ---
var cap = L.createGame({});
L.start(cap);
cap.speed = 700;
cap.ball.x = 40; cap.ball.y = 200; cap.ball.vx = -700; cap.ball.vy = 0; cap.playerY = 200;
L.step(cap, 0.016, {}, function () { return 0.5; });
eq(cap.speed, 720, 'speed caps at MAX_SPEED 720');

// --- foldY / predictY ---
eq(L.foldY(450), 350, 'foldY reflects past bottom wall');
eq(L.foldY(-50), 50, 'foldY reflects above top wall');
eq(L.foldY(800), 0, 'foldY at full period');
eq(L.predictY({ x: 300, y: 100, vx: 300, vy: 0 }, 570), 100, 'predictY straight ball');
approx(L.predictY({ x: 300, y: 100, vx: 300, vy: 150 }, 570), 235, 0.01, 'predictY angled ball');
eq(L.predictY({ x: 300, y: 100, vx: -300, vy: 0 }, 570), 200, 'predictY moving away returns center');

// --- AI targeting ---
var hard = L.createGame({ difficulty: 'hard' });
L.start(hard);
hard.ball.x = 300; hard.ball.y = 100; hard.ball.vx = 300; hard.ball.vy = 0;
hard.aiTimer = 0; hard.aiY = 200;
L.step(hard, 0.016, {}, function () { return 0.5; });
eq(hard.aiTargetY, 100, 'hard AI targets predicted ball y exactly');
ok(hard.aiY < 200, 'hard AI moves toward target', hard.aiY);
var easy = L.createGame({ difficulty: 'easy' });
L.start(easy);
easy.ball.x = 300; easy.ball.y = 100; easy.ball.vx = 300; easy.ball.vy = 0;
easy.aiTimer = 0;
L.step(easy, 0.016, {}, function () { return 0; }); // rng 0 -> error -60
eq(easy.aiTargetY, 40, 'easy AI applies -60 error at rng 0 (clamped to paddle range)');

// --- paddle clamp + pointer tracking ---
var cl = L.createGame({});
L.start(cl);
cl.playerY = 40;
L.step(cl, 0.1, { dir: -1 }, function () { return 0.5; });
eq(cl.playerY, 40, 'player paddle clamps at top');
var tr = L.createGame({});
L.start(tr);
tr.playerY = 200;
L.step(tr, 0.1, { targetY: 300 }, function () { return 0.5; });
eq(tr.playerY, 290, 'pointer tracking moves at 900 px/s (200 -> 290 in 0.1s)');

// --- pause / reset ---
var pz = L.createGame({});
L.start(pz);
L.togglePause(pz);
eq(pz.phase, 'paused', 'togglePause pauses');
L.togglePause(pz);
eq(pz.phase, 'playing', 'togglePause resumes');
pz.playerScore = 3;
L.resetMatch(pz);
eq(pz.phase, 'ready', 'resetMatch returns to ready');
eq(pz.playerScore, 0, 'resetMatch clears scores');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
