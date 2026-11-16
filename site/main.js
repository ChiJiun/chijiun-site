import { me, interests, research, experience, projects, more, skills, cats, contact, repoUrl } from './data.js?v=8e6d4d55';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const ext = (a, href) => { a.href = href; a.target = '_blank'; a.rel = 'noreferrer'; return a; };
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const smooth = reduced ? 'auto' : 'smooth';

// ---------- content ----------
$('tagline').textContent = `${me.zh} · ${me.tagline}`;
$('intro').textContent = me.intro;
$('motto').textContent = me.motto;
const h1 = $('name');
h1.setAttribute('aria-label', me.en);
const letters = [];
me.en.split(' ').forEach((word) => {
  const w = el('span', 'w');
  w.setAttribute('aria-hidden', 'true');
  [...word].forEach((c) => { const s = el('span', 'ch', c); letters.push(s); w.append(s); });
  h1.append(w);
});
{
  const first = el('a', 'btn main', '看研究');
  first.href = '#research';
  $('links').append(first, ...me.links.map((l) => ext(el('a', 'btn', l.label), l.href)));
}

interests.forEach((i) => {
  const box = el('div', 'interest rise');
  box.append(el('h3', '', i.title), el('p', '', i.text));
  $('interests').append(box);
});

research.forEach((r) => {
  const box = el('article', 'panel study rise');
  const head = el('div', 'study-head');
  head.append(el('h3', '', r.title), el('span', 'date', r.date));
  box.append(head, el('p', 'org', r.org));
  if (r.flow) {
    const flow = el('ol', 'flow');
    flow.setAttribute('aria-label', '流程');
    r.flow.forEach((f) => { const li = el('li'); li.append(el('span', '', f)); flow.append(li); });
    box.append(flow);
  }
  const ul = el('ul', 'points');
  ul.setAttribute('role', 'list'); // list-style: none 會讓 Safari 的 VoiceOver 不再把它念成清單
  r.points.forEach((p) => {
    // 「問題：…」「做法：…」這類短標籤拆出來，讓四個重點一眼分得開。
    const m = p.match(/^([^：，。、]{2,4})：(.+)$/s);
    const li = el('li');
    if (m) li.append(el('span', 'k', `${m[1]}：`), m[2]);
    else li.textContent = p;
    ul.append(li);
  });
  box.append(ul, ext(el('a', 'more-link', `${r.link.label} →`), r.link.href));
  $('studies').append(box);
});

projects.forEach((p) => {
  const li = el('li', 'rise');
  const a = ext(el('a', 'card'), p.href);
  const top = el('div', 'top');
  top.append(el('span', '', p.tag), el('span', '', p.year));
  const chips = el('div', 'chips');
  p.stack.forEach((s) => chips.append(el('span', 'chip', s)));
  a.append(top, el('h3', '', p.title), el('span', 'sub', p.sub), el('p', '', p.desc), el('p', 'note', p.note), chips);
  li.append(a);
  $('cards').append(li);
});

more.forEach((m) => {
  const li = el('li');
  const title = el('b');
  if (m.href) title.append(ext(el('a', '', m.title), m.href));
  else title.textContent = m.title;
  li.append(title, el('span', '', m.text));
  $('more').append(li);
});

for (const c of Object.values(cats)) {
  const s = el('span', '', c.label);
  s.style.setProperty('--c', c.color);
  $('legend').append(s);
}

