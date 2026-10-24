/* HEIC / RAW 解碼：轉成瀏覽器可以顯示的 JPEG，再交給一般相片流程處理 */
(function () {
  'use strict';

  const RAW_EXT = /\.(dng|nef|nrw|cr2|cr3|crw|arw|srf|sr2|raf|orf|rw2|rwl|pef|srw|x3f|3fr|fff|iiq|erf|mrw|kdc|dcr|mos|mef|gpr|raw)$/i;
  const HEIC_EXT = /\.(heic|heif|hif)$/i;
  const ACCEPT_EXT = '.heic,.heif,.hif,.dng,.nef,.nrw,.cr2,.cr3,.crw,.arw,.srf,.sr2,.raf,.orf,.rw2,.rwl,.pef,.srw,.x3f,.3fr,.fff,.iiq,.erf,.mrw,.kdc,.dcr,.mos,.mef,.gpr';

  function formatOf(file) {
    if (RAW_EXT.test(file.name)) return 'raw';
    if (/\.svgz?$/i.test(file.name) || file.type === 'image/svg+xml') return 'svg';
    if (HEIC_EXT.test(file.name) || /^image\/hei[cf]/.test(file.type)) return 'heic';
    return 'std';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function canDecode(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  /* ---------- HEIC：Safari 可直接顯示，其他瀏覽器用 libheif（heic-to） ---------- */

  let heicReady = null;
  async function decodeHeic(file) {
    const direct = URL.createObjectURL(file);
    if (await canDecode(direct)) return { url: direct };
    URL.revokeObjectURL(direct);
    if (!heicReady) heicReady = loadScript('vendor/heic/heic-to.js').catch((e) => { heicReady = null; throw e; });
    await heicReady;
    const blob = await window.HeicTo({ blob: file, type: 'image/jpeg', quality: 0.95 });
    return { url: URL.createObjectURL(blob) };
  }

  /* ---------- SVG：依 viewBox 轉成高解析度 PNG（長邊至少 2048px） ---------- */

  async function decodeSvg(file) {
    const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('invalid svg');
    const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let w = num(svg.getAttribute('width')) || (vb.length === 4 ? vb[2] : 0) || 1024;
    let h = num(svg.getAttribute('height')) || (vb.length === 4 ? vb[3] : 0) || w;
    const s = Math.min(4096 / Math.max(w, h), Math.max(1, 2048 / Math.max(w, h)));
    w = Math.round(w * s); h = Math.round(h * s);
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w / s} ${h / s}`);
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = svgUrl;
      });
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      return { url: URL.createObjectURL(blob) };
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  /* ---------- RAW：LibRaw 完整解碼，失敗時退回內嵌 JPEG 預覽 ---------- */

  let LibRawClass = null;
  async function getLibRaw() {
    if (!LibRawClass) {
      const mod = await import(new URL('vendor/libraw/index.js', document.baseURI).href);
      LibRawClass = mod.default;
    }
    return new LibRawClass();
  }

  async function decodeRaw(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let meta = null;
    try {
      const raw = await getLibRaw();
      try {
        // 傳給 worker 時 buffer 會被轉移，所以給一份複本，原本的留給備援使用
        await raw.open(buf.slice(), { useCameraWb: true, outputBps: 8, userQual: 3 });
        meta = await raw.metadata(true);
        const data = await raw.imageData();
        if (!data || !data.width) throw new Error('empty image');
        const blob = await rgbToJpeg(data);
        return { url: URL.createObjectURL(blob), meta, method: 'libraw' };
      } finally {
        raw.dispose();
      }
    } catch (err) {
      console.warn('LibRaw decode failed, using embedded preview', err);
      const preview = await largestEmbeddedJpeg(buf);
      if (!preview) throw err;
      return { url: preview.url, meta, method: 'preview' };
    }
  }

  async function rgbToJpeg({ width, height, colors, data }) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    const out = ctx.createImageData(width, height);
    const px = out.data;
    const src = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
    const step = colors || 3;
    for (let i = 0, j = 0; j < px.length; i += step, j += 4) {
      px[j] = src[i];
      px[j + 1] = src[i + (step > 1 ? 1 : 0)];
      px[j + 2] = src[i + (step > 2 ? 2 : 0)];
      px[j + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.97));
    c.width = c.height = 0;
    return blob;
  }

  // 掃描檔案中所有 JPEG（SOI…EOI），取解析度最大且能顯示的一張
  async function largestEmbeddedJpeg(d) {
    const found = [];
    let i = 0;
    const n = d.length;
    while (i < n - 3) {
      if (!(d[i] === 0xff && d[i + 1] === 0xd8 && d[i + 2] === 0xff)) { i++; continue; }
      let j = i + 2, ok = false, w = 0, h = 0, lossless = false;
      while (j + 4 <= n && d[j] === 0xff) {
        const m = d[j + 1];
        if (m === 0xd9) { ok = true; j += 2; break; }
        if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { j += 2; continue; }
        const len = (d[j + 2] << 8) | d[j + 3];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          h = (d[j + 5] << 8) | d[j + 6];
          w = (d[j + 7] << 8) | d[j + 8];
          if (m === 0xc3 || m === 0xc7 || m === 0xcb || m === 0xcf) lossless = true; // RAW 資料本身，瀏覽器無法顯示
        }
        if (m === 0xda) {
          let k = j + 2 + len;
          while (k + 1 < n && !(d[k] === 0xff && d[k + 1] !== 0 && !(d[k + 1] >= 0xd0 && d[k + 1] <= 0xd7))) k++;
          j = k;
          continue;
        }
        j += 2 + len;
      }
      if (ok && w && !lossless) { found.push({ start: i, end: j, w, h }); i = j; } else i += 3;
    }
    found.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const f of found) {
      const blob = new Blob([d.subarray(f.start, f.end)], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      if (await canDecode(url)) return { url, blob };
      URL.revokeObjectURL(url);
    }
    return null;
  }

  /**
   * 快速取得 RAW 內嵌的 JPEG 預覽（通常不到一秒），讓畫面先顯示，完整解碼在背景進行。
   * Fujifilm RAF 的檔頭直接記錄預覽位置，不需讀取整個檔案。
   */
  async function rawPreview(file) {
    try {
      const head = new DataView(await file.slice(0, 96).arrayBuffer());
      const magic = String.fromCharCode(...new Uint8Array(head.buffer, 0, 8));
      if (magic === 'FUJIFILM') {
        const off = head.getUint32(84), len = head.getUint32(88);
        if (off && len && off + len <= file.size) {
          const blob = file.slice(off, off + len, 'image/jpeg');
          const url = URL.createObjectURL(blob);
          if (await canDecode(url)) return { url, blob };
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) { /* 改用掃描 */ }
    return largestEmbeddedJpeg(new Uint8Array(await file.arrayBuffer()));
  }

  /** 用內嵌預覽 JPEG 的 EXIF 補上原檔讀不到的欄位（RAF、CR3 等 exifr 不支援的格式） */
  function mergeExif(base, extra) {
    if (!extra) return base;
    for (const k of ['make', 'model', 'lens', 'focal', 'iso', 'fnum', 'exposure']) {
      if (!base[k] && extra[k]) base[k] = extra[k];
    }
    if (base.lat == null && extra.lat != null) { base.lat = extra.lat; base.lon = extra.lon; }
    if (base.dateFromFile && !extra.dateFromFile && extra.date) {
      base.date = extra.date; base.time = extra.time; base.dateFromFile = false;
    }
    return base;
  }

  /** 用 LibRaw 的中繼資料補上 exifr 讀不到的欄位（CR3、RAF 等） */
  function fillFromLibRaw(exif, meta) {
    if (!meta) return exif;
    const pad2 = (v) => String(v).padStart(2, '0');
    const num = (v) => typeof v === 'number' && isFinite(v) && v > 0;
    if (!exif.make && meta.camera_make) exif.make = meta.camera_make;
    if (!exif.model && meta.camera_model) exif.model = String(meta.camera_model).trim();
    const lens = meta.lens && (meta.lens.Lens || (meta.lens.makernotes && meta.lens.makernotes.Lens));
    if (!exif.lens && lens) exif.lens = String(lens).trim();
    if (!exif.iso && num(meta.iso_speed)) exif.iso = String(Math.round(meta.iso_speed));
    if (!exif.fnum && num(meta.aperture)) exif.fnum = meta.aperture.toFixed(1);
    if (!exif.focal && num(meta.focal_len)) exif.focal = String(Number(meta.focal_len.toFixed(1)));
    if (!exif.exposure && num(meta.shutter)) exif.exposure = Frame.formatExposure(meta.shutter);
    if (meta.timestamp instanceof Date && !isNaN(meta.timestamp) && meta.timestamp.getTime() > 0 && exif.dateFromFile) {
      const d = meta.timestamp;
      exif.date = `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
      exif.time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      exif.dateFromFile = false;
    }
    const g = meta.gps_data;
    if (exif.lat == null && g && g.gpsparsed) {
      const dms = (a) => a[0] + a[1] / 60 + a[2] / 3600;
      let lat = dms(g.latitude), lon = dms(g.longitude);
      if (g.latref === 'S') lat = -lat;
      if (g.longref === 'W') lon = -lon;
      if (lat || lon) { exif.lat = lat; exif.lon = lon; }
    }
    return exif;
  }

  window.Decode = { rawPreview, mergeExif, formatOf, decodeSvg, decodeHeic, decodeRaw, fillFromLibRaw, ACCEPT_EXT };
})();
