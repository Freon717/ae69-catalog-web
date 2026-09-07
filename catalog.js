const Catalog = (() => {
  const APP_VERSION = 'web-1.1';
  const MANIFESTS = [
    'https://raw.githubusercontent.com/Freon717/ae69-catalog-data/main/catalog-manifest.json',
    'https://cdn.jsdelivr.net/gh/Freon717/ae69-catalog-data@main/catalog-manifest.json'
  ];
  const JSON_URLS = [
    'https://raw.githubusercontent.com/Freon717/ae69-catalog-data/main/catalog.json',
    'https://cdn.jsdelivr.net/gh/Freon717/ae69-catalog-data@main/catalog.json'
  ];
  const DB_NAME = 'ae69-catalog';
  const STORE = 'meta';
  const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
  const RU = 'йцукенгшщзхъфывапролджэячсмитьбю';
  const WARE_CODE = /(?:[?&]ware_code=)(\d+)/i;

  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  let list = [];
  let byCode = new Map();
  let barcodeMap = new Map();
  let articleMap = new Map();
  let usedIndex = new Map();
  let dataVersion = 0;
  let updatedAt = '';
  let productCount = 0;
  let scanBusy = false;

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]/g, '');
  }
  function swapKeyboard(value) {
    const lower = String(value || '').toLowerCase();
    let out = '';
    for (const ch of lower) {
      const en = EN.indexOf(ch);
      const ru = RU.indexOf(ch);
      out += en >= 0 ? RU[en] : ru >= 0 ? EN[ru] : ch;
    }
    return out;
  }
  function metersFrom(quantity) {
    const value = Number(String(quantity).replace(',', '.'));
    if (!Number.isFinite(value) || value !== Math.trunc(value)) return String(quantity);
    return String(value / 1000).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }
  function unitFor(category, quantity) {
    if (category === 'w' || category === 'tt') return { quantity: metersFrom(quantity), unit: 'м' };
    return { quantity: String(quantity || '1'), unit: 'шт.' };
  }
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch { return undefined; }
  }
  async function idbSet(key, value) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  }
  function applyPayload(payload) {
    const products = payload && payload.products ? payload.products : [];
    list = products;
    byCode = new Map();
    barcodeMap = new Map();
    articleMap = new Map();
    usedIndex = new Map();
    for (const p of products) {
      byCode.set(String(p.c), p);
      const art = String(p.a || '').trim().toLowerCase();
      if (art) {
        if (!articleMap.has(art)) articleMap.set(art, []);
        articleMap.get(art).push(p.c);
      }
      for (const b of p.b || []) {
        const key = String(b).replace(/\D/g, '');
        if (!key) continue;
        if (!barcodeMap.has(key)) barcodeMap.set(key, []);
        const arr = barcodeMap.get(key);
        if (!arr.includes(p.c)) arr.push(p.c);
      }
      for (const item of String(p.k || '').split(',')) {
        const token = item.trim();
        if (!token) continue;
        const code = token.split('-', 2)[0].trim();
        if (!code) continue;
        if (!usedIndex.has(code)) usedIndex.set(code, []);
        usedIndex.get(code).push({ parent: p.c, raw: token });
      }
    }
    dataVersion = payload.dataVersion || 0;
    updatedAt = payload.updatedAt || '';
    productCount = payload.productCount || products.length;
  }
  async function fetchJson(urls) {
    let last;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        return await res.json();
      } catch (e) { last = e; }
    }
    throw last || new Error('offline');
  }
  async function load() {
    const cached = await idbGet('catalog');
    if (cached && cached.products) {
      applyPayload(cached);
      readyResolve();
      checkUpdate(false);
      return;
    }
    try {
      const bundled = await fetch('catalog.json');
      const payload = await bundled.json();
      applyPayload(payload);
      await idbSet('catalog', payload);
      readyResolve();
    } catch (e) {
      try {
        const payload = await fetchJson(JSON_URLS);
        applyPayload(payload);
        await idbSet('catalog', payload);
        readyResolve();
      } catch (err) {
        readyReject(err);
        return;
      }
    }
    checkUpdate(false);
  }
  async function checkUpdate(manual) {
    const notify = window.onCatalogUpdated;
    try {
      const manifest = await fetchJson(MANIFESTS);
      const remote = Number(manifest.dataVersion || 0);
      if (remote && remote > dataVersion) {
        const jsonUrl = manifest.jsonUrl;
        const payload = await fetchJson(jsonUrl ? [jsonUrl, ...JSON_URLS] : JSON_URLS);
        if (payload && payload.products && payload.products.length >= 1000) {
          applyPayload(payload);
          await idbSet('catalog', payload);
          if (notify) notify({ status: 'updated', message: 'Каталог обновлён', dataVersion, productCount, updatedAt });
          return;
        }
      }
      if (manual && notify) notify({ status: 'current', message: 'Каталог актуален', dataVersion, productCount, updatedAt });
    } catch (e) {
      if (manual && notify) notify({ status: navigator.onLine ? 'error' : 'offline', message: navigator.onLine ? 'Не удалось обновить' : 'Нет сети' });
    }
  }

  function cardItem(p) {
    return {
      code: p.c,
      article: p.a,
      name: p.n,
      category: p.h,
      photoCount: (p.p || []).length,
      photo: (p.p || [])[0] || ''
    };
  }
  function resolveComponent(token) {
    const item = String(token || '').trim();
    const parts = item.split('-');
    const code = (parts.shift() || '').trim();
    const quantity = parts.length ? parts.join('-').replace(/шт\.?/i, '').trim() : '1';
    const p = byCode.get(code);
    if (!p) return { code, quantity, article: '', name: 'Код отсутствует в базе', unit: '', found: false };
    const u = unitFor(p.g, quantity);
    return { code, quantity: u.quantity, article: p.a, name: p.n, unit: u.unit, found: true };
  }
  function usedIn(code) {
    const rows = usedIndex.get(String(code)) || [];
    const out = [];
    for (const row of rows) {
      const parent = byCode.get(row.parent);
      if (!parent) continue;
      const resolved = resolveComponent(row.raw);
      out.push({
        code: parent.c,
        article: parent.a,
        name: parent.n,
        quantity: resolved.quantity,
        unit: resolved.unit
      });
    }
    out.sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0) || String(a.code).localeCompare(b.code, 'ru'));
    return out;
  }
  function wareCodeFrom(value) {
    const m = String(value || '').match(WARE_CODE);
    return m ? m[1] : '';
  }
  function digitsOnly(value) {
    const compact = String(value || '').replace(/\s/g, '');
    const m = compact.match(/(\d{8,14})/);
    return m ? m[1] : compact.replace(/\D/g, '');
  }
  function codeFromInternalEan(digits) {
    if (!digits || digits.length !== 13 || !digits.startsWith('2169000')) return '';
    return String(Number(digits.slice(7, 12)));
  }
  function exists(code) {
    return !!code && byCode.has(String(code));
  }