// ---------- status bar ----------
const IDLE = finePointer ? '字母鍵：技能 · 1–4：區塊 · :：指令 · Ctrl K：搜尋' : '點鍵帽看技能 · 右上角開指令面板';
const stMsg = $('st-msg');
let sayTimer = 0;
stMsg.textContent = IDLE;
function say(text) {
  stMsg.textContent = text;
  stMsg.classList.add('say');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { stMsg.textContent = IDLE; stMsg.classList.remove('say'); }, 4200);
}
const contactOn = Boolean(contact.accessKey || contact.email);
const SECTIONS = [['top', 'about.md'], ['research', 'research.md'], ['experience', 'experience/'], ['projects', 'projects.md']];
if (contactOn) {
  $('contact').hidden = false;
  $('nav-contact').hidden = false;
  SECTIONS.push(['contact', 'contact.md']);
}
function onScroll() {
  const max = root.scrollHeight - innerHeight;
  $('st-pos').textContent = `${max > 0 ? Math.round((scrollY / max) * 100) : 0}%`;
  let name = SECTIONS[0][1];
  for (const [id, file] of SECTIONS) if ($(id).getBoundingClientRect().top < innerHeight * 0.45) name = file;
  $('st-file').textContent = name;
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();
const goTo = (id) => (id === 'top' ? scrollTo({ top: 0, behavior: smooth }) : $(id).scrollIntoView({ behavior: smooth }));

// ---------- dot-field background (fallback when the hero shader is off) ----------
// Named `flow` for its two callers: burst() on key presses, recolor() on theme change.
const flow = (() => {
  const cv = $('bg');
  const ctx = cv.getContext('2d');
  const GAP = 32, R = 140, LIFE = 1400;
  const mouse = { x: -9999, y: -9999 };
  let W = 0, H = 0, pts = [], ripples = [], ink = '', raf = 0, on = false;

  const readColors = () => { ink = getComputedStyle(root).getPropertyValue('--ink').trim(); };
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgb(${ink})`;
    for (const p of pts) {
      const disp = Math.hypot(p.x - p.ox, p.y - p.oy);
      ctx.globalAlpha = Math.min(1, 0.16 + disp / 12);
      const size = 1.3 + Math.min(2.4, disp / 5);
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
  function resize() {
    if (!on) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pts = [];
    for (let y = GAP / 2; y < H; y += GAP) for (let x = GAP / 2; x < W; x += GAP) pts.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
    draw();
  }
  function step() {
    const now = performance.now();
    ripples = ripples.filter((r) => now - r.t < LIFE);
    let energy = 0;
    for (const p of pts) {
      let fx = (p.ox - p.x) * 0.06, fy = (p.oy - p.y) * 0.06;
      const mx = p.x - mouse.x, my = p.y - mouse.y, md = Math.hypot(mx, my) || 1;
      if (md < R) { const f = (1 - md / R) * 2.4; fx += (mx / md) * f; fy += (my / md) * f; }
      for (const r of ripples) {
        const age = (now - r.t) / LIFE, rx = p.ox - r.x, ry = p.oy - r.y, rd = Math.hypot(rx, ry) || 1;
        const diff = Math.abs(rd - age * 560);
        if (diff < 44) { const f = (1 - diff / 44) * (1 - age) * 1.8; fx += (rx / rd) * f; fy += (ry / rd) * f; }
      }
      p.vx = (p.vx + fx) * 0.82; p.vy = (p.vy + fy) * 0.82;
      p.x += p.vx; p.y += p.vy;
      energy += Math.abs(p.vx) + Math.abs(p.vy);
    }
    draw();
    raf = energy > 0.6 || ripples.length ? requestAnimationFrame(step) : 0;
  }
  const wake = () => { if (on && !raf && !reduced) raf = requestAnimationFrame(step); };
  const ripple = (x, y) => { if (!on) return; ripples.push({ x, y, t: performance.now() }); wake(); };
  const leave = () => { mouse.x = mouse.y = -9999; wake(); };

  addEventListener('resize', resize);
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; wake(); });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('.key')) ripple(e.clientX, e.clientY); });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(); });
  addEventListener('pointercancel', leave);
  root.addEventListener('pointerleave', leave);

  return {
    burst: ripple,
    recolor() { if (on) { readColors(); draw(); } },
    enable() { if (on) return; on = true; readColors(); resize(); },
    disable() {
      if (!on) return;
      on = false;
      cancelAnimationFrame(raf); raf = 0; ripples = [];
      ctx.clearRect(0, 0, W, H);
    },
  };
})();

// ---------- hero shader (WebGPU, shaders.com) ----------
// A dithered noise field behind the hero: noise is what differential privacy adds, so it is the
// one decorative thing on the page. Loaded lazily and only where it is cheap: wide screens with
// WebGPU, no reduced-motion, no data-saver. Everywhere else the dot field above takes over.
const fx = (() => {
  const cv = $('fx');
  // The same query as the CSS breakpoint that hides #fx, so the two can never disagree.
  const narrow = matchMedia('(max-width: 980px)');
  // Read live rather than once at load: the CSS hides #fx the moment reduced motion is switched on.
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const BASE = 0.42, AIM = { x: 1, y: 0.2 };
  // off: the visitor switched it off (:fx). dead: this browser cannot run it, so never try again.
  let shader = null, raf = 0, seen = true, off = false, dead = false, busy = false, wired = false;
  try { off = localStorage.getItem('fx') === 'off'; } catch {}
  let aimX = AIM.x, aimY = AIM.y, curX = AIM.x, curY = AIM.y, aimRaf = 0;
  const aimTick = () => {
    curX += (aimX - curX) * 0.06; curY += (aimY - curY) * 0.06;
    shader?.update('mask', { center: { x: curX, y: curY } });
    aimRaf = shader && Math.abs(aimX - curX) + Math.abs(aimY - curY) > 0.0005 ? requestAnimationFrame(aimTick) : 0;
  };
  const color = () => getComputedStyle(root).getPropertyValue('--fx').trim();
  // Everything that can be decided without loading the bundle: can it run here, and is it wanted.
  const able = () => !dead && 'gpu' in navigator && !calm.matches && !narrow.matches && !navigator.connection?.saveData;
  const eligible = () => !off && able();
  // The mask radius is measured in canvas heights. Cap it by the aspect ratio so that on tall
  // windows the field still stops short of the text column.
  const radius = () => Math.min(1.5, (0.9 * cv.clientWidth) / Math.max(1, cv.clientHeight));
  const fit = () => { if (cv.clientHeight) shader?.update('mask', { radius: radius() }); };
  const sync = () => {
    if (!shader) return;
    const show = !off && !narrow.matches && !calm.matches;
    if (show && seen && !document.hidden) shader.resume(); else shader.pause();
    root.classList.toggle('fx-on', show);
    if (show) flow.disable(); else flow.enable();
  };
  async function start() {
    if (shader) return true;
    if (busy || !eligible()) return false;
    busy = true;
    // If the download or the GPU setup hangs, do not leave the page without a background.
    const slow = setTimeout(flow.enable, 6000);
    try {
      // Cheap check before fetching 1.3 MB: WebGPU can exist without a usable adapter.
      if (!(await navigator.gpu.requestAdapter().catch(() => null))) { dead = true; return false; }
      const { createShader } = await import('./vendor/shaders-4.0.7.min.js?v=d9c44cac');
      // createShader pins the canvas to its current pixel size unless a CSS size is already set inline.
      cv.style.width = '100%'; cv.style.height = '100%';
      // onError also fires for device losses the library recovers from; only a terminal one has a failure reason.
      const onError = () => {
        if (!shader?.getFailureReason()) return;
        shader = null; dead = true;
        root.classList.remove('fx-on');
        flow.enable();
      };
      const made = await createShader(cv, {
        components: [
          // Soft circle anchored top-right: the mask keeps the field off the text column.
          { type: 'Circle', id: 'mask', props: { visible: false, color: '#ffffff', radius: radius(), softness: 1, center: { ...AIM } } },
          { type: 'SimplexNoise', id: 'noise', props: { colorA: '#ffffff', colorB: '#000000', scale: 2.6, speed: 0.3, balance: 0.35, maskSource: 'mask' } },
          { type: 'Dither', id: 'dither', props: { pattern: 'bayer4', pixelSize: 3, threshold: BASE, colorA: 'transparent', colorB: color() } },
        ],
      // onReady fires again after the library rebuilds a lost device, which resets colour, mask and the paused state.
      }, { disableTelemetry: true, onError, onReady: () => { recolor(); fit(); sync(); } });
      if (made.getFailureReason()) { dead = true; return false; }
      shader = made;
      // The theme or the window may have changed while the shader was being built.
      recolor();
      fit();
      if (!wired) {
        wired = true;
        // Entries arrive oldest first; only the latest one describes the current state.
        new IntersectionObserver((entries) => { seen = entries[entries.length - 1].isIntersecting; sync(); }).observe(cv);
        new ResizeObserver(fit).observe(cv);
        document.addEventListener('visibilitychange', sync);
      }
      sync();
      return true;
    } catch (e) {
      console.warn('[fx] shader unavailable, using the dot field instead', e);
      dead = true;
      return false;
    } finally {
      clearTimeout(slow);
      busy = false;
    }
  }
  const recolor = () => shader?.update('dither', { colorB: color() });
  const boot = () => start().then((ok) => { if (!ok) flow.enable(); });
  // Crossing the breakpoint or switching reduced motion: re-sync a running shader, or start one
  // that could not run when the page loaded.
  const retry = () => (shader ? sync() : boot());
  narrow.addEventListener('change', retry);
  calm.addEventListener('change', retry);
  return {
    eligible, boot, recolor,
    // The field animates on its own, so it needs an off switch (WCAG 2.2.2). Returns the new
    // state, or null where the shader is not shown anyway and there is nothing to switch.
    toggle() {
      if (!able()) return null;
      off = !off;
      try { localStorage.setItem('fx', off ? 'off' : 'on'); } catch {}
      if (shader) sync(); else if (!off) boot();
      return !off;
    },
    // The field leans a little toward the pointer (nx, ny in 0..1 across the hero).
    aim(nx, ny) {
      if (!shader || off) return;
      aimX = AIM.x + (nx - 0.5) * 0.18; aimY = AIM.y + (ny - 0.5) * 0.18;
      if (!aimRaf) aimRaf = requestAnimationFrame(aimTick);
    },
    // A key press briefly lets more of the noise through. The threshold stays under 0.5: above it
    // the dither lights dots everywhere, including behind the text.
    pulse() {
      if (!shader || off) return;
      const t0 = performance.now();
      cancelAnimationFrame(raf);
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 520);
        shader?.update('dither', { threshold: BASE + 0.07 * (1 - k) ** 2 });
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
  };
})();
// Where the shader cannot run, show the dot field right away. Otherwise start the shader once the
// page is idle, so parsing the bundle never competes with first paint.
if (!fx.eligible()) flow.enable();
else (window.requestIdleCallback ?? ((run) => setTimeout(run, 200)))(fx.boot, { timeout: 2000 });

// ---------- skill readout ----------
const hud = $('hud');
function hudIdle() {
  hud.replaceChildren();
  hud.classList.remove('empty');
  const p = el('p', 'hud-idle');
  p.append('> ', finePointer ? '按鍵盤上任何一個字母鍵，或點鍵帽' : '點任何一個鍵帽', el('span', 'caret'));
  const q = el('p', 'hud-idle');
  q.append('每個鍵帽是一項技能，這裡會顯示', el('b', '', '我用它做了什麼'), '。');
  hud.append(p, q);
}
function hudSkill(key, s) {
  const c = cats[s.cat];
  hud.replaceChildren();
  hud.classList.remove('empty');
  hud.style.setProperty('--c', c.color);
  const top = el('div', 'hud-top');
  top.append(el('span', 'hud-key', key.toUpperCase()), el('span', 'hud-name', s.name), el('span', 'hud-cat', c.label));
  hud.append(top, el('p', 'hud-desc', s.desc));
  if (s.repo) hud.append(ext(el('a', 'hud-link', `→ ${s.repo}`), repoUrl(s.repo)));
}
function hudEmpty(key) {
  hud.replaceChildren();
  hud.classList.add('empty'); // 沒有分類色時鍵名的底是主色，字色要跟著換（見 .hud.empty）
  hud.style.removeProperty('--c');
  const top = el('div', 'hud-top');
  top.append(el('span', 'hud-key', key.toUpperCase()), el('span', 'hud-name', '這個鍵還空著'));
  hud.append(top, el('p', 'hud-desc', '還在學新東西，學會了再補上。'));
}
hudIdle();

// ---------- keyboard ----------
const NAV = { 1: ['研', 'research', '研究'], 2: ['經', 'experience', '經歷'], 3: ['作', 'projects', '作品'], 0: ['↑', 'top', '頁首'] };
if (contactOn) NAV[4] = ['信', 'contact', '聯絡'];
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const kb = $('kb');
const keys = new Map();
for (const row of ROWS) {
  const r = el('div', 'kb-row');
  for (const k of row) {
    const b = el('button', 'key');
    b.type = 'button'; b.tabIndex = -1; b.dataset.key = k;
    const cap = el('span', 'cap');
    cap.append(el('i', '', k));
    const s = skills[k];
    if (s) {
      b.dataset.c = s.cat;
      b.style.setProperty('--c', cats[s.cat].color);
      b.setAttribute('aria-label', `${k.toUpperCase()}：${s.name}`);
      cap.append(el('b', '', s.short));
    } else if (NAV[k]) {
      b.style.setProperty('--c', '#ffffff');
      b.setAttribute('aria-label', `${k}：跳到${NAV[k][2]}`);
      cap.append(el('b', '', NAV[k][0]));
    } else {
      b.setAttribute('aria-label', `${k.toUpperCase()}：空白鍵`);
    }
    b.append(cap);
    r.append(b);
    keys.set(k, b);
  }
  kb.append(r);
}
{
  const r = el('div', 'kb-row');
  const b = el('button', 'key wide');
  b.type = 'button'; b.tabIndex = -1; b.dataset.key = ' ';
  b.setAttribute('aria-label', '空白鍵');
  const cap = el('span', 'cap');
  cap.append(el('b', '', 'chijiun'));
  b.append(cap);
  r.append(b);
  kb.append(r);
  keys.set(' ', b);
}

let soundOn = false;
let audio;
function clack() {
  if (!soundOn) return;
  audio ??= new AudioContext();
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(170 + Math.random() * 70, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.05);
  gain.gain.setValueAtTime(0.07, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}
function toggleSound() {
  soundOn = !soundOn;
  $('sound').setAttribute('aria-pressed', String(soundOn));
  $('sound').textContent = `按鍵音效：${soundOn ? '開' : '關'}`;
  clack();
}
$('sound').addEventListener('click', toggleSound);

let active = null;
function press(k) {
  const b = keys.get(k);
  if (!b || b.classList.contains('down')) return;
  b.classList.add('down');
  clack();
  const rect = b.getBoundingClientRect();
  if (rect.bottom > 0 && rect.top < innerHeight) {
    flow.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
    fx.pulse();
  }
  if (skills[k]) {
    active?.classList.remove('active');
    active = b;
    b.classList.add('active');
    hudSkill(k, skills[k]);
  } else if (NAV[k]) {
    goTo(NAV[k][1]);
  } else if (k !== ' ') {
    hudEmpty(k);
  }
}
const release = (k) => keys.get(k)?.classList.remove('down');
const releaseAll = () => keys.forEach((b) => b.classList.remove('down'));
kb.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.key');
  if (b) press(b.dataset.key);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) kb.addEventListener(type, releaseAll);
addEventListener('blur', releaseAll);
addEventListener('keyup', (e) => release(e.key.toLowerCase()));

// ---------- pointer: keyboard tilt, hero letters, card glow ----------
if (finePointer && !reduced) {
  const hero = $('top');
  hero.addEventListener('pointermove', (e) => {
    const rect = hero.getBoundingClientRect();
    kb.style.setProperty('--px', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
    kb.style.setProperty('--py', (((e.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
    fx.aim(e.clientX / innerWidth, (e.clientY - rect.top) / rect.height);
    for (const s of letters) {
      const b = s.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
      s.style.setProperty('--k', Math.max(0, 1 - d / 240).toFixed(3));
    }
  });
  hero.addEventListener('pointerleave', () => {
    kb.style.setProperty('--px', 0); kb.style.setProperty('--py', 0);
    letters.forEach((s) => s.style.setProperty('--k', 0));
    fx.aim(0.5, 0.5);
  });
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const b = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${(((e.clientX - b.left) / b.width) * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(((e.clientY - b.top) / b.height) * 100).toFixed(1)}%`);
    });
  });
}

