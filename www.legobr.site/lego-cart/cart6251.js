/* LEGO Global Slide Cart — v3
   - Slide cart with fast-shipping progress bar (target R$ 55)
   - "Adicionar mais produtos" modal (10% OFF over site price) with Ver detalhes
   - Product details modal (carrossel, descrição, peças, idade, avaliações)
   - NO order bump here (order bump is only in checkout)
   - Persists cart in localStorage
   - Auto-hooks add-to-cart buttons on vitrine + product pages
   - Overrides .checkoutButtonLink external redirect on product pages
*/
(function () {
  if (window.__LEGO_CART_LOADED__) return;
  window.__LEGO_CART_LOADED__ = true;

  const STORAGE_KEY = 'lego_cart_v1';
  const FAST_UNLOCKED_KEY = 'lego_fast_shipping_unlocked_v1';
  const CHECKOUT_URL = '/checkout.html';

  const money = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');

  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; } };
  const save = (items) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    const subtotal = items.reduce((s,i)=>s+i.price*i.qty,0);
    const target = (window.LegoConfig && window.LegoConfig.FAST_SHIPPING_TARGET) || 55;
    localStorage.setItem(FAST_UNLOCKED_KEY, subtotal >= target ? '1' : '0');
    updateBadge();
    if (drawerOpen) render();
  };

  let drawerOpen = false;

  const $ = (tag, attrs = {}, html) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    });
    if (html !== undefined) el.innerHTML = html;
    return el;
  };

  const cartIconSvg = `<svg viewBox="0 0 24 24"><path d="M7 4h-2l-1 2v2h2l3.6 7.59-1.35 2.44c-.16.28-.25.61-.25.97 0 1.1.9 2 2 2h12v-2h-11.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49a.996.996 0 0 0-.87-1.48h-14.72l-.94-2zm0 15c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>`;
  const starsHtml = (r) => {
    const full = Math.round(r);
    let s = '';
    for (let i=1;i<=5;i++) s += i<=full ? '★' : '☆';
    return `<span class="lc-stars">${s}</span>`;
  };

  const HEADER_CART_SELECTORS = [
    '.icon-btn.cart-icon',
    '.vtex-minicart-2-x-openIconButton',
    '.vtex-minicart-2-x-openIconContainer',
    '[class*="minicart"] button',
    'a[href$="/checkout"]',
    'a[href*="/checkout/#/cart"]',
  ].join(',');

  const headerButtons = new Set();

  // Overlay + Drawer
  const overlay = $('div', { class: 'lc-overlay' });
  overlay.addEventListener('click', () => close());

  const drawer = $('aside', { class: 'lc-drawer', 'aria-hidden': 'true' });
  drawer.innerHTML = `
    <div class="lc-header">
      <h3>Seu Carrinho</h3>
      <button class="lc-close" aria-label="Fechar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="lc-progress-wrap" id="lc-progress-wrap" style="display:none">
      <div class="lc-progress-text" id="lc-progress-text"></div>
      <div class="lc-progress"><div class="lc-progress-bar" id="lc-progress-bar"></div></div>
      <button type="button" class="lc-add-more" id="lc-add-more">＋ Adicionar mais produtos com 10% OFF</button>
    </div>
    <div class="lc-body" id="lc-body"></div>
    <div class="lc-footer" id="lc-footer" style="display:none">
      <div class="lc-row"><span>Subtotal</span><strong id="lc-subtotal">R$ 0,00</strong></div>
      <div class="lc-row"><span>Frete padrão</span><span style="color:#059669;font-weight:700">Grátis</span></div>
      <div class="lc-row total"><span>Total</span><span class="lc-total-val" id="lc-total">R$ 0,00</span></div>
      <a class="lc-checkout" href="${CHECKOUT_URL}">Finalizar Compra</a>
      <div class="lc-secure"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg> Pagamento 100% seguro via Pix</div>
    </div>
  `;
  drawer.querySelector('.lc-close').addEventListener('click', () => close());
  drawer.querySelector('.lc-checkout').addEventListener('click', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    try { close(); } catch (e) {}
    window.location.href = CHECKOUT_URL;
  }, true);
  drawer.querySelector('#lc-add-more').addEventListener('click', openAddMoreModal);

  // "Add more" modal
  const addModalOverlay = $('div', { class:'lc-modal-overlay' });
  const addModal = $('div', { class:'lc-modal' });
  addModal.innerHTML = `
    <div class="lc-modal-head">
      <h3>Adicione mais e ganhe frete rápido</h3>
      <button class="lc-modal-close" aria-label="Fechar">×</button>
    </div>
    <p class="lc-modal-sub">Todos com <strong>10% OFF</strong> — some ao seu carrinho e libere o frete rápido grátis.</p>
    <div class="lc-modal-list" id="lc-modal-list"></div>
  `;
  addModalOverlay.addEventListener('click', (e) => { if (e.target === addModalOverlay) closeAddMoreModal(); });
  addModal.querySelector('.lc-modal-close').addEventListener('click', closeAddMoreModal);

  // Details modal (reusable) — used from slide cart and checkout order bump
  const detailsOverlay = $('div', { class:'lc-details-overlay' });
  const detailsBox = $('div', { class:'lc-details' });
  detailsOverlay.appendChild(detailsBox);
  detailsOverlay.addEventListener('click', (e) => { if (e.target === detailsOverlay) closeDetails(); });

  function openDetails(product, opts) {
    opts = opts || {};
    if (!product) return;
    const imgs = (product.images && product.images.length ? product.images : [product.image]).filter(Boolean);
    const priceLine = opts.promoPrice != null
      ? `${opts.hideReferencePrice ? '' : `<span class="lc-d-old">${money(product.price)}</span> `}<span class="lc-d-new">${money(opts.promoPrice)}</span> ${opts.tag ? '<span class="lc-d-tag">'+opts.tag+'</span>' : ''}`
      : `<span class="lc-d-new">${money(product.price)}</span>`;
    const ratingLine = product.showRating === false ? '' : `<div class="lc-d-rating">${starsHtml(product.rating||4.8)} <strong>${(product.rating||4.8).toFixed(1)}</strong> <span>(${product.reviews||0} avaliações)</span></div>`;
    const specsHtml = Array.isArray(product.specs) && product.specs.length
      ? product.specs.map(spec => typeof spec === 'string' ? `<li>${spec}</li>` : `<li><strong>${spec.label}:</strong> ${spec.value}</li>`).join('')
      : `<li><strong>${product.pieces||'—'}</strong> peças</li><li>Idade mínima <strong>${product.ageMin||8}+</strong></li><li>SKU <strong>${product.sku}</strong></li>`;
    detailsBox.innerHTML = `
      <button class="lc-d-close" aria-label="Fechar">×</button>
      <div class="lc-d-carousel">
        ${imgs.map((src,i)=>`<img src="${src}" alt="${product.name}" data-idx="${i}" class="${i===0?'active':''}" onerror="this.style.visibility='hidden'">`).join('')}
        ${imgs.length>1 ? `
          <button class="lc-d-nav lc-d-prev" aria-label="Anterior">‹</button>
          <button class="lc-d-nav lc-d-next" aria-label="Próxima">›</button>
          <div class="lc-d-dots">${imgs.map((_,i)=>`<span class="${i===0?'on':''}" data-dot="${i}"></span>`).join('')}</div>
        `:''}
      </div>
      <div class="lc-d-body">
        <div class="lc-d-name">${product.name}</div>
        ${ratingLine}
        <div class="lc-d-price">${priceLine}</div>
        <p class="lc-d-desc">${product.description || 'Kit LEGO oficial licenciado.'}</p>
        <ul class="lc-d-specs">${specsHtml}</ul>
        <div class="lc-d-actions">
          <button type="button" class="lc-d-add">${opts.actionLabel || 'Adicionar ao carrinho'}</button>
        </div>
      </div>
    `;
    detailsOverlay.classList.add('lc-open');
    // Carousel
    let cur = 0;
    const imgsEls = detailsBox.querySelectorAll('.lc-d-carousel img');
    const dotsEls = detailsBox.querySelectorAll('.lc-d-dots span');
    const setActive = (i) => {
      cur = (i + imgs.length) % imgs.length;
      imgsEls.forEach((im,idx)=>im.classList.toggle('active', idx===cur));
      dotsEls.forEach((d,idx)=>d.classList.toggle('on', idx===cur));
    };
    const prev = detailsBox.querySelector('.lc-d-prev');
    const next = detailsBox.querySelector('.lc-d-next');
    if (prev) prev.addEventListener('click', ()=>setActive(cur-1));
    if (next) next.addEventListener('click', ()=>setActive(cur+1));
    dotsEls.forEach(d => d.addEventListener('click', ()=>setActive(+d.dataset.dot)));
    detailsBox.querySelector('.lc-d-close').addEventListener('click', closeDetails);
    detailsBox.querySelector('.lc-d-add').addEventListener('click', () => {
      if (typeof opts.onAdd === 'function') opts.onAdd(product);
      closeDetails();
    });
  }
  function closeDetails() { detailsOverlay.classList.remove('lc-open'); }
  // expose
  window.LegoDetails = { open: openDetails, close: closeDetails };

  const toast = $('div', { class: 'lc-toast' });

  function hookHeaderButton(btn) {
    if (!btn || btn.__lcHeaderHooked) return;
    btn.__lcHeaderHooked = true;
    btn.classList.add('lc-header-cart');
    btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); open(); }, true);
    if (!btn.querySelector('.lc-badge')) {
      const b = document.createElement('span');
      b.className = 'lc-badge'; b.style.display = 'none'; b.textContent = '0';
      btn.style.position = btn.style.position || 'relative';
      btn.appendChild(b);
    }
    headerButtons.add(btn);
    updateBadge();
  }

  function scanHeaderButtons() {
    document.querySelectorAll(HEADER_CART_SELECTORS).forEach(hookHeaderButton);
  }

  function mount() {
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    document.body.appendChild(addModalOverlay);
    addModalOverlay.appendChild(addModal);
    document.body.appendChild(detailsOverlay);
    document.body.appendChild(toast);
    scanHeaderButtons();
    hookProductCards();
    const obs = new MutationObserver(() => { scanHeaderButtons(); hookProductCards(); });
    obs.observe(document.body, { childList: true, subtree: true });
    updateBadge();
  }

  // Vitrine: hook add-to-cart buttons using LegoConfig catalog (by slug)
  function hookProductCards() {
    if (!window.LegoConfig) return;
    document.querySelectorAll('.product-card').forEach((card) => {
      if (card.__lcCardHooked) return;
      const btn = card.querySelector('.btn-add-cart');
      if (!btn) return;
      const oc = card.getAttribute('onclick') || '';
      const m = oc.match(/'([^']+)\/index\.html/);
      if (!m) return;
      const slug = m[1].split('/').pop();
      const p = window.LegoConfig.getBySlug(slug);
      if (!p) return;
      card.__lcCardHooked = true;
      btn.removeAttribute('onclick');
      btn.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation();
        addItem({ id: p.slug, sku: p.sku, name: p.name+' ('+p.sku+')', price: p.price, image: p.image, qty: 1 });
        open();
      }, true);
      btn.addEventListener('mousedown', (ev) => ev.stopPropagation(), true);
    });
  }

  // ---------- render ----------
  function render() {
    const items = load();
    const body = drawer.querySelector('#lc-body');
    const footer = drawer.querySelector('#lc-footer');
    const progressWrap = drawer.querySelector('#lc-progress-wrap');

    if (!items.length) {
      body.innerHTML = `
        <div class="lc-empty">
          ${cartIconSvg.replace('<svg','<svg style="fill:#94a3b8"')}
          <h4>Seu carrinho está vazio</h4>
          <p>Adicione produtos LEGO incríveis para começar!</p>
        </div>`;
      footer.style.display = 'none';
      progressWrap.style.display = 'none';
      return;
    }

    body.innerHTML = items.map((it, idx) => `
      <div class="lc-item" data-idx="${idx}">
        <img src="${it.image || ''}" alt="${it.name}" onerror="this.style.visibility='hidden'"/>
        <div class="lc-item-col">
          <div class="lc-name">${it.name}</div>
          <div class="lc-price">${money(it.price)}</div>
          <div class="lc-qty">
            <button data-act="dec">−</button><span>${it.qty}</span><button data-act="inc">+</button>
          </div>
          <button class="lc-item-details" data-act="details">Ver detalhes</button>
        </div>
        <div class="lc-item-right">
          <button class="lc-remove" data-act="rm">remover</button>
          <strong style="font-size:14px">${money(it.price * it.qty)}</strong>
        </div>
      </div>
    `).join('');
    body.querySelectorAll('.lc-item').forEach((row) => {
      const idx = +row.dataset.idx;
      row.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const it = load();
          const act = btn.dataset.act;
          if (act === 'inc') it[idx].qty += 1;
          if (act === 'dec') it[idx].qty = Math.max(1, it[idx].qty - 1);
          if (act === 'rm') it.splice(idx, 1);
          if (act === 'details') {
            const cur = it[idx];
            const baseSku = (cur.sku || '').toString();
            const p = window.LegoConfig && (window.LegoConfig.getBySlug(baseSku) || window.LegoConfig.getBySlug((cur.id||'').replace(/^(bump|promo):/,'')));
            if (p) openDetails(p);
            return;
          }
          save(it);
        });
      });
    });

    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    drawer.querySelector('#lc-subtotal').textContent = money(subtotal);
    drawer.querySelector('#lc-total').textContent = money(subtotal);
    footer.style.display = 'block';

    // Progress bar
    const target = (window.LegoConfig && window.LegoConfig.FAST_SHIPPING_TARGET) || 55;
    progressWrap.style.display = 'block';
    const pct = Math.min(100, Math.round((subtotal / target) * 100));
    drawer.querySelector('#lc-progress-bar').style.width = pct + '%';
    const remaining = Math.max(0, target - subtotal);
    const txt = drawer.querySelector('#lc-progress-text');
    if (remaining <= 0) {
      txt.innerHTML = '🚀 <strong>Frete rápido liberado!</strong> Você já ganhou o frete dos Correios grátis no checkout.';
      drawer.querySelector('#lc-progress-bar').classList.add('lc-progress-done');
    } else {
      txt.innerHTML = 'Faltam <strong>'+money(remaining)+'</strong> para liberar o <strong>frete rápido grátis</strong>';
      drawer.querySelector('#lc-progress-bar').classList.remove('lc-progress-done');
    }
  }

  function updateBadge() {
    const items = load();
    const count = items.reduce((s, i) => s + i.qty, 0);
    headerButtons.forEach((btn) => {
      const badge = btn.querySelector('.lc-badge');
      if (!badge) return;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  function open() { drawerOpen = true; drawer.classList.add('lc-open'); overlay.classList.add('lc-open'); drawer.setAttribute('aria-hidden','false'); render(); }
  function close() { drawerOpen = false; drawer.classList.remove('lc-open'); overlay.classList.remove('lc-open'); drawer.setAttribute('aria-hidden','true'); }

  function showToast(msg, withCheck) {
    toast.innerHTML = (withCheck ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M5 12l5 5L20 7"/></svg>' : '') + String(msg);
    toast.classList.add('lc-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('lc-show'), 1800);
  }

  // ---------- add item: ALWAYS create new distinct product entry;
  //           only increment qty when SAME id is added again ----------
  function addItem(item) {
    if (!item || !item.id) return;
    const items = load();
    const found = items.find((i) => i.id === item.id);
    if (found) {
      found.qty += item.qty || 1;
    } else {
      items.push({
        id: String(item.id),
        sku: item.sku || '',
        name: item.name || 'Produto LEGO',
        price: Number(item.price) || 0,
        image: item.image || '',
        qty: Number(item.qty) || 1,
      });
    }
    save(items);
    showToast('Adicionado ao carrinho', true);
  }

  // ---------- Add More modal (10% OFF list) ----------
  function openAddMoreModal() {
    if (!window.LegoConfig) return;
    const cur = load();
    // Cada slug pode existir 2x no carrinho: versão normal (id = slug) e versão promo (id = 'promo:'+slug).
    // Só ocultamos o produto da modal quando a versão PROMO já está no carrinho.
    const promoInCart = new Set(cur.filter(i => String(i.id).startsWith('promo:')).map(i => i.id.replace(/^promo:/,'')));
    const list = addModal.querySelector('#lc-modal-list');
    const items = window.LegoConfig.PRODUCTS.filter(p => !promoInCart.has(p.slug));
    if (!items.length) {
      list.innerHTML = '<div class="lc-modal-empty">Você já aproveitou o 10% OFF em todos os produtos 🎉</div>';
    } else {
      list.innerHTML = items.map(p => {
        const promo = +(p.price * (1 - 0.10)).toFixed(2);
        return `
        <div class="lc-modal-item" data-slug="${p.slug}">
          <img src="${p.image}" alt="${p.name}" onerror="this.style.visibility='hidden'">
          <div class="lc-modal-info">
            <div class="lc-modal-name">${p.name}</div>
            <div class="lc-modal-price">
              <span class="lc-modal-old">${money(p.price)}</span>
              <span class="lc-modal-new">${money(promo)}</span>
              <span class="lc-modal-tag">10% OFF</span>
            </div>
            <div class="lc-modal-meta">${starsHtml(p.rating||4.8)} <span>${(p.rating||4.8).toFixed(1)} · ${p.reviews||0}</span></div>
          </div>
          <div class="lc-modal-btns">
            <button class="lc-modal-inspect" data-inspect="${p.slug}">Ver detalhes</button>
            <button class="lc-modal-add" data-add="${p.slug}">Adicionar</button>
          </div>
        </div>`;
      }).join('');
      const addPromo = (p) => {
        const promo = +(p.price * (1 - 0.10)).toFixed(2);
        addItem({ id: 'promo:'+p.slug, sku: p.sku, name: p.name+' ('+p.sku+') · 10% OFF', price: promo, image: p.image, qty:1 });
        closeAddMoreModal();
        if (drawerOpen) render();
      };
      list.querySelectorAll('[data-add]').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = window.LegoConfig.getBySlug(btn.dataset.add);
          if (p) addPromo(p);
        });
      });
      list.querySelectorAll('[data-inspect]').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = window.LegoConfig.getBySlug(btn.dataset.inspect);
          if (!p) return;
          const promo = +(p.price * (1 - 0.10)).toFixed(2);
          openDetails(p, {
            promoPrice: promo, tag: '10% OFF',
            actionLabel: 'Adicionar com 10% OFF',
            onAdd: () => addPromo(p),
          });
        });
      });
    }
    addModalOverlay.classList.add('lc-open');
  }
  function closeAddMoreModal() { addModalOverlay.classList.remove('lc-open'); }

  window.LegoCart = {
    add: addItem, open, close, getItems: load, clear: () => save([]),
    openAddMore: openAddMoreModal,
  };

  // ---------- Product page auto-detection ----------
  function detectProductAndHook() {
    if (!window.LegoConfig) return;
    const p = window.LegoConfig.detectCurrent();
    if (!p) return;

    const addSelectors = [
      '.checkoutButtonLink',
      '.vtex-add-to-cart-button',
      '[class*="buyButton"]','[class*="BuyButton"]','[class*="buybutton"]',
      'button[class*="add-to-cart"]', 'a[href*="/checkout/cart/add"]',
      'button.buy-button','a.buy-button',
      'a[href*="checkout.legostores.online"]',
    ].join(',');
    const isInternalCartUI = (el) => !!(el.closest && el.closest('.lc-drawer, .lc-modal, .lc-modal-overlay, .lc-details, .lc-details-overlay, .lc-overlay'));
    const isBuyByText = (el) => {
      if (isInternalCartUI(el)) return false;
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t || t.length > 40) return false;
      return /^(compre agora|comprar agora|comprar|adicionar ao carrinho|adicionar|buy now|add to cart)$/i.test(t);
    };
    const attach = (btn) => {
      if (btn.__lcHooked) return;
      btn.__lcHooked = true;
      // Neutralize inline handlers/href that could redirect externally
      try { btn.removeAttribute('onclick'); } catch (e) {}
      if (btn.tagName === 'A') { try { btn.setAttribute('href', 'javascript:void(0)'); btn.removeAttribute('target'); } catch (e) {} }
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        addItem({ id: p.slug, sku: p.sku, name: p.name+' ('+p.sku+')', price: p.price, image: p.image, qty: 1 });
        open();
      }, true);
    };
    const scan = () => {
      document.querySelectorAll(addSelectors).forEach((el) => { if (!isInternalCartUI(el)) attach(el); });
      document.querySelectorAll('button, a').forEach((el) => { if (!el.__lcHooked && isBuyByText(el)) attach(el); });
    };
    scan();
    // Extra safety: intercept clicks that survive at document capture
    document.addEventListener('click', (ev) => {
      const t = ev.target && ev.target.closest && ev.target.closest('.checkoutButtonLink, a[href*="checkout.legostores.online"]');
      if (!t) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      ev.stopPropagation();
      addItem({ id: p.slug, sku: p.sku, name: p.name+' ('+p.sku+')', price: p.price, image: p.image, qty: 1 });
      open();
    }, true);
    new MutationObserver(scan).observe(document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); detectProductAndHook(); });
  } else { mount(); detectProductAndHook(); }
})();
