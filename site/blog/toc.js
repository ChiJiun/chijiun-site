/* 文章目錄：依文章裡有 id 的 h2 / h3 自動產生。
   寬螢幕（>= 1300px）固定在文章右側；窄螢幕變成右下角的「目錄」按鈕，點開是浮動面板。
   捲動時標出目前讀到的章節，並只展開目前這一章的小節（類似 Notion / HackMD）。 */
(() => {
  const post = document.querySelector('.post');
  if (!post) return;
  const heads = [...post.querySelectorAll('h2[id], h3[id]')];
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
  const list = document.createElement('ol');

  const items = []; // { head, a, li, group }
  let group = null;
  let sub = null;
  for (const h of heads) {
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent.trim();
    const li = document.createElement('li');
    li.appendChild(a);
    if (h.tagName === 'H2') {
      li.className = 'toc-h2';
      list.appendChild(li);
      group = li;
      sub = null;
    } else {
      if (!group) continue;
      if (!sub) {
        sub = document.createElement('ol');
        sub.className = 'toc-sub';
        group.appendChild(sub);
      }
      li.className = 'toc-h3';
      sub.appendChild(li);
    }
    items.push({ head: h, a, li, group });
  }

  panel.append(title, list);
  nav.append(btn, panel);
  document.body.appendChild(nav);

  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
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

  let current = null;
  const update = () => {
    let found = items[0];
    for (const it of items) {
      if (it.head.getBoundingClientRect().top <= 130) found = it;
      else break;
    }
    if (found === current) return;
    if (current) {
      current.li.classList.remove('active');
      current.a.removeAttribute('aria-current');
      current.group.classList.remove('open');
    }
    current = found;
    current.li.classList.add('active');
    current.a.setAttribute('aria-current', 'location');
    current.group.classList.add('open');
    // 讓目前這一項留在目錄面板的可視範圍內
    const box = panel.getBoundingClientRect();
    const r = current.a.getBoundingClientRect();
    if (r.top < box.top + 40 || r.bottom > box.bottom - 8) {
      panel.scrollTop += r.top - box.top - box.height / 2;
    }
  };

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