function hitScan(text) {
    if (!text) return false;
    scanBusy = false;
    if (typeof window.onBarcode === 'function') window.onBarcode(String(text));
    return true;
  }
  function symbolText(symbol) {
    if (!symbol) return '';
    try {
      if (typeof symbol.decode === 'function') return String(symbol.decode('utf-8') || '');
    } catch {}
    if (symbol.data instanceof Uint8Array) return new TextDecoder().decode(symbol.data);
    return String(symbol.data || '');
  }
  function boostContrast(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      let v = (g - 128) * 1.55 + 128;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    return imageData;
  }
  async function decodeImageData(imageData) {
    const zbar = window.zbarWasm;
    if (!zbar || !zbar.scanImageData) return '';
    try {
      const symbols = await zbar.scanImageData(imageData);
      if (symbols && symbols.length) return symbolText(symbols[0]);
    } catch {}
    return '';
  }
  async function decodeCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let text = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (text) return text;
    return decodeImageData(boostContrast(ctx.getImageData(0, 0, canvas.width, canvas.height)));
  }
  function paintSource(source, canvas, rotate, band) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return false;
    let sx = 0, sy = 0, sW = sw, sH = sh;
    if (band) {
      if (rotate) {
        sW = Math.round(sw * 0.4);
        sx = Math.round((sw - sW) / 2);
      } else {
        sH = Math.round(sh * 0.4);
        sy = Math.round((sh - sH) / 2);
      }
    }
    const outW = rotate ? sH : sW;
    const outH = rotate ? sW : sH;
    const scale = outW > 1400 ? 1400 / outW : 1;
    canvas.width = Math.max(1, Math.round(outW * scale));
    canvas.height = Math.max(1, Math.round(outH * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (rotate) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(source, sx, sy, sW, sH, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
    } else {
      ctx.drawImage(source, sx, sy, sW, sH, 0, 0, canvas.width, canvas.height);
    }
    return true;
  }
  async function readSource(source) {
    const canvas = document.getElementById('scanCanvas') || document.createElement('canvas');
    const attempts = [
      { rotate: false, band: false },
      { rotate: false, band: true },
      { rotate: true, band: false },
      { rotate: true, band: true }
    ];
    for (const attempt of attempts) {
      if (!paintSource(source, canvas, attempt.rotate, attempt.band)) continue;
      const text = await decodeCanvas(canvas);
      if (text) return text;
    }
    return '';
  }
  function startScan() {
    const input = document.getElementById('scanFile');
    if (!input) {
      if (typeof window.flash === 'function') window.flash('Сканер недоступен');
      return;
    }
    input.value = '';
    input.click();
  }
  async function scanPhoto(file) {
    if (!file) return;
    if (typeof window.flash === 'function') window.flash('Читаю этикетку…');
    scanBusy = true;
    try {
      let source;
      if (typeof createImageBitmap === 'function') {
        try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
      }
      if (!source) {
        const url = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
        URL.revokeObjectURL(url);
      }
      const text = await readSource(source);
      if (source && source.close) try { source.close(); } catch {}
      if (!hitScan(text) && typeof window.flash === 'function') {
        window.flash('Код не распознан. Снимите ближе, с зумом.');
      }
    } catch (e) {
      scanBusy = false;
      if (typeof window.flash === 'function') window.flash('Не удалось открыть фото');
    }
  }

  const api = {
    ready,
    photoUrl(url) { return url || ''; },
    scanBarcode() { startScan(); },
    checkUpdate() { checkUpdate(true); },
    catalogInfo() {
      return JSON.stringify({
        appVersion: APP_VERSION,
        dataVersion,
        productCount,
        updatedAt,
        online: navigator.onLine
      });
    },
    categories() {
      const map = new Map();
      for (const p of list) {
        const key = p.g || '';
        const name = p.h || 'Без категории';
        const rec = map.get(key) || { key, name, count: 0 };
        rec.count += 1;
        map.set(key, rec);
      }
      return JSON.stringify([...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    },
    search(rawQuery, category, offset, requestedLimit) {
      const raw = String(rawQuery || '').trim();
      const query = normalize(raw);
      const alternate = normalize(swapKeyboard(raw));
      const limit = Math.max(10, Math.min(requestedLimit || 50, 100));
      offset = Math.max(0, offset || 0);
      const filtered = [];
      for (const p of list) {
        if (category && p.g !== category) continue;
        if (query) {
          const hay = p.s || (normalize(p.c) + normalize(p.a) + normalize(p.n));
          if (!hay.includes(query) && !(alternate && alternate !== query && hay.includes(alternate))) continue;
        }
        filtered.push(p);
      }
      filtered.sort((a, b) => {
        const ac = String(a.c) === raw ? 0 : String(a.a).toLowerCase() === raw.toLowerCase() ? 1 : 2;
        const bc = String(b.c) === raw ? 0 : String(b.a).toLowerCase() === raw.toLowerCase() ? 1 : 2;
        if (ac !== bc) return ac - bc;
        return (Number(a.c) || 0) - (Number(b.c) || 0) || String(a.c).localeCompare(String(b.c), 'ru');
      });
      const items = filtered.slice(offset, offset + limit).map(cardItem);
      return JSON.stringify({ items, total: filtered.length, offset, hasMore: offset + items.length < filtered.length });
    },
    product(code) {
      const p = byCode.get(String(code));
      if (!p) return '{}';
      const components = String(p.k || '').split(',').map(resolveComponent).filter(c => c.code);
      return JSON.stringify({
        code: p.c,
        article: p.a,
        name: p.n,
        instruction: p.i,
        category: p.h,
        photos: p.p || [],
        barcodes: p.b || [],
        components,
        usedIn: usedIn(p.c)
      });
    },
    lookupScan(raw) {
      const value = String(raw || '').trim();
      const result = { query: value, match: 'none' };
      if (!value) return JSON.stringify(result);
      const fromQr = wareCodeFrom(value);
      if (exists(fromQr)) return JSON.stringify({ match: 'exact', code: fromQr, via: 'qr', query: fromQr });
      const digits = digitsOnly(value);
      const byBar = barcodeMap.get(digits) || [];
      if (byBar.length === 1) return JSON.stringify({ match: 'exact', code: byBar[0], via: 'barcode', query: byBar[0] });
      if (byBar.length > 1) return JSON.stringify({ match: 'multi', query: digits, codes: byBar });
      const fromEan = codeFromInternalEan(digits);
      if (exists(fromEan)) return JSON.stringify({ match: 'exact', code: fromEan, via: 'ean', query: fromEan });
      if (exists(value)) return JSON.stringify({ match: 'exact', code: value, via: 'code', query: value });
      const arts = articleMap.get(value.toLowerCase()) || [];
      if (arts.length === 1) return JSON.stringify({ match: 'exact', code: arts[0], via: 'article', query: arts[0] });
      if (arts.length > 1) return JSON.stringify({ match: 'multi', query: value, codes: arts });
      return JSON.stringify(result);
    },
    async copyText(text) {
      try { await navigator.clipboard.writeText(text || ''); }
      catch {
        const ta = document.createElement('textarea');
        ta.value = text || '';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    },
    async shareError(code, name) {
      const p = byCode.get(String(code)) || {};
      const message = 'Ошибка в карточке товара\n'
        + 'Код: ' + (code || '') + '\n'
        + 'Артикул: ' + (p.a || '') + '\n'
        + 'Наименование: ' + (name || '') + '\n'
        + 'Приложение: ' + APP_VERSION + ' · база ' + dataVersion + '\n'
        + 'Дата: ' + new Date().toLocaleString('ru-RU') + '\n\nЧто нужно исправить: ';
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Ошибка в справочнике АЭ', text: message });
          return;
        }
      } catch {}
      await api.copyText(message);
      if (typeof window.flash === 'function') window.flash('Текст ошибки скопирован');
    }
  };

  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'scanFile' && e.target.files && e.target.files[0]) {
      scanPhoto(e.target.files[0]);
      e.target.value = '';
    }
  });
  window.addEventListener('online', () => { if (window.renderMeta) window.renderMeta(); });
  window.addEventListener('offline', () => { if (window.renderMeta) window.renderMeta(); });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  load();
  return api;
})();