// ---------- editor window ----------
const editor = (() => {
  const files = [
    ...experience,
    {
      name: 'help.txt',
      lines: [
        ['h1', '快捷鍵'],
        ['blank'],
        ['h2', '整個頁面'],
        ['li', '字母鍵　　看那個鍵帽代表的技能'],
        ['li', '1 2 3 4 0  研究、經歷、作品、聯絡、頁首'],
        ['li', ': 或 /　　開指令列，例如 :theme、:e awards、:sound、:blog'],
        ['li', ':fx　　　 開關首屏的背景動畫'],
        ['li', 'Ctrl K　　搜尋想去的地方或作品'],
        ['blank'],
        ['h2', '這個視窗（先點一下）'],
        ['li', 'j / k　　 下一行、上一行'],
        ['li', 'h / l　　 上一個、下一個檔案'],
        ['li', 'g g / G　 第一行、最後一行'],
        ['li', 'Enter　　 開啟游標所在行的連結'],
        ['li', 'Esc　　　 離開視窗'],
      ],
    },
  ];
  const buf = $('buf'), tabs = $('tabs');
  const cursors = files.map(() => 0);
  let cur = 0, pendingG = 0;
  const SYM = { h1: '# ', h2: '## ', li: '- ', quote: '> ', link: '→ ' };

  function renderLine([kind, text, href], i) {
    const row = el('div', 'ln');
    row.dataset.i = i;
    const tx = el('span', 'tx');
    if (SYM[kind]) tx.append(el('span', 'sym', SYM[kind]));
    if (kind === 'link') tx.append(ext(el('a', '', text), href));
    else if (kind !== 'blank') tx.append(el('span', kind, text));
    row.append(el('span', 'no', String(i + 1)), tx);
    return row;
  }
  function move(line) {
    const lines = files[cur].lines;
    const next = Math.max(0, Math.min(lines.length - 1, line));
    buf.querySelector('.cur')?.classList.remove('cur');
    cursors[cur] = next;
    const row = buf.children[next];
    row.classList.add('cur');
    const top = row.offsetTop, bottom = top + row.offsetHeight;
    if (next === 0) buf.scrollTop = 0;
    else if (top < buf.scrollTop) buf.scrollTop = top - 10;
    else if (bottom > buf.scrollTop + buf.clientHeight) buf.scrollTop = bottom - buf.clientHeight + 30;
    $('ed-pos').textContent = `${next + 1}:${lines.length}`;
    $('ed-hint').textContent = lines[next][0] === 'link' ? `Enter 開啟 ${lines[next][1]}` : 'j/k 移動 · h/l 切換檔案 · Enter 開連結 · Esc 離開';
  }
  function open(i) {
    cur = (i + files.length) % files.length;
    buf.replaceChildren(...files[cur].lines.map(renderLine));
    [...tabs.children].forEach((b, n) => {
      b.setAttribute('aria-selected', String(n === cur));
      if (n === cur) tabs.scrollLeft = Math.max(0, b.offsetLeft - 24);
    });
    $('ed-title').textContent = `chijiun — ~/experience/${files[cur].name}`;
    move(cursors[cur]);
  }
  function openLink() {
    const [kind, , href] = files[cur].lines[cursors[cur]];
    if (kind === 'link') window.open(href, '_blank', 'noopener');
    else say('這一行沒有連結');
  }
  files.forEach((f, i) => {
    const tab = el('button', '', f.name);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => { open(i); buf.focus({ preventScroll: true }); });
    tabs.append(tab);
  });
  buf.addEventListener('click', (e) => {
    const row = e.target.closest('.ln');
    if (row) move(Number(row.dataset.i));
  });
  buf.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const now = performance.now();
    if (k === 'j' || k === 'ArrowDown') move(cursors[cur] + 1);
    else if (k === 'k' || k === 'ArrowUp') move(cursors[cur] - 1);
    else if (k === 'G') move(Infinity);
    else if (k === 'g') { if (now - pendingG < 600) { move(0); pendingG = 0; } else pendingG = now; }
    else if (k === 'h' || k === 'ArrowLeft') open(cur - 1);
    else if (k === 'l' || k === 'ArrowRight') open(cur + 1);
    else if (/^[1-9]$/.test(k) && Number(k) <= files.length) open(Number(k) - 1);
    else if (k === 'Enter' || k === 'o') openLink();
    else if (k === 'Escape') buf.blur();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  open(0);

  return {
    files,
    show(i) {
      open(i);
      $('experience').scrollIntoView({ behavior: smooth });
      buf.focus({ preventScroll: true });
    },
  };
})();

