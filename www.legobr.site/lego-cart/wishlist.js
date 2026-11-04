/* LEGO Wishlist — standalone slide-over
   - Persists favorited SKUs (slugs) in localStorage
   - Badge on header heart icon (auto-created) and on cart-icon area
   - Slide drawer opens when clicking the header heart icon
   - Works with product card buttons that call toggleWishlist() defined in script.js
*/
(function () {
  if (window.__LEGO_WISHLIST_LOADED__) return;
  window.__LEGO_WISHLIST_LOADED__ = true;

  const KEY = 'lego_wishlist_v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = (arr) => { localStorage.setItem(KEY, JSON.stringify(arr)); updateBadge(); if (drawerOpen) render(); };
  const money = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');

  let drawerOpen = false;

  // --- Overlay + Drawer ---
  const overlay = document.createElement('div');
  overlay.className = 'lw-overlay';
  overlay.addEventListener('click', close);

  const drawer = document.createElement('aside');
  drawer.className = 'lw-drawer';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <div class="lw-header">
      <h3>Meus Favoritos</h3>
      <button class="lw-close" aria-label="Fechar">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="lw-body" id="lw-body"></div>
  `;
  drawer.querySelector('.lw-close').addEventListener('click', close);

  // --- Styles (scoped, injected once) ---
  const css = `
    .lw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .25s ease;z-index:9998}
    .lw-overlay.open{opacity:1;pointer-events:auto}
    .lw-drawer{position:fixed;top:0;right:0;height:100vh;width:min(420px,100vw);background:#fff;transform:translateX(100%);transition:transform .28s ease;z-index:9999;display:flex;flex-direction:column;box-shadow:-8px 0 24px rgba(0,0,0,.12)}
    .lw-drawer.open{transform:translateX(0)}
    .lw-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #eee}
    .lw-header h3{margin:0;font-size:17px;font-weight:800;color:#111}
    .lw-close{background:transparent;border:0;color:#111;cursor:pointer;padding:6px;border-radius:6px}
    .lw-close:hover{background:#f4f4f4}
    .lw-body{flex:1;overflow-y:auto;padding:12px 14px}
    .lw-empty{text-align:center;padding:48px 12px;color:#666;font-size:14px}
    .lw-item{display:flex;gap:12px;padding:12px 6px;border-bottom:1px solid #f0f0f0;align-items:center}
    .lw-item img{width:64px;height:64px;object-fit:contain;border-radius:6px;background:#f7f7f7;flex-shrink:0}
    .lw-item .lw-info{flex:1;min-width:0}
    .lw-item .lw-name{font-size:13px;font-weight:700;color:#111;line-height:1.25;margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .lw-item .lw-price{font-size:14px;font-weight:800;color:#0086ff}
    .lw-item .lw-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
    .lw-item button{background:transparent;border:1px solid #ddd;color:#333;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
    .lw-item .lw-add{background:#0086ff;color:#fff;border-color:#0086ff}
    .lw-item .lw-add:hover{background:#0072d8}
    .lw-item .lw-remove:hover{background:#fee;border-color:#f66;color:#c00}
    .lw-badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#e53935;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;line-height:1;pointer-events:none}
    .icon-btn.heart-icon,.icon-btn.cart-icon{position:relative}
    .btn-wishlist.active svg{fill:#e53935;stroke:#e53935}
  `;
  const style = document.createElement('style');
  style.textContent = css;

  function ensureMounted() {
    if (!document.head.contains(style)) document.head.appendChild(style);
    if (!document.body.contains(overlay)) document.body.appendChild(overlay);
    if (!document.body.contains(drawer)) document.body.appendChild(drawer);
  }

  function open() {
    ensureMounted();
    drawerOpen = true;
    overlay.classList.add('open');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    render();
  }
  function close() {
    drawerOpen = false;
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function render() {
    const body = drawer.querySelector('#lw-body');
    const list = load();
    if (!list.length) {
      body.innerHTML = '<div class="lw-empty">Sua lista de favoritos está vazia.<br/>Toque no coração de um produto para adicioná-lo aqui.</div>';
      return;
    }
    const cfg = window.LegoConfig;
    const rows = list.map(slug => {
      const p = cfg && cfg.getBySlug(slug);
      if (!p) return '';
      return `
        <div class="lw-item" data-slug="${p.slug}">
          <img src="${p.image}" alt="${p.name}"/>
          <div class="lw-info">
            <p class="lw-name">${p.name}</p>
            <div class="lw-price">${money(p.price)}</div>
          </div>
          <div class="lw-actions">
            <button class="lw-add" data-add>Comprar</button>
            <button class="lw-remove" data-remove>Remover</button>
          </div>
        </div>`;
    }).join('');
    body.innerHTML = rows;
    body.querySelectorAll('.lw-item').forEach(item => {
      const slug = item.dataset.slug;
      item.querySelector('[data-remove]').addEventListener('click', () => api.remove(slug));
      item.querySelector('[data-add]').addEventListener('click', () => {
        const p = cfg && cfg.getBySlug(slug);
        if (p && window.LegoCart) {
          window.LegoCart.add({ id:p.slug, sku:p.sku, name:p.name+' ('+p.sku+')', price:p.price, image:p.image, qty:1 });
          close();
          window.LegoCart.open && window.LegoCart.open();
        }
      });
    });
  }

  function updateBadge() {
    const n = load().length;
    // Update badge on all .icon-btn.heart-icon (header) and on any [data-lego-wishlist-count]
    document.querySelectorAll('.icon-btn.heart-icon').forEach(btn => {
      let b = btn.querySelector('.lw-badge');
      if (n > 0) {
        if (!b) { b = document.createElement('span'); b.className = 'lw-badge'; btn.appendChild(b); }
        b.textContent = n;
      } else if (b) { b.remove(); }
    });
    document.querySelectorAll('[data-lego-wishlist-count]').forEach(el => { el.textContent = n; });
  }

  function markActiveButtons() {
    const set = new Set(load());
    document.querySelectorAll('.product-card').forEach(card => {
      const oc = card.getAttribute('onclick') || '';
      const m = oc.match(/'([^']+)\/index\.html/);
      if (!m) return;
      const slug = m[1].split('/').pop();
      const btn = card.querySelector('.btn-wishlist');
      if (btn) btn.classList.toggle('active', set.has(slug));
    });
  }

  function bindHeaderClicks() {
    document.querySelectorAll('.icon-btn.heart-icon').forEach(btn => {
      if (btn.__lwBound) return;
      btn.__lwBound = true;
      btn.addEventListener('click', (e) => { e.preventDefault(); open(); });
      btn.style.cursor = 'pointer';
    });
  }

  const api = {
    add(slug) {
      const cur = load();
      if (!cur.includes(slug)) { cur.push(slug); save(cur); }
      markActiveButtons();
    },
    remove(slug) {
      const cur = load().filter(s => s !== slug);
      save(cur);
      markActiveButtons();
    },
    has(slug) { return load().includes(slug); },
    open, close,
    list() { return load(); },
  };
  window.LegoWishlist = api;

  function init() {
    ensureMounted();
    updateBadge();
    markActiveButtons();
    bindHeaderClicks();
    // Also observe for late-added product cards / header buttons
    const mo = new MutationObserver(() => { markActiveButtons(); bindHeaderClicks(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
