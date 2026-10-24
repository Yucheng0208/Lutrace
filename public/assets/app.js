/* 光痕 — 主程式（介面沿用 Lumark：左側清單、中間預覽／裁切、右側分頁設定） */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const t = I18n.t;
  const PREVIEW_MAX = 1600; // 預覽最長邊（像素）
  const THUMB_MAX = 340;    // 模板縮圖最長邊

  /* ---------- 設定（記在瀏覽器） ---------- */

  const SETTINGS_KEY = 'guanghen.settings';
  const DEFAULTS = {
    tpl: 'ipod',
    skins: {},            // 每個模板各自記住配色（10 種）
    modes: {},            // 每個模板各自記住版型
    accent: 'auto',       // auto：從照片取主色
    stamp: true,          // 橘色日期印記
    artist: '',
    album: '',
    show: { quote: true, date: true, time: true, weather: true, temp: true, location: true, camera: true },
    dateFormat: 'slash',  // slash：2026/10/24；dot：2026.10.24；short：10月24日
    timeFormat: '24',
    tempUnit: 'C',
    locFormat: 'city-district',
    autoGeo: true,
    maxLong: 4096,
    outFormat: 'jpg',
    quality: 93,
    video: { format: 'mp4', mute: false, fps: 12 },
    anim: { preview: true, seconds: 10, songLen: '3:24', start: 35 }, // 動態播放器
    animOut: 'mp4',       // 照片套用動態模板時：still 圖片、gif、mp4
    quoteStyle: 'auto',   // auto：音樂模板用歌詞風；quote；lyric
    textStyle: { font: 'round', weight: 700, color: 'auto', panel: 'liquid' }, // 鎖定畫面、天氣卡
  };
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        ...DEFAULTS, ...s, show: { ...DEFAULTS.show, ...(s.show || {}) }, video: { ...DEFAULTS.video, ...(s.video || {}) }, skins: { ...(s.skins || {}) },
        modes: { ...(s.modes || {}) }, anim: { ...DEFAULTS.anim, ...(s.anim || {}) }, textStyle: { ...DEFAULTS.textStyle, ...(s.textStyle || {}) },
      };
    } catch (e) { return structuredClone(DEFAULTS); }
  }
  const settings = loadSettings();
  if (!Templates.LIST.some((x) => x.id === settings.tpl)) settings.tpl = DEFAULTS.tpl;
  // 舊版的款式代碼已改為共用配色，無效的就拿掉
  Object.keys(settings.skins).forEach((k) => { if (!Templates.PALETTE.some((p) => p.id === settings.skins[k])) delete settings.skins[k]; });
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 無痕模式 */ }
  }

  const state = { photos: [], activeId: null, mode: 'preview', filter: 'all', bgm: null };
  let nextId = 1;
  const active = () => state.photos.find((p) => p.id === state.activeId) || null;
  const tplNow = () => Templates.byId(settings.tpl);
  /** 模板目前的「配色|版型」 */
  const skinFor = (tp) => `${settings.skins[tp.id] || tp.pal}|${settings.modes[tp.id] || (tp.modes[0] || {}).id || ''}`;
  const skinNow = () => skinFor(tplNow());

  /* ---------- 介面主題 / 語言 ---------- */

  function applyUiTheme(value) {
    if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('guanghen.uiTheme', value); } catch (e) { /* ignore */ }
    $('ui-theme').value = value;
    document.querySelectorAll('[data-ui-theme]').forEach((b) => b.classList.toggle('active', b.dataset.uiTheme === value));
  }
  function initUiControls() {
    let uiTheme = 'auto';
    try { uiTheme = localStorage.getItem('guanghen.uiTheme') || 'auto'; } catch (e) { /* ignore */ }
    applyUiTheme(uiTheme);
    $('ui-theme').addEventListener('change', (e) => applyUiTheme(e.target.value));
    document.querySelectorAll('[data-ui-theme]').forEach((b) => b.addEventListener('click', () => applyUiTheme(b.dataset.uiTheme)));
    const opts = I18n.SUPPORTED.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
    ['ui-lang', 'ui-lang-m'].forEach((id) => {
      $(id).innerHTML = opts;
      $(id).value = I18n.lang;
      $(id).addEventListener('change', (e) => { I18n.setLang(e.target.value); $('ui-lang').value = $('ui-lang-m').value = e.target.value; });
    });
  }

  /* ---------- 加入檔案（沿用 Lumark 的解碼流程：HEIC、RAW、SVG、GIF、影片） ---------- */

  async function addFiles(files, opts = {}) {
    const list = [...files].filter((f) => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|gif|tiff?|bmp|avif)$/i.test(f.name)
      || Media.kindOf(f) !== 'photo' || Decode.formatOf(f) !== 'std');
    if (!list.length) return;
    setBusy(t('st.reading', { n: list.length }));
    for (const file of list) {
      let url = URL.createObjectURL(file);
      try {
        const kind = Media.kindOf(file);
        let img, exif, W, H, poster = url, exportScale = 1, needFullRaw = false;
        if (kind === 'video') {
          exif = await Media.readVideoMeta(file);
          try {
            img = await Media.loadVideo(url);
          } catch (err) {
            const label = t('st.transcoding', { name: file.name });
            setBusy(label);
            const pr = await Media.transcodePreview(file, progressHandler(label));
            $('progress').hidden = true;
            URL.revokeObjectURL(url);
            url = pr.url;
            img = await Media.loadVideo(url);
            if (pr.origW) exportScale = pr.origW / img.videoWidth;
          }
          img.loop = true; img.muted = true;
          W = img.videoWidth; H = img.videoHeight;
        } else if (kind === 'photo' && Decode.formatOf(file) === 'raw') {
          setBusy(t('st.decodingRaw', { name: file.name }));
          const [prev, ex] = await Promise.all([Decode.rawPreview(file).catch(() => null), Frame.readExif(file)]);
          if (prev) {
            const prevExif = await Frame.readExif(new File([prev.blob], 'preview.jpg', { type: 'image/jpeg', lastModified: file.lastModified }));
            exif = Decode.mergeExif(ex, prevExif);
            URL.revokeObjectURL(url);
            url = prev.url; poster = url;
            img = await Frame.loadImage(url);
            needFullRaw = true;
          } else {
            const dec = await Decode.decodeRaw(file);
            URL.revokeObjectURL(url);
            url = dec.url; poster = url;
            exif = Decode.fillFromLibRaw(ex, dec.meta);
            img = await Frame.loadImage(url);
          }
          W = img.naturalWidth; H = img.naturalHeight;
        } else if (kind === 'photo' && Decode.formatOf(file) !== 'std') {
          const fmt = Decode.formatOf(file);
          if (fmt !== 'svg') setBusy(t(fmt === 'raw' ? 'st.decodingRaw' : 'st.decodingHeic', { name: file.name }));
          const [dec, ex] = await Promise.all([
            fmt === 'svg' ? Decode.decodeSvg(file) : Decode.decodeHeic(file),
            Frame.readExif(file),
          ]);
          URL.revokeObjectURL(url);
          url = dec.url; poster = url;
          exif = Decode.fillFromLibRaw(ex, dec.meta);
          img = await Frame.loadImage(url);
          W = img.naturalWidth; H = img.naturalHeight;
        } else {
          [img, exif] = await Promise.all([Frame.loadImage(url), kind === 'gif' ? Media.readVideoMeta(file) : Frame.readExif(file)]);
          W = img.naturalWidth; H = img.naturalHeight;
        }
        const still = Media.snapshot(img, W, H, 720);
        if (kind !== 'photo') poster = await new Promise((r) => still.toBlob((b) => r(URL.createObjectURL(b)), 'image/jpeg', 0.9));
        const analysis = Quotes.analyze(still);
        const photo = {
          id: nextId++, kind, file, name: file.name, url, img, poster, W, H, exportScale,
          exif, crop: null, ratioKey: 'tpl',
          thumb: makeThumb(still), still, analysis,
          mood: 'daily', quote: '', quoteAuto: true,
          cameraText: null, shotText: null,
          addr: null, locAuto: true, weatherAuto: true, placeStatus: '',
        };
        if (opts.sample) Object.assign(photo.exif, opts.sample);
        if (opts.music) { photo.quote = opts.music.title || ''; photo.quoteAuto = !photo.quote; }
        if (opts.sample) { photo.locAuto = false; photo.weatherAuto = false; }
        refreshMood(photo, true);
        state.photos.push(photo);
        const first = !state.activeId;
        if (first) state.activeId = photo.id;
        renderList();
        if (first) selectPhoto(photo.id);
        if (!opts.sample && !opts.music) autoPlace(photo);
        if (needFullRaw) photo.fullPromise = upgradeRaw(photo);
      } catch (err) {
        URL.revokeObjectURL(url);
        console.error(err);
        setStatus(t('st.readFail', { name: file.name }));
      }
    }
    setBusy('');
    $('progress').hidden = true;
    selectPhoto(state.activeId);
  }

  let busyMsg = '', pendingRaw = 0;
  function setBusy(msg) { busyMsg = msg || ''; syncBusy(); }
  function syncBusy() {
    const text = busyMsg || (pendingRaw ? t('st.rawUpgrading') : '');
    $('stage-busy').hidden = !text;
    $('stage-busy-text').textContent = text;
  }

  async function upgradeRaw(p) {
    pendingRaw++; syncBusy();
    try {
      const dec = await Decode.decodeRaw(p.file);
      p.exif = Decode.fillFromLibRaw(p.exif, dec.meta);
      if (dec.method !== 'libraw' || !state.photos.includes(p)) { URL.revokeObjectURL(dec.url); return; }
      const img = await Frame.loadImage(dec.url);
      const nW = img.naturalWidth, nH = img.naturalHeight;
      if (p.crop) {
        const s = nW / p.W;
        p.crop = Math.abs(nW / nH - p.W / p.H) < 0.02 ? { x: p.crop.x * s, y: p.crop.y * s, w: p.crop.w * s, h: p.crop.h * s } : null;
      }
      URL.revokeObjectURL(p.url);
      Object.assign(p, { url: dec.url, poster: dec.url, img, W: nW, H: nH });
      if (p === active()) { if (state.mode === 'crop') openCrop(); else renderPreview(); }
    } catch (e) {
      console.warn('full RAW decode failed; keeping the embedded preview', e);
    } finally { pendingRaw--; syncBusy(); }
  }

  function makeThumb(src) {
    const c = document.createElement('canvas');
    const s = 128 / Math.min(src.width, src.height);
    c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  }

  function removePhoto(id) {
    const i = state.photos.findIndex((p) => p.id === id);
    if (i < 0) return;
    releaseItem(state.photos[i]);
    state.photos.splice(i, 1);
    if (state.activeId === id) state.activeId = state.photos[Math.min(i, state.photos.length - 1)]?.id ?? null;
    renderList();
    selectPhoto(state.activeId);
  }
  function releaseItem(p) {
    if (p.kind === 'video') p.img.pause();
    URL.revokeObjectURL(p.url);
    if (p.poster !== p.url) URL.revokeObjectURL(p.poster);
  }

  function selectPhoto(id) {
    state.activeId = id;
    const p = active();
    $('dropzone').hidden = !!p;
    $('stage').hidden = !p;
    renderList();
    fillForm(p);
    syncVideoUi();
    busy(false);
    if (!p) { stopPlayback(); scheduleThumbs(); return; }
    if (state.mode === 'crop') openCrop(); else renderPreview();
    scheduleThumbs();
  }

  function renderList() {
    $('count').textContent = state.photos.length;
    $('photo-list').innerHTML = state.photos.map((p) => `
      <li class="photo-item${p.id === state.activeId ? ' active' : ''}" data-id="${p.id}">
        <img src="${p.thumb}" alt="">
        <div style="min-width:0"><div class="name">${escapeHtml(p.name)}</div><div class="meta">${escapeHtml([p.exif.date, p.exif.location].filter(Boolean).join(' · '))}</div></div>
        <button class="remove" type="button" data-remove="${p.id}" aria-label="${t('list.remove')}">×</button>
      </li>`).join('');
  }

  /* ---------- 語錄 ---------- */

  function hourOf(p) { const h = parseInt(String(p.exif.time || '').split(':')[0], 10); return isNaN(h) ? null : h; }
  function quoteStyle() {
    if (settings.quoteStyle !== 'auto') return settings.quoteStyle;
    return tplNow().tag === 'music' ? 'lyric' : 'quote';
  }
  function refreshMood(p, pickNew) {
    const mood = Quotes.moodOf(p.analysis, { weatherKey: weatherKeyOf(p.exif.weather), hour: hourOf(p) });
    const style = quoteStyle();
    const changed = mood !== p.mood || style !== p.quoteStyle;
    p.mood = mood;
    p.quoteStyle = style;
    if (p.quoteAuto && (pickNew || changed || !p.quote)) p.quote = Quotes.pick(mood, I18n.lang, p.quote, style);
  }
  /** 換模板或語錄風格後，自動產生的語錄跟著換成對應風格 */
  function refreshQuoteStyles() {
    state.photos.forEach((p) => refreshMood(p));
    const p = active();
    if (p) { $('f-quote').value = p.quote; syncMoodTag(p); }
  }
  function syncMoodTag(p) {
    $('mood-tag').textContent = p ? t('q.mood', { m: Quotes.label(p.mood, I18n.lang) }) : '';
  }

  /* ---------- 天氣 / 日期格式 ---------- */

  const W_KEYS = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'thunder'];
  function weatherKeyOf(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (W_KEYS.includes(s)) return s;
    const hit = W_KEYS.find((k) => t('w.' + k) === s);
    if (hit) return hit;
    if (/雷|thunder|storm/i.test(s)) return 'thunder';
    if (/雪|snow/i.test(s)) return 'snow';
    if (/毛毛|drizzle/i.test(s)) return 'drizzle';
    if (/雨|rain|shower/i.test(s)) return 'rain';
    if (/霧|fog|mist|haze/i.test(s)) return 'fog';
    if (/多雲|partly|晴時/i.test(s)) return 'partly';
    if (/雲|曇|陰|cloud|overcast/i.test(s)) return 'cloudy';
    if (/晴|sun|clear|☀/i.test(s)) return 'clear';
    return 'cloudy';
  }
  function weatherLabel(v) { return W_KEYS.includes(v) ? t('w.' + v) : String(v || ''); }
  function fillWeatherList() {
    $('weather-list').innerHTML = W_KEYS.map((k) => `<option value="${t('w.' + k)}"></option>`).join('');
  }

  function dateParts(p) {
    const m = String(p.exif.date || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
    const tm = String(p.exif.time || '').match(/(\d{1,2}):(\d{2})/);
    return {
      y: m ? +m[1] : null, mo: m ? +m[2] : null, day: m ? +m[3] : null,
      h: tm ? +tm[1] : null, mi: tm ? +tm[2] : null,
    };
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function fmtDate(dp, format = settings.dateFormat) {
    if (dp.y == null) return '';
    if (format === 'dot') return `${dp.y}.${pad2(dp.mo)}.${pad2(dp.day)}`;
    if (format === 'dash') return `${dp.y}-${pad2(dp.mo)}-${pad2(dp.day)}`;
    if (format === 'short') return I18n.lang === 'en' ? `${MONTHS[dp.mo - 1][0]}${MONTHS[dp.mo - 1].slice(1).toLowerCase()} ${dp.day}` : `${dp.mo}月${dp.day}日`; // 中文、日文相同
    return `${dp.y}/${pad2(dp.mo)}/${pad2(dp.day)}`;
  }
  function fmtTime(dp, format = settings.timeFormat) {
    if (dp.h == null) return '';
    if (format === '12') {
      const h12 = dp.h % 12 || 12;
      if (I18n.lang === 'en') return `${h12}:${pad2(dp.mi)} ${dp.h < 12 ? 'AM' : 'PM'}`;
      if (I18n.lang === 'ja') return `${dp.h < 12 ? '午前' : '午後'} ${h12}:${pad2(dp.mi)}`;
      return `${dp.h < 12 ? '上午' : '下午'} ${h12}:${pad2(dp.mi)}`;
    }
    return `${pad2(dp.h)}:${pad2(dp.mi)}`;
  }
  function fmtLong(dp) {
    if (dp.y == null) return '';
    const d = new Date(dp.y, dp.mo - 1, dp.day);
    try {
      if (I18n.lang === 'en') return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      return `${dp.mo}月${dp.day}日 ${d.toLocaleDateString(I18n.lang === 'ja' ? 'ja-JP' : 'zh-TW', { weekday: 'long' })}`;
    } catch (e) { return fmtDate(dp); }
  }
  function fmtTemp(c) {
    if (c === '' || c == null || isNaN(parseFloat(c))) return '';
    const v = parseFloat(c);
    return settings.tempUnit === 'F' ? `${Math.round(v * 9 / 5 + 32)}°F` : `${Math.round(v)}°C`;
  }
  function accentOf(p) {
    if (settings.accent !== 'auto') return settings.accent;
    return (p && p.analysis && p.analysis.accent) || '#ff5c8a';
  }

  /** 歌曲進度：t 為動畫開始後的秒數 */
  function parseLen(v) {
    const m = String(v || '').match(/^\s*(\d+)\s*[:：]\s*(\d{1,2})\s*$/);
    if (m) return Math.max(10, +m[1] * 60 + +m[2]);
    const n = parseFloat(v);
    return isFinite(n) && n > 0 ? Math.max(10, n) : 204;
  }
  const mmss = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`;
  function animAt(t) {
    const total = parseLen(settings.anim.songLen);
    const cur = Math.min(total, total * settings.anim.start / 100 + (t || 0));
    return { t: t || 0, progress: cur / total, elapsed: mmss(cur), remain: '-' + mmss(total - cur), total: mmss(total), playing: true };
  }

  /** 模板需要的文字資料 */
  function dataFor(p, t = 0) {
    const s = settings.show;
    const dp = dateParts(p);
    const wKey = weatherKeyOf(p.exif.weather);
    return {
      lang: I18n.lang,
      quote: s.quote ? (p.quote || '').trim() : '',
      artist: settings.artist.trim(),
      album: settings.album.trim(),
      y: dp.y, mo: dp.mo, day: dp.day, h: dp.h, mi: dp.mi,
      date: s.date ? fmtDate(dp) : '',
      dateDot: s.date && dp.y != null ? `${dp.y}.${pad2(dp.mo)}.${pad2(dp.day)}` : '',
      dateLong: s.date ? fmtLong(dp) : '',
      monthYear: s.date && dp.y != null ? `${MONTHS[dp.mo - 1]} ${dp.y}` : '',
      stampText: s.date && dp.y != null ? `'${String(dp.y).slice(2)} ${pad2(dp.mo)} ${pad2(dp.day)}` : '',
      time: s.time ? fmtTime(dp) : '',
      weather: s.weather ? weatherLabel(p.exif.weather) : '',
      weatherKey: wKey,
      temp: s.temp ? fmtTemp(p.exif.temp) : '',
      location: s.location ? (p.exif.location || '').trim() : '',
      camera: '', // 不顯示相機與拍攝參數
      shot: '',
      accent: accentOf(p),
      pal: p.analysis,
      still: p.still,
      stamp: settings.stamp,
      anim: animAt(t),
      style: settings.textStyle,
    };
  }
  function textOf(d) { return [d.quote, d.artist, d.album, d.date, d.dateLong, d.time, d.weather, d.temp, d.location, d.camera, d.shot, '正在播放現在訊息播放來源我的回憶未知的歌手今天的主打歌'].join(''); }

  /* ---------- 預覽 ---------- */

  function cropOf(p) { return p.crop || { x: 0, y: 0, w: p.W, h: p.H }; }

  function naturalK(p, tpl, skin) {
    const crop = Templates.fitCrop(cropOf(p), Templates.aspectFor(tpl, cropOf(p)));
    const L0 = tpl.layout(Templates.aspectFor(tpl, cropOf(p)), Templates.skinOf(tpl, skin));
    let k = Math.max(1.08, Math.min(crop.w, crop.h) / 1000);
    if (Math.max(L0.W, L0.H) * k > settings.maxLong) k = settings.maxLong / Math.max(L0.W, L0.H);
    return { k, L0 };
  }

  let renderToken = 0;
  let view = null; // 目前預覽的狀態：{ p, tpl, skin, k, info, ov, lastOv }
  const animOn = () => tplNow().anim && settings.anim.preview;

  async function renderPreview() {
    const p = active();
    if (!p || state.mode !== 'preview') { stopPlayback(); return; }
    const token = ++renderToken;
    const d = dataFor(p);
    await Templates.ensureFonts(textOf(d), settings.textStyle.weight);
    if (token !== renderToken) return;
    const tpl = tplNow(), skin = skinNow();
    const { k: nk, L0 } = naturalK(p, tpl, skin);
    const k = Math.min(nk, PREVIEW_MAX / Math.max(L0.W, L0.H));
    view = { p, tpl, skin, k, ov: null, info: null, lastOv: 0, t0: performance.now(), lastDraw: 0 };
    if (p.kind === 'photo') drawPhotoFrame(0);
    else { buildOverlay(p.img.currentTime || 0); drawVideoFrame(); }
    if (p.kind !== 'photo' || animOn()) startPlayback(p); else stopPlayback();
    const out = exportSize(p);
    $('dims').textContent = t('dims.output', { w: out.W, h: out.H });
  }

  function drawPhotoFrame(t) {
    const v = view;
    Templates.render($('preview'), { tpl: v.tpl.id, skin: v.skin, src: v.p.img, crop: cropOf(v.p), d: dataFor(v.p, t), k: v.k });
  }
  function buildOverlay(t) {
    const v = view;
    if (!v.ov) v.ov = document.createElement('canvas');
    v.info = Templates.render(v.ov, { tpl: v.tpl.id, skin: v.skin, overlay: true, crop: cropOf(v.p), d: dataFor(v.p, t), k: v.k });
    const c = $('preview');
    if (c.width !== v.info.W || c.height !== v.info.H) { c.width = v.info.W; c.height = v.info.H; }
  }
  function drawVideoFrame() {
    const v = view;
    if (!v || !v.info) return;
    const ctx = $('preview').getContext('2d');
    const { info, p } = v;
    ctx.clearRect(0, 0, info.W, info.H);
    const s = info.slotPx, cr = info.crop;
    try { ctx.drawImage(p.img, cr.x, cr.y, cr.w, cr.h, s.x, s.y, s.w, s.h); } catch (e) { /* 影格尚未就緒 */ }
    ctx.drawImage(v.ov, 0, 0);
  }

  let playing = null, rafId = 0;
  function startPlayback(p) {
    if (playing !== p) {
      stopPlayback();
      playing = p;
      if (p.kind === 'video' && !p.userPaused) p.img.play().catch(() => {});
    }
    syncPlayButton();
    if (!rafId) {
      const tick = (now) => {
        rafId = 0;
        const v = view;
        if (!playing || playing !== active() || state.mode !== 'preview' || !v || v.p !== playing) return;
        if (playing.kind === 'photo') {
          // 照片＋動態模板：每秒約 20 格
          if (now - v.lastDraw > 48) { v.lastDraw = now; drawPhotoFrame(((now - v.t0) / 1000) % settings.anim.seconds); }
        } else {
          if (v.tpl.anim && animOn() && now - v.lastOv > 90) { v.lastOv = now; buildOverlay(playing.img.currentTime || 0); }
          drawVideoFrame();
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
  }
  function stopPlayback() {
    if (playing && playing.kind === 'video') playing.img.pause();
    playing = null;
    cancelAnimationFrame(rafId); rafId = 0;
    syncPlayButton();
  }
  function syncPlayButton() {
    const p = active();
    const btn = $('play-toggle');
    btn.hidden = !p || p.kind !== 'video' || state.mode !== 'preview';
    if (p && p.kind === 'video') btn.textContent = p.img.paused ? '▶' : '❚❚';
  }

  /* ---------- 模板縮圖 ---------- */

  const TPL_JA = {
    ipod: 'MP3 プレーヤー', player: '再生中', vinyl: 'レコード', cd: 'CD ジャケット', instax: 'インスタント', film: '35mm フィルム',
    ccd: 'CCD カメラ', y2k: 'Y2K ウィンドウ', magazine: '雑誌の表紙', ticket: 'ライブチケット', lockscreen: 'ロック画面', scrapbook: 'スクラップブック',
    miniplayer: '写真＋プレーヤー', cassette: 'カセット', playlist: 'プレイリスト', lyrics: '歌詞カード', widget: '音楽ウィジェット', boarding: '搭乗券',
    receipt: 'レシート', stamp: '切手', postcard: 'ポストカード', newspaper: '新聞の一面', chat: 'チャット', gameboy: '携帯ゲーム機',
    tv: 'レトロテレビ', slide: 'スライド', gallery: '美術館', sticker: 'ステッカー', post: 'SNS 投稿', weathercard: '天気カード',
  };
  function tplName(tp) { return I18n.lang === 'zh-Hant' ? tp.zh : I18n.lang === 'ja' ? (TPL_JA[tp.id] || tp.en) : tp.en; }
  /** 配色與版型的名稱（中／英／日） */
  function nameOf(x) { return I18n.lang === 'zh-Hant' ? x.zh : I18n.lang === 'ja' ? (x.ja || x.en) : x.en; }

  function buildGallery() {
    $('tpl-grid').innerHTML = Templates.LIST.map((tp) => `
      <button class="tpl-card" type="button" data-tpl="${tp.id}" data-tag="${tp.tag}" aria-pressed="false">
        <span class="tpl-thumb"><canvas width="10" height="10"></canvas></span>
        <span class="tpl-name">${tp.anim ? '<i class="tpl-anim" aria-hidden="true">▶</i>' : ''}${escapeHtml(tplName(tp))}</span>
      </button>`).join('');
    $('tpl-count').textContent = t('tpl.count', { n: Templates.LIST.length });
    syncGallery();
  }
  function syncGallery() {
    document.querySelectorAll('.tpl-card').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tpl === settings.tpl));
      b.hidden = state.filter !== 'all' && b.dataset.tag !== state.filter;
    });
    document.querySelectorAll('#tpl-filter .chip').forEach((c) => c.classList.toggle('active', c.dataset.filter === state.filter));
  }

  let thumbTimer = 0, thumbToken = 0;
  function scheduleThumbs() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(renderThumbs, 220);
  }
  async function renderThumbs() {
    const token = ++thumbToken;
    const p = active() || samplePhoto();
    if (!p) return;
    const d = dataFor(p);
    await Templates.ensureFonts(textOf(d), settings.textStyle.weight);
    for (const tp of Templates.LIST) {
      if (token !== thumbToken) return;
      const card = document.querySelector(`.tpl-card[data-tpl="${tp.id}"] canvas`);
      if (!card) continue;
      const skin = skinFor(tp);
      const L0 = tp.layout(Templates.aspectFor(tp, cropOf(p)), Templates.skinOf(tp, skin));
      const k = THUMB_MAX / Math.max(L0.W, L0.H);
      const tmp = document.createElement('canvas');
      Templates.render(tmp, { tpl: tp.id, skin, src: p.kind === 'photo' ? p.img : p.still, crop: p.kind === 'photo' ? cropOf(p) : scaleCrop(cropOf(p), p.still.width / p.W), d, k });
      card.width = tmp.width; card.height = tmp.height;
      card.getContext('2d').drawImage(tmp, 0, 0);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  function scaleCrop(c, s) { return { x: c.x * s, y: c.y * s, w: c.w * s, h: c.h * s }; }

  // 沒有照片時，用範例圖畫縮圖
  let sampleCache = null;
  function samplePhoto() {
    if (sampleCache) return sampleCache;
    const img = makeSampleCanvas(900, 900);
    const now = new Date();
    sampleCache = {
      kind: 'photo', img, still: img, W: img.width, H: img.height, crop: null,
      exif: { date: `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}`, time: '17:42', weather: 'clear', temp: '27', location: I18n.lang === 'en' ? 'Tamsui, Taipei' : '新北市 淡水', make: 'FUJIFILM', model: 'X100VI', focal: '23', fnum: '2.0', exposure: '1/250', iso: '200' },
      quote: Quotes.pick('sunset', I18n.lang, '', 'quote'), analysis: Quotes.analyze(img), cameraText: null, shotText: null,
    };
    return sampleCache;
  }

  /** 程式畫出的範例照片：海邊夕陽 */
  function makeSampleCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#3b2a7a'); sky.addColorStop(0.45, '#ff6f91'); sky.addColorStop(1, '#ffc46b');
    x.fillStyle = sky; x.fillRect(0, 0, w, h * 0.62);
    const sun = x.createRadialGradient(w * 0.62, h * 0.56, 0, w * 0.62, h * 0.56, w * 0.2);
    sun.addColorStop(0, 'rgba(255,245,200,1)'); sun.addColorStop(0.45, 'rgba(255,214,120,.9)'); sun.addColorStop(1, 'rgba(255,180,90,0)');
    x.fillStyle = sun; x.fillRect(0, 0, w, h);
    const sea = x.createLinearGradient(0, h * 0.62, 0, h);
    sea.addColorStop(0, '#ff9a76'); sea.addColorStop(0.3, '#7c4d8f'); sea.addColorStop(1, '#241a45');
    x.fillStyle = sea; x.fillRect(0, h * 0.62, w, h * 0.38);
    x.fillStyle = 'rgba(255,230,170,.55)';
    for (let i = 0; i < 26; i++) { const yy = h * 0.64 + i * h * 0.012; const ww = w * (0.18 - i * 0.005); x.fillRect(w * 0.62 - ww / 2, yy, ww, 2 + i * 0.12); }
    x.fillStyle = '#1a1230';
    x.beginPath(); x.moveTo(0, h * 0.62);
    for (let i = 0; i <= 10; i++) x.lineTo(i * w * 0.045, h * 0.62 - [30, 60, 45, 90, 70, 110, 80, 50, 65, 35, 20][i] * h / 900);
    x.lineTo(w * 0.45, h * 0.62); x.closePath(); x.fill();
    // 椰子樹
    x.strokeStyle = '#1a1230'; x.lineWidth = w * 0.014; x.lineCap = 'round';
    x.beginPath(); x.moveTo(w * 0.16, h); x.quadraticCurveTo(w * 0.2, h * 0.7, w * 0.27, h * 0.42); x.stroke();
    x.lineWidth = w * 0.008;
    for (const [dx, dy] of [[-0.12, 0.04], [-0.1, -0.05], [0.0, -0.09], [0.1, -0.04], [0.12, 0.05], [0.04, 0.08]]) {
      x.beginPath(); x.moveTo(w * 0.27, h * 0.42); x.quadraticCurveTo(w * (0.27 + dx * 0.5), h * (0.42 + dy - 0.05), w * (0.27 + dx), h * (0.42 + dy + 0.04)); x.stroke();
    }
    return c;
  }

  /* ---------- 表單 ---------- */

  function fillForm(p) {
    const has = !!p;
    $('f-quote').value = has ? p.quote : '';
    syncMoodTag(p);
    $('f-artist').value = settings.artist;
    $('f-album').value = settings.album;
    const dp = has ? dateParts(p) : {};
    $('f-date').value = dp.y != null ? `${dp.y}-${pad2(dp.mo)}-${pad2(dp.day)}` : '';
    $('f-time').value = dp.h != null ? `${pad2(dp.h)}:${pad2(dp.mi)}` : '';
    $('f-location').value = has ? (p.exif.location || '') : '';
    $('f-weather').value = has ? weatherLabel(p.exif.weather) : '';
    $('f-temp').value = has ? (p.exif.temp ?? '') : '';
    ['f-quote', 'quote-gen', 'f-date', 'f-time', 'f-location', 'f-weather', 'f-temp', 'btn-detect', 'btn-my-location']
      .forEach((id) => { $(id).disabled = !has; });
    syncPlaceMode();
    updatePlaceStatus();
  }

  /** 日期格式按鈕上的範例用今天的日期 */
  function syncFormatExamples() {
    const now = new Date();
    const dp = { y: now.getFullYear(), mo: now.getMonth() + 1, day: now.getDate() };
    document.querySelectorAll('[data-date-format]').forEach((b) => { b.textContent = fmtDate(dp, b.dataset.dateFormat); });
  }

  function syncSettingsUi() {
    syncFormatExamples();
    document.querySelectorAll('[data-show]').forEach((el) => { el.checked = !!settings.show[el.dataset.show]; });
    document.querySelectorAll('[data-date-format]').forEach((b) => b.classList.toggle('active', b.dataset.dateFormat === settings.dateFormat));
    document.querySelectorAll('[data-time-format]').forEach((b) => b.classList.toggle('active', b.dataset.timeFormat === settings.timeFormat));
    document.querySelectorAll('[data-unit]').forEach((b) => b.classList.toggle('active', b.dataset.unit === settings.tempUnit));
    document.querySelectorAll('[data-max-long]').forEach((b) => b.classList.toggle('active', Number(b.dataset.maxLong) === settings.maxLong));
    document.querySelectorAll('[data-out-format]').forEach((b) => b.classList.toggle('active', b.dataset.outFormat === settings.outFormat));
    document.querySelectorAll('[data-vformat]').forEach((b) => b.classList.toggle('active', b.dataset.vformat === settings.video.format));
    document.querySelectorAll('[data-accent]').forEach((b) => b.classList.toggle('active', b.dataset.accent === settings.accent));
    document.querySelector('.swatch-picker:not(.ts-picker)').classList.toggle('active', settings.accent !== 'auto' && !document.querySelector(`[data-accent="${settings.accent}"]`));
    $('opt-stamp').checked = settings.stamp;
    $('auto-geo').checked = settings.autoGeo;
    $('loc-format').value = settings.locFormat;
    $('quality').value = settings.quality;
    $('quality-val').textContent = settings.quality;
    $('v-mute').checked = settings.video.mute;
    $('v-fps').value = String(settings.video.fps);
    const a = settings.anim, ts = settings.textStyle;
    $('a-preview').checked = a.preview;
    $('a-seconds').value = a.seconds; $('a-seconds-val').textContent = `${a.seconds}s`;
    $('a-songlen').value = a.songLen;
    $('a-start').value = a.start; $('a-start-val').textContent = `${a.start}%`;
    document.querySelectorAll('[data-anim-out]').forEach((b) => b.classList.toggle('active', b.dataset.animOut === settings.animOut));
    document.querySelectorAll('[data-quote-style]').forEach((b) => b.classList.toggle('active', b.dataset.quoteStyle === settings.quoteStyle));
    document.querySelectorAll('[data-ts-font]').forEach((b) => b.classList.toggle('active', b.dataset.tsFont === ts.font));
    document.querySelectorAll('[data-ts-panel]').forEach((b) => b.classList.toggle('active', b.dataset.tsPanel === ts.panel));
    document.querySelectorAll('[data-ts-color]').forEach((b) => b.classList.toggle('active', b.dataset.tsColor === ts.color));
    document.querySelector('.ts-picker').classList.toggle('active', ts.color !== 'auto' && !document.querySelector(`[data-ts-color="${ts.color}"]`));
    $('ts-weight').value = ts.weight; $('ts-weight-val').textContent = ts.weight;
    syncVideoUi();
    syncSkins();
    syncGallery();
  }

  function syncSkins() {
    const tp = tplNow();
    const [pal, mode] = skinNow().split('|');
    const accent = accentOf(active() || samplePhoto());
    $('skin-chips').innerHTML = tp.skins.map((s) => {
      const c = s.chroma ? { paper: Templates.tone(accent, 0.9), deep: accent } : s;
      return `<button class="pal-chip${s.id === pal ? ' active' : ''}" type="button" data-skin="${s.id}" style="--c1:${c.paper};--c2:${c.deep}">
        <i aria-hidden="true"></i><span>${escapeHtml(nameOf(s))}</span></button>`;
    }).join('');
    syncPalPages(true);
    $('mode-field').hidden = !tp.modes.length;
    $('mode-chips').innerHTML = tp.modes.map((m) => `<button class="chip${m.id === mode ? ' active' : ''}" type="button" data-mode="${m.id}">${escapeHtml(nameOf(m))}</button>`).join('');
  }

  /* 配色滑動列：一頁五個，切到目前選的那一頁，並更新頁點與箭頭 */
  const PAL_PER_PAGE = 5;
  function palPages() { return Math.ceil(tplNow().skins.length / PAL_PER_PAGE); }
  function palPage() {
    const g = $('skin-chips');
    return g.clientWidth ? Math.round(g.scrollLeft / g.clientWidth) : 0;
  }
  function syncPalPages(jumpToActive) {
    const g = $('skin-chips');
    const n = palPages();
    if (jumpToActive) {
      const i = [...g.children].findIndex((c) => c.classList.contains('active'));
      if (i >= 0 && g.clientWidth) {
        const prev = g.style.scrollBehavior;
        g.style.scrollBehavior = 'auto';
        g.scrollLeft = Math.floor(i / PAL_PER_PAGE) * g.clientWidth;
        g.style.scrollBehavior = prev;
      }
    }
    const cur = palPage();
    if ($('pal-dots').children.length !== n) $('pal-dots').innerHTML = Array.from({ length: n }, (_, i) => `<span data-page="${i}"></span>`).join('');
    [...$('pal-dots').children].forEach((d, i) => d.classList.toggle('on', i === cur));
  }
  /** 換頁；超過最後一頁回到第一頁，第一頁往前則到最後一頁 */
  let palTarget = null; // 捲動動畫進行中時，連按箭頭以目標頁為準
  function goPalPage(i) {
    const g = $('skin-chips');
    const n = palPages();
    palTarget = ((i % n) + n) % n;
    g.scrollTo({ left: palTarget * g.clientWidth });
  }

  function syncVideoUi() {
    const p = active();
    const isVid = !!p && p.kind !== 'photo';
    const tp = tplNow();
    $('video-group').hidden = !isVid;
    $('anim-group').hidden = !tp.anim;
    $('textstyle-group').hidden = !tp.styleable;
    $('anim-out-group').hidden = !(p && p.kind === 'photo' && tp.anim);
    $('bgm-group').hidden = !(p && tp.anim);
    const gif = settings.video.format === 'gif';
    document.querySelectorAll('.gif-only').forEach((el) => { el.hidden = !gif; });
    document.querySelectorAll('.mov-only').forEach((el) => { el.hidden = gif; });
  }

  /** 修改設定後：存檔、重畫預覽與縮圖 */
  function changed({ thumbs = true } = {}) {
    saveSettings();
    renderPreview();
    if (thumbs) scheduleThumbs();
  }

  /* ---------- 地點與天氣（沿用 Lumark 的偵測流程） ---------- */

  function placeLabel(p) { return p.addr ? Geo.formatPlace(p.addr, settings.locFormat, I18n.lang) : ''; }

  function autoPlace(p) {
    if (p.exif.lat != null) detectPlace(p);
    else if (settings.autoGeo) useMyLocation(p);
    else { p.placeStatus = 'place.noGps'; updatePlaceStatus(); }
  }

  function isoDate(s) {
    const m = String(s || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
  }

  async function detectPlace(p, { weather = true } = {}) {
    if (p.exif.lat == null || p.exif.lon == null) { p.placeStatus = 'place.noGps'; updatePlaceStatus(); return; }
    p.placeStatus = 'place.looking';
    updatePlaceStatus();
    const { lat, lon } = p.exif;
    const jobs = [Geo.reverseGeocode(lat, lon, I18n.geoLang).then((addr) => {
      p.addr = addr;
      if (p.locAuto) p.exif.location = placeLabel(p);
    })];
    if (weather && p.weatherAuto) {
      const d = isoDate(p.exif.date);
      const hour = hourOf(p);
      if (d) {
        jobs.push(Geo.weatherAt(lat, lon, d, hour == null ? 12 : hour).then((w) => {
          if (w && p.weatherAuto) { p.exif.weather = w.key; p.exif.temp = w.temp === '' ? '' : String(w.temp); }
        }));
      }
    }
    const results = await Promise.allSettled(jobs);
    const failed = results.some((r) => r.status === 'rejected');
    p.placeStatus = failed ? 'place.failed' : '';
    if (failed) console.warn(results);
    refreshMood(p);
    updatePlaceStatus();
    renderList();
    if (p === active()) { fillForm(p); renderPreview(); scheduleThumbs(); }
  }

  async function useMyLocation(p) {
    try {
      p.placeStatus = 'place.looking';
      updatePlaceStatus();
      const pos = await Geo.currentPosition();
      p.exif.lat = pos.lat; p.exif.lon = pos.lon;
      p.locAuto = true; p.weatherAuto = true;
      syncPlaceMode();
      await detectPlace(p);
      if (!p.placeStatus) { p.placeStatus = 'place.fromDevice'; updatePlaceStatus(); }
    } catch (e) {
      p.placeStatus = 'place.geoDenied';
      updatePlaceStatus();
    }
  }

  function syncPlaceMode() {
    const p = active();
    const manual = p ? !(p.locAuto && p.weatherAuto) : false;
    document.querySelectorAll('[data-place-mode]').forEach((b) => b.classList.toggle('active', b.dataset.placeMode === (manual ? 'manual' : 'auto')));
  }
  function updatePlaceStatus() {
    const p = active();
    $('place-status').textContent = p && p.placeStatus ? t(p.placeStatus) : '';
  }

  /* ---------- 裁切 ---------- */

  const RATIOS = { free: null, 1: 1, '4/5': 4 / 5, '3/4': 3 / 4, '4/3': 4 / 3, '3/2': 3 / 2, '9/16': 9 / 16, '16/9': 16 / 9 };
  function ratioFor(p) {
    const tp = tplNow();
    if (tp.ratio) return tp.ratio;
    if (p.ratioKey === 'tpl') return null;
    return RATIOS[p.ratioKey] ?? null;
  }

  const editor = new CropEditor({
    area: $('crop-area'), img: $('crop-img'), box: $('crop-box'),
    onChange(crop) {
      const p = active();
      if (!p) return;
      p.crop = (crop.x === 0 && crop.y === 0 && crop.w === p.W && crop.h === p.H) ? null : crop;
    },
  });

  function setMode(mode) {
    state.mode = mode;
    $('mode-preview').classList.toggle('active', mode === 'preview');
    $('mode-crop').classList.toggle('active', mode === 'crop');
    $('preview-wrap').hidden = mode !== 'preview';
    $('crop-wrap').hidden = mode !== 'crop';
    if (mode === 'crop') { stopPlayback(); openCrop(); }
    else { renderPreview(); scheduleThumbs(); }
  }

  function openCrop() {
    const p = active();
    if (!p) return;
    const tp = tplNow();
    const r = ratioFor(p);
    let crop = p.crop;
    // 模板固定比例時，先把目前裁切套成該比例
    if (r) crop = Templates.fitCrop(cropOf(p), r);
    document.querySelectorAll('#ratio-chips .chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.ratio === (tp.ratio ? 'tpl' : p.ratioKey));
      c.disabled = !!tp.ratio && c.dataset.ratio !== 'tpl';
    });
    $('crop-hint').hidden = !tp.ratio;
    if (tp.ratio) $('crop-hint').textContent = t('crop.locked', { name: tplName(tp), r: ratioName(tp.ratio) });
    editor.load(p.poster, p.W, p.H, crop, r);
    editor.commit();
  }
  function ratioName(r) {
    const known = Object.entries(RATIOS).find(([, v]) => v && Math.abs(v - r) < 0.001);
    return known ? known[0].replace('/', ':').replace(/^1$/, '1:1') : r.toFixed(2);
  }

  /* ---------- 輸出 ---------- */

  /** 是否輸出成動畫（GIF / MP4） */
  function isAnimExport(p) {
    if (!tplNow().anim) return false;
    return p.kind === 'photo' ? settings.animOut !== 'still' : true;
  }
  function animFormat(p) { return p.kind === 'photo' ? settings.animOut : settings.video.format; }
  function animK(p, L0, fmt) {
    const maxLong = fmt === 'gif' ? 720 : Math.min(settings.maxLong, 1440);
    const { k } = naturalK(p, tplNow(), skinNow());
    return Math.min(k, maxLong / Math.max(L0.W, L0.H));
  }
  function exportSize(p) {
    const tpl = tplNow(), skin = skinNow();
    let { k, L0 } = naturalK(p, tpl, skin);
    if (isAnimExport(p)) k = animK(p, L0, animFormat(p));
    else if (p.kind !== 'photo') k = Math.min(Math.max(1, Math.min(cropOf(p).w, cropOf(p).h) * (p.exportScale || 1) / 1000), Math.min(settings.maxLong, 1920) / Math.max(L0.W, L0.H));
    const even = (v) => Math.max(2, Math.round(v / 2) * 2);
    return { W: even(L0.W * k), H: even(L0.H * k) };
  }

  function seekVideo(v, time) {
    return new Promise((resolve) => {
      if (Math.abs(v.currentTime - time) < 0.001) { resolve(); return; }
      const done = () => { v.removeEventListener('seeked', done); resolve(); };
      v.addEventListener('seeked', done);
      v.currentTime = time;
      setTimeout(done, 3000);
    });
  }

  /** 逐格畫出動態模板，再交給 ffmpeg 編成 GIF / MP4 */
  async function renderAnimBlob(p, onProgress) {
    if (p.fullPromise) await p.fullPromise;
    const tpl = tplNow(), skin = skinNow();
    const fmt = animFormat(p);
    const fps = fmt === 'gif' ? settings.video.fps : 20;
    const isVid = p.kind === 'video';
    const duration = isVid ? Math.min(p.img.duration || 10, 30) : settings.anim.seconds;
    const count = Math.max(2, Math.round(fps * duration));
    const L0 = tpl.layout(Templates.aspectFor(tpl, cropOf(p)), Templates.skinOf(tpl, skin));
    const k = animK(p, L0, fmt);
    await Templates.ensureFonts(textOf(dataFor(p)), settings.textStyle.weight);
    const canvas = document.createElement('canvas');
    const wasPlaying = isVid && !p.img.paused;
    if (isVid) { stopPlayback(); p.img.pause(); }
    try {
      return await Media.encodeFrames({
        count, fps, format: fmt,
        audioFile: state.bgm || (isVid ? p.file : null), mute: !state.bgm && settings.video.mute,
        shouldStop: () => cancelled,
        async getFrame(i) {
          const time = i / fps;
          if (isVid) await seekVideo(p.img, Math.min(time, (p.img.duration || duration) - 0.01));
          Templates.render(canvas, { tpl: tpl.id, skin, src: p.img, crop: cropOf(p), d: dataFor(p, time), k });
          return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
        },
      }, onProgress || (() => {}));
    } finally {
      canvas.width = canvas.height = 0;
      if (isVid && wasPlaying && p === active()) renderPreview();
    }
  }

  async function renderPhotoBlob(p) {
    if (p.fullPromise) await p.fullPromise;
    const d = dataFor(p);
    await Templates.ensureFonts(textOf(d), settings.textStyle.weight);
    const canvas = document.createElement('canvas');
    Templates.render(canvas, { tpl: settings.tpl, skin: skinNow(), src: p.img, crop: cropOf(p), d, maxLong: settings.maxLong });
    const png = settings.outFormat === 'png';
    const blob = await new Promise((res) => canvas.toBlob(res, png ? 'image/png' : 'image/jpeg', settings.quality / 100));
    canvas.width = canvas.height = 0;
    return blob;
  }

  async function renderVideoBlob(p, onProgress) {
    const tp = tplNow(), skin = skinNow();
    const s = p.exportScale || 1;
    const aspect = Templates.aspectFor(tp, cropOf(p));
    const fc = Templates.fitCrop(cropOf(p), aspect);
    const crop = {
      x: Math.round(fc.x * s), y: Math.round(fc.y * s),
      w: Math.floor((fc.w * s) / 2) * 2, h: Math.floor((fc.h * s) / 2) * 2,
    };
    const d = dataFor(p);
    await Templates.ensureFonts(textOf(d), settings.textStyle.weight);
    const L0 = tp.layout(aspect, Templates.skinOf(tp, skin));
    const maxLong = Math.min(settings.maxLong, 1920); // 影片在瀏覽器中編碼，尺寸太大會很慢
    let k = Math.max(1, Math.min(crop.w, crop.h) / 1000);
    if (Math.max(L0.W, L0.H) * k > maxLong) k = maxLong / Math.max(L0.W, L0.H);
    const canvas = document.createElement('canvas');
    const info = Templates.render(canvas, { tpl: tp.id, skin, overlay: true, crop, d, k });
    const overlay = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const v = settings.video;
    return Media.exportVideo({
      file: p.file, crop, layout: { width: info.W, height: info.H }, slot: info.slotPx, overlay,
      bg: '#000000', format: v.format, mute: v.mute, loops: 1, boomerang: false,
      gifInfinite: true, fps: v.fps, maxWidth: 0,
    }, onProgress || (() => {}));
  }

  function renderFull(p, onProgress) {
    if (isAnimExport(p)) return renderAnimBlob(p, onProgress);
    return p.kind === 'photo' ? renderPhotoBlob(p) : renderVideoBlob(p, onProgress);
  }

  function outExt(p) {
    if (isAnimExport(p)) return animFormat(p);
    return p.kind === 'photo' ? (settings.outFormat === 'png' ? 'png' : 'jpg') : settings.video.format;
  }
  function outName(p) { return `${p.name.replace(/\.[^.]+$/, '')}_${settings.tpl}.${outExt(p)}`; }

  function progressHandler(prefix) {
    return (phase, r) => {
      const pct = Math.round(r * 100);
      $('progress').hidden = false;
      $('progress').value = pct;
      const key = phase === 'download' ? 'st.ffmpegDownload' : phase === 'frames' ? 'st.frames' : 'st.encoding';
      setStatus(`${prefix ? prefix + ' — ' : ''}${t(key, { p: pct })}`);
    };
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function exportOne() {
    const p = active();
    if (!p) return;
    busy(true, t('st.exporting'));
    try { download(await renderFull(p, progressHandler('')), outName(p)); setStatus(t('st.exported', { name: outName(p) })); }
    catch (e) { console.error(e); setStatus(cancelled ? t('st.cancelled') : t('st.exportFail')); }
    finally { busy(false); }
  }

  const isTouchDevice = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
  let pendingShare = null;
  async function shareFile(file) {
    try {
      await navigator.share({ files: [file] });
      setStatus(t('st.saved', { name: file.name }));
    } catch (e) {
      if (e.name === 'AbortError') { setStatus(''); return; }
      if (e.name === 'NotAllowedError') {
        pendingShare = file;
        $('save-device').querySelector('.tbtn-label').textContent = t('tb.saveTap');
        setStatus(t('st.saveTap'));
        return;
      }
      throw e;
    }
  }
  async function saveToDevice() {
    const p = active();
    if (!p) return;
    if (pendingShare) {
      const file = pendingShare;
      pendingShare = null;
      $('save-device').querySelector('.tbtn-label').textContent = t('tb.save');
      try { await shareFile(file); } catch (e) { console.error(e); download(file, file.name); }
      return;
    }
    busy(true, t('st.exporting'));
    try {
      const blob = await renderFull(p, progressHandler(''));
      const file = new File([blob], outName(p), { type: blob.type });
      if (isTouchDevice && navigator.canShare && navigator.canShare({ files: [file] })) await shareFile(file);
      else if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: file.name, types: [{ description: file.type, accept: { [file.type]: [`.${outExt(p)}`] } }] });
          const w = await handle.createWritable();
          await w.write(file); await w.close();
          setStatus(t('st.saved', { name: file.name }));
        } catch (e) {
          if (e.name === 'AbortError') setStatus('');
          else { download(file, file.name); setStatus(t('st.exported', { name: file.name })); }
        }
      } else { download(file, file.name); setStatus(t('st.exported', { name: file.name })); }
    } catch (e) { console.error(e); setStatus(cancelled ? t('st.cancelled') : t('st.exportFail')); }
    finally { busy(false); }
  }

  let pendingSocial = null;
  async function deliverToSocial(file) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); setStatus(t('st.shared')); return; }
      catch (e) {
        if (e.name === 'AbortError') { setStatus(''); return; }
        if (e.name === 'NotAllowedError') {
          pendingSocial = file;
          $('share-social').querySelector('span').textContent = t('tb.shareTap');
          setStatus(t('st.shareTap'));
          return;
        }
        console.warn(e);
      }
    }
    if (file.type.startsWith('image/') && navigator.clipboard && window.ClipboardItem) {
      try {
        let png = file;
        if (file.type !== 'image/png') {
          const img = await Frame.loadImage(URL.createObjectURL(file));
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          png = await new Promise((r) => c.toBlob(r, 'image/png'));
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        setStatus(t('st.copiedForSocial'));
        return;
      } catch (e) { console.warn('clipboard', e); }
    }
    download(file, file.name);
    setStatus(t('st.shareFallback'));
  }
  async function shareSocial() {
    const p = active();
    if (!p) return;
    if (pendingSocial) {
      const file = pendingSocial;
      pendingSocial = null;
      $('share-social').querySelector('span').textContent = t('tb.share');
      await deliverToSocial(file);
      return;
    }
    busy(true, t('st.exporting'));
    try { const blob = await renderFull(p, progressHandler('')); await deliverToSocial(new File([blob], outName(p), { type: blob.type })); }
    catch (e) { console.error(e); setStatus(cancelled ? t('st.cancelled') : t('st.exportFail')); }
    finally { busy(false); }
  }

  async function exportAll() {
    if (!state.photos.length) return;
    busy(true);
    try {
      const zip = new JSZip();
      const used = new Set();
      for (let i = 0; i < state.photos.length; i++) {
        const p = state.photos[i];
        const label = t('st.exportingN', { i: i + 1, n: state.photos.length, name: p.name });
        setStatus(label);
        let name = outName(p), n = 1;
        while (used.has(name)) name = outName(p).replace(/(\.\w+)$/, `_${n++}$1`);
        used.add(name);
        zip.file(name, await renderFull(p, progressHandler(label)));
      }
      setStatus(t('st.zipping'));
      download(await zip.generateAsync({ type: 'blob' }), 'guanghen.zip');
      setStatus(t('st.exportedN', { n: state.photos.length }));
    } catch (e) { console.error(e); setStatus(cancelled ? t('st.cancelled') : t('st.exportFail')); }
    finally { busy(false); }
  }

  let cancelled = false;
  function busy(on, msg) {
    if (on) cancelled = false;
    ['export-one', 'save-device', 'save-top', 'share-social'].forEach((id) => { $(id).disabled = on || !active(); });
    $('export-all').disabled = on || state.photos.length < 2;
    $('cancel-export').hidden = !on;
    if (!on) $('progress').hidden = true;
    if (msg) setStatus(msg);
  }
  function setStatus(msg) { $('status').textContent = msg; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- 事件 ---------- */

  $('file-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  $('dz-add').addEventListener('click', () => $('file-input').click());

  const stagePanel = document.querySelector('.stage-panel');
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; stagePanel.classList.add('dragging'); });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; stagePanel.classList.remove('dragging'); } });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    stagePanel.classList.remove('dragging');
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  $('photo-list').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { removePhoto(Number(rm.dataset.remove)); return; }
    const li = e.target.closest('.photo-item');
    if (li) selectPhoto(Number(li.dataset.id));
  });
  $('remove-all').addEventListener('click', () => { state.photos.forEach(releaseItem); state.photos = []; selectPhoto(null); });

  $('mode-preview').addEventListener('click', () => setMode('preview'));
  $('mode-crop').addEventListener('click', () => setMode('crop'));
  $('crop-done').addEventListener('click', () => setMode('preview'));
  $('crop-reset').addEventListener('click', () => {
    const p = active();
    if (!p) return;
    p.ratioKey = 'tpl'; p.crop = null;
    openCrop();
  });
  $('ratio-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    const p = active();
    if (!chip || !p || chip.disabled) return;
    p.ratioKey = chip.dataset.ratio;
    document.querySelectorAll('#ratio-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    editor.setRatio(ratioFor(p));
  });
  $('play-toggle').addEventListener('click', () => {
    const p = active();
    if (!p || p.kind !== 'video') return;
    if (p.img.paused) { p.userPaused = false; p.img.play().catch(() => {}); } else { p.userPaused = true; p.img.pause(); }
    syncPlayButton();
  });

  // 模板
  $('tpl-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.tpl-card');
    if (!card) return;
    settings.tpl = card.dataset.tpl;
    syncSkins(); syncGallery(); syncVideoUi();
    refreshQuoteStyles();
    saveSettings();
    if (state.mode === 'crop') openCrop(); else renderPreview();
    if (matchMedia('(max-width: 720px)').matches) document.querySelector('.stage-panel').scrollIntoView({ block: 'nearest' });
  });
  $('tpl-filter').addEventListener('click', (e) => {
    const c = e.target.closest('[data-filter]');
    if (!c) return;
    state.filter = c.dataset.filter;
    syncGallery();
  });
  $('skin-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-skin]');
    if (!c) return;
    settings.skins[settings.tpl] = c.dataset.skin;
    if (c.dataset.skin === 'chroma') scheduleThumbs();
    syncSkins();
    changed();
  });
  let palScrollTimer = 0;
  $('skin-chips').addEventListener('scroll', () => { clearTimeout(palScrollTimer); palScrollTimer = setTimeout(() => { palTarget = null; syncPalPages(false); }, 120); }, { passive: true });
  $('pal-prev').addEventListener('click', () => goPalPage((palTarget ?? palPage()) - 1));
  $('pal-next').addEventListener('click', () => goPalPage((palTarget ?? palPage()) + 1));
  $('pal-dots').addEventListener('click', (e) => { const d = e.target.closest('[data-page]'); if (d) goPalPage(Number(d.dataset.page)); });
  // 切到「風格」分頁時面板才有寬度，再對齊一次目前的配色
  new ResizeObserver(() => syncPalPages(true)).observe($('skin-chips'));
  $('mode-chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-mode]');
    if (!c) return;
    settings.modes[settings.tpl] = c.dataset.mode;
    syncSkins();
    changed();
  });
  // 主題色用在「隨光色」：選了主題色就切到隨光色
  document.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => { settings.accent = b.dataset.accent; settings.skins[settings.tpl] = 'chroma'; syncSettingsUi(); changed(); }));
  $('accent-picker').addEventListener('input', (e) => { settings.accent = e.target.value; settings.skins[settings.tpl] = 'chroma'; syncSettingsUi(); changed({ thumbs: false }); });
  $('accent-picker').addEventListener('change', () => scheduleThumbs());
  $('opt-stamp').addEventListener('change', (e) => { settings.stamp = e.target.checked; changed(); });

  // 動態播放器
  $('a-preview').addEventListener('change', (e) => { settings.anim.preview = e.target.checked; changed({ thumbs: false }); });
  $('a-seconds').addEventListener('input', (e) => { settings.anim.seconds = Number(e.target.value); $('a-seconds-val').textContent = `${settings.anim.seconds}s`; saveSettings(); });
  $('a-start').addEventListener('input', (e) => { settings.anim.start = Number(e.target.value); $('a-start-val').textContent = `${settings.anim.start}%`; changed(); });
  $('a-songlen').addEventListener('change', (e) => { settings.anim.songLen = mmss(parseLen(e.target.value)); e.target.value = settings.anim.songLen; changed(); });

  // 鎖定畫面等：文字與面板
  document.querySelectorAll('[data-ts-font]').forEach((b) => b.addEventListener('click', () => { settings.textStyle.font = b.dataset.tsFont; syncSettingsUi(); changed(); }));
  document.querySelectorAll('[data-ts-panel]').forEach((b) => b.addEventListener('click', () => { settings.textStyle.panel = b.dataset.tsPanel; syncSettingsUi(); changed(); }));
  document.querySelectorAll('[data-ts-color]').forEach((b) => b.addEventListener('click', () => { settings.textStyle.color = b.dataset.tsColor; syncSettingsUi(); changed(); }));
  $('ts-color-picker').addEventListener('input', (e) => { settings.textStyle.color = e.target.value; syncSettingsUi(); changed({ thumbs: false }); });
  $('ts-weight').addEventListener('input', (e) => { settings.textStyle.weight = Number(e.target.value); $('ts-weight-val').textContent = settings.textStyle.weight; changed({ thumbs: false }); });
  $('ts-weight').addEventListener('change', () => scheduleThumbs());

  // 語錄與文字
  document.querySelectorAll('[data-quote-style]').forEach((b) => b.addEventListener('click', () => {
    settings.quoteStyle = b.dataset.quoteStyle;
    syncSettingsUi();
    saveSettings();
    refreshQuoteStyles();
    renderPreview(); scheduleThumbs();
  }));
  $('quote-gen').addEventListener('click', () => {
    const p = active();
    if (!p) return;
    p.quoteAuto = true;
    refreshMood(p, true);
    $('f-quote').value = p.quote;
    syncMoodTag(p);
    $('f-quote').classList.remove('pop'); void $('f-quote').offsetWidth; $('f-quote').classList.add('pop');
    renderPreview(); scheduleThumbs();
  });
  $('f-quote').addEventListener('input', (e) => {
    const p = active();
    if (!p) return;
    p.quote = e.target.value; p.quoteAuto = false;
    renderPreview(); scheduleThumbs();
  });
  $('f-artist').addEventListener('input', (e) => { settings.artist = e.target.value; changed(); });
  $('f-album').addEventListener('input', (e) => { settings.album = e.target.value; changed(); });
  document.querySelectorAll('[data-show]').forEach((el) => el.addEventListener('change', () => { settings.show[el.dataset.show] = el.checked; changed(); }));
  function bindSeg(attr, apply) {
    document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => { apply(b.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())]); syncSettingsUi(); changed(); }));
  }
  bindSeg('date-format', (v) => { settings.dateFormat = v; });
  bindSeg('time-format', (v) => { settings.timeFormat = v; });
  bindSeg('unit', (v) => { settings.tempUnit = v; });
  bindSeg('max-long', (v) => { settings.maxLong = Number(v); });
  bindSeg('out-format', (v) => { settings.outFormat = v; });
  bindSeg('vformat', (v) => { settings.video.format = v; syncVideoUi(); });
  bindSeg('anim-out', (v) => { settings.animOut = v; });

  function onDateTime() {
    const p = active();
    if (!p) return;
    const dv = $('f-date').value, tv = $('f-time').value;
    p.exif.date = dv ? dv.replace(/-/g, '/') : '';
    p.exif.time = tv || '';
    refreshMood(p);
    $('f-quote').value = p.quote; syncMoodTag(p);
    if (p.weatherAuto && p.exif.lat != null) detectPlace(p);
    renderPreview(); scheduleThumbs();
  }
  $('f-date').addEventListener('change', onDateTime);
  $('f-time').addEventListener('change', onDateTime);

  // 地點與天氣
  $('f-location').addEventListener('input', (e) => { const p = active(); if (!p) return; p.exif.location = e.target.value; p.locAuto = false; syncPlaceMode(); renderPreview(); scheduleThumbs(); });
  $('f-weather').addEventListener('input', (e) => {
    const p = active(); if (!p) return;
    const v = e.target.value;
    const key = W_KEYS.find((k) => t('w.' + k) === v);
    p.exif.weather = key || v; p.weatherAuto = false;
    syncPlaceMode(); refreshMood(p); $('f-quote').value = p.quote; syncMoodTag(p);
    renderPreview(); scheduleThumbs();
  });
  $('f-temp').addEventListener('input', (e) => { const p = active(); if (!p) return; p.exif.temp = e.target.value.trim(); p.weatherAuto = false; syncPlaceMode(); renderPreview(); scheduleThumbs(); });
  document.querySelectorAll('[data-place-mode]').forEach((b) => b.addEventListener('click', () => {
    const p = active(); if (!p) return;
    const auto = b.dataset.placeMode === 'auto';
    p.locAuto = auto; p.weatherAuto = auto;
    syncPlaceMode();
    if (auto) autoPlace(p);
  }));
  $('loc-format').addEventListener('change', (e) => {
    settings.locFormat = e.target.value;
    saveSettings();
    state.photos.forEach((p) => { if (p.locAuto && p.addr) p.exif.location = placeLabel(p); });
    fillForm(active()); renderList(); renderPreview(); scheduleThumbs();
  });
  $('btn-detect').addEventListener('click', () => { const p = active(); if (p) { p.locAuto = true; p.weatherAuto = true; detectPlace(p); } });
  $('btn-my-location').addEventListener('click', () => { const p = active(); if (p) useMyLocation(p); });
  $('auto-geo').addEventListener('change', (e) => { settings.autoGeo = e.target.checked; saveSettings(); });

  // 輸出
  $('quality').addEventListener('input', (e) => { settings.quality = Number(e.target.value); $('quality-val').textContent = settings.quality; saveSettings(); });
  $('v-mute').addEventListener('change', (e) => { settings.video.mute = e.target.checked; saveSettings(); });
  $('v-fps').addEventListener('change', (e) => { settings.video.fps = Number(e.target.value); saveSettings(); });
  $('export-one').addEventListener('click', exportOne);
  $('save-top').addEventListener('click', exportOne);
  $('save-device').addEventListener('click', saveToDevice);
  $('share-social').addEventListener('click', shareSocial);
  $('export-all').addEventListener('click', exportAll);
  $('cancel-export').addEventListener('click', () => { cancelled = true; Media.cancel(); });

  // 網址匯入（跨網域時透過 Worker 的 /api/fetch）
  const MIME_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv',
  };
  function nameFromResponse(res, href) {
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    let name = '';
    try { name = m ? decodeURIComponent(m[1]) : decodeURIComponent(new URL(href).pathname.split('/').pop() || ''); } catch (e) { /* ignore */ }
    name = name.replace(/[\\/:*?"<>|]+/g, '_').slice(-120) || 'image';
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/\.[a-z0-9]{2,5}$/i.test(name) && MIME_EXT[type]) name += `.${MIME_EXT[type]}`;
    return name;
  }
  const MUSIC_HOST = /(^|\.)(spotify\.com|music\.apple\.com|itunes\.apple\.com|youtube\.com|youtu\.be|kkbox\.com|soundcloud\.com|streetvoice\.com|bandcamp\.com|music\.line\.me|deezer\.com|tidal\.com|music\.amazon\.[a-z.]+)$/i;

  // Apple 的公開 API 會限制雲端主機的流量，所以搜尋與 Apple Music 連結直接從瀏覽器查詢
  const bigArt = (u) => (u ? u.replace(/\/\d+x\d+(bb)?(-\d+)?\.(jpg|png|webp)$/i, '/1500x1500bb.jpg') : '');
  const fromItunes = (r) => ({
    title: r.trackName || r.collectionName || '', artist: r.artistName || '', album: r.collectionName || '',
    image: bigArt(r.artworkUrl100), thumb: r.artworkUrl100, year: (r.releaseDate || '').slice(0, 4), source: 'Apple Music',
  });
  async function itunes(path) {
    const res = await fetch(`https://itunes.apple.com/${path}`, { credentials: 'omit' });
    if (!res.ok) throw new Error(`itunes ${res.status}`);
    return (await res.json()).results || [];
  }
  async function searchSongs(q) {
    const cc = { 'zh-Hant': 'tw', ja: 'jp', en: 'us' }[I18n.lang] || 'tw';
    try { return (await itunes(`search?media=music&entity=song&limit=10&country=${cc}&term=${encodeURIComponent(q)}`)).map(fromItunes); }
    catch (e) {
      const res = await fetch(`api/search?country=${cc}&q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`search ${res.status}`);
      return (await res.json()).results || [];
    }
  }

  /** 解析音樂連結：取得歌名、歌手、專輯與封面網址 */
  async function musicInfo(href) {
    const u = new URL(href);
    if (/(^|\.)(music|itunes)\.apple\.com$/i.test(u.hostname)) {
      const id = u.searchParams.get('i') || (u.pathname.match(/\/(\d+)\/?$/) || u.pathname.match(/id(\d+)/) || [])[1];
      const cc = (u.pathname.match(/^\/([a-z]{2})\//i) || [, 'us'])[1];
      if (id) {
        try {
          const rs = await itunes(`lookup?id=${id}&country=${cc}`);
          const r = rs.find((x) => x.wrapperType === 'track') || rs[0];
          if (r) return fromItunes(r);
        } catch (e) { /* 改用 Worker */ }
      }
    }
    const res = await fetch(`api/music?url=${encodeURIComponent(href)}`);
    if (!res.ok) throw new Error(`music ${res.status}`);
    return res.json();
  }

  /** 把歌曲資料套用到照片（歌名放進語錄，歌手、專輯放進設定） */
  function applySong(p, info) {
    if (info.artist) settings.artist = info.artist;
    if (info.album) settings.album = info.album;
    saveSettings();
    if (p) { p.quote = info.title || p.quote; p.quoteAuto = false; }
    if (tplNow().tag !== 'music') { settings.tpl = 'player'; syncSkins(); syncGallery(); syncVideoUi(); saveSettings(); }
    fillForm(active());
    renderPreview(); scheduleThumbs();
  }

  /** 專輯封面加成一張新照片 */
  async function addCover(info) {
    if (!info.image) throw new Error('no image');
    let res = null;
    try { res = await fetch(info.image, { mode: 'cors', credentials: 'omit' }); if (!res.ok) res = null; } catch (e) { res = null; }
    if (!res) res = await fetch(`api/fetch?url=${encodeURIComponent(info.image)}`);
    if (!res.ok) throw new Error('cover');
    const blob = await res.blob();
    const name = `${[info.artist, info.title].filter(Boolean).join(' - ') || 'cover'}.jpg`.replace(/[\\/:*?"<>|]+/g, '_');
    const before = state.photos.length;
    await addFiles([new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: Date.now() })], { music: info });
    const p = state.photos[before];
    if (p) { selectPhoto(p.id); applySong(p, info); }
  }

  async function importMusic(href) {
    setBusy(t('st.musicFetching'));
    try { await addCover(await musicInfo(href)); $('url-input').value = ''; }
    catch (e) { console.warn(e); setStatus(t('st.musicFailed')); }
    finally { setBusy(''); }
  }

  async function importUrl(raw) {
    let u;
    try { u = new URL(String(raw).trim()); } catch (e) { setStatus(t('st.urlInvalid')); return; }
    if (!/^https?:$/.test(u.protocol)) { setStatus(t('st.urlInvalid')); return; }
    if (MUSIC_HOST.test(u.hostname)) { importMusic(u.href); return; }
    setBusy(t('st.urlFetching'));
    let res = null;
    try {
      res = await fetch(u.href, { mode: 'cors', credentials: 'omit' });
      if (!res.ok || !/^(image|video)\//.test(res.headers.get('content-type') || '')) res = null;
    } catch (e) { res = null; }
    if (!res) {
      try { res = await fetch(`api/fetch?url=${encodeURIComponent(u.href)}`); } catch (e) { res = null; }
      if (!res || !res.ok) {
        const code = res && res.status;
        setStatus(t(code === 415 ? 'st.urlNotMedia' : code === 413 ? 'st.urlTooLarge' : code === 400 ? 'st.urlInvalid' : 'st.urlFailed'));
        setBusy('');
        return;
      }
    }
    try {
      const blob = await res.blob();
      await addFiles([new File([blob], nameFromResponse(res, res.headers.get('x-final-url') || res.url || u.href), { type: blob.type })]);
      $('url-input').value = '';
    } catch (e) { console.error(e); setStatus(t('st.urlFailed')); setBusy(''); }
  }
  $('url-form').addEventListener('submit', (e) => { e.preventDefault(); importUrl($('url-input').value); });

  // 從歌曲帶入：搜尋歌名，或貼上音樂連結
  let songResults = [];
  function renderSongs() {
    $('song-results').innerHTML = songResults.map((r, i) => `
      <li class="song-item">
        <img src="${escapeHtml(r.thumb || r.image || '')}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <div style="min-width:0"><div class="t">${escapeHtml(r.title || '')}</div><div class="a">${escapeHtml([r.artist, r.album, r.year].filter(Boolean).join(' · '))}</div></div>
        <div class="acts">
          <button class="btn btn-ghost btn-sm" type="button" data-song-apply="${i}" ${active() ? '' : 'disabled'}>${t('song.apply')}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-song-cover="${i}" ${r.image ? '' : 'disabled'}>${t('song.cover')}</button>
        </div>
      </li>`).join('');
  }
  $('song-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('song-input').value.trim();
    if (!q) return;
    $('song-status').textContent = t('song.loading');
    songResults = [];
    renderSongs();
    try {
      if (/^https?:\/\//i.test(q)) songResults = [await musicInfo(q)];
      else songResults = await searchSongs(q);
      $('song-status').textContent = songResults.length ? '' : t('song.none');
    } catch (err) {
      console.warn(err);
      $('song-status').textContent = t(/^https?:/i.test(q) ? 'st.musicFailed' : 'song.none');
    }
    renderSongs();
  });
  $('song-results').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-song-apply]'), c = e.target.closest('[data-song-cover]');
    const r = songResults[Number((a || c || {}).dataset?.songApply ?? (a || c || {}).dataset?.songCover)];
    if (!r) return;
    if (a) { applySong(active(), r); $('song-status').textContent = t('song.applied', { t: r.title }); }
    if (c) {
      c.disabled = true;
      try { await addCover(r); $('song-status').textContent = t('song.applied', { t: r.title }); }
      catch (err) { console.warn(err); $('song-status').textContent = t('st.musicFailed'); }
      c.disabled = false;
    }
  });

  // 背景音樂（輸出 MP4 時加入）
  function syncBgm() {
    $('bgm-name').textContent = state.bgm ? state.bgm.name : '';
    $('bgm-remove').hidden = !state.bgm;
  }
  $('bgm-input').addEventListener('change', (e) => { state.bgm = e.target.files[0] || null; e.target.value = ''; syncBgm(); });
  $('bgm-remove').addEventListener('click', () => { state.bgm = null; syncBgm(); });
  document.addEventListener('paste', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && target.id !== 'url-input') return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); return; }
    const text = (e.clipboardData?.getData('text') || '').trim();
    if (/^https?:\/\/\S+$/i.test(text) && target.id !== 'url-input') { e.preventDefault(); importUrl(text); }
  });

  // 分頁
  const isPhoneLayout = () => matchMedia('(max-width: 720px)').matches;
  function setTab(name) {
    if (name === 'more' && !isPhoneLayout()) name = 'style';
    $('settings-panel').dataset.tab = name;
    document.querySelectorAll('#tabbar .tab, .inspector-tabs .itab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $('settings-panel').scrollTop = 0;
    try { localStorage.setItem('guanghen.tab', name); } catch (e) { /* ignore */ }
  }
  document.querySelectorAll('#tabbar .tab, .inspector-tabs .itab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  let savedTab = 'style';
  try { savedTab = localStorage.getItem('guanghen.tab') || 'style'; } catch (e) { /* ignore */ }
  setTab(['style', 'text', 'place', 'export', 'more'].includes(savedTab) ? savedTab : 'style');

  window.addEventListener('langchange', () => {
    I18n.apply();
    fillWeatherList();
    buildGallery();
    syncSettingsUi();
    sampleCache = null;
    state.photos.forEach((p) => { if (p.quoteAuto) p.quote = Quotes.pick(p.mood, I18n.lang, '', quoteStyle()); if (p.locAuto && p.addr) p.exif.location = placeLabel(p); });
    fillForm(active());
    renderPreview();
    scheduleThumbs();
  });

  /* ---------- 啟動 ---------- */

  setInterval(syncFormatExamples, 60000); // 過了午夜，範例日期跟著換

  document.querySelectorAll('.copyright-year').forEach((el) => { el.textContent = new Date().getFullYear(); });

  initUiControls();
  I18n.apply();
  fillWeatherList();
  buildGallery();
  syncSettingsUi();
  fillForm(null);
  busy(false);
  scheduleThumbs();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderPreview(); scheduleThumbs(); });
})();