// ---------- contact form ----------
if (contactOn) {
  if (contact.email) {
    const direct = el('a', '', contact.email);
    direct.href = `mailto:${contact.email}`;
    $('contact-direct').append('也可以直接寄到 ', direct, '。');
  }
  const form = $('contact-form'), note = $('contact-note'), send = $('contact-send');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (send.disabled) return;
    const d = new FormData(form);
    if (d.get('botcheck')) return;
    const name = d.get('name').trim(), email = d.get('email').trim(), message = d.get('message').trim();
    // `required` lets whitespace-only values through.
    if (!name || !email || !message) {
      note.textContent = '三個欄位都要填喔。';
      return;
    }
    const subject = `[chijiun.com] ${name} 的來信`;
    const mailto = contact.email
      ? `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n\n— ${name} <${email}>`)}`
      : '';
    if (!contact.accessKey) {
      location.href = mailto;
      note.textContent = '已經幫你開啟郵件程式，按下寄出就可以了。';
      return;
    }
    send.disabled = true;
    note.textContent = '寄送中…';
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: contact.accessKey, subject, from_name: name, name, email, message }),
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      form.reset();
      note.textContent = '寄出了，謝謝你。我會盡快回信。';
    } catch {
      // Keep what the visitor typed, and hand the same message to their own mail app.
      if (mailto) {
        const link = el('a', '', '改用你的郵件程式寄出');
        link.href = mailto;
        note.replaceChildren('寄送失敗。可以稍後再試，或', link, '（內容已經幫你帶好）。');
      } else {
        note.textContent = '寄送失敗，請稍後再試，或改用 LinkedIn 聯絡我。';
      }
    } finally {
      send.disabled = false;
    }
  });
}

// ---------- theme: circular reveal via View Transitions ----------
function toggleTheme(e) {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  let applied = false;
  const apply = () => {
    if (applied) return;
    applied = true;
    root.classList.add('switching');
    setTimeout(() => root.classList.remove('switching'), 80);
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]').content = next === 'dark' ? '#0c0c0b' : '#f4f1ea';
    try { localStorage.setItem('theme', next); } catch {}
    flow.recolor();
    fx.recolor();
  };
  if (!document.startViewTransition || reduced) return apply();
  const x = e?.clientX || innerWidth - 40, y = e?.clientY || 28;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  // If the browser never gets a frame to start the transition, switch anyway.
  setTimeout(apply, 400);
  document.startViewTransition(apply).ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 560, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}
$('theme').addEventListener('click', toggleTheme);

// ---------- command palette / command line ----------
const pal = $('pal'), q = $('q'), list = $('list');
const visit = (href) => () => window.open(href, '_blank', 'noopener');
const cmds = [
  { label: '回到頁首', alias: ':e about', run: () => goTo('top') },
  { label: '研究', alias: ':e research', run: () => goTo('research') },
  { label: '經歷', alias: ':e experience', run: () => goTo('experience') },
  { label: '作品', alias: ':e projects', run: () => goTo('projects') },
  { label: '文章', alias: ':blog', run: () => { location.href = 'blog/'; } },
  ...editor.files.map((f, i) => ({ label: `經歷 › ${f.name}`, alias: `:e ${f.name.split('.')[0]}`, run: () => editor.show(i) })),
  ...(contactOn ? [{ label: '寫信給我', alias: ':mail', run: () => { goTo('contact'); $('contact-form').elements.namedItem('name').focus({ preventScroll: true }); } }] : []),
  { label: '切換深色／淺色', alias: ':theme', run: () => toggleTheme() },
  { label: '按鍵音效 開／關', alias: ':sound', run: toggleSound },
  { label: '背景動畫 開／關', alias: ':fx', run: () => { const on = fx.toggle(); say(on === null ? '這個裝置或視窗寬度不會顯示背景動畫' : `背景動畫：${on ? '開' : '關'}`); } },
  { label: '快捷鍵說明', alias: ':help', run: () => editor.show(editor.files.length - 1) },
  ...me.links.map((l) => ({ label: `開啟 ${l.label}`, hint: '連結', run: visit(l.href) })),
  ...research.map((r) => ({ label: r.title, hint: `repo · ${r.link.label}`, run: visit(r.link.href) })),
  ...projects.map((p) => ({ label: p.title, hint: 'repo', run: visit(p.href) })),
  { label: '離開', alias: ':q', run: () => say('這裡跟 vim 一樣，出不去的。') },
];
let shown = [], sel = 0;
function draw() {
  const needle = q.value.trim().toLowerCase();
  shown = cmds.filter((c) => !needle || `${c.label} ${c.hint ?? ''} ${c.alias ?? ''}`.toLowerCase().includes(needle));
  sel = Math.min(sel, Math.max(0, shown.length - 1));
  if (!shown.length) return list.replaceChildren(el('li', 'none', needle.startsWith(':') ? '不認得的指令，打 :help 看全部' : '找不到符合的項目'));
  list.replaceChildren(...shown.map((c, i) => {
    const li = el('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === sel));
    li.append(el('span', '', c.label), el('span', '', c.alias ?? c.hint));
    li.addEventListener('click', () => exec(i));
    li.addEventListener('pointermove', () => { if (sel !== i) { sel = i; mark(); } });
    return li;
  }));
}
function mark() {
  [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === sel)));
  list.children[sel]?.scrollIntoView({ block: 'nearest' });
}
function exec(i) {
  const c = shown[i];
  if (!c) return;
  pal.close();
  c.run();
}
function openPal(prefix = '') {
  if (pal.open) return pal.close();
  q.value = prefix; sel = 0;
  pal.showModal();
  $('st-mode').textContent = 'COMMAND';
  draw();
  q.focus();
}
pal.addEventListener('close', () => { $('st-mode').textContent = 'NORMAL'; });
q.addEventListener('input', () => { sel = 0; draw(); });
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { sel = (sel + 1) % Math.max(1, shown.length); mark(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = (sel - 1 + shown.length) % Math.max(1, shown.length); mark(); e.preventDefault(); }
  else if (e.key === 'Enter') { exec(sel); e.preventDefault(); }
});
pal.addEventListener('click', (e) => { if (e.target === pal) pal.close(); });
$('open-pal').addEventListener('click', () => openPal());

// ---------- global keys ----------
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPal(); return; }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || pal.open) return;
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key === ':' || e.key === '/') { e.preventDefault(); openPal(e.key === ':' ? ':' : ''); return; }
  const k = e.key.toLowerCase();
  if (k !== ' ' && keys.has(k)) press(k);
});

if (!finePointer) $('open-pal').textContent = '指令';
else if (/Mac/.test(navigator.platform)) $('open-pal').textContent = '⌘ K';
