/* 年輕風格特色封面模板：MP3、串流播放、黑膠、CD、拍立得、底片、CCD、Y2K、雜誌、票根、鎖定畫面、手帳
 * 每個模板都以「照片短邊 = 1000 單位」設計，輸出時整體等比例放大縮小。
 * 照片只會放在一個不旋轉的矩形（slot）裡，所以同一套模板也能套用到影片（先輸出一張挖空的覆蓋圖，再交給 ffmpeg 合成）。
 */
(function () {
  'use strict';

  const F = {
    sans: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
    round: '"Saira", "Noto Sans TC", sans-serif',
    hand: '"Caveat", "LXGW WenKai TC", "Noto Sans TC", cursive',
    pixel: '"VT323", "Noto Sans TC", monospace',
    mono: '"Space Mono", "Noto Sans TC", monospace',
    display: '"Bebas Neue", "Noto Sans TC", sans-serif',
    serif: '"DM Serif Display", "Noto Serif TC", serif',
  };

  // 需要先載入的字型（canvas 不會自動下載網頁字型）
  const FONT_FACES = [
    '400 40px "Noto Sans TC"', '700 40px "Noto Sans TC"', '900 40px "Noto Sans TC"',
    '700 40px "Caveat"', '400 40px "LXGW WenKai TC"', '400 40px "VT323"',
    '400 40px "Space Mono"', '700 40px "Space Mono"', '400 40px "Bebas Neue"',
    'italic 400 40px "DM Serif Display"', '400 40px "DM Serif Display"', '700 40px "Saira"', '400 40px "Saira"',
  ];
  async function ensureFonts(text, weight) {
    if (!document.fonts || !document.fonts.load) return;
    const sample = (text || '') + 'ABCabc0123456789:°';
    const faces = [...FONT_FACES];
    if (weight && weight !== 700) faces.push(`${weight} 40px "Saira"`, `${weight} 40px "Noto Sans TC"`, `${weight} 40px "DM Serif Display"`);
    await Promise.all(faces.map((f) => document.fonts.load(f, sample).catch(() => null)));
  }

  /* ---------- 顏色 ---------- */

  function rgb(h) {
    let s = String(h || '#000').replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(a) { return '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); }
  function alpha(h, a) { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; }
  function lum(h) {
    const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function ink(bg, dark = '#141414', light = '#ffffff') { return lum(bg) > 0.2 ? dark : light; }
  function toHsl(h) {
    let [r, g, b] = rgb(h).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let hh = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh *= 60;
    }
    return [hh, s, l];
  }
  function fromHsl(hh, s, l) {
    const k = (n) => (n + hh / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  /** 依主色做出同色系的柔和色（背景用） */
  function tone(h, l, sMax = 0.75) { const [hh, s] = toHsl(h); return fromHsl(hh, Math.min(s, sMax), l); }

  /* ---------- 繪圖小工具 ---------- */

  function rr(ctx, x, y, w, h, r) {
    const R = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v || 0, w / 2, h / 2)));
    ctx.beginPath();
    ctx.moveTo(x + R[0], y);
    ctx.lineTo(x + w - R[1], y); ctx.arcTo(x + w, y, x + w, y + R[1], R[1]);
    ctx.lineTo(x + w, y + h - R[2]); ctx.arcTo(x + w, y + h, x + w - R[2], y + h, R[2]);
    ctx.lineTo(x + R[3], y + h); ctx.arcTo(x, y + h, x, y + h - R[3], R[3]);
    ctx.lineTo(x, y + R[0]); ctx.arcTo(x, y, x + R[0], y, R[0]);
    ctx.closePath();
  }

  function setFont(ctx, size, fam, weight = 400, style = '') {
    ctx.font = `${style ? style + ' ' : ''}${weight} ${Math.max(1, size)}px ${fam}`;
  }
  function spacing(ctx, v) { if ('letterSpacing' in ctx) ctx.letterSpacing = (v || 0) + 'px'; }

  function clip(ctx, text, maxW) {
    text = String(text || '');
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }

  // 中日文逐字斷行，英文以單字斷行
  const TOKEN = /[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+|\s+/g;
  function wrap(ctx, text, maxW, maxLines = 3) {
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const tok of para.match(TOKEN) || []) {
        const test = line + tok;
        const closing = /^[。，、！？；：」』）》〉,.!?;:)\]…~]/.test(tok);
        if (line.trim() && tok.trim() && !closing && ctx.measureText(test).width > maxW) { lines.push(line.trimEnd()); line = tok; }
        else line = test;
      }
      lines.push(line.trim());
    }
    const out = lines.filter((l, i) => l || i === 0);
    if (out.length > maxLines) {
      const keep = out.slice(0, maxLines);
      keep[maxLines - 1] = clip(ctx, out.slice(maxLines - 1).join(' ') + ' ', maxW);
      if (!keep[maxLines - 1].endsWith('…')) keep[maxLines - 1] += '…';
      return keep.map((l) => clip(ctx, l, maxW));
    }
    return out.map((l) => clip(ctx, l, maxW));
  }

  /** 縮小字級直到放得下（最多 maxLines 行） */
  function fitWrap(ctx, text, maxW, size, fam, weight, maxLines, minSize, style) {
    let s = size;
    // 稍微縮小就能放成一行時，優先單行
    setFont(ctx, size, fam, weight, style);
    const w1 = ctx.measureText(text).width;
    if (w1 > maxW && size * maxW / w1 >= Math.max(minSize, size * 0.72)) {
      s = size * maxW / w1 * 0.99;
      setFont(ctx, s, fam, weight, style);
      return { size: s, lines: [text] };
    }
    for (;;) {
      setFont(ctx, s, fam, weight, style);
      const lines = wrapRaw(ctx, text, maxW);
      if (lines.length <= maxLines || s <= minSize) { return { size: s, lines: wrap(ctx, text, maxW, maxLines) }; }
      s = Math.max(minSize, s * 0.9);
    }
  }
  function wrapRaw(ctx, text, maxW) { return wrap(ctx, text, maxW, 99); }

  function fitSize(ctx, text, maxW, size, fam, weight = 400, min = size * 0.4, style) {
    setFont(ctx, size, fam, weight, style);
    const w = ctx.measureText(text).width;
    if (w <= maxW) return size;
    const s = Math.max(min, size * maxW / w);
    setFont(ctx, s, fam, weight, style);
    return s;
  }

  function text(ctx, str, x, y, o = {}) {
    if (!str) return 0;
    const size = o.size || 40;
    if (o.max) fitSize(ctx, str, o.max, size, o.fam || F.sans, o.weight || 400, o.min || size * 0.55, o.style);
    else setFont(ctx, size, o.fam || F.sans, o.weight || 400, o.style);
    spacing(ctx, o.ls || 0);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillStyle = o.color || '#111';
    const s = o.max ? clip(ctx, str, o.max) : str;
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width;
    spacing(ctx, 0);
    return w;
  }

  function lines(ctx, arr, x, y, lh, o = {}) {
    setFont(ctx, o.size, o.fam || F.sans, o.weight || 400, o.style);
    spacing(ctx, o.ls || 0);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillStyle = o.color || '#111';
    arr.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    spacing(ctx, 0);
  }

  function shadow(ctx, color, blur, ox = 0, oy = 0) {
    ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy;
  }
  function noShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }

  function rand(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  /** 用縮小再放大的方式做模糊（Safari 不支援 ctx.filter） */
  const blurCache = new WeakMap();
  function blurred(src, w, h, amount = 18) {
    if (!src) return null;
    let m = blurCache.get(src);
    if (!m) { m = new Map(); blurCache.set(src, m); }
    if (!m.has(amount)) m.set(amount, blurredRaw(src, amount));
    return m.get(amount);
  }
  function blurredRaw(src, amount) {
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    const tiny = document.createElement('canvas');
    const s = Math.max(4, Math.round(Math.max(sw, sh) / amount));
    tiny.width = Math.max(2, Math.round(s * sw / Math.max(sw, sh)));
    tiny.height = Math.max(2, Math.round(s * sh / Math.max(sw, sh)));
    const tc = tiny.getContext('2d');
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(src, 0, 0, tiny.width, tiny.height);
    const mid = document.createElement('canvas');
    mid.width = tiny.width * 4; mid.height = tiny.height * 4;
    const mc = mid.getContext('2d');
    mc.imageSmoothingQuality = 'high';
    mc.drawImage(tiny, 0, 0, mid.width, mid.height);
    return mid;
  }
  /** 以 cover 方式填滿矩形 */
  function cover(ctx, src, x, y, w, h) {
    const sw = src.width, sh = src.height;
    const s = Math.max(w / sw, h / sh);
    const dw = sw * s, dh = sh * s;
    ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  /** 主題色填色：選了漸層主題色時（d.accent2）回傳對角漸層，否則回傳純色 */
  function accentPaint(ctx, d, x, y, w, h) {
    if (!d.accent2) return d.accent;
    const stops = d.accentStops && d.accentStops.length > 1 ? d.accentStops : [d.accent, d.accent2];
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }

  /** 鎖定畫面等可調整的字型 */
  function fontOf(key) {
    return { round: F.round, sans: F.sans, serif: F.serif, pixel: F.pixel, hand: F.hand, display: F.display }[key] || F.round;
  }

  /**
   * 面板樣式：liquid 液態玻璃、frost 毛玻璃、blur 霧化、gradient 漸層、solid 實色
   * @returns 面板上適合的文字顏色
   */
  function panel(ctx, d, L, x, y, w, h, r, kind, fg) {
    kind = kind || 'frost';
    ctx.save();
    rr(ctx, x, y, w, h, r); ctx.clip();
    if ((kind === 'liquid' || kind === 'frost' || kind === 'blur') && d.still) {
      cover(ctx, blurred(d.still, L.W, L.H, kind === 'blur' ? 7 : kind === 'liquid' ? 24 : 11), 0, 0, L.W, L.H);
    }
    if (kind === 'frost') { ctx.fillStyle = 'rgba(246,246,248,.62)'; ctx.fillRect(x, y, w, h); }
    else if (kind === 'blur') { ctx.fillStyle = 'rgba(18,18,24,.38)'; ctx.fillRect(x, y, w, h); }
    else if (kind === 'liquid') {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, w, h);
      const hi = ctx.createLinearGradient(0, y, 0, y + h);
      hi.addColorStop(0, 'rgba(255,255,255,.32)'); hi.addColorStop(0.45, 'rgba(255,255,255,.04)'); hi.addColorStop(1, 'rgba(255,255,255,.12)');
      ctx.fillStyle = hi; ctx.fillRect(x, y, w, h);
    } else if (kind === 'gradient') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      const stops = d.accent2 ? (d.accentStops || [d.accent, d.accent2]) : [d.accent, mix(d.accent, '#7a5cff', 0.65)];
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), alpha(c, 0.92)));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    } else { ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    if (kind === 'liquid') {
      const sg = ctx.createLinearGradient(x, y, x + w, y + h);
      sg.addColorStop(0, 'rgba(255,255,255,.95)'); sg.addColorStop(0.35, 'rgba(255,255,255,.12)');
      sg.addColorStop(0.7, 'rgba(255,255,255,.08)'); sg.addColorStop(1, 'rgba(255,255,255,.7)');
      rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r); ctx.lineWidth = 3; ctx.strokeStyle = sg; ctx.stroke();
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
      ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + 6, w * 0.32, Math.min(h * 0.18, 18), 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill(); ctx.restore();
    }
    if (kind === 'frost' || kind === 'solid') return '#141414';
    if (kind === 'gradient') return ink(d.accent);
    return fg && lum(fg) > 0.4 ? fg : '#ffffff';
  }

  /* ---------- 圖示（以 (x, y) 為中心、邊長 s） ---------- */

  function cloudPath(ctx, cx, cy, w) {
    const r = w * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.36, cy + r * 1.1);
    ctx.arc(cx - w * 0.26, cy + r * 0.35, r * 0.78, Math.PI * 0.62, Math.PI * 1.5);
    ctx.arc(cx - w * 0.02, cy - r * 0.35, r * 1.25, Math.PI * 1.08, Math.PI * 1.95);
    ctx.arc(cx + w * 0.27, cy + r * 0.3, r * 0.85, Math.PI * 1.45, Math.PI * 0.45);
    ctx.closePath();
  }
  function sunPath(ctx, cx, cy, r, rays = true) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (!rays) return;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 1.45, cy + Math.sin(a) * r * 1.45);
      ctx.lineTo(cx + Math.cos(a) * r * 1.95, cy + Math.sin(a) * r * 1.95);
      ctx.stroke();
    }
  }
  function weatherIcon(ctx, key, x, y, s, color, lw) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = lw || s * 0.075; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (key) {
      case 'clear': sunPath(ctx, x, y, s * 0.2); break;
      case 'partly':
        sunPath(ctx, x - s * 0.14, y - s * 0.12, s * 0.14);
        ctx.save(); cloudPath(ctx, x + s * 0.06, y + s * 0.08, s * 0.72);
        ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); ctx.restore();
        cloudPath(ctx, x + s * 0.06, y + s * 0.08, s * 0.72); ctx.stroke();
        break;
      case 'fog':
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(x - s * 0.36 + (i === 0 ? s * 0.08 : 0), y + i * s * 0.18);
          ctx.lineTo(x + s * 0.36 - (i === 1 ? s * 0.1 : 0), y + i * s * 0.18); ctx.stroke();
        }
        break;
      case 'drizzle': case 'rain': case 'snow': case 'thunder':
        cloudPath(ctx, x, y - s * 0.1, s * 0.8); ctx.stroke();
        if (key === 'thunder') {
          ctx.beginPath(); ctx.moveTo(x + s * 0.04, y + s * 0.08); ctx.lineTo(x - s * 0.08, y + s * 0.26);
          ctx.lineTo(x + s * 0.06, y + s * 0.26); ctx.lineTo(x - s * 0.06, y + s * 0.44); ctx.stroke();
        } else {
          for (let i = -1; i <= 1; i++) {
            const bx = x + i * s * 0.18, by = y + s * 0.24;
            if (key === 'snow') { ctx.beginPath(); ctx.arc(bx, by + s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
            else { ctx.beginPath(); ctx.moveTo(bx + s * 0.04, by - s * 0.02); ctx.lineTo(bx - s * 0.04, by + s * (key === 'rain' ? 0.18 : 0.1)); ctx.stroke(); }
          }
        }
        break;
      default: // cloudy
        cloudPath(ctx, x, y, s * 0.86); ctx.stroke();
    }
    ctx.restore();
  }

  function icon(ctx, name, x, y, s, color, o = {}) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = o.lw || s * 0.09; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const h = s / 2;
    switch (name) {
      case 'play':
        ctx.beginPath(); ctx.moveTo(x - h * 0.55, y - h * 0.75); ctx.lineTo(x + h * 0.8, y); ctx.lineTo(x - h * 0.55, y + h * 0.75); ctx.closePath(); ctx.fill(); break;
      case 'pause':
        rr(ctx, x - h * 0.6, y - h * 0.75, h * 0.42, h * 1.5, h * 0.08); ctx.fill();
        rr(ctx, x + h * 0.18, y - h * 0.75, h * 0.42, h * 1.5, h * 0.08); ctx.fill(); break;
      case 'next': case 'prev': {
        const d = name === 'next' ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x - d * h * 0.75, y - h * 0.65); ctx.lineTo(x + d * h * 0.4, y); ctx.lineTo(x - d * h * 0.75, y + h * 0.65); ctx.closePath(); ctx.fill();
        rr(ctx, x + d * h * 0.45 - h * 0.13, y - h * 0.65, h * 0.26, h * 1.3, h * 0.06); ctx.fill(); break;
      }
      case 'ffwd': case 'rew': {
        const d = name === 'ffwd' ? 1 : -1;
        for (const o2 of [-0.42, 0.38]) {
          const cx = x + d * o2 * h;
          ctx.beginPath(); ctx.moveTo(cx - d * h * 0.45, y - h * 0.55); ctx.lineTo(cx + d * h * 0.4, y); ctx.lineTo(cx - d * h * 0.45, y + h * 0.55); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'shuffle':
        ctx.beginPath(); ctx.moveTo(x - h * 0.8, y - h * 0.5); ctx.bezierCurveTo(x - h * 0.1, y - h * 0.5, x + h * 0.1, y + h * 0.5, x + h * 0.7, y + h * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - h * 0.8, y + h * 0.5); ctx.bezierCurveTo(x - h * 0.1, y + h * 0.5, x + h * 0.1, y - h * 0.5, x + h * 0.7, y - h * 0.5); ctx.stroke();
        for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + h * 0.45, y + sy * h * 0.5 - h * 0.25); ctx.lineTo(x + h * 0.75, y + sy * h * 0.5); ctx.lineTo(x + h * 0.45, y + sy * h * 0.5 + h * 0.25); ctx.stroke(); }
        break;
      case 'repeat':
        rr(ctx, x - h * 0.75, y - h * 0.45, h * 1.5, h * 0.9, h * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + h * 0.05, y - h * 0.72); ctx.lineTo(x + h * 0.3, y - h * 0.45); ctx.lineTo(x + h * 0.05, y - h * 0.18); ctx.stroke();
        break;
      case 'heart':
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.75);
        ctx.bezierCurveTo(x - h * 1.1, y - h * 0.05, x - h * 0.55, y - h * 0.95, x, y - h * 0.38);
        ctx.bezierCurveTo(x + h * 0.55, y - h * 0.95, x + h * 1.1, y - h * 0.05, x, y + h * 0.75);
        ctx.closePath();
        if (o.fill) ctx.fill(); else ctx.stroke();
        break;
      case 'pin':
        ctx.beginPath();
        ctx.arc(x, y - h * 0.2, h * 0.5, Math.PI * 0.8, Math.PI * 2.2);
        ctx.lineTo(x, y + h * 0.85); ctx.closePath();
        if (o.fill) ctx.fill(); else ctx.stroke();
        ctx.save(); ctx.fillStyle = o.hole || 'transparent';
        if (o.hole) { ctx.beginPath(); ctx.arc(x, y - h * 0.2, h * 0.18, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        break;
      case 'battery':
        ctx.lineWidth = o.lw || s * 0.07;
        rr(ctx, x - h, y - h * 0.48, s * 0.9, h * 0.96, h * 0.2); ctx.stroke();
        rr(ctx, x - h + s * 0.08, y - h * 0.48 + s * 0.08, (s * 0.9 - s * 0.16) * (o.level ?? 0.8), h * 0.96 - s * 0.16, h * 0.08); ctx.fill();
        rr(ctx, x + h * 0.86, y - h * 0.18, s * 0.08, h * 0.36, s * 0.02); ctx.fill();
        break;
      case 'chevron':
        ctx.beginPath(); ctx.moveTo(x - h * 0.6, y - h * 0.25); ctx.lineTo(x, y + h * 0.35); ctx.lineTo(x + h * 0.6, y - h * 0.25); ctx.stroke(); break;
      case 'dots':
        for (const dx of [-0.6, 0, 0.6]) { ctx.beginPath(); ctx.arc(x + dx * h, y, s * 0.07, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'lock':
        rr(ctx, x - h * 0.6, y - h * 0.1, h * 1.2, h * 0.95, h * 0.18); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - h * 0.15, h * 0.4, Math.PI, 0); ctx.stroke();
        break;
      case 'star4':
        ctx.beginPath();
        ctx.moveTo(x, y - h); ctx.quadraticCurveTo(x, y, x + h, y); ctx.quadraticCurveTo(x, y, x, y + h);
        ctx.quadraticCurveTo(x, y, x - h, y); ctx.quadraticCurveTo(x, y, x, y - h); ctx.fill();
        break;
      case 'star5': {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? h * 0.42 : h;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        if (o.fill) ctx.fill(); else ctx.stroke();
        break;
      }
      case 'flash':
        rr(ctx, x - h * 0.22, y - h * 0.1, h * 0.44, h * 0.8, h * 0.08); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - h * 0.4, y - h * 0.7); ctx.lineTo(x + h * 0.4, y - h * 0.7); ctx.lineTo(x + h * 0.22, y - h * 0.1); ctx.lineTo(x - h * 0.22, y - h * 0.1); ctx.closePath(); ctx.stroke();
        break;
      case 'camera':
        rr(ctx, x - h * 0.75, y - h * 0.4, h * 1.5, h * 1.05, h * 0.18); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y + h * 0.12, h * 0.28, 0, Math.PI * 2); ctx.stroke();
        rr(ctx, x - h * 0.3, y - h * 0.62, h * 0.6, h * 0.22, h * 0.06); ctx.fill();
        break;
      case 'music':
        ctx.beginPath(); ctx.ellipse(x - h * 0.35, y + h * 0.45, h * 0.28, h * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + h * 0.45, y + h * 0.3, h * 0.28, h * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = s * 0.08;
        ctx.beginPath(); ctx.moveTo(x - h * 0.1, y + h * 0.42); ctx.lineTo(x - h * 0.1, y - h * 0.65); ctx.lineTo(x + h * 0.7, y - h * 0.8); ctx.lineTo(x + h * 0.7, y + h * 0.27); ctx.stroke();
        break;
      case 'info':
        ctx.beginPath(); ctx.arc(x, y, h * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = o.on || '#fff';
        setFont(ctx, s * 0.9, F.serif, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('i', x, y + s * 0.04);
        break;
      case 'cursor':
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s); ctx.lineTo(x + s * 0.28, y + s * 0.74); ctx.lineTo(x + s * 0.48, y + s * 1.12);
        ctx.lineTo(x + s * 0.62, y + s * 1.05); ctx.lineTo(x + s * 0.42, y + s * 0.68); ctx.lineTo(x + s * 0.78, y + s * 0.68); ctx.closePath();
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = s * 0.06; ctx.stroke();
        break;
    }
    ctx.restore();
  }

  function barcode(ctx, x, y, w, h, seed, color) {
    const r = rand(hashStr(seed));
    ctx.fillStyle = color;
    let cx = x;
    while (cx < x + w) {
      const bw = (1 + Math.floor(r() * 4)) * w / 110;
      if (r() > 0.35) ctx.fillRect(cx, y, Math.min(bw, x + w - cx), h);
      cx += bw + w / 110;
    }
  }

  function dateStamp(ctx, str, x, y, size, align = 'right') {
    if (!str) return;
    ctx.save();
    setFont(ctx, size, F.pixel, 400);
    spacing(ctx, size * 0.06);
    ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    shadow(ctx, 'rgba(255,120,30,.85)', size * 0.35);
    ctx.fillStyle = '#ffae4a';
    ctx.fillText(str, x, y);
    noShadow(ctx);
    ctx.fillStyle = 'rgba(255,214,150,.9)';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function paperNoise(ctx, x, y, w, h, seed, color, n = 1400) {
    const r = rand(seed);
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) ctx.fillRect(x + r() * w, y + r() * h, 1.6 + r() * 2.4, 1.6 + r() * 2.4);
  }

  /* ---------- 共用文字組合 ---------- */

  function weatherText(d) { return [d.weather, d.temp].filter(Boolean).join(' '); }
  function metaLine(d, sep = '  ·  ', keys = ['date', 'time', 'wx', 'location']) {
    return keys.map((k) => (k === 'wx' ? weatherText(d) : d[k])).filter(Boolean).join(sep);
  }
  /** 播放進度（app 每一格都會給；沒給時用靜態預設值） */
  function A(d) {
    return d.anim || { t: 0, progress: 0.35, elapsed: '1:12', remain: '-2:12', total: '3:24', playing: true };
  }
  function artistOf(d) { return d.artist || d.location || (d.lang === 'zh-Hant' ? '未知的歌手' : 'Unknown Artist'); }
  function slotDims(a) { return a >= 1 ? [1000 * a, 1000] : [1000, 1000 / a]; }
  const T = (d, zh, en) => (d.lang === 'zh-Hant' ? zh : en);

  /* =====================================================================
   *  模板
   * ===================================================================== */

  // 30 種配色（每個模板共用）：paper 主要表面、bg 背景、ink 文字、deep 點綴色
  const PALETTE = [
    { id: 'moon', zh: '月光白', en: 'Moonlight', ja: 'ムーンライト', paper: '#f7f5f0', bg: '#ebe7df', ink: '#1c1c1e', deep: '#8a8378' },
    { id: 'midnight', zh: '午夜黑', en: 'Midnight', ja: 'ミッドナイト', paper: '#1d1d23', bg: '#101014', ink: '#f2f2f5', deep: '#5a6aa0', dark: true },
    { id: 'mica', zh: '雲母銀', en: 'Mica Silver', ja: 'マイカシルバー', paper: '#e7e9ec', bg: '#d2d6db', ink: '#23262b', deep: '#7d8794' },
    { id: 'blush', zh: '櫻花霧', en: 'Blush', ja: 'ブラッシュ', paper: '#fbe2e9', bg: '#f5c8d5', ink: '#5c2338', deep: '#e0628c' },
    { id: 'sierra', zh: '遠峰藍', en: 'Sierra Blue', ja: 'シエラブルー', paper: '#dbe8f5', bg: '#bcd3ea', ink: '#1c3553', deep: '#4a83c4' },
    { id: 'sage', zh: '鼠尾草', en: 'Sage', ja: 'セージ', paper: '#e2ebdc', bg: '#c8d8be', ink: '#26412c', deep: '#6c9a68' },
    { id: 'oat', zh: '燕麥奶', en: 'Oat Milk', ja: 'オーツミルク', paper: '#f2e9d9', bg: '#e2d3ba', ink: '#4a3a28', deep: '#b0895a' },
    { id: 'lavender', zh: '薰衣草', en: 'Lavender', ja: 'ラベンダー', paper: '#ebe3fa', bg: '#d5c8f3', ink: '#3a2d63', deep: '#8c6be0' },
    { id: 'deepsea', zh: '深海藍', en: 'Deep Sea', ja: 'ディープシー', paper: '#16233a', bg: '#0b1526', ink: '#e8f0ff', deep: '#3f8cff', dark: true },
    { id: 'chroma', zh: '隨光色', en: 'Chroma', ja: 'クロマ', chroma: true, paper: '#fde6ee', bg: '#f8cddb', ink: '#4a1830', deep: '#ff5c8a' },
    { id: 'sunset', zh: '落日橘', en: 'Sunset', ja: 'サンセット', paper: '#ffe4d2', bg: '#ffcaa6', ink: '#6b2e12', deep: '#f2733a' },
    { id: 'peach', zh: '蜜桃奶', en: 'Peach Milk', ja: 'ピーチミルク', paper: '#ffe9e0', bg: '#ffd2c0', ink: '#5e3122', deep: '#f59a7a' },
    { id: 'coral', zh: '珊瑚粉', en: 'Coral', ja: 'コーラル', paper: '#ffe0dc', bg: '#ffc1b8', ink: '#6a2420', deep: '#f2665a' },
    { id: 'rosegold', zh: '玫瑰金', en: 'Rose Gold', ja: 'ローズゴールド', paper: '#f6e1dc', bg: '#ebc3b8', ink: '#5a2c26', deep: '#c98673' },
    { id: 'burgundy', zh: '酒紅色', en: 'Burgundy', ja: 'バーガンディ', paper: '#3a1520', bg: '#250c13', ink: '#f8e6ea', deep: '#c8475f', dark: true },
    { id: 'lemon', zh: '檸檬霜', en: 'Lemon Frost', ja: 'レモンフロスト', paper: '#fbf5d2', bg: '#f3e8a0', ink: '#4d4310', deep: '#d9b52a' },
    { id: 'butter', zh: '奶油黃', en: 'Butter', ja: 'バター', paper: '#fff4d6', bg: '#ffe6a8', ink: '#4f3d10', deep: '#e6b23a' },
    { id: 'caramel', zh: '焦糖棕', en: 'Caramel', ja: 'キャラメル', paper: '#f3e0cc', bg: '#e3c19c', ink: '#4a2c14', deep: '#b9733a' },
    { id: 'cocoa', zh: '可可棕', en: 'Cocoa', ja: 'ココア', paper: '#2e2019', bg: '#1d140f', ink: '#f5e9e0', deep: '#c08a5a', dark: true },
    { id: 'matcha', zh: '抹茶綠', en: 'Matcha', ja: '抹茶', paper: '#e6ecd2', bg: '#cfdcaa', ink: '#34401a', deep: '#7f9a3a' },
    { id: 'mintice', zh: '薄荷冰', en: 'Mint Ice', ja: 'ミントアイス', paper: '#ddf5ec', bg: '#b8eadb', ink: '#1d4a3c', deep: '#3dbb94' },
    { id: 'lake', zh: '湖水綠', en: 'Lake Teal', ja: 'レイクティール', paper: '#d6eeee', bg: '#addcdc', ink: '#164446', deep: '#2a9d9f' },
    { id: 'forest', zh: '森林綠', en: 'Forest', ja: 'フォレスト', paper: '#17291f', bg: '#0d1a13', ink: '#e4f2e8', deep: '#4caf78', dark: true },
    { id: 'sky', zh: '天空藍', en: 'Sky', ja: 'スカイ', paper: '#dff1ff', bg: '#bfe3ff', ink: '#13385a', deep: '#38a3ff' },
    { id: 'seasalt', zh: '海鹽藍', en: 'Sea Salt', ja: 'シーソルト', paper: '#e2eef2', bg: '#c4dde6', ink: '#1e3b47', deep: '#5a9bb4' },
    { id: 'grape', zh: '葡萄紫', en: 'Grape', ja: 'グレープ', paper: '#e7dcf0', bg: '#cdb5e2', ink: '#3a1f52', deep: '#7b3fa8' },
    { id: 'nightfall', zh: '夜幕紫', en: 'Nightfall', ja: 'ナイトフォール', paper: '#231a3a', bg: '#150f26', ink: '#efe8ff', deep: '#9b7bff', dark: true },
    { id: 'neon', zh: '霓虹粉', en: 'Neon Pink', ja: 'ネオンピンク', paper: '#1a0f1c', bg: '#0e0710', ink: '#ffe6f4', deep: '#ff4fa3', dark: true },
    { id: 'afternoon', zh: '午後灰', en: 'Afternoon Grey', ja: 'アフタヌーングレー', paper: '#ecebe8', bg: '#d8d6d1', ink: '#2b2a28', deep: '#7a7670' },
    { id: 'graphite', zh: '石墨灰', en: 'Graphite', ja: 'グラファイト', paper: '#2a2b2e', bg: '#1c1d20', ink: '#ececee', deep: '#9aa0aa', dark: true },
  ];
  /** 隨光色：依照片主色即時調出一組配色 */
  function resolvePal(p, accent) {
    const base = p || PALETTE[0];
    if (!base.chroma) return base;
    const a = accent || '#ff5c8a';
    return { ...base, paper: tone(a, 0.93, 0.6), bg: tone(a, 0.84, 0.6), ink: tone(a, 0.18, 0.6), deep: a };
  }

  // 有不同版型的模板（與配色分開選）
  const MODES = {
    player: [{ id: 'blur', zh: '霧化', en: 'Blurred', ja: 'ぼかし' }, { id: 'color', zh: '色塊', en: 'Solid', ja: 'カラー' }],
    lyrics: [{ id: 'color', zh: '色塊', en: 'Solid', ja: 'カラー' }, { id: 'blur', zh: '霧化', en: 'Blurred', ja: 'ぼかし' }],
    miniplayer: [{ id: 'bar', zh: '播放列', en: 'Bar', ja: 'バー' }, { id: 'glass', zh: '毛玻璃', en: 'Glass', ja: 'ガラス' }],
    ccd: [{ id: 'frame', zh: '機身框', en: 'Body', ja: 'ボディ' }, { id: 'none', zh: '無框', en: 'Borderless', ja: 'フチなし' }],
    magazine: [{ id: 'auto', zh: '自動', en: 'Auto', ja: '自動' }, { id: 'white', zh: '白字', en: 'White', ja: '白文字' }, { id: 'black', zh: '黑字', en: 'Black', ja: '黒文字' }],
    scrapbook: [{ id: 'grid', zh: '方格', en: 'Grid', ja: '方眼' }, { id: 'dots', zh: '點點', en: 'Dots', ja: 'ドット' }, { id: 'paper', zh: '紙紋', en: 'Paper', ja: '紙' }],
    tv: [{ id: 'wood', zh: '木紋', en: 'Wood', ja: '木目' }, { id: 'plastic', zh: '塑膠殼', en: 'Plastic', ja: 'プラスチック' }],
    film: [{ id: 'dark', zh: '底片黑', en: 'Film base', ja: 'フィルム' }, { id: 'tint', zh: '染色', en: 'Tinted', ja: 'カラー' }],
  };
  // 各模板預設配色
  const DEF_PAL = {
    ipod: 'moon', player: 'midnight', vinyl: 'oat', cd: 'mica', instax: 'moon', film: 'midnight', ccd: 'midnight', y2k: 'lavender',
    magazine: 'chroma', ticket: 'oat', lockscreen: 'chroma', scrapbook: 'moon', miniplayer: 'moon', cassette: 'midnight', playlist: 'midnight',
    lyrics: 'chroma', widget: 'lavender', boarding: 'sierra', receipt: 'blush', stamp: 'oat', postcard: 'oat', newspaper: 'oat',
    chat: 'moon', gameboy: 'mica', tv: 'oat', slide: 'moon', gallery: 'moon', sticker: 'chroma', post: 'moon', weathercard: 'chroma',
  };

  const LIST = [];
  function def(t) {
    t.skins = PALETTE;
    t.modes = MODES[t.id] || [];
    t.pal = DEF_PAL[t.id] || 'moon';
    LIST.push(t);
  }

  /* ---------- 1. MP3 播放器 ---------- */
  def({
    id: 'ipod', zh: 'MP3 播放器', en: 'MP3 Player', tag: 'music', ratio: 1, anim: true,
    layout() { return { W: 1600, H: 2844, slot: { x: 300, y: 437, w: 1000, h: 1000, r: 8 } }; },
    draw(ctx, L, d, photo, sk) {
      const dx = 100, dy = 177, DW = 1400, DH = 2489;
      // 背景
      const g = ctx.createLinearGradient(0, 0, L.W, L.H);
      g.addColorStop(0, sk.bg); g.addColorStop(1, mix(sk.bg, sk.deep, 0.3));
      ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
      const body0 = sk.dark ? mix(sk.paper, '#ffffff', 0.1) : mix(sk.paper, '#ffffff', 0.55);
      const body1 = sk.dark ? mix(sk.paper, '#000000', 0.35) : mix(sk.paper, sk.deep, 0.25);
      const wheel = sk.dark ? mix(sk.paper, '#ffffff', 0.14) : mix(sk.paper, '#ffffff', 0.8);
      const wheelInk = sk.dark ? '#cfcfd4' : mix(sk.deep, '#8a8a8a', 0.35);
      const btn = sk.dark ? mix(sk.paper, '#000000', 0.2) : mix(sk.paper, '#ffffff', 0.35);
      const r = rand(7); ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 26; i++) icon(ctx, 'star4', r() * L.W, r() * L.H, 20 + r() * 40, 'rgba(255,255,255,.55)');
      // 機身
      shadow(ctx, 'rgba(0,0,0,.28)', 90, 0, 40);
      const bg = ctx.createLinearGradient(dx, dy, dx + DW, dy + DH);
      bg.addColorStop(0, body0); bg.addColorStop(1, body1);
      rr(ctx, dx, dy, DW, DH, 150); ctx.fillStyle = bg; ctx.fill();
      noShadow(ctx);
      ctx.lineWidth = 6; ctx.strokeStyle = sk.dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.9)'; ctx.stroke();
      // 螢幕
      rr(ctx, dx + 90, dy + 100, 1220, 1500, 54); ctx.fillStyle = '#0d0d0f'; ctx.fill();
      const scrBg = sk.dark ? '#18191c' : '#f6f7f8';
      const scrInk = sk.dark ? '#f2f2f2' : '#151515';
      const scrMute = sk.dark ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.55)';
      rr(ctx, dx + 120, dy + 130, 1160, 1440, 24); ctx.fillStyle = scrBg; ctx.fill();
      // 狀態列
      const sb = ctx.createLinearGradient(0, dy + 130, 0, dy + 215);
      sb.addColorStop(0, sk.dark ? '#34363b' : '#ffffff'); sb.addColorStop(1, sk.dark ? '#24262a' : '#d9dde2');
      rr(ctx, dx + 120, dy + 130, 1160, 86, [24, 24, 0, 0]); ctx.fillStyle = sb; ctx.fill();
      icon(ctx, 'play', dx + 175, dy + 173, 34, '#3b82f6');
      text(ctx, T(d, '正在播放', 'Now Playing'), dx + 205, dy + 188, { size: 40, weight: 700, color: scrInk });
      icon(ctx, 'battery', dx + 1210, dy + 173, 62, sk.dark ? '#7ee081' : '#2fb24c', { level: 0.75 });
      if (d.time) text(ctx, d.time, dx + 1150, dy + 188, { size: 38, weight: 700, color: scrInk, align: 'right' });
      // 封面
      photo();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.12)'; rr(ctx, L.slot.x, L.slot.y, 1000, 1000, 8); ctx.stroke();
      // 歌曲資訊
      const cx = dx + DW / 2;
      text(ctx, d.quote || T(d, '今天的主打歌', 'Track of the day'), cx, dy + 1338, { size: 60, weight: 700, color: scrInk, align: 'center', max: 1040 });
      text(ctx, artistOf(d), cx, dy + 1405, { size: 44, weight: 500, color: scrMute, align: 'center', max: 1000 });
      const sub = [d.album, weatherText(d)].filter(Boolean).join('  ·  ');
      text(ctx, sub, cx, dy + 1460, { size: 36, color: scrMute, align: 'center', max: 1000 });
      // 進度條
      const an = A(d), prog = an.progress;
      rr(ctx, dx + 200, dy + 1492, 1000, 18, 9); ctx.fillStyle = sk.dark ? '#3a3c41' : '#dfe3e8'; ctx.fill();
      const pg = ctx.createLinearGradient(0, dy + 1492, 0, dy + 1510); pg.addColorStop(0, '#7cb7ff'); pg.addColorStop(1, '#2f74e0');
      rr(ctx, dx + 200, dy + 1492, Math.max(18, 1000 * prog), 18, 9); ctx.fillStyle = pg; ctx.fill();
      text(ctx, an.elapsed, dx + 200, dy + 1550, { size: 32, color: scrMute });
      text(ctx, an.remain, dx + 1200, dy + 1550, { size: 32, color: scrMute, align: 'right' });
      // 轉盤
      const wy = dy + 2030, R = 390;
      shadow(ctx, 'rgba(0,0,0,.18)', 20, 0, 6);
      ctx.beginPath(); ctx.arc(cx, wy, R, 0, Math.PI * 2); ctx.fillStyle = wheel; ctx.fill();
      noShadow(ctx);
      ctx.lineWidth = 3; ctx.strokeStyle = sk.dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; ctx.stroke();
      text(ctx, 'MENU', cx, wy - R + 105, { size: 54, weight: 700, color: wheelInk, align: 'center', fam: F.round, ls: 4 });
      icon(ctx, 'ffwd', cx + R - 100, wy, 76, wheelInk);
      icon(ctx, 'rew', cx - R + 100, wy, 76, wheelInk);
      icon(ctx, 'play', cx - 26, wy + R - 100, 52, wheelInk);
      icon(ctx, 'pause', cx + 30, wy + R - 100, 46, wheelInk);
      const bgc = ctx.createLinearGradient(0, wy - 140, 0, wy + 140);
      bgc.addColorStop(0, btn); bgc.addColorStop(1, mix(btn, sk.dark ? '#000' : '#9a9a9a', 0.15));
      ctx.beginPath(); ctx.arc(cx, wy, 140, 0, Math.PI * 2); ctx.fillStyle = bgc; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = sk.dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)'; ctx.stroke();
    },
  });

  /* ---------- 2. 串流播放畫面 ---------- */
  def({
    id: 'player', zh: '播放中', en: 'Now Playing', tag: 'music', ratio: 1, anim: true,
    layout() { return { W: 1240, H: 2204, slot: { x: 120, y: 380, w: 1000, h: 1000, r: 30 } }; },
    draw(ctx, L, d, photo, sk) {
      const light = sk.mode === 'color' && !sk.dark;
      if (sk.mode !== 'color' && d.still) {
        cover(ctx, blurred(d.still, L.W, L.H, 14), 0, 0, L.W, L.H);
        ctx.fillStyle = alpha(sk.dark ? '#000000' : mix(sk.deep, '#000000', 0.55), 0.42); ctx.fillRect(0, 0, L.W, L.H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, L.H);
        if (light) { g.addColorStop(0, sk.bg); g.addColorStop(1, sk.paper); }
        else { g.addColorStop(0, mix(sk.paper, '#ffffff', 0.06)); g.addColorStop(1, mix(sk.paper, '#000000', 0.45)); }
        ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
      }
      const hiC = light ? mix(sk.deep, '#000000', 0.1) : mix(sk.deep, '#ffffff', 0.35);
      const vg = ctx.createLinearGradient(0, L.H * 0.55, 0, L.H);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, light ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,.35)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, L.W, L.H);
      const fg = light ? sk.ink : '#ffffff';
      const mute = light ? alpha(sk.ink, 0.6) : 'rgba(255,255,255,.72)';
      // 上方
      icon(ctx, 'chevron', 150, 205, 56, fg, { lw: 7 });
      icon(ctx, 'dots', 1090, 205, 64, fg);
      text(ctx, T(d, '播放來源：我的回憶', 'PLAYING FROM YOUR MEMORIES'), 620, 190, { size: 26, weight: 700, color: mute, align: 'center', ls: 3, max: 760 });
      text(ctx, d.album || T(d, '日常精選', 'Daily Mix'), 620, 240, { size: 36, weight: 700, color: fg, align: 'center', max: 760 });
      // 封面
      shadow(ctx, 'rgba(0,0,0,.45)', 70, 0, 30);
      rr(ctx, 120, 380, 1000, 1000, 30); ctx.fillStyle = '#000'; ctx.fill();
      noShadow(ctx);
      photo();
      // 歌名
      const q = d.quote || T(d, '今天的主打歌', 'Track of the day');
      text(ctx, q, 120, 1500, { size: 62, weight: 700, color: fg, max: 850 });
      text(ctx, artistOf(d), 120, 1570, { size: 42, color: mute, max: 850 });
      icon(ctx, 'heart', 1080, 1515, 66, hiC, { fill: true });
      // 進度
      const an = A(d), prog = an.progress;
      rr(ctx, 120, 1652, 1000, 10, 5); ctx.fillStyle = light ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.28)'; ctx.fill();
      rr(ctx, 120, 1652, 1000 * prog, 10, 5); ctx.fillStyle = fg; ctx.fill();
      ctx.beginPath(); ctx.arc(120 + 1000 * prog, 1657, 18, 0, Math.PI * 2); ctx.fill();
      text(ctx, an.elapsed, 120, 1720, { size: 32, color: mute });
      text(ctx, an.total, 1120, 1720, { size: 32, color: mute, align: 'right' });
      // 控制鍵
      const y = 1860;
      icon(ctx, 'shuffle', 160, y, 66, hiC, { lw: 6 });
      icon(ctx, 'prev', 390, y, 84, fg);
      ctx.beginPath(); ctx.arc(620, y, 96, 0, Math.PI * 2); ctx.fillStyle = fg; ctx.fill();
      icon(ctx, 'pause', 620, y, 70, light ? '#fff' : '#111');
      icon(ctx, 'next', 850, y, 84, fg);
      icon(ctx, 'repeat', 1080, y, 66, mute, { lw: 6 });
      // 底部
      const by = 2060;
      if (d.location) { icon(ctx, 'pin', 140, by - 12, 40, hiC, { fill: true }); text(ctx, d.location, 172, by, { size: 32, weight: 700, color: hiC, max: 620 }); }
      const wx = weatherText(d);
      if (wx) {
        setFont(ctx, 32, F.sans, 500); const w = ctx.measureText(wx).width;
        text(ctx, wx, 1120, by, { size: 32, weight: 500, color: mute, align: 'right' });
        weatherIcon(ctx, d.weatherKey, 1120 - w - 34, by - 12, 50, mute);
      }
    },
  });

  /* ---------- 3. 黑膠唱片 ---------- */
  def({
    id: 'vinyl', zh: '黑膠唱片', en: 'Vinyl', tag: 'music', ratio: 1, anim: true,
    layout() { return { W: 1860, H: 1560, slot: { x: 130, y: 130, w: 1000, h: 1000, r: 4 } }; },
    draw(ctx, L, d, photo, sk) {
      const bg = sk.bg || tone(d.accent, 0.9, 0.5);
      const fg = ink(bg, '#1a1a1a', '#f4f4f4');
      const mute = alpha(fg, 0.6);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      // 唱片
      const cx = 1240, cy = 630, R = 490;
      shadow(ctx, 'rgba(0,0,0,.35)', 40, 10, 16);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = sk.wax || '#121212'; ctx.fill();
      noShadow(ctx);
      const spin = A(d).t * Math.PI * 2 * (33.3 / 60);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin); ctx.translate(-cx, -cy);
      for (let r = 180; r < R - 8; r += 7) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.025 + (r % 21 === 0 ? 0.04 : 0)})`; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
      if (ctx.createConicGradient) {
        const cg = ctx.createConicGradient(-0.6, cx, cy);
        cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(0.08, 'rgba(255,255,255,.16)'); cg.addColorStop(0.16, 'rgba(255,255,255,0)');
        cg.addColorStop(0.5, 'rgba(255,255,255,0)'); cg.addColorStop(0.58, 'rgba(255,255,255,.16)'); cg.addColorStop(0.66, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath(); ctx.arc(cx, cy, R - 4, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
      }
      // 圓標（跟著轉）
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin); ctx.translate(-cx, -cy);
      ctx.beginPath(); ctx.arc(cx, cy, 170, 0, Math.PI * 2); ctx.fillStyle = accentPaint(ctx, d, cx - 170, cy - 170, 340, 340); ctx.fill();
      const lab = ink(d.accent);
      text(ctx, (d.album || 'SIDE A').toUpperCase(), cx, cy - 50, { size: 30, weight: 700, color: lab, align: 'center', max: 190, fam: F.round });
      text(ctx, d.date || '', cx, cy + 58, { size: 26, color: lab, align: 'center', max: 190 });
      text(ctx, '33⅓ RPM', cx, cy + 96, { size: 22, color: alpha(lab, 0.7), align: 'center', ls: 2 });
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
      // 封套
      shadow(ctx, 'rgba(0,0,0,.35)', 50, 0, 20);
      rr(ctx, 130, 130, 1000, 1000, 4); ctx.fillStyle = '#000'; ctx.fill();
      noShadow(ctx);
      photo();
      const gl = ctx.createLinearGradient(130, 130, 1130, 1130);
      gl.addColorStop(0, 'rgba(255,255,255,.14)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,.12)');
      rr(ctx, 130, 130, 1000, 1000, 4); ctx.fillStyle = gl; ctx.fill();
      // 圓形貼紙
      const wx = weatherText(d);
      if (wx || d.time) {
        ctx.save(); ctx.translate(1040, 1050); ctx.rotate(-0.22);
        shadow(ctx, 'rgba(0,0,0,.25)', 14, 0, 6);
        ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.fillStyle = '#ffe14d'; ctx.fill(); noShadow(ctx);
        if (d.weatherKey && d.weather) weatherIcon(ctx, d.weatherKey, 0, -26, 64, '#1a1a1a', 6);
        text(ctx, d.temp || d.time, 0, 50, { size: 38, weight: 900, color: '#1a1a1a', align: 'center', max: 150 });
        ctx.restore();
      }
      // 文字
      const q = d.quote || T(d, '今天的主打歌', 'Track of the day');
      text(ctx, q, 130, 1260, { size: 60, weight: 900, color: fg, max: 1600 });
      text(ctx, [artistOf(d), d.album].filter(Boolean).join('  —  '), 130, 1335, { size: 40, color: fg, max: 1440 });
      text(ctx, metaLine(d, '  ·  ', ['date', 'time', 'location']), 130, 1405, { size: 30, color: mute, fam: F.mono, max: 1440 });
      text(ctx, 'SIDE A  ▸  33⅓', 1730, 1405, { size: 26, weight: 700, color: mute, align: 'right', fam: F.mono });
    },
  });

  /* ---------- 4. CD 盒 ---------- */
  def({
    id: 'cd', zh: 'CD 專輯', en: 'CD Case', tag: 'music', ratio: 1,
    layout() { return { W: 1400, H: 1750, slot: { x: 262, y: 130, w: 1000, h: 1000, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const bg = sk.bg || tone(d.accent, 0.88, 0.45);
      const fg = ink(bg, '#1a1a1a', '#f2f2f2');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      // 盒身
      shadow(ctx, 'rgba(0,0,0,.3)', 60, 0, 26);
      rr(ctx, 100, 100, 1200, 1060, 14); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      noShadow(ctx);
      const sp = ctx.createLinearGradient(100, 0, 240, 0);
      sp.addColorStop(0, '#111214'); sp.addColorStop(0.5, '#3b3d42'); sp.addColorStop(1, '#16171a');
      rr(ctx, 100, 100, 140, 1060, [14, 0, 0, 14]); ctx.fillStyle = sp; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 3;
      for (let y = 130; y < 1140; y += 22) { ctx.beginPath(); ctx.moveTo(118, y); ctx.lineTo(222, y); ctx.stroke(); }
      ctx.save(); ctx.translate(170, 1130); ctx.rotate(-Math.PI / 2);
      text(ctx, `${(d.album || 'MEMORIES').toUpperCase()}  ·  ${d.quote || ''}`, 0, 12, { size: 34, weight: 700, color: '#fff', max: 980, fam: F.sans, ls: 2 });
      ctx.restore();
      photo();
      // 反光
      ctx.save();
      rr(ctx, 100, 100, 1200, 1060, 14); ctx.clip();
      const gl = ctx.createLinearGradient(100, 100, 1300, 1160);
      gl.addColorStop(0, 'rgba(255,255,255,.0)'); gl.addColorStop(0.32, 'rgba(255,255,255,.0)');
      gl.addColorStop(0.36, 'rgba(255,255,255,.28)'); gl.addColorStop(0.46, 'rgba(255,255,255,.06)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl; ctx.fillRect(100, 100, 1200, 1060);
      ctx.restore();
      rr(ctx, 100, 100, 1200, 1060, 14); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
      // 曲目
      text(ctx, 'TRACKLIST', 100, 1255, { size: 34, weight: 700, color: fg, fam: F.mono, ls: 6 });
      text(ctx, `℗ ${d.y || ''} ${artistOf(d)}`, 1300, 1255, { size: 28, color: alpha(fg, 0.6), fam: F.mono, align: 'right', max: 620 });
      const tracks = [d.quote, d.location, weatherText(d), d.camera, [d.date, d.time].filter(Boolean).join(' ')].filter(Boolean);
      const r = rand(hashStr(tracks.join('')));
      tracks.slice(0, 5).forEach((tr, i) => {
        const y = 1335 + i * 76;
        text(ctx, String(i + 1).padStart(2, '0'), 100, y, { size: 34, weight: 700, color: d.accent && lum(bg) > 0.2 ? mix(d.accent, '#000', 0.25) : '#ffd36b', fam: F.mono });
        const len = `${2 + Math.floor(r() * 3)}:${String(Math.floor(r() * 60)).padStart(2, '0')}`;
        const w = text(ctx, tr, 190, y, { size: 34, color: fg, max: 900 });
        ctx.strokeStyle = alpha(fg, 0.25); ctx.setLineDash([3, 12]); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(190 + w + 20, y - 10); ctx.lineTo(1190, y - 10); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, len, 1300, y, { size: 32, color: alpha(fg, 0.7), fam: F.mono, align: 'right' });
      });
    },
  });

  /* ---------- 5. 拍立得 ---------- */
  def({
    id: 'instax', zh: '拍立得', en: 'Instant', tag: 'photo', ratio: null, suggest: '3/4',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 140, H: h + 90 + 340, slot: { x: 70, y: 90, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      ctx.fillStyle = sk.paper; ctx.fillRect(0, 0, L.W, L.H);
      paperNoise(ctx, 0, 0, L.W, L.H, 3, sk.dark ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.025)');
      const s = L.slot;
      photo();
      const ig = ctx.createLinearGradient(0, s.y, 0, s.y + 30);
      ig.addColorStop(0, 'rgba(0,0,0,.12)'); ig.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ig; ctx.fillRect(s.x, s.y, s.w, 30);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.strokeRect(s.x, s.y, s.w, s.h);
      if (d.stamp) dateStamp(ctx, d.stampText, s.x + s.w - 40, s.y + s.h - 40, 64);
      // 手寫字
      const by = s.y + s.h, bh = L.H - by;
      const q = d.quote || '';
      if (q) {
        const f = fitWrap(ctx, q, s.w - 60, 84, F.hand, 700, 2, 46);
        const lh = f.size * 1.12;
        const y0 = by + bh * 0.42 - (f.lines.length - 1) * lh / 2 + f.size * 0.3;
        lines(ctx, f.lines, L.W / 2, y0, lh, { size: f.size, fam: F.hand, weight: 700, color: sk.ink, align: 'center' });
      }
      const left = [d.location, weatherText(d)].filter(Boolean).join(' · ');
      const right = [d.date, d.time].filter(Boolean).join(' ');
      const my = L.H - 52;
      let lx = s.x + 6;
      if (d.weather && d.weatherKey) { weatherIcon(ctx, d.weatherKey, lx + 22, my - 14, 46, sk.ink, 4); lx += 56; }
      text(ctx, left, lx, my, { size: 40, fam: F.hand, weight: 700, color: alpha(sk.ink, 0.75), max: s.w * 0.55 });
      text(ctx, right, s.x + s.w - 6, my, { size: 40, fam: F.hand, weight: 700, color: alpha(sk.ink, 0.75), align: 'right', max: s.w * 0.4 });
    },
  });

  /* ---------- 6. 底片 ---------- */
  def({
    id: 'film', zh: '35mm 底片', en: '35mm Film', tag: 'photo', ratio: null, suggest: '3/2',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 80, H: h + 340, slot: { x: 40, y: 170, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const tint = sk.mode === 'tint';
      const base = tint ? mix(sk.deep, '#000000', 0.55) : (sk.dark ? mix(sk.paper, '#000000', 0.3) : mix(sk.paper, '#0d0d0d', 0.9));
      const filmInk = tint ? mix(sk.paper, '#ffffff', 0.3) : (sk.dark ? '#f2a33a' : mix(sk.paper, sk.deep, 0.15));
      ctx.fillStyle = base; ctx.fillRect(0, 0, L.W, L.H);
      const s = L.slot;
      // 齒孔
      const holeW = 56, holeH = 76, step = 118;
      const n = Math.floor((L.W - 40) / step);
      const off = (L.W - (n - 1) * step) / 2;
      ctx.fillStyle = '#f2ede4';
      for (let i = 0; i < n; i++) {
        const x = off + i * step - holeW / 2;
        rr(ctx, x, 26, holeW, holeH, 10); ctx.fill();
        rr(ctx, x, L.H - 26 - holeH, holeW, holeH, 10); ctx.fill();
      }
      const ink2 = filmInk;
      const fno = d.day ? String(d.day).padStart(2, '0') : '24';
      text(ctx, `▶ ${fno}A`, s.x + 10, 150, { size: 30, weight: 700, color: ink2, fam: F.mono });
      text(ctx, `${(d.album || 'LUMA POP').toUpperCase()} 400`, L.W / 2, 150, { size: 30, weight: 700, color: ink2, fam: F.mono, align: 'center', ls: 6 });
      text(ctx, d.date || '', s.x + s.w - 10, 150, { size: 30, weight: 700, color: ink2, fam: F.mono, align: 'right' });
      const bl = s.y + s.h + 52;
      text(ctx, d.location || '', s.x + 10, bl, { size: 30, weight: 700, color: ink2, fam: F.mono, max: s.w * 0.45 });
      text(ctx, d.quote || '', L.W / 2, bl, { size: 30, weight: 700, color: ink2, fam: F.mono, align: 'center', max: s.w * 0.4 });
      text(ctx, [weatherText(d), d.time].filter(Boolean).join('  '), s.x + s.w - 10, bl, { size: 30, weight: 700, color: ink2, fam: F.mono, align: 'right', max: s.w * 0.3 });
      photo();
      if (d.stamp) dateStamp(ctx, d.stampText, s.x + s.w - 40, s.y + s.h - 40, 64);
    },
  });

  /* ---------- 7. CCD 相機螢幕 ---------- */
  def({
    id: 'ccd', zh: 'CCD 相機', en: 'CCD Cam', tag: 'photo', ratio: null, suggest: '4/3',
    layout(a, sk) {
      const [w, h] = slotDims(a); const b = sk && sk.mode === 'none' ? 0 : 40;
      return { W: w + b * 2, H: h + b * 2, slot: { x: b, y: b, w, h, r: b ? 16 : 0 } };
    },
    draw(ctx, L, d, photo, sk) {
      if (sk.mode !== 'none') { ctx.fillStyle = sk.dark ? mix(sk.paper, '#000000', 0.6) : mix(sk.paper, '#000000', 0.1); ctx.fillRect(0, 0, L.W, L.H); }
      photo();
      const s = L.slot, m = 48;
      const x0 = s.x + m, y0 = s.y + m, x1 = s.x + s.w - m, y1 = s.y + s.h - m;
      ctx.save();
      shadow(ctx, 'rgba(0,0,0,.65)', 6, 2, 2);
      const W = '#ffffff';
      rr(ctx, x0, y0, 92, 66, 10); ctx.lineWidth = 5; ctx.strokeStyle = W; ctx.stroke();
      text(ctx, 'P', x0 + 46, y0 + 56, { size: 66, color: W, fam: F.pixel, align: 'center' });
      text(ctx, 'AUTO', x0 + 116, y0 + 52, { size: 54, color: W, fam: F.pixel });
      icon(ctx, 'battery', x1 - 46, y0 + 30, 84, W, { level: 0.66, lw: 6 });
      const fc = String(((d.day || 24) * 7 + (d.mi || 0)) % 999).padStart(4, '0');
      text(ctx, fc, x1 - 110, y0 + 52, { size: 54, color: W, fam: F.pixel, align: 'right' });
      if (s.w > s.h * 1.15) text(ctx, '12M ★FINE', x1 - 270, y0 + 52, { size: 46, color: W, fam: F.pixel, align: 'right' });
      if (d.weather || d.temp) {
        const tw = text(ctx, d.temp || '', x1, y0 + 130, { size: 54, color: W, fam: F.pixel, align: 'right' });
        if (d.weather && d.weatherKey) weatherIcon(ctx, d.weatherKey, x1 - tw - 40, y0 + 110, 60, W, 5);
      }
      // 對焦框
      const fw = Math.min(s.w, s.h) * 0.22, cx = s.x + s.w / 2, cy = s.y + s.h / 2, k = fw * 0.28;
      ctx.strokeStyle = '#6dff86'; ctx.lineWidth = 6;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * fw, cy + sy * (fw - k)); ctx.lineTo(cx + sx * fw, cy + sy * fw); ctx.lineTo(cx + sx * (fw - k), cy + sy * fw);
        ctx.stroke();
      }
      if (d.quote) text(ctx, d.quote, x0, y0 + 130, { size: 50, color: W, fam: F.pixel, max: s.w * 0.62 });
      // 日期印記在右下；寬度不夠時，參數與地點往上排
      const stamp = [d.dateDot, d.time].filter(Boolean).join('  ');
      setFont(ctx, 70, F.pixel, 400); spacing(ctx, 4);
      const stampW = stamp ? ctx.measureText(stamp).width + 40 : 0;
      spacing(ctx, 0);
      const room = x1 - x0 - stampW;
      let row = y1;
      if (room < 360) row -= 80;
      const maxW = room < 360 ? x1 - x0 : room;
      if (d.shot) { text(ctx, d.shot, x0, row, { size: 52, color: W, fam: F.pixel, max: maxW }); row -= 74; }
      if (d.location) text(ctx, d.location, x0, row, { size: 50, color: W, fam: F.pixel, max: Math.min(maxW, s.w * 0.7) });
      ctx.restore();
      dateStamp(ctx, stamp, x1, y1, 70);
    },
  });

  /* ---------- 8. Y2K 視窗 ---------- */
  def({
    id: 'y2k', zh: 'Y2K 視窗', en: 'Y2K Window', tag: 'fun', ratio: null, suggest: '4/3',
    layout(a) {
      const [w, h] = slotDims(a);
      return { W: w + 200, H: h + 120 + 92 + 80 + 310, slot: { x: 100, y: 120 + 92, w, h, r: 0 } };
    },
    draw(ctx, L, d, photo, sk) {
      const g = ctx.createLinearGradient(0, 0, L.W, L.H);
      g.addColorStop(0, sk.dark ? sk.paper : sk.bg); g.addColorStop(1, mix(sk.dark ? sk.paper : sk.bg, sk.deep, 0.4));
      ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
      ctx.strokeStyle = sk.dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.45)'; ctx.lineWidth = 2;
      for (let x = 0; x < L.W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, L.H); ctx.stroke(); }
      for (let y = 0; y < L.H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L.W, y); ctx.stroke(); }
      const r = rand(11);
      for (let i = 0; i < 14; i++) icon(ctx, 'star4', r() * L.W, r() * L.H, 30 + r() * 50, i % 3 ? '#ffffff' : '#fff59e');
      const s = L.slot;
      const wx = s.x - 10, wy = s.y - 92, ww = s.w + 20, wh = s.h + 92 + 80;
      // 視窗
      shadow(ctx, 'rgba(40,0,80,.3)', 0, 18, 18);
      ctx.fillStyle = '#ece8f3'; ctx.fillRect(wx, wy, ww, wh);
      noShadow(ctx);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(wx, wy, ww, 4); ctx.fillRect(wx, wy, 4, wh);
      ctx.fillStyle = '#7a7486'; ctx.fillRect(wx, wy + wh - 4, ww, 4); ctx.fillRect(wx + ww - 4, wy, 4, wh);
      const tb = ctx.createLinearGradient(wx, 0, wx + ww, 0);
      tb.addColorStop(0, mix(sk.deep, '#000000', 0.12)); tb.addColorStop(1, mix(sk.deep, '#ffffff', 0.3));
      ctx.fillStyle = tb; ctx.fillRect(wx + 8, wy + 8, ww - 16, 76);
      const fname = `${(d.album || 'my_memory').replace(/\s+/g, '_').toLowerCase()}_${String(d.mo || 10).padStart(2, '0')}${String(d.day || 24).padStart(2, '0')}.jpg`;
      icon(ctx, 'heart', wx + 50, wy + 46, 36, '#ffffff', { fill: true });
      text(ctx, fname, wx + 84, wy + 62, { size: 50, color: '#fff', fam: F.pixel, max: ww - 330 });
      ['_', '□', '×'].forEach((c, i) => {
        const bx = wx + ww - 16 - (3 - i) * 66;
        ctx.fillStyle = '#ece8f3'; ctx.fillRect(bx, wy + 18, 56, 56);
        ctx.fillStyle = '#fff'; ctx.fillRect(bx, wy + 18, 56, 3); ctx.fillRect(bx, wy + 18, 3, 56);
        ctx.fillStyle = '#7a7486'; ctx.fillRect(bx, wy + 71, 56, 3); ctx.fillRect(bx + 53, wy + 18, 3, 56);
        text(ctx, c, bx + 28, wy + 62, { size: 50, color: '#222', fam: F.pixel, align: 'center' });
      });
      photo();
      // 狀態列
      const sy = s.y + s.h + 12;
      ctx.fillStyle = '#d9d4e2'; ctx.fillRect(s.x, sy, s.w, 58);
      ctx.fillStyle = '#9a94a6'; ctx.fillRect(s.x, sy, s.w, 3); ctx.fillRect(s.x, sy, 3, 58);
      let x = s.x + 22;
      if (d.location) { icon(ctx, 'pin', x + 12, sy + 28, 36, '#e2408c', { fill: true, hole: '#d9d4e2' }); x += 36; x += text(ctx, d.location, x, sy + 44, { size: 44, color: '#2a2433', fam: F.pixel, max: s.w * 0.45 }) + 30; }
      if (weatherText(d)) {
        if (d.weatherKey && d.weather) { weatherIcon(ctx, d.weatherKey, x + 18, sy + 28, 40, '#2a2433', 4); x += 44; }
        x += text(ctx, weatherText(d), x, sy + 44, { size: 44, color: '#2a2433', fam: F.pixel, max: s.w * 0.3 }) + 30;
      }
      text(ctx, [d.date, d.time].filter(Boolean).join(' '), s.x + s.w - 20, sy + 44, { size: 44, color: '#2a2433', fam: F.pixel, align: 'right', max: Math.max(120, s.x + s.w - x - 30) });
      // 對話框
      const q = d.quote;
      if (q) {
        const dw = Math.min(680, s.w * 0.72), dh = 250;
        const dx = L.W - dw - 50, dy = L.H - dh - 36;
        shadow(ctx, 'rgba(40,0,80,.3)', 0, 12, 12);
        ctx.fillStyle = '#ece8f3'; ctx.fillRect(dx, dy, dw, dh);
        noShadow(ctx);
        ctx.fillStyle = '#fff'; ctx.fillRect(dx, dy, dw, 4); ctx.fillRect(dx, dy, 4, dh);
        ctx.fillStyle = '#7a7486'; ctx.fillRect(dx, dy + dh - 4, dw, 4); ctx.fillRect(dx + dw - 4, dy, 4, dh);
        ctx.fillStyle = tb; ctx.fillRect(dx + 6, dy + 6, dw - 12, 50);
        text(ctx, T(d, '訊息.txt', 'message.txt'), dx + 22, dy + 44, { size: 40, color: '#fff', fam: F.pixel });
        icon(ctx, 'info', dx + 62, dy + 112, 64, sk.deep);
        const f = fitWrap(ctx, q, dw - 140, 44, F.pixel, 400, 2, 30);
        lines(ctx, f.lines, dx + 112, dy + 104 + (f.lines.length === 1 ? 16 : 0), f.size * 1.05, { size: f.size, fam: F.pixel, color: '#1d1724' });
        const ox = dx + dw / 2 - 70, oy = dy + dh - 74;
        ctx.fillStyle = '#ece8f3'; ctx.fillRect(ox, oy, 140, 52);
        ctx.strokeStyle = '#1d1724'; ctx.lineWidth = 3; ctx.strokeRect(ox, oy, 140, 52);
        ctx.fillStyle = '#fff'; ctx.fillRect(ox + 3, oy + 3, 134, 3);
        text(ctx, 'OK', ox + 70, oy + 40, { size: 44, color: '#1d1724', fam: F.pixel, align: 'center' });
        icon(ctx, 'cursor', ox + 110, oy + 30, 56, '#000');
      }
    },
  });

  /* ---------- 9. 雜誌封面 ---------- */
  def({
    id: 'magazine', zh: '雜誌封面', en: 'Magazine', tag: 'fun', ratio: 4 / 5,
    layout(a) { const [w, h] = slotDims(a); return { W: w, H: h, slot: { x: 0, y: 0, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      photo();
      const dark = sk.mode === 'black' || (sk.mode !== 'white' && (d.pal ? d.pal.topLum > 0.62 : false));
      const fg = dark ? '#111111' : '#ffffff';
      const tg = ctx.createLinearGradient(0, 0, 0, L.H * 0.32);
      tg.addColorStop(0, dark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.35)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, L.W, L.H * 0.32);
      const bg2 = ctx.createLinearGradient(0, L.H * 0.55, 0, L.H);
      bg2.addColorStop(0, 'rgba(0,0,0,0)'); bg2.addColorStop(1, dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.45)');
      ctx.fillStyle = bg2; ctx.fillRect(0, L.H * 0.55, L.W, L.H * 0.45);
      const title = (d.album || 'VIBES').toUpperCase();
      const size = fitSize(ctx, title, L.W - 80, 340, F.display, 400, 120);
      text(ctx, title, L.W / 2, 40 + size * 0.86, { size, fam: F.display, color: fg, align: 'center' });
      const issue = [`ISSUE No.${String(d.mo || 10).padStart(2, '0')}${String(d.day || 24).padStart(2, '0')}`, d.monthYear, d.location].filter(Boolean).join('  ·  ');
      text(ctx, issue.toUpperCase(), L.W / 2, 40 + size * 0.86 + 54, { size: 28, weight: 700, fam: F.mono, color: fg, align: 'center', ls: 3, max: L.W - 100 });
      // 封面標語
      const q = d.quote || T(d, '把今天，做成一張封面', 'Make today a cover');
      const f = fitWrap(ctx, q, L.W * 0.66, 104, F.serif, 400, 3, 56, 'italic');
      const baseY = L.H * 0.66;
      lines(ctx, f.lines, 60, baseY, f.size * 1.08, { size: f.size, fam: F.serif, style: 'italic', color: fg });
      let y = baseY + f.lines.length * f.size * 1.08 + 20;
      const tags = [weatherText(d), d.camera, [d.date, d.time].filter(Boolean).join(' ')].filter(Boolean);
      tags.forEach((tg2) => {
        setFont(ctx, 32, F.sans, 900); spacing(ctx, 2);
        const w = Math.min(ctx.measureText(tg2.toUpperCase()).width, L.W * 0.6);
        spacing(ctx, 0);
        ctx.fillStyle = accentPaint(ctx, d, 60, y - 36, w + 28, 48); ctx.fillRect(60, y - 36, w + 28, 48);
        text(ctx, tg2.toUpperCase(), 74, y, { size: 32, weight: 900, color: ink(d.accent), ls: 2, max: L.W * 0.6 });
        y += 62;
      });
      // 條碼
      const bw = 250, bh = 150, bx = L.W - bw - 50, by = L.H - bh - 50;
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw, bh);
      barcode(ctx, bx + 16, by + 14, bw - 32, bh - 56, d.quote + d.date, '#111');
      text(ctx, `4 ${d.y || 2026} ${String(d.mo || 10).padStart(2, '0')}${String(d.day || 24).padStart(2, '0')} 0`, bx + bw / 2, by + bh - 14, { size: 26, fam: F.mono, color: '#111', align: 'center', max: bw - 20 });
      // 圓形貼紙
      ctx.save(); ctx.translate(L.W - 150, 40 + size + 150); ctx.rotate(0.2);
      ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.fillStyle = '#ffe14d'; ctx.fill();
      text(ctx, 'SPECIAL', 0, -8, { size: 36, weight: 900, color: '#111', align: 'center', fam: F.display });
      text(ctx, 'EDITION', 0, 32, { size: 36, weight: 900, color: '#111', align: 'center', fam: F.display });
      ctx.restore();
    },
  });

  /* ---------- 10. 演唱會票根 ---------- */
  def({
    id: 'ticket', zh: '演唱會票根', en: 'Ticket', tag: 'fun', ratio: null, suggest: '4/3',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 640 + 300 + 180, H: h + 180, slot: { x: 90, y: 90, w, h, r: [36, 0, 0, 36] } }; },
    draw(ctx, L, d, photo, sk) {
      const s = L.slot;
      const bgc = sk.dark ? sk.bg : tone(sk.deep, 0.5, 0.6);
      ctx.fillStyle = bgc; ctx.fillRect(0, 0, L.W, L.H);
      const r = rand(5);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`; ctx.beginPath(); ctx.arc(r() * L.W, r() * L.H, 6 + r() * 26, 0, Math.PI * 2); ctx.fill(); }
      const x0 = s.x, y0 = s.y, PW = 640, SW = 300, H = s.h;
      const px = x0 + s.w, sx = px + PW;
      shadow(ctx, 'rgba(0,0,0,.35)', 50, 0, 22);
      rr(ctx, x0, y0, s.w + PW, H, [36, 0, 0, 36]); ctx.fillStyle = sk.paper; ctx.fill();
      rr(ctx, sx, y0, SW, H, [0, 36, 36, 0]); ctx.fillStyle = mix(sk.paper, sk.deep, sk.dark ? 0.2 : 0.3); ctx.fill();
      noShadow(ctx);
      // 打孔缺口
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      for (const yy of [y0, y0 + H]) { ctx.beginPath(); ctx.arc(sx, yy, 40, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bgc; ctx.fillRect(0, 0, L.W, L.H); ctx.restore();
      ctx.strokeStyle = alpha(sk.ink, 0.35); ctx.setLineDash([14, 14]); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx, y0 + 60); ctx.lineTo(sx, y0 + H - 60); ctx.stroke(); ctx.setLineDash([]);
      photo();
      // 資訊欄
      const acc = sk.deep;
      ctx.fillStyle = d.accent2 ? accentPaint(ctx, d, px, y0, PW, 96) : acc; ctx.fillRect(px, y0, PW, 96);
      text(ctx, `LIVE TOUR ${d.y || ''}`.trim(), px + 40, y0 + 64, { size: 40, weight: 700, color: ink(acc), fam: F.mono, ls: 4, max: PW - 80 });
      const q = d.quote || T(d, '今天的主打歌', 'Track of the day');
      const fz = fitWrap(ctx, q, PW - 80, 66, F.sans, 900, 3, 40);
      lines(ctx, fz.lines, px + 40, y0 + 190, fz.size * 1.15, { size: fz.size, fam: F.sans, weight: 900, color: sk.ink });
      let cy = y0 + 190 + fz.lines.length * fz.size * 1.15;
      text(ctx, `feat. ${artistOf(d)}`, px + 40, cy + 10, { size: 36, color: alpha(sk.ink, 0.7), max: PW - 80 });
      cy += 70;
      const cells = [['DATE', d.date], ['TIME', d.time], ['WEATHER', d.weather], ['TEMP', d.temp]].filter((c) => c[1]);
      const avail = y0 + H - 140 - cy;
      const rowH = Math.min(120, avail / Math.max(1, Math.ceil(cells.length / 2)));
      cells.forEach(([k, v], i) => {
        const cx2 = px + 40 + (i % 2) * 290, cy2 = cy + Math.floor(i / 2) * rowH + 40;
        text(ctx, k, cx2, cy2, { size: 24, weight: 700, color: alpha(sk.ink, 0.5), fam: F.mono, ls: 3 });
        text(ctx, v, cx2, cy2 + 48, { size: 40, weight: 700, color: sk.ink, max: 270 });
      });
      if (d.location) {
        text(ctx, 'VENUE', px + 40, y0 + H - 90, { size: 24, weight: 700, color: alpha(sk.ink, 0.5), fam: F.mono, ls: 3 });
        text(ctx, d.location, px + 40, y0 + H - 44, { size: 40, weight: 700, color: sk.ink, max: PW - 80 });
      }
      // 存根
      ctx.save(); ctx.translate(sx + 92, y0 + H / 2); ctx.rotate(-Math.PI / 2);
      text(ctx, 'ADMIT ONE', 0, 0, { size: 62, weight: 900, color: sk.ink, align: 'center', fam: F.display, ls: 6, max: H - 120 });
      text(ctx, `ROW ${d.mo || 10}  ·  SEAT ${d.day || 24}`, 0, 52, { size: 30, weight: 700, color: alpha(sk.ink, 0.7), align: 'center', fam: F.mono, max: H - 120 });
      ctx.restore();
      ctx.save(); ctx.translate(sx + 210, y0 + 60); ctx.rotate(Math.PI / 2);
      barcode(ctx, 0, -50, H - 120, 80, q + d.date, sk.ink);
      ctx.restore();
    },
  });

  /* ---------- 11. 手機鎖定畫面（字型、粗細、顏色、通知面板都可調） ---------- */
  def({
    id: 'lockscreen', zh: '鎖定畫面', en: 'Lock Screen', tag: 'fun', ratio: 9 / 16, styleable: true,
    layout() { return { W: 1000, H: 1778, slot: { x: 0, y: 0, w: 1000, h: 1778, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      photo();
      const st = d.style || {};
      const fg = st.color && st.color !== 'auto' ? st.color : '#fff';
      const shade = lum(fg) > 0.4 ? 'rgba(0,0,0,' : 'rgba(255,255,255,';
      const tg = ctx.createLinearGradient(0, 0, 0, 760);
      tg.addColorStop(0, shade + '.3)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, L.W, 760);
      const bg2 = ctx.createLinearGradient(0, L.H - 700, 0, L.H);
      bg2.addColorStop(0, 'rgba(0,0,0,0)'); bg2.addColorStop(1, shade + '.32)');
      ctx.fillStyle = bg2; ctx.fillRect(0, L.H - 700, L.W, 700);
      icon(ctx, 'battery', 900, 70, 62, fg, { level: 0.8 });
      text(ctx, '5G', 820, 84, { size: 38, weight: 700, color: fg, align: 'right' });
      icon(ctx, 'lock', 500, 170, 54, fg, { lw: 6 });
      const fam = fontOf(st.font);
      const w = st.weight || 700;
      ctx.save(); shadow(ctx, 'rgba(0,0,0,.18)', 20);
      text(ctx, d.dateLong || d.date, 500, 290, { size: 52, weight: Math.min(w, 700), color: alpha(fg, 0.92), align: 'center', max: 860, fam: st.font === 'serif' || st.font === 'hand' ? fam : F.sans });
      if (d.time) text(ctx, d.time.replace(/\s*(AM|PM|上午|下午|午前|午後)\s*/g, ''), 500, 560, { size: st.font === 'pixel' ? 360 : 300, weight: w, fam, color: fg, align: 'center', max: 900 });
      ctx.restore();
      const wx = weatherText(d);
      const pill = [wx, d.location].filter(Boolean).join('  ·  ');
      if (pill) {
        setFont(ctx, 40, F.sans, 700);
        const pw = Math.min(860, ctx.measureText(pill).width + (d.weather ? 140 : 80));
        const pc = panel(ctx, d, L, 500 - pw / 2, 620, pw, 84, 42, st.panel, fg);
        let tx = 500 - pw / 2 + 40;
        if (d.weather && d.weatherKey) { weatherIcon(ctx, d.weatherKey, tx + 26, 662, 54, pc, 5); tx += 66; }
        text(ctx, pill, tx, 676, { size: 40, weight: 700, color: pc, max: pw - (tx - (500 - pw / 2)) - 30 });
      }
      // 通知卡片
      const q = d.quote;
      if (q) {
        const nx = 50, nw = 900, ny = L.H - 560;
        setFont(ctx, 40, F.sans, 400);
        const ql = wrap(ctx, q, nw - 230, 2);
        const nh = 150 + ql.length * 52;
        const nc = panel(ctx, d, L, nx, ny, nw, nh, 48, st.panel, fg);
        rr(ctx, nx + 34, ny + 36, 96, 96, 24); ctx.fillStyle = accentPaint(ctx, d, nx + 34, ny + 36, 96, 96); ctx.fill();
        icon(ctx, 'music', nx + 82, ny + 84, 56, ink(d.accent, '#111', '#fff'));
        text(ctx, d.album || 'Memories', nx + 160, ny + 76, { size: 38, weight: 700, color: nc, max: 520 });
        text(ctx, T(d, '現在', 'now'), nx + nw - 40, ny + 76, { size: 32, color: alpha(nc, 0.55), align: 'right' });
        lines(ctx, ql, nx + 160, ny + 130, 52, { size: 40, color: alpha(nc, 0.9) });
      }
      for (const [x, nm] of [[150, 'flash'], [850, 'camera']]) {
        const c = panel(ctx, d, L, x - 72, L.H - 262, 144, 144, 72, st.panel === 'gradient' || st.panel === 'solid' ? 'blur' : st.panel, fg);
        icon(ctx, nm, x, L.H - 190, 64, c, { lw: 5 });
      }
      rr(ctx, 350, L.H - 46, 300, 12, 6); ctx.fillStyle = fg; ctx.fill();
    },
  });

  /* ---------- 12. 手帳拼貼 ---------- */
  def({
    id: 'scrapbook', zh: '手帳拼貼', en: 'Scrapbook', tag: 'photo', ratio: null, suggest: '4/5',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 300, H: h + 190 + 440, slot: { x: 150, y: 190, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      ctx.fillStyle = sk.paper; ctx.fillRect(0, 0, L.W, L.H);
      const line = alpha(sk.deep, sk.dark ? 0.3 : 0.2);
      if (sk.mode === 'grid') {
        ctx.strokeStyle = line; ctx.lineWidth = 2;
        for (let x = 0; x < L.W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, L.H); ctx.stroke(); }
        for (let y = 0; y < L.H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L.W, y); ctx.stroke(); }
      } else if (sk.mode === 'dots') {
        ctx.fillStyle = line;
        for (let y = 25; y < L.H; y += 50) for (let x = 25 + ((y / 50) % 2) * 25; x < L.W; x += 50) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
      } else paperNoise(ctx, 0, 0, L.W, L.H, 9, 'rgba(90,60,20,.08)', 3000);
      const s = L.slot;
      shadow(ctx, 'rgba(0,0,0,.22)', 30, 6, 12);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 28, s.y - 28, s.w + 56, s.h + 56);
      noShadow(ctx);
      photo();
      const tape = (x, y, ang, col) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.beginPath();
        const w = 300, h = 76;
        ctx.moveTo(-w / 2, -h / 2);
        for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + (w * i) / 6, -h / 2 + (i % 2 ? 6 : 0));
        for (let i = 0; i <= 6; i++) ctx.lineTo(w / 2 - (w * i) / 6, h / 2 - (i % 2 ? 6 : 0));
        ctx.closePath();
        ctx.fillStyle = alpha(col, 0.72); ctx.fill();
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 12;
        for (let k = -w; k < w; k += 40) { ctx.beginPath(); ctx.moveTo(k, -h); ctx.lineTo(k + h, h); ctx.stroke(); }
        ctx.restore();
      };
      tape(s.x + 30, s.y - 10, -0.6, d.accent);
      tape(s.x + s.w - 30, s.y - 10, 0.6, mix(d.accent, '#ffd166', 0.6));
      // 塗鴉
      ctx.strokeStyle = sk.ink; ctx.lineWidth = 6; ctx.lineCap = 'round';
      icon(ctx, 'star5', s.x + s.w + 70, s.y + 90, 70, mix(d.accent, '#000', 0.1), { lw: 6 });
      icon(ctx, 'star4', s.x + s.w + 100, s.y + 200, 44, '#ffcf3f');
      icon(ctx, 'heart', s.x - 80, s.y + s.h - 40, 80, '#ff5c8a', { fill: true });
      icon(ctx, 'star4', s.x - 95, s.y + 120, 50, mix(d.accent, '#fff', 0.2));
      // 手寫語錄
      const by = s.y + s.h + 28;
      const q = d.quote || '';
      let qy = by + 120;
      if (q) {
        const f = fitWrap(ctx, q, s.w - 240, 88, F.hand, 700, 2, 50);
        lines(ctx, f.lines, s.x, qy, f.size * 1.15, { size: f.size, fam: F.hand, weight: 700, color: sk.ink });
        setFont(ctx, f.size, F.hand, 700);
        const lw = Math.min(s.w * 0.75, ctx.measureText(f.lines[f.lines.length - 1]).width);
        const uy = qy + (f.lines.length - 1) * f.size * 1.15 + 20;
        ctx.strokeStyle = alpha(d.accent, 0.8); ctx.lineWidth = 8; ctx.beginPath();
        for (let x = 0; x <= lw; x += 20) ctx[x ? 'lineTo' : 'moveTo'](s.x + x, uy + Math.sin(x / 20) * 6);
        ctx.stroke();
      }
      // 便利貼
      const memo = [d.date, d.time, weatherText(d), d.location].filter(Boolean);
      if (memo.length) {
        ctx.save(); ctx.translate(L.W - 190, L.H - 170); ctx.rotate(-0.06);
        shadow(ctx, 'rgba(0,0,0,.2)', 16, 3, 8);
        ctx.fillStyle = '#fff3a3'; ctx.fillRect(-160, -130, 320, 260);
        noShadow(ctx);
        memo.slice(0, 4).forEach((m, i) => text(ctx, m, -136, -74 + i * 58, { size: 42, fam: F.hand, weight: 700, color: '#4a3b12', max: 272 }));
        ctx.restore();
      }
    },
  });

  /* =====================================================================
   *  繪製入口
   * ===================================================================== */

  const even = (v) => Math.max(2, Math.round(v / 2) * 2);

  function byId(id) { return LIST.find((t) => t.id === id) || LIST[0]; }
  /** 配色＋版型；accent 給「隨光色」用 */
  function skinOf(t, id, mode, accent) {
    // 也接受「配色|版型」的寫法（app 用一個字串記住兩者）
    if (typeof id === 'string' && id.includes('|')) [id, mode] = id.split('|');
    const p = PALETTE.find((x) => x.id === id) || PALETTE.find((x) => x.id === t.pal) || PALETTE[0];
    const m = (t.modes.find((x) => x.id === mode) || t.modes[0] || {}).id;
    return { ...resolvePal(p, accent), mode: m };
  }

  /**
   * 計算版面（像素）
   * @param aspect 照片在模板中的寬高比
   * @param k      每單位多少像素
   */
  function pixelLayout(tpl, aspect, k, skin) {
    const L = tpl.layout(aspect, skin);
    const s = L.slot;
    const px = { x: even(s.x * k), y: even(s.y * k), w: even(s.w * k), h: even(s.h * k) };
    return { L, W: even(L.W * k), H: even(L.H * k), slotPx: px, k };
  }

  /** 照片放進模板時，實際使用的寬高比 */
  function aspectFor(tpl, crop) { return tpl.ratio || crop.w / crop.h; }

  /** 依 slot 比例把裁切範圍再置中裁成一樣比例 */
  function fitCrop(crop, aspect) {
    const a = crop.w / crop.h;
    if (Math.abs(a - aspect) < 0.002) return { ...crop };
    if (a > aspect) { const w = crop.h * aspect; return { x: crop.x + (crop.w - w) / 2, y: crop.y, w, h: crop.h }; }
    const h = crop.w / aspect; return { x: crop.x, y: crop.y + (crop.h - h) / 2, w: crop.w, h };
  }

  /**
   * @param canvas 目標畫布
   * @param o {
   *   tpl, skin, src（照片 / 影片影格）, crop（原圖像素）, d（文字資料）,
   *   k（每單位像素，未給時依照片解析度）, maxLong（輸出最長邊上限）, overlay（true：挖空照片區，給影片合成用）
   * }
   * @returns { W, H, slotPx, crop（實際使用的裁切） }
   */
  function render(canvas, o) {
    const tpl = byId(o.tpl);
    const skin = skinOf(tpl, o.skin, o.mode, o.d && o.d.accent);
    const aspect = aspectFor(tpl, o.crop);
    const crop = fitCrop(o.crop, aspect);
    let k = o.k;
    if (!k) {
      // 預設：照片以原解析度放入（短邊至少 1080px，文字才夠清楚），再依最長邊上限縮小
      const short = Math.min(crop.w, crop.h);
      k = Math.max(1.08, short / 1000);
      const L0 = tpl.layout(aspect, skin);
      const maxLong = o.maxLong || 4096;
      if (Math.max(L0.W, L0.H) * k > maxLong) k = maxLong / Math.max(L0.W, L0.H);
    }
    const P = pixelLayout(tpl, aspect, k, skin);
    canvas.width = P.W; canvas.height = P.H;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, P.W, P.H);
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(P.W / P.L.W, 0, 0, P.H / P.L.H, 0, 0);
    const sp = P.slotPx;
    const r = P.L.slot.r || 0;
    const photo = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      rr(ctx, sp.x, sp.y, sp.w, sp.h, Array.isArray(r) ? r.map((v) => v * k) : r * k);
      if (o.overlay) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000'; ctx.fill();
      } else if (o.src) {
        ctx.clip();
        ctx.drawImage(o.src, crop.x, crop.y, crop.w, crop.h, sp.x, sp.y, sp.w, sp.h);
      } else {
        ctx.fillStyle = '#888'; ctx.fill();
      }
      ctx.restore();
    };
    ctx.textBaseline = 'alphabetic';
    // 點綴色跟著配色（隨光色則用照片主色或自訂主題色）
    const d = skin.chroma ? o.d : { ...o.d, accent: skin.deep, accent2: null, accentStops: null };
    tpl.draw(ctx, P.L, d, photo, skin);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { W: P.W, H: P.H, slotPx: sp, crop, k };
  }

  const kit = {
    F, rgb, hex, mix, alpha, lum, ink, tone, rr, setFont, spacing, clip, wrap, fitWrap, fitSize, text, lines,
    shadow, noShadow, rand, hashStr, blurred, cover, cloudPath, weatherIcon, icon, barcode, dateStamp, paperNoise,
    weatherText, metaLine, artistOf, slotDims, T, A, panel, fontOf, accentPaint,
  };
  window.Templates = { LIST, PALETTE, define: def, kit, byId, skinOf, render, aspectFor, fitCrop, ensureFonts, weatherIcon, tone, ink, mix };
})();
