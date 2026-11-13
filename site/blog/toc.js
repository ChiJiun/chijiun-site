/* 文章目錄：依文章裡有 id 的 h1～h6 自動產生，並保留標題層級的父子關係。
   - h1 是文章標題，h2 是它的章節，h3 是章節底下的小節，以此類推；跳級（例如 h2 直接接 h4）時，掛在最近的上一層。
   - 有子層級的項目前面有 ▸ 按鈕，可以個別展開或收合；捲動時，目前所在章節的整條路徑會自動展開並標示。
   - 寬螢幕（>= 1300px）固定在文章右側；窄螢幕變成右下角的「目錄」按鈕，點開是浮動面板。 */
(() => {
  const post = document.querySelector('.post');
  if (!post) return;
  const heads = [...post.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')];
  if (heads.length < 3) return;

  const nav = document.createElement('nav');
  nav.className = 'toc';
  nav.setAttribute('aria-label', '文章目錄');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toc-toggle';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'toc-panel');
  btn.textContent = '☰ 目錄';

  const panel = document.createElement('div');
  panel.id = 'toc-panel';
  panel.className = 'toc-panel';
  const title = document.createElement('p');
  title.className = 'toc-title';
  title.textContent = '目錄';
  const root = document.createElement('ol');
  root.className = 'toc-root';

  // 依標題層級建樹：stack 的最後一個是目前最近、層級較小的祖先
  const nodes = [];
  const stack = [];
  heads.forEach((head, i) => {
    const level = Number(head.tagName[1]);
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1] || null;

    const li = document.createElement('li');
    li.className = 'toc-item toc-l' + level;
    li.dataset.level = String(level);
    const row = document.createElement('div');
    row.className = 'toc-row';
    const a = document.createElement('a');
    a.href = '#' + head.id;
    a.textContent = head.textContent.trim();
    row.appendChild(a);
    li.appendChild(row);

    const node = { head, level, li, row, a, parent, children: [], list: null, fold: null, userOpen: undefined };
    if (parent) {
      if (!parent.list) {
        parent.list = document.createElement('ol');
        parent.list.className = 'toc-children';
        parent.li.appendChild(parent.list);
        // 有子層級的項目才有展開／收合按鈕
        const f = document.createElement('button');
        f.type = 'button';
        f.className = 'toc-fold';
        f.setAttribute('aria-label', '展開或收合「' + parent.a.textContent + '」');
        f.addEventListener('click', () => {
          parent.userOpen = !isOpen(parent);
          render();
        });
        parent.row.prepend(f);
        parent.fold = f;
        parent.li.classList.add('has-children');
      }
      parent.children.push(node);
      parent.list.appendChild(li);
    } else {
      root.appendChild(li);
    }
    nodes.push(node);
    stack.push(node);
  });

  panel.append(title, root);
  nav.append(btn, panel);
  document.body.appendChild(nav);

  let current = nodes[0];
  const inPath = (n) => { for (let x = current; x; x = x.parent) if (x === n) return true; return false; };
  // 使用者手動切換過就照他的；否則「目前所在章節的祖先（含自己）」自動展開
  const isOpen = (n) => (n.userOpen !== undefined ? n.userOpen : inPath(n));

  const render = () => {
    for (const n of nodes) {
      n.li.classList.toggle('active', n === current);
      n.li.classList.toggle('in-path', inPath(n) && n !== current);
      if (n.a) {
        if (n === current) n.a.setAttribute('aria-current', 'location');
        else n.a.removeAttribute('aria-current');
      }
      if (n.fold) {
        const open = isOpen(n);
        n.li.classList.toggle('open', open);
        n.fold.setAttribute('aria-expanded', String(open));
      }
    }
  };

  const keepVisible = () => {
    const box = panel.getBoundingClientRect();
    const r = current.a.getBoundingClientRect();
    if (r.height && (r.top < box.top + 40 || r.bottom > box.bottom - 8)) {
      panel.scrollTop += r.top - box.top - box.height / 2;
    }
  };

  const update = () => {
    let found = nodes[0];
    for (const n of nodes) {
      if (n.head.getBoundingClientRect().top <= 130) found = n;
      else break;
    }
    if (found === current && nav.dataset.ready) return;
    current = found;
    nav.dataset.ready = '1';
    render();
    keepVisible();
  };

  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) keepVisible();
  };
  btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  panel.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) setOpen(false);
  });

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
