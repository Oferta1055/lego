/* LEGO Checkout — logic v3
   - Order bump (fixed R$ 29,45) exclusive to checkout, collapsed CTA
   - Bump lets user inspect product before adding; only shown while subtotal < R$ 55
   - Fast-shipping progress bar (target R$ 55) — Correios fica grátis se atingido
   - Resumo do Pedido com quantidade/remover; frete "Calculado na entrega" até step 2
*/
(function () {
  const STORAGE_KEY = 'lego_cart_v1';
  const ORDER_KEY = 'lego_last_order_v1';
  const BUMP_DECLINED_KEY = 'lego_bump_declined_v1';
  const money = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const CFG = window.LegoConfig || {};
  const TARGET = CFG.FAST_SHIPPING_TARGET || 55;
  const FAST_PRICE = CFG.FAST_SHIPPING_PRICE || 24.90;
  const BUMP_PRICE = CFG.ORDER_BUMP_PRICE || 29.45;
  const PIX_DISCOUNT = 0.10;

  const FAST_METHOD = CFG.FAST_SHIPPING || {};
  const STANDARD_METHOD = CFG.STANDARD_SHIPPING || {};
  const SHIPPING = {
    sedex: {
      name: FAST_METHOD.name || 'Correios (mais rápido)', price: FAST_PRICE,
      minBusinessDays: FAST_METHOD.minBusinessDays || 3, maxBusinessDays: FAST_METHOD.maxBusinessDays || 5, eta: '',
    },
    jdlg: {
      name: STANDARD_METHOD.name || 'Jadlog Express', price: 0,
      minBusinessDays: STANDARD_METHOD.minBusinessDays || 7, maxBusinessDays: STANDARD_METHOD.maxBusinessDays || 12, eta: '',
    },
  };

  function refreshShippingEstimates(baseDate) {
    const estimator = window.LegoDeliveryDates;
    if (!estimator || typeof estimator.estimate !== 'function') return;
    Object.entries(SHIPPING).forEach(([key, method]) => {
      const estimate = estimator.estimate(method.minBusinessDays, method.maxBusinessDays, baseDate);
      method.eta = estimate.label;
      method.estimatedFrom = estimate.from;
      method.estimatedTo = estimate.to;
      const etaElement = $(`#ck-ship-${key}-eta`);
      if (etaElement) etaElement.textContent = estimate.label;
    });
  }

  let items = [];
  try { items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) {}

  const customer = { name:'', email:'', cellphone:'', taxId:'' };
  const address = {};
  let shippingKey = 'jdlg';
  let shippingChosen = false;   // becomes true only when user reaches step 2/beyond
  let resolvedCep = '';
  let requestedCep = '';
  let cepRequestToken = 0;
  let bumpExpanded = false;     // "Ver produtos" toggled the collapsed CTA
  let currentStep = 1;
  let pollTimer = null;
  let currentTx = null;

  function subtotal() { return items.reduce((s, i) => s + i.price * i.qty, 0); }
  function fastUnlocked() { return subtotal() >= TARGET; }
  function shippingPrice() {
    if (shippingKey === 'sedex') return fastUnlocked() ? 0 : FAST_PRICE;
    return 0;
  }
  function calc() {
    const st = subtotal();
    const discount = st * PIX_DISCOUNT;
    const shipping = shippingChosen ? shippingPrice() : 0;
    // Total mostrado antes de escolher entrega: usa apenas subtotal - desconto (frete calculado depois)
    const total = shippingChosen ? (st - discount + shipping) : (st - discount);
    return { subtotal: st, discount, shipping, total };
  }

  function persistCart() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {} }

  // -------- Order Bump --------
  function bumpPriceFor(p) {
    const configured = p && p.bumpPrice;
    return configured != null && Number.isFinite(Number(configured)) ? Number(configured) : BUMP_PRICE;
  }
  function bumpCandidates() {
    if (!CFG.PRODUCTS) return [];
    const inCartIds = new Set(items.map(i => i.id));
    const allowed = CFG.ORDER_BUMP_ALLOWED_SKUS || [];
    const frameByProductSku = CFG.ORDER_BUMP_BY_PRODUCT_SKU || {};
    const frameSlugs = Array.from(new Set(items
      .filter(i => !String(i.id || '').startsWith('bump:') && !String(i.id || '').startsWith('promo:'))
      .map(i => frameByProductSku[String(i.sku || '')] || frameByProductSku[String(i.id || '')])
      .filter(Boolean)));
    const matchedFrames = frameSlugs.map(slug => CFG.getBySlug(slug)).filter(Boolean);
    const source = matchedFrames.length ? matchedFrames : CFG.PRODUCTS.filter(p => allowed.includes(p.sku));
    return source.filter(p =>
      !inCartIds.has(p.slug) &&
      !inCartIds.has('bump:'+p.slug) &&
      !inCartIds.has('promo:'+p.slug)
    ).slice(0, 5);
  }
  function bumpDeclined() {
    try { return sessionStorage.getItem(BUMP_DECLINED_KEY) === '1'; } catch(e) { return false; }
  }
  function setBumpDeclined(v) {
    try { v ? sessionStorage.setItem(BUMP_DECLINED_KEY, '1') : sessionStorage.removeItem(BUMP_DECLINED_KEY); } catch(e) {}
  }
  function bumpSelected() {
    return items.some(i => String(i.id).startsWith('bump:'));
  }

  function renderBump() {
    const box = $('#ck-bump');
    if (!box) return;
    const cands = bumpCandidates();
    const offerPrice = bumpPriceFor(cands[0]);
    const frameOffer = cands.length > 0 && cands.every(p => p.bumpType === 'frame');
    // Regras de exibição por etapa:
    //  - Etapa 1: sempre (se houver candidatos e o usuário não recusou)
    //  - Etapa 2: nunca (foco em endereço/frete)
    //  - Etapa 3: apenas se NÃO tiver sido selecionado na etapa 1
    const allowedStep =
      currentStep === 1 ? true :
      currentStep === 2 ? false :
      /* step 3 */ !bumpSelected();

    if (!allowedStep || !items.length || !cands.length || fastUnlocked() || bumpDeclined()) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    if (!bumpExpanded) {
      box.innerHTML = `
        <div class="ck-bump-cta">
          <span class="ck-bump-tag">OFERTA EXCLUSIVA</span>
          <h3>${frameOffer ? 'Adicione o quadro compatível com seu Technic por apenas' : 'Adicione ao seu pedido por apenas'} <span class="ck-bump-fixed">${money(offerPrice)}</span></h3>
          <p>${frameOffer ? 'Confira as imagens e informações do quadro antes de adicionar.' : 'Preço promocional válido apenas neste checkout — ajuda a liberar o <strong>frete rápido grátis</strong>.'}</p>
          <div class="ck-bump-cta-btns">
            <button type="button" class="ck-bump-yes" id="ck-bump-yes">Ver produtos</button>
            <button type="button" class="ck-bump-no" id="ck-bump-no">Não, obrigado</button>
          </div>
        </div>
      `;
      $('#ck-bump-yes').addEventListener('click', () => { bumpExpanded = true; renderBump(); });
      $('#ck-bump-no').addEventListener('click', () => { setBumpDeclined(true); renderBump(); });
      return;
    }
    // Expanded list
    box.innerHTML = `
      <div class="ck-bump-head">
        <span class="ck-bump-tag">OFERTA EXCLUSIVA</span>
        <h3>${frameOffer ? 'Quadro compatível com seu Technic por' : 'Escolha qualquer um por apenas'} <span class="ck-bump-fixed">${money(offerPrice)}</span></h3>
        <p>${frameOffer ? 'Abra “Ver detalhes” para conferir a imagem e as características antes de adicionar.' : 'Preço promocional válido apenas neste checkout.'}</p>
        <button type="button" class="ck-bump-collapse" id="ck-bump-collapse">Recolher</button>
      </div>
      <div class="ck-bump-list">
        ${cands.map(p => {
          const itemPrice = bumpPriceFor(p);
          const oldPrice = p.hideReferencePrice ? '' : `<span class="ck-bump-old">${money(p.price)}</span>`;
          return `
          <div class="ck-bump-item" data-slug="${p.slug}">
            <img src="${p.image}" alt="${p.name}" onerror="this.style.visibility='hidden'">
            <div class="ck-bump-info">
              <div class="ck-bump-name">${p.name}</div>
              <div class="ck-bump-price">
                ${oldPrice}
                <span class="ck-bump-new">${money(itemPrice)}</span>
              </div>
            </div>
            <div class="ck-bump-btns">
              <button type="button" class="ck-bump-inspect" data-inspect="${p.slug}">Ver detalhes</button>
              <button type="button" class="ck-bump-add" data-add="${p.slug}">Adicionar</button>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    `;
    $('#ck-bump-collapse').addEventListener('click', () => { bumpExpanded = false; renderBump(); });
    box.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => addBumpProduct(btn.dataset.add));
    });
    box.querySelectorAll('[data-inspect]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = CFG.getBySlug(btn.dataset.inspect);
        if (!p || !window.LegoDetails) return;
        const itemPrice = bumpPriceFor(p);
        window.LegoDetails.open(p, {
          promoPrice: itemPrice, hideReferencePrice: p.hideReferencePrice === true, tag: 'OFERTA CHECKOUT',
          actionLabel: 'Adicionar por ' + money(itemPrice),
          onAdd: () => addBumpProduct(p.slug),
        });
      });
    });
  }

  function addBumpProduct(slug) {
    const p = CFG.getBySlug(slug);
    if (!p) return;
    const bumpId = 'bump:'+p.slug;
    const idx = items.findIndex(i => i.id === bumpId);
    if (idx !== -1) return; // already added
    items.push({ id: bumpId, sku: p.sku, name: p.name+' ('+p.sku+') · Oferta Checkout', price: bumpPriceFor(p), image: p.image, qty: 1 });
    persistCart();
    refreshAll();
  }

  // -------- Progress bar --------
  function renderProgress() {
    const wrap = $('#ck-progress-wrap');
    if (!wrap) return;
    const st = subtotal();
    const pct = Math.min(100, Math.round((st / TARGET) * 100));
    $('#ck-progress-bar').style.width = pct + '%';
    const remaining = Math.max(0, TARGET - st);
    if (remaining <= 0) {
      $('#ck-progress-text').innerHTML = '🚀 <strong>Frete rápido liberado!</strong> Correios grátis se você escolher.';
      $('#ck-progress-bar').classList.add('ck-progress-done');
    } else {
      $('#ck-progress-text').innerHTML = 'Faltam <strong>'+money(remaining)+'</strong> para o <strong>frete rápido (Correios) grátis</strong>.';
      $('#ck-progress-bar').classList.remove('ck-progress-done');
    }
    const sedexPriceEl = $('#ck-ship-sedex-price');
    if (sedexPriceEl) {
      if (fastUnlocked()) {
        sedexPriceEl.innerHTML = '<span class="ck-old">'+money(FAST_PRICE)+'</span> <span class="ck-free">Grátis</span>';
      } else {
        sedexPriceEl.innerHTML = money(FAST_PRICE);
      }
    }
  }

  // -------- Summary (with qty +/- and remove) --------
  function renderSummary() {
    const box = $('#ck-items');
    if (!items.length) {
      box.innerHTML = `<div class="ck-empty">Seu carrinho está vazio.<br><a href="/">Ver produtos</a></div>`;
      $$('.ck-next').forEach(b => b.disabled = true);
      $('#ck-subtotal').textContent = money(0);
      $('#ck-discount').textContent = '- ' + money(0);
      $('#ck-shipping').textContent = 'Calculado na entrega';
      $('#ck-ship-label').textContent = '';
      $('#ck-total').textContent = money(0);
      return;
    }
    $$('.ck-next').forEach(b => b.disabled = false);
    box.innerHTML = items.map((it, idx) => `
      <div class="ck-sum-item" data-idx="${idx}">
        <img src="${it.image || ''}" alt="" onerror="this.style.visibility='hidden'">
        <div class="ck-sum-mid">
          <div class="n">${it.name}</div>
          <div class="ck-sum-qty">
            <button type="button" data-act="dec" aria-label="Diminuir">−</button>
            <span>${it.qty}</span>
            <button type="button" data-act="inc" aria-label="Aumentar">+</button>
            <button type="button" class="ck-sum-details" data-act="details">Detalhes</button>
            <button type="button" class="ck-sum-rm" data-act="rm">Remover</button>
          </div>
        </div>
        <div class="p">${money(it.price * it.qty)}</div>
      </div>
    `).join('');
    box.querySelectorAll('.ck-sum-item').forEach(row => {
      const idx = +row.dataset.idx;
      row.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          if (act === 'inc') items[idx].qty += 1;
          else if (act === 'dec') items[idx].qty = Math.max(1, items[idx].qty - 1);
          else if (act === 'rm') items.splice(idx, 1);
          else if (act === 'details') {
            const cur = items[idx];
            const p = CFG.getBySlug((cur.sku||'').toString()) || CFG.getBySlug((cur.id||'').replace(/^(bump|promo):/,''));
            if (p && window.LegoDetails) window.LegoDetails.open(p);
            return;
          }
          persistCart();
          refreshAll();
        });
      });
    });
    const t = calc();
    $('#ck-subtotal').textContent = money(t.subtotal);
    $('#ck-discount').textContent = '- ' + money(t.discount);
    if (shippingChosen) {
      $('#ck-shipping').innerHTML = t.shipping ? money(t.shipping) : '<span class="ck-free">Grátis</span>';
      $('#ck-ship-label').textContent = SHIPPING[shippingKey].name;
    } else {
      $('#ck-shipping').textContent = 'Calculado na entrega';
      $('#ck-ship-label').textContent = '';
    }
    $('#ck-total').textContent = money(t.total);
  }

  function refreshAll() { renderSummary(); renderProgress(); renderBump(); }
  refreshShippingEstimates();
  refreshAll();

  // -------- step nav --------
  function goStep(n) {
    currentStep = n;
    $$('.ck-panel').forEach(p => p.hidden = true);
    $('#ck-panel-' + n).hidden = false;
    $$('.ck-step').forEach(s => {
      const step = +s.dataset.step;
      s.classList.toggle('ck-active', step === n);
      s.classList.toggle('ck-done', step < n);
    });
    renderBump();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // -------- masks --------
  const maskPhone = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  const maskCPF = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  const maskCEP = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  function setCepStatus(message, state = '') {
    const status = $('#ck-cep-status');
    if (!status) return;
    status.textContent = message;
    status.className = 'ck-cep-status' + (state ? ' is-' + state : '');
  }
  function clearAddressForCepChange() {
    const form = $('#ck-panel-2');
    ['street', 'district', 'city', 'state'].forEach((key) => {
      if (form && form[key]) form[key].value = '';
    });
  }
  function setShippingOptionsVisible(visible) {
    const section = $('#ck-shipping-section');
    const show = Boolean(visible && resolvedCep.length === 8);
    if (section) section.hidden = !show;
    if (!show) {
      const hadSelection = shippingChosen || shippingKey !== 'jdlg';
      shippingChosen = false;
      shippingKey = 'jdlg';
      const defaultMethod = $('input[name="shipping"][value="jdlg"]');
      if (defaultMethod) defaultMethod.checked = true;
      if (hadSelection) renderSummary();
    }
  }
  async function lookupCep(rawCep) {
    const cep = rawCep.replace(/\D/g, '');
    if (cep.length !== 8 || cep === resolvedCep || cep === requestedCep) return;
    requestedCep = cep;
    const requestToken = ++cepRequestToken;
    setShippingOptionsVisible(false);
    setCepStatus('Consultando o endereço pelo CEP…', 'loading');
    const manualButton = $('#ck-cep-manual');
    if (manualButton) manualButton.hidden = true;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error('Falha na consulta do CEP.');
      const data = await response.json();
      const form = $('#ck-panel-2');
      if (requestToken !== cepRequestToken || form.cep.value.replace(/\D/g, '') !== cep) return;
      requestedCep = '';
      if (data.erro || !data.localidade || !data.uf) {
        resolvedCep = '';
        setCepStatus('CEP não localizado. Confira os números ou preencha o endereço manualmente.', 'error');
        if (manualButton) manualButton.hidden = false;
        return;
      }
      form.street.value = form.street.value || data.logradouro || '';
      form.district.value = form.district.value || data.bairro || '';
      form.city.value = form.city.value || data.localidade || '';
      form.state.value = form.state.value || data.uf || '';
      resolvedCep = cep;
      setShippingOptionsVisible(true);
      setCepStatus('Endereço localizado. Escolha uma forma de entrega.', 'success');
    } catch (error) {
      if (requestToken !== cepRequestToken) return;
      requestedCep = '';
      resolvedCep = '';
      setCepStatus('Não foi possível consultar o CEP. Confira a conexão ou preencha o endereço manualmente.', 'error');
      if (manualButton) manualButton.hidden = false;
    }
  }
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'cellphone') t.value = maskPhone(t.value);
    if (t.name === 'taxId') t.value = maskCPF(t.value);
    if (t.name === 'cep') {
      t.value = maskCEP(t.value);
      const cep = t.value.replace(/\D/g, '');
      if (cep === resolvedCep || cep === requestedCep) return;
      if (resolvedCep) clearAddressForCepChange();
      resolvedCep = '';
      const manualButton = $('#ck-cep-manual');
      if (manualButton) manualButton.hidden = true;
      if (cep.length === 8) {
        lookupCep(cep);
      } else {
        requestedCep = '';
        cepRequestToken += 1;
        setShippingOptionsVisible(false);
        setCepStatus(cep ? 'Digite os 8 dígitos do CEP para consultar o endereço.' : 'Informe o CEP para consultar o endereço e liberar as opções de entrega.');
      }
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'shipping') { shippingKey = e.target.value; shippingChosen = true; renderSummary(); }
  });

  function isValidCPF(cpf) {
    cpf = cpf.replace(/\D/g,'');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let sum=0, rem;
    for (let i=1;i<=9;i++) sum += parseInt(cpf.charAt(i-1))*(11-i);
    rem=(sum*10)%11; if (rem===10||rem===11) rem=0;
    if (rem !== parseInt(cpf.charAt(9))) return false;
    sum=0;
    for (let i=1;i<=10;i++) sum += parseInt(cpf.charAt(i-1))*(12-i);
    rem=(sum*10)%11; if (rem===10||rem===11) rem=0;
    return rem === parseInt(cpf.charAt(10));
  }

  document.addEventListener('blur', (e) => {
    if (e.target.name !== 'cep') return;
    const cep = e.target.value.replace(/\D/g,'');
    if (cep.length === 8 && cep !== resolvedCep && cep !== requestedCep) lookupCep(cep);
  }, true);

  $('#ck-cep-manual').addEventListener('click', () => {
    const form = $('#ck-panel-2');
    const cep = form.cep.value.replace(/\D/g, '');
    if (cep.length !== 8) {
      setCepStatus('Informe os 8 dígitos do CEP antes de continuar.', 'error');
      return;
    }
    cepRequestToken += 1;
    requestedCep = '';
    resolvedCep = cep;
    $('#ck-cep-manual').hidden = true;
    setShippingOptionsVisible(true);
    setCepStatus('Preencha o endereço manualmente e escolha uma forma de entrega.', 'success');
  });

  $('#ck-panel-1').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    customer.name = f.name.value.trim();
    customer.email = f.email.value.trim();
    customer.cellphone = f.cellphone.value.replace(/\D/g,'');
    customer.taxId = f.taxId.value.replace(/\D/g,'');
    if (customer.cellphone.length < 10) return alert('Telefone inválido — inclua DDD.');
    if (!isValidCPF(customer.taxId)) return alert('CPF inválido.');
    goStep(2);
  });

  $('#ck-panel-2').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const cep = f.cep.value.replace(/\D/g, '');
    if (cep.length !== 8 || cep !== resolvedCep) {
      setShippingOptionsVisible(false);
      if (cep.length === 8 && requestedCep === cep) {
        setCepStatus('Aguarde a consulta do endereço antes de continuar.', 'loading');
      } else {
        setCepStatus('Consulte o CEP ou escolha o preenchimento manual antes de continuar.', 'error');
        if (cep.length === 8) lookupCep(cep);
      }
      f.cep.focus();
      return;
    }
    ['cep','street','number','district','city','state'].forEach(k => address[k] = f[k].value.trim());
    address.complement = f.complement.value.trim();
    const sel = f.querySelector('input[name="shipping"]:checked');
    shippingKey = sel ? sel.value : 'jdlg';
    shippingChosen = true;
    renderSummary();
    goStep(3);
  });

  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (back) goStep(+back.dataset.back);
  });

  function renderOrderDetails(txid) {
    const t = calc();
    const ship = SHIPPING[shippingKey];
    $('#ck-od-id').textContent = txid ? String(txid).slice(0, 12).toUpperCase() : '—';
    $('#ck-od-items').innerHTML = items.map(it => `
      <div class="ck-od-item">
        <img src="${it.image || ''}" alt="" onerror="this.style.visibility='hidden'">
        <span class="ck-od-item-name">${it.name}</span>
        <span class="ck-od-item-qty">x${it.qty}</span>
        <span class="ck-od-item-price">${money(it.price * it.qty)}</span>
      </div>`).join('');
    $('#ck-od-subtotal').textContent = money(t.subtotal);
    $('#ck-od-discount').textContent = '- ' + money(t.discount);
    $('#ck-od-ship-name').textContent = '(' + ship.name + ')';
    $('#ck-od-shipping').innerHTML = t.shipping ? money(t.shipping) : '<span class="ck-free">Grátis</span>';
    $('#ck-od-total').textContent = money(t.total);
    $('#ck-od-customer').textContent = `${customer.name} • ${customer.email}`;
    const cmpl = address.complement ? ', ' + address.complement : '';
    $('#ck-od-address').textContent = `${address.street}, ${address.number}${cmpl} — ${address.district}, ${address.city}/${address.state} — CEP ${address.cep}`;
    $('#ck-od-eta').textContent = `Envio ${ship.name} • ${ship.eta}`;
  }

  function saveOrder(txid) {
    refreshShippingEstimates();
    const t = calc();
    const order = {
      txid: txid || ('LG' + Date.now()),
      createdAt: Date.now(),
      items, customer, address,
      shipping: { key: shippingKey, ...SHIPPING[shippingKey], price: shippingPrice() },
      totals: t,
    };
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (e) {}
    return order;
  }

  function fetchWithTimeout(url, opts = {}, ms = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  async function generatePix() {
    if (!items.length) return alert('Carrinho vazio.');
    // ensure shippingChosen for calc consistency at final step
    shippingChosen = true;
    $('#ck-pay-init').hidden = true;
    $('#ck-pay-error').hidden = true;
    $('#ck-pay-loading').hidden = false;
    const t = calc();
    const amountCents = Math.round(t.total * 100);
    const description = items.map(i => `${i.qty}x ${i.name}`).join(' | ').slice(0, 200);
    try {
      const res = await fetchWithTimeout('/api/create-pix', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          amount: amountCents, description, customer, address,
          shipping: { key: shippingKey, name: SHIPPING[shippingKey].name, price: shippingPrice() },
          items: items.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty })),
        }),
      }, 20000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar Pix');
      currentTx = { txid: data.txid, route: data.route };
      saveOrder(data.txid);
      renderOrderDetails(data.txid);
      $('#ck-pay-loading').hidden = true;
      $('#ck-pay-pix').hidden = false;
      $('#ck-qr').src = data.pix_qr_code;
      $('#ck-pix-code').value = data.pix_code;
      startPolling();
    } catch (err) {
      $('#ck-pay-loading').hidden = true;
      $('#ck-pay-error').hidden = false;
      const msg = err && err.name === 'AbortError'
        ? 'A conexão demorou demais. Verifique sua internet e tente novamente.'
        : (err.message || 'Erro desconhecido.');
      $('#ck-error-msg').textContent = msg;
    }
  }

  $('#ck-generate-pix').addEventListener('click', generatePix);
  $('#ck-retry-pix').addEventListener('click', generatePix);

  $('#ck-copy').addEventListener('click', async () => {
    const code = $('#ck-pix-code').value;
    try { await navigator.clipboard.writeText(code); }
    catch (e) { $('#ck-pix-code').select(); document.execCommand('copy'); }
    const b = $('#ck-copy');
    const svgCopy = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
    const svgCheck = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><path d="M5 12l5 5L20 7"/></svg>';
    b.innerHTML = svgCheck + 'Copiado!'; b.classList.add('copied');
    setTimeout(() => { b.innerHTML = svgCopy + 'Copiar código'; b.classList.remove('copied'); }, 2000);
  });

  function confirmPaid() {
    const order = saveOrder(currentTx && currentTx.txid);
    order.status = 'paid';
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    window.location.href = '/obrigado.html';
  }

  const POLL_INTERVAL = 7000, POLL_MAX_TRIES = 240, POLL_FAIL_THRESHOLD = 3;
  let tries = 0, consecutiveFails = 0, checking = false;
  function setPollWarn(show, msg) {
    const w = $('#ck-poll-warn'); if (!w) return;
    w.hidden = !show;
    if (show && msg) { const m = $('#ck-poll-warn-msg'); if (m) m.textContent = msg; }
  }
  async function checkStatus() {
    if (!currentTx || checking) return;
    checking = true; tries++;
    try {
      const r = await fetchWithTimeout(`/api/payment-status?txid=${encodeURIComponent(currentTx.txid)}&route=${encodeURIComponent(currentTx.route)}`, {}, 12000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      consecutiveFails = 0; setPollWarn(false);
      if (d.status === 'approved' || d.status === 'paid') { stopPolling(); confirmPaid(); }
      else if (d.status && d.status !== 'waiting_payment' && d.status !== 'pending') {
        stopPolling();
        const st = $('.ck-await-head span');
        if (st) st.innerHTML = `<span style="color:#DA291C">Pagamento ${d.status}. Recarregue para tentar novamente.</span>`;
      }
    } catch (e) {
      consecutiveFails++;
      if (consecutiveFails >= POLL_FAIL_THRESHOLD) setPollWarn(true, 'Não conseguimos verificar o pagamento no momento. Continuaremos tentando — ou use "Verificar pagamento agora".');
    } finally { checking = false; }
    if (tries > POLL_MAX_TRIES) stopPolling();
  }
  function startPolling() { if (!currentTx) return; stopPolling(); tries=0; consecutiveFails=0; pollTimer = setInterval(checkStatus, POLL_INTERVAL); }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  const checkNowBtn = $('#ck-check-now');
  if (checkNowBtn) {
    checkNowBtn.addEventListener('click', async () => {
      if (checking) return;
      const original = checkNowBtn.innerHTML;
      checkNowBtn.disabled = true;
      checkNowBtn.textContent = 'Verificando...';
      await checkStatus();
      if (currentTx && !pollTimer) startPolling();
      checkNowBtn.disabled = false;
      checkNowBtn.innerHTML = original;
    });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && currentTx && pollTimer) checkStatus(); });
  window.addEventListener('online', () => { if (currentTx) { setPollWarn(false); if (!pollTimer) startPolling(); else checkStatus(); } });
})();
