/* Sync product rating (score + reviews + stars) across:
   - Vitrine cards (uses value already in HTML, but normalizes)
   - Product page header (any element with .rating, .product-rating, [class*="rating"])
   - Reviews section (.trustvox-widget-rating, [data-trustvox-product-code])
   Source of truth: window.LegoConfig.PRODUCTS
*/
(function () {
  function starsHtml(rate) {
    const full = Math.round(rate);
    let s = '';
    for (let i=0;i<5;i++) s += (i<full?'★':'☆');
    return s;
  }
  function formatBlock(p) {
    return '<span class="lc-stars" style="color:#f5a623;letter-spacing:1px;">'+starsHtml(p.rating)+'</span> ' +
      '<span style="color:#111;font-weight:700;margin-left:6px;">'+p.rating.toFixed(1).replace('.',',')+'</span> ' +
      '<span style="color:#666;">('+p.reviews+' avaliações)</span>';
  }

  function sync() {
    if (!window.LegoConfig) return;
    const p = window.LegoConfig.detectCurrent();
    if (!p) return;

    // Injeta código SKU (#43011) acima do nome do produto na página de produto.
    // Fica no lado esquerdo da linha (badges), enquanto o rating fica na direita.
    document.querySelectorAll('.legobrasil-custom-components-0-x-productNameCustom--productDetail').forEach(h1 => {
      if (h1.__lcSkuDone) return;
      h1.__lcSkuDone = true;
      // Remove qualquer prefixo "Editions - " duplicado? Mantém H1 como está.
      const badge = document.createElement('div');
      badge.className = 'lc-product-sku';
      badge.setAttribute('data-lc-sku','');
      badge.style.cssText = 'font-size:14px;font-weight:700;color:#666;letter-spacing:0.5px;margin-bottom:6px;';
      badge.textContent = '#' + p.sku;
      // Inserir antes da linha que contém o H1 (row two), no início do container do produto
      const rowTwo = h1.closest('.vtex-flex-layout-0-x-flexRow--productDetailRowTwo');
      if (rowTwo && rowTwo.parentNode && !rowTwo.parentNode.querySelector('[data-lc-sku]')) {
        rowTwo.parentNode.insertBefore(badge, rowTwo);
      } else if (!h1.parentNode.querySelector('[data-lc-sku]')) {
        h1.parentNode.insertBefore(badge, h1);
      }
    });

    // Header of product page: replace any existing rating text
    document.querySelectorAll('[data-lego-rating="header"], .lego-rating-header').forEach(el => {
      el.innerHTML = formatBlock(p);
    });

    // Trustvox rating placeholders — replace with our synced value
    document.querySelectorAll('.trustvox-widget-rating, .trustvox-fluid-jump, [data-trustvox-product-code]').forEach(el => {
      if (el.__lcRatingDone) return;
      el.__lcRatingDone = true;
      el.innerHTML = '<div class="lego-rating-inline" style="display:inline-flex;align-items:center;gap:8px;font-size:15px;">'+formatBlock(p)+'</div>';
    });

    // Reviews section summary (.reviews-summary or [data-lego-rating="reviews"])
    document.querySelectorAll('[data-lego-rating="reviews"], .lego-reviews-summary').forEach(el => {
      el.innerHTML = '<div style="font-size:34px;font-weight:800;">'+p.rating.toFixed(1).replace('.',',')+'</div>' +
        '<div style="color:#f5a623;font-size:22px;letter-spacing:2px;">'+starsHtml(p.rating)+'</div>' +
        '<div style="color:#666;">Baseado em '+p.reviews+' avaliações verificadas</div>';
    });

    // Legacy: enhance .lc-gallery-count from cart.js — override count to real one
    document.querySelectorAll('.lc-gallery-count .lc-num').forEach(el => {
      el.textContent = '('+p.reviews+')';
    });
  }

  // Run immediately and also observe DOM for widgets that mount async
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else { sync(); }
  const obs = new MutationObserver(() => sync());
  obs.observe(document.documentElement, { childList:true, subtree:true });

  // Also sync vitrine cards to config (in case source-of-truth differs from HTML)
  function syncVitrine() {
    if (!window.LegoConfig) return;
    document.querySelectorAll('.product-card').forEach(card => {
      if (card.__lcRatingSync) return;
      const oc = card.getAttribute('onclick') || '';
      const m = oc.match(/'([^']+)\/index\.html/);
      if (!m) return;
      const slug = m[1].split('/').pop();
      const p = window.LegoConfig.getBySlug(slug);
      if (!p) return;
      const r = card.querySelector('.product-rating');
      if (r) {
        const full = Math.floor(p.rating);
        const half = (p.rating - full) >= 0.5;
        let stars = '';
        for (let i=0;i<full;i++) stars += '★';
        if (half) stars += '☆';
        for (let i=0;i<(5-full-(half?1:0));i++) stars += '☆';
        r.innerHTML = '<span style="color:#f5a623;letter-spacing:1px;">'+stars+'</span> <span style="color:#666;font-weight:600;">'+p.rating.toFixed(1).replace('.',',')+'</span> ('+p.reviews+')';
      }
      card.__lcRatingSync = true;
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncVitrine);
  } else { syncVitrine(); }
  const obs2 = new MutationObserver(syncVitrine);
  obs2.observe(document.documentElement, { childList:true, subtree:true });
})();
