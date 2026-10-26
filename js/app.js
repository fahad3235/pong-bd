// Pong BD \u2014 browser wiring: canvas render, input, sound, persistence.
'use strict';
(function () {
  var L = window.PongLogic;
  var STR = window.I18N;
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var W = L.W, H = L.H;
  var STORE_KEY = 'pong-bd-v1';

  var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
  function toDigits(n, lang) {
    var s = String(n);
    if (lang !== 'bn') return s;
    return s.replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
  }

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage unavailable \u2014 defaults */ }
    return {};
  }
  function savePrefs() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
    } catch (e) { /* ignore */ }
  }

  var prefs = loadPrefs();
  var lang = prefs.lang === 'bn' ? 'bn' : 'en';
  var muted = prefs.muted === true;
  var state = L.createGame({
    difficulty: prefs.difficulty || 'medium',
    target: prefs.target || 7
  });
  var bestWins = prefs.bestWins || 0;

  // Audio: lazy AudioContext, created on the first user gesture.
  var audioCtx = null;
  function beep(freq, ms) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + ms / 1000);
    } catch (e) { /* audio unavailable \u2014 game continues silently */ }
  }

  var keys = {};
  var pointerY = null;
  var flash = '';
  var flashUntil = 0;

  function t(key) { return STR[lang][key]; }

  function renderText() {
    document.getElementById('title').textContent = t('title');
    document.getElementById('subtitle').textContent = t('subtitle');
    document.getElementById('lbl-you').textContent = t('you');
    document.getElementById('lbl-cpu').textContent = t('cpu');
    document.getElementById('lbl-difficulty').textContent = t('difficulty');
    document.getElementById('lbl-firstto').textContent = t('firstTo');
    document.getElementById('btn-start').textContent = t('start');
    document.getElementById('btn-pause').textContent = state.phase === 'paused' ? t('resume') : t('pause');
    document.getElementById('btn-restart').textContent = t('restart');
    document.getElementById('btn-sound').textContent = muted ? t('soundOff') : t('soundOn');
    document.getElementById('btn-lang').textContent = t('langBtn');
    document.getElementById('lbl-best').textContent = t('best');
    document.getElementById('how-title').textContent = t('howTitle');
    document.getElementById('how1').textContent = t('how1');
    document.getElementById('how2').textContent = t('how2');
    document.getElementById('how3').textContent = t('how3');
    document.getElementById('how4').textContent = t('how4');
    document.getElementById('footer').textContent = t('footer');
    var diffSel = document.getElementById('sel-difficulty');
    diffSel.options[0].text = t('easy');
    diffSel.options[1].text = t('medium');
    diffSel.options[2].text = t('hard');
    renderScores();
    renderOverlay();
  }

  function renderScores() {
    document.getElementById('score-you').textContent = toDigits(state.playerScore, lang);
    document.getElementById('score-cpu').textContent = toDigits(state.aiScore, lang);
    document.getElementById('best-val').textContent = toDigits(bestWins, lang);
    document.getElementById('score-target').textContent =
      '(' + t('firstTo') + ' ' + toDigits(state.target, lang) + ')';
  }

  function renderOverlay() {
    var el = document.getElementById('overlay');
    var msg = '';
    if (state.phase === 'ready') msg = t('ready');
    else if (state.phase === 'paused') msg = t('paused');
    else if (state.phase === 'over') msg = state.winner === 'player' ? t('youWin') : t('cpuWin');
    else if (flash && Date.now() < flashUntil) msg = flash;
    el.textContent = msg;
    el.classList.toggle('hidden', msg === '');
  }

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(20, state.playerY - L.PADDLE_H / 2, L.PADDLE_W, L.PADDLE_H);
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(W - 20 - L.PADDLE_W, state.aiY - L.PADDLE_H / 2, L.PADDLE_W, L.PADDLE_H);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, L.BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  function syncControls() {
    document.getElementById('sel-difficulty').value = state.difficulty;
    document.getElementById('sel-target').value = String(state.target);
    document.getElementById('btn-pause').textContent = state.phase === 'paused' ? t('resume') : t('pause');
  }

  var last = null;
  function frame(ts) {
    if (last === null) last = ts;
    var dt = Math.min((ts - last) / 1000, 1 / 30);
    last = ts;
    if (state.phase === 'playing') {
      var dir = 0;
      if (keys['ArrowUp'] || keys['w'] || keys['W']) dir = -1;
      if (keys['ArrowDown'] || keys['s'] || keys['S']) dir = 1;
      var prevEvent = state.lastEvent;
      var prevWinner = state.winner;
      L.step(state, dt, { dir: dir, targetY: pointerY });
      if (state.lastEvent === 'paddle') beep(660, 40);
      if (state.lastEvent === 'wall') beep(330, 30);
      if (state.lastEvent === 'point') {
        flash = state.lastScorer === 'player' ? t('pointYou') : t('pointCpu');
        flashUntil = Date.now() + 1200;
        beep(state.lastScorer === 'player' ? 880 : 220, 120);
      }
      if (state.lastEvent === 'win') {
        if (state.winner === 'player') {
          bestWins += 1;
          prefs.bestWins = bestWins;
          savePrefs();
        }
        beep(state.winner === 'player' ? 990 : 196, 300);
      }
      if (prevEvent !== state.lastEvent || prevWinner !== state.winner) renderScores();
      renderOverlay();
    }
    draw();
    requestAnimationFrame(frame);
  }

  function canvasPointer(e) {
    var rect = canvas.getBoundingClientRect();
    var y = (e.clientY - rect.top) * (H / rect.height);
    pointerY = Math.max(L.PADDLE_H / 2, Math.min(H - L.PADDLE_H / 2, y));
  }
  canvas.addEventListener('mousemove', canvasPointer);
  canvas.addEventListener('touchstart', function (e) { e.preventDefault(); canvasPointer(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); canvasPointer(e.touches[0]); }, { passive: false });
  document.addEventListener('keydown', function (e) {
    keys[e.key] = true;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.key] = false; });

  document.getElementById('btn-start').addEventListener('click', function () {
    L.start(state);
    syncControls();
    renderOverlay();
  });
  document.getElementById('btn-pause').addEventListener('click', function () {
    L.togglePause(state);
    syncControls();
    renderOverlay();
  });
  document.getElementById('btn-restart').addEventListener('click', function () {
    L.resetMatch(state);
    syncControls();
    renderScores();
    renderOverlay();
  });
  document.getElementById('btn-sound').addEventListener('click', function () {
    muted = !muted;
    prefs.muted = muted;
    savePrefs();
    renderText();
  });
  document.getElementById('btn-lang').addEventListener('click', function () {
    lang = lang === 'en' ? 'bn' : 'en';
    prefs.lang = lang;
    savePrefs();
    renderText();
  });
  document.getElementById('sel-difficulty').addEventListener('change', function (e) {
    state.difficulty = e.target.value;
    prefs.difficulty = state.difficulty;
    savePrefs();
    L.resetMatch(state);
    syncControls();
    renderScores();
    renderOverlay();
  });
  document.getElementById('sel-target').addEventListener('change', function (e) {
    state.target = parseInt(e.target.value, 10);
    prefs.target = state.target;
    savePrefs();
    L.resetMatch(state);
    syncControls();
    renderScores();
    renderOverlay();
  });

  // Test hook for the headless-Chrome smoke test.
  window.__pong = {
    getState: function () {
      return {
        phase: state.phase,
        playerScore: state.playerScore,
        aiScore: state.aiScore,
        playerY: Math.round(state.playerY),
        aiY: Math.round(state.aiY),
        ballX: Math.round(state.ball.x),
        ballY: Math.round(state.ball.y),
        ballVx: Math.round(state.ball.vx),
        difficulty: state.difficulty,
        target: state.target,
        winner: state.winner
      };
    }
  };

  // Init from prefs.
  document.getElementById('sel-difficulty').value = state.difficulty;
  document.getElementById('sel-target').value = String(state.target);
  renderText();
  draw();
  requestAnimationFrame(frame);
})();
