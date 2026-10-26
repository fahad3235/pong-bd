// Pong BD \u2014 headless-Chrome smoke test via raw CDP (Node 24 global WebSocket).
// No npm dependencies. Run: node tests/smoke.js
// Chrome is spawned by this script on port 9223 and killed at the end.
'use strict';
const { spawn } = require('child_process');
const FILE = 'file:///home/hatch/workspace/muse-project-factory/builds/pong-bd/index.html';
const CHROME = '/opt/meta-chromium/chrome';
const PORT = 9223;
let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok:', label); }
  else { fail++; console.error('FAIL:', label, extra !== undefined ? '(' + extra + ')' : ''); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = [];
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = res; this.ws.onerror = rej;
    });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    };
  }
  send(method, params) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  on(fn) { this.handlers.push(fn); }
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function waitForDebugger() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) return;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('chrome debugger port did not come up');
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--remote-debugging-address=127.0.0.1',
    'about:blank'
  ], { stdio: 'ignore' });
  const errors = [], net = [];
  let cdp = null;
  try {
    await waitForDebugger();
    const tabs = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(FILE), { method: 'PUT' })).json();
    cdp = new CDP(tabs.webSocketDebuggerUrl);
    await cdp.ready;
    cdp.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception.description || ''));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console: ' + JSON.stringify(m.params.args.map(a => a.value)));
      if (m.method === 'Network.requestWillBeSent') {
        const u = m.params.request.url;
        if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) net.push(u);
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    const loadFired = new Promise((res) => {
      const h = (m) => { if (m.method === 'Page.loadEventFired') res(); };
      cdp.on(h);
    });
    await cdp.send('Page.navigate', { url: FILE });
    await Promise.race([loadFired, sleep(5000)]);
    await sleep(600);

    ok(await cdp.evalExpr('document.title') === 'Pong BD \u2014 Classic Pong vs CPU', 'page title');
    ok(await cdp.evalExpr("document.getElementById('title').textContent") === 'Pong BD', 'h1 renders');
    ok(await cdp.evalExpr("document.getElementById('game-canvas').width === 600 && document.getElementById('game-canvas').height === 400"), 'canvas 600x400');
    let st = await cdp.evalExpr('window.__pong.getState()');
    ok(st.phase === 'ready' && st.playerScore === 0 && st.aiScore === 0 && st.target === 7, 'initial state ready/0/0/target 7');
    ok(await cdp.evalExpr("!document.getElementById('overlay').classList.contains('hidden')"), 'ready overlay visible');

    await cdp.evalExpr("document.getElementById('btn-start').click()");
    await sleep(400);
    st = await cdp.evalExpr('window.__pong.getState()');
    ok(st.phase === 'playing', 'start sets phase playing');
    const bx0 = st.ballX;
    await sleep(400);
    st = await cdp.evalExpr('window.__pong.getState()');
    ok(st.ballX !== bx0 || st.ballY !== 200, 'ball moves after start (x ' + bx0 + ' -> ' + st.ballX + ')');

    // ArrowDown key via CDP input moves the player paddle down.
    const y0 = (await cdp.evalExpr('window.__pong.getState()')).playerY;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await sleep(300);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    st = await cdp.evalExpr('window.__pong.getState()');
    ok(st.playerY > y0, 'ArrowDown moves paddle down (' + y0 + ' -> ' + st.playerY + ')');

    await cdp.evalExpr("document.getElementById('btn-pause').click()");
    await sleep(200);
    st = await cdp.evalExpr('window.__pong.getState()');
    ok(st.phase === 'paused', 'pause button pauses');
    await cdp.evalExpr("document.getElementById('btn-pause').click()");
    await sleep(200);
    st = await cdp.evalExpr('window.__pong.getState()');
    ok(st.phase === 'playing', 'pause button resumes');

    await cdp.evalExpr("document.getElementById('btn-lang').click()");
    await sleep(200);
    ok(await cdp.evalExpr("document.getElementById('title').textContent") === '\u09aa\u0982 \u09ac\u09bf\u09a1\u09bf', 'language toggle switches title to Bengali');
    await cdp.evalExpr("document.getElementById('btn-lang').click()");
    await sleep(200);
    ok(await cdp.evalExpr("document.getElementById('title').textContent") === 'Pong BD', 'language toggle switches back');

    await cdp.evalExpr("document.getElementById('btn-restart').click()");
    await sleep(300);
    st = await cdp.evalExpr('window.__pong.getState()');
    ok(st.phase === 'ready' && st.playerScore === 0 && st.aiScore === 0, 'restart resets state');

    ok(errors.length === 0, 'zero console/page errors' + (errors.length ? ' (' + errors.join('; ') + ')' : ''));
    ok(net.length === 0, 'zero network requests' + (net.length ? ' (' + net.join(', ') + ')' : ''));

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    ok(await cdp.evalExpr('document.documentElement.scrollWidth <= window.innerWidth + 1'), '390px viewport: no horizontal overflow');
  } finally {
    if (cdp) cdp.close();
    try { chrome.kill('SIGKILL'); } catch (e) {}
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH:', e); process.exit(1); });
