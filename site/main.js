import { me, interests, research, experience, projects, more, skills, cats, contact, repoUrl } from './data.js';

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
  r.points.forEach((p) => ul.append(el('li', '', p)));
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
const IDLE = finePointer ? '字母鍵：技能 · 1 2 3：區塊 · :：指令 · Ctrl K：搜尋' : '點鍵帽看技能 · 右上角開指令面板';
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
if (contactOn) SECTIONS.push(['contact', 'contact.md']);
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

// ---------- dot-field background ----------
// Named `flow` for its two callers: burst() on key presses, recolor() on theme change.
const flow = (() => {
  const cv = $('bg');
  const ctx = cv.getContext('2d');
  const GAP = 32, R = 140, LIFE = 1400;
  const mouse = { x: -9999, y: -9999 };
  let W = 0, H = 0, pts = [], ripples = [], ink = '', raf = 0;

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
  const wake = () => { if (!raf && !reduced) raf = requestAnimationFrame(step); };
  const ripple = (x, y) => { ripples.push({ x, y, t: performance.now() }); wake(); };
  const leave = () => { mouse.x = mouse.y = -9999; wake(); };

  readColors();
  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; wake(); });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('.key')) ripple(e.clientX, e.clientY); });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(); });
  addEventListener('pointercancel', leave);
  root.addEventListener('pointerleave', leave);

  return {
    burst: ripple,
    recolor() { readColors(); draw(); },
  };
})();

// ---------- skill readout ----------
const hud = $('hud');
function hudIdle() {
  hud.replaceChildren();
  const p = el('p', 'hud-idle');
  p.append('> ', finePointer ? '按鍵盤上任何一個字母鍵，或點鍵帽' : '點任何一個鍵帽', el('span', 'caret'));
  const q = el('p', 'hud-idle');
  q.append('每個鍵帽是一項技能，這裡會顯示', el('b', '', '我用它做了什麼'), '。');
  hud.append(p, q);
}
function hudSkill(key, s) {
  const c = cats[s.cat];
  hud.replaceChildren();
  hud.style.setProperty('--c', c.color);
  const top = el('div', 'hud-top');
  top.append(el('span', 'hud-key', key.toUpperCase()), el('span', 'hud-name', s.name), el('span', 'hud-cat', c.label));
  hud.append(top, el('p', 'hud-desc', s.desc));
  if (s.repo) hud.append(ext(el('a', 'hud-link', `→ ${s.repo}`), repoUrl(s.repo)));
}
function hudEmpty(key) {
  hud.replaceChildren();
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
  if (rect.bottom > 0 && rect.top < innerHeight) flow.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
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

// ---------- pointer: keyboard tilt, hero letters, card glare ----------
if (finePointer && !reduced) {
  const hero = $('top');
  hero.addEventListener('pointermove', (e) => {
    const rect = hero.getBoundingClientRect();
    kb.style.setProperty('--px', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
    kb.style.setProperty('--py', (((e.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
    for (const s of letters) {
      const b = s.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
      s.style.setProperty('--k', Math.max(0, 1 - d / 240).toFixed(3));
    }
  });
  hero.addEventListener('pointerleave', () => {
    kb.style.setProperty('--px', 0); kb.style.setProperty('--py', 0);
    letters.forEach((s) => s.style.setProperty('--k', 0));
  });
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const b = card.getBoundingClientRect();
      const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
      card.style.setProperty('--rx', `${((0.5 - py) * 9).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((px - 0.5) * 11).toFixed(2)}deg`);
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
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
        ['li', '1 2 3 0　 研究、經歷、作品、頁首'],
        ['li', ': 或 /　　開指令列，例如 :theme、:e awards、:sound'],
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
  $('contact').hidden = false;
  $('nav-contact').hidden = false;
  const form = $('contact-form'), note = $('contact-note'), send = $('contact-send');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    if (d.get('botcheck')) return;
    const name = d.get('name').trim(), email = d.get('email').trim(), message = d.get('message').trim();
    const subject = `[chijiun.github.io] ${name} 的來信`;
    if (!contact.accessKey) {
      location.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n\n— ${name} <${email}>`)}`;
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
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      form.reset();
      note.textContent = '寄出了，謝謝你。我會盡快回信。';
    } catch {
      note.textContent = '寄送失敗，請稍後再試，或改用 LinkedIn 聯絡我。';
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
    document.querySelector('meta[name="theme-color"]').content = next === 'dark' ? '#0a0f22' : '#f6f8fc';
    try { localStorage.setItem('theme', next); } catch {}
    flow.recolor();
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
  ...editor.files.map((f, i) => ({ label: `經歷 › ${f.name}`, alias: `:e ${f.name.split('.')[0]}`, run: () => editor.show(i) })),
  ...(contactOn ? [{ label: '寫信給我', alias: ':mail', run: () => { goTo('contact'); $('contact-form').elements.namedItem('name').focus({ preventScroll: true }); } }] : []),
  { label: '切換深色／淺色', alias: ':theme', run: () => toggleTheme() },
  { label: '按鍵音效 開／關', alias: ':sound', run: toggleSound },
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
