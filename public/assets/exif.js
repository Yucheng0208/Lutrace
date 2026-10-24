/* 相片參數讀取（取自 Lumark frame.js：EXIF、品牌名稱、曝光格式） */
(function () {
  'use strict';

  /** 把 EXIF 的廠牌整理成好看的品牌名稱（NIKON CORPORATION → NIKON） */
  const BRAND_NAMES = [
    [/^nikon/i, 'NIKON'], [/^canon/i, 'Canon'], [/^fuji/i, 'FUJIFILM'], [/^sony/i, 'SONY'],
    [/^ricoh/i, 'RICOH'], [/^pentax/i, 'PENTAX'], [/^olympus/i, 'OLYMPUS'], [/^om digital/i, 'OM SYSTEM'],
    [/^panasonic/i, 'Panasonic'], [/^leica/i, 'Leica'], [/^hasselblad/i, 'HASSELBLAD'], [/^sigma/i, 'SIGMA'],
    [/^dji/i, 'DJI'], [/^gopro/i, 'GoPro'], [/^insta360|^arashi/i, 'Insta360'], [/^kodak/i, 'Kodak'],
    [/^apple/i, 'Apple'], [/^samsung/i, 'Samsung'], [/^google/i, 'Google'], [/^huawei/i, 'HUAWEI'],
    [/^xiaomi/i, 'Xiaomi'], [/^vivo/i, 'vivo'], [/^oppo/i, 'OPPO'], [/^oneplus/i, 'OnePlus'], [/^asus/i, 'ASUS'],
    [/^honor/i, 'HONOR'], [/^motorola/i, 'Motorola'], [/^nothing/i, 'Nothing'], [/^microsoft/i, 'Microsoft'],
  ];
  function brandName(make) {
    const m = String(make || '').trim();
    if (!m) return '';
    const hit = BRAND_NAMES.find(([re]) => re.test(m));
    if (hit) return hit[1];
    // 去掉結尾的公司型態字樣（Co., Ltd.／Corporation／Inc.／GmbH…）
    let out = m;
    const SUFFIX = /[\s,]*(co\.?,?\s*ltd\.?|ltd\.?|limited|corporation|corp\.?|inc\.?|gmbh|ag|s\.?a\.?|imaging|company|camera)$/i;
    for (let i = 0; i < 4 && SUFFIX.test(out); i++) out = out.replace(SUFFIX, '');
    return out.replace(/[,.\s]+$/, '').trim() || m;
  }

  /* ---------- 數值格式化 ---------- */

  function trimNum(n, digits) {
    return String(Number(n.toFixed(digits)));
  }

  function formatExposure(t) {
    if (typeof t !== 'number' || !isFinite(t) || t <= 0) return '';
    if (t >= 1) return trimNum(t, 1);
    const denom = Math.round(1 / t);
    if (Math.abs(1 / denom - t) / t > 0.03) return '1/' + trimNum(1 / t, 1);
    return '1/' + denom;
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  // EXIF 時間沒有時區，exifr 會當成本地時間建立 Date，直接取各欄位即為相機上的當地時間
  function splitDate(d) {
    if (typeof d === 'string') {
      const m = d.match(/(\d{4})[:\-/](\d{2})[:\-/](\d{2})(?:[ T](\d{2}):(\d{2}))?/);
      if (!m) return null;
      return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] != null ? +m[4] : null, mi: m[5] != null ? +m[5] : null };
    }
    if (d instanceof Date && !isNaN(d)) {
      return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() };
    }
    return null;
  }

  /* ---------- Nikon MakerNote：鏡頭規格 (tag 0x0084) ---------- */
  function nikonLensFromMakerNote(buf) {
    try {
      if (!buf) return '';
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      if (String.fromCharCode(...u8.subarray(0, 5)) !== 'Nikon') return '';
      const base = 10;
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const le = u8[base] === 0x49;
      const ifd = dv.getUint32(base + 4, le);
      const count = dv.getUint16(base + ifd, le);
      for (let i = 0; i < count; i++) {
        const e = base + ifd + 2 + i * 12;
        if (dv.getUint16(e, le) !== 0x0084) continue;
        const off = base + dv.getUint32(e + 8, le);
        const r = (k) => {
          const den = dv.getUint32(off + k * 8 + 4, le);
          return den ? dv.getUint32(off + k * 8, le) / den : 0;
        };
        const [fMin, fMax, aMin, aMax] = [r(0), r(1), r(2), r(3)];
        if (!fMin) return '';
        const focal = fMin === fMax ? trimNum(fMin, 1) : `${trimNum(fMin, 1)}-${trimNum(fMax, 1)}`;
        const ap = aMin === aMax ? trimNum(aMin, 1) : `${trimNum(aMin, 1)}-${trimNum(aMax, 1)}`;
        return `${focal}mm f/${ap}`;
      }
    } catch (err) { /* 格式不符就放棄 */ }
    return '';
  }

  async function readExif(file) {
    let raw = {};
    try {
      raw = (await exifr.parse(file, {
        tiff: true, exif: true, gps: true, ifd1: false,
        xmp: true, iptc: false, icc: false, makerNote: true,
      })) || {};
    } catch (err) {
      console.warn('EXIF read failed', err);
    }
    let lens = raw.LensModel || raw.Lens || '';
    if (!lens && /nikon/i.test(raw.Make || '')) {
      lens = nikonLensFromMakerNote(raw.makerNote || raw.MakerNote);
    }
    const iso = raw.ISO ?? raw.ISOSpeedRatings ?? raw.PhotographicSensitivity;
    const model = (raw.Model || '').trim();
    // 手機鏡頭名稱常以機型開頭（iPhone 17 Pro Max back camera …），去掉重複的部分
    if (model && lens && String(lens).startsWith(model)) lens = String(lens).slice(model.length).trim() || lens;
    // 手機等小感光元件：改用等效 35mm 焦距（6.8mm → 24mm）
    let focal = raw.FocalLength;
    const eq = raw.FocalLengthIn35mmFormat ?? raw.FocalLengthIn35mmFilm;
    if (typeof focal === 'number' && focal < 15 && typeof eq === 'number' && eq > focal * 1.5) focal = eq;

    // 沒有拍攝時間時，退而使用檔案修改時間
    let when = splitDate(raw.DateTimeOriginal || raw.CreateDate || raw.ModifyDate);
    const dateFromFile = !when;
    if (!when && file.lastModified) when = splitDate(new Date(file.lastModified));

    const lat = typeof raw.latitude === 'number' && isFinite(raw.latitude) ? raw.latitude : null;
    const lon = typeof raw.longitude === 'number' && isFinite(raw.longitude) ? raw.longitude : null;

    return {
      make: raw.Make || '',
      model,
      lens: String(lens).trim().replace(/(\d+)\.0(?!\d)/g, '$1'),
      focal: typeof focal === 'number' ? trimNum(focal, 1) : '',
      iso: iso != null ? String(Array.isArray(iso) ? iso[0] : iso) : '',
      fnum: typeof raw.FNumber === 'number' ? raw.FNumber.toFixed(1) : '',
      exposure: formatExposure(raw.ExposureTime),
      date: when ? `${when.y}/${pad2(when.mo)}/${pad2(when.d)}` : '',
      time: when && when.h != null ? `${pad2(when.h)}:${pad2(when.mi)}` : '',
      lat, lon, dateFromFile,
      software: String(raw.Software || '').trim(),
      location: '',
      weather: '',
      temp: '',
    };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  window.Frame = { brandName, formatExposure, readExif, loadImage };
})();
