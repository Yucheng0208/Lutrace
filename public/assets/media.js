/* 影片 / GIF：讀取 MP4・MOV 中繼資料，以及用 ffmpeg.wasm 輸出 MP4・MOV・GIF */
(function () {
  'use strict';

  const VIDEO_EXT = /\.(mp4|m4v|mov|qt|webm|mkv|avi|wmv|asf|flv|f4v|mpg|mpeg|m2v|ts|mts|m2ts|3gp|3g2|ogv|vob)$/i;

  function kindOf(file) {
    if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) return 'gif';
    if (/^video\//.test(file.type) || VIDEO_EXT.test(file.name)) return 'video';
    return 'photo';
  }

  /* ---------- MP4 / MOV 中繼資料（ISO BMFF box） ---------- */

  const td = new TextDecoder('utf-8');
  const str4 = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

  async function readBytes(file, start, len) {
    return new DataView(await file.slice(start, start + len).arrayBuffer());
  }

  // 在檔案最上層找出 moov box
  async function findMoov(file) {
    let off = 0;
    while (off + 8 <= file.size) {
      const h = await readBytes(file, off, 16);
      let size = h.getUint32(0);
      const type = str4(h, 4);
      let header = 8;
      if (size === 1) { size = Number(h.getBigUint64(8)); header = 16; }
      else if (size === 0) size = file.size - off;
      if (size < header) return null;
      if (type === 'moov') {
        if (size > 64 * 1024 * 1024) return null;
        return readBytes(file, off + header, size - header);
      }
      off += size;
    }
    return null;
  }

  function* boxes(dv, start, end) {
    let o = start;
    while (o + 8 <= end) {
      let size = dv.getUint32(o);
      const type = str4(dv, o + 4);
      let header = 8;
      if (size === 1) { size = Number(dv.getBigUint64(o + 8)); header = 16; }
      else if (size === 0) size = end - o;
      if (size < header || o + size > end) return;
      yield { type, start: o + header, end: o + size };
      o += size;
    }
  }

  // ISO 6709："+61.4989+023.7684+123.4/"
  function parseIso6709(s) {
    const m = String(s).match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
    return m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : null;
  }

  function parseMoov(dv) {
    const out = {};
    const setIfEmpty = (k, v) => { if (v && !out[k]) out[k] = String(v).replace(/\0+$/, '').trim(); };
    const textAt = (b) => td.decode(new Uint8Array(dv.buffer, dv.byteOffset + b.start, b.end - b.start));

    // QuickTime 使用者資料：©xyz ©mak ©mod ©day（前 4 bytes 為長度與語系）
    const readUdta = (s, e) => {
      for (const b of boxes(dv, s, e)) {
        const name = b.type.replace('©', '@');
        if (!['@xyz', '@mak', '@mod', '@day'].includes(name)) continue;
        const v = td.decode(new Uint8Array(dv.buffer, dv.byteOffset + b.start + 4, Math.max(0, b.end - b.start - 4)));
        if (name === '@xyz') setIfEmpty('location', v);
        if (name === '@mak') setIfEmpty('make', v);
        if (name === '@mod') setIfEmpty('model', v);
        if (name === '@day') setIfEmpty('date', v);
      }
    };

    // Apple 的 mdta：keys + ilst
    const readMeta = (s, e) => {
      let keys = [];
      for (const b of boxes(dv, s, e)) {
        if (b.type === 'keys') {
          const count = dv.getUint32(b.start + 4);
          let o = b.start + 8;
          for (let i = 0; i < count && o + 8 <= b.end; i++) {
            const size = dv.getUint32(o);
            keys.push(td.decode(new Uint8Array(dv.buffer, dv.byteOffset + o + 8, size - 8)));
            o += size;
          }
        } else if (b.type === 'ilst') {
          for (const item of boxes(dv, b.start, b.end)) {
            const idx = dv.getUint32(item.start - 4);
            const key = keys[idx - 1] || '';
            for (const d of boxes(dv, item.start, item.end)) {
              if (d.type !== 'data') continue;
              const v = textAt({ start: d.start + 8, end: d.end });
              if (/location\.ISO6709$/.test(key)) setIfEmpty('location', v);
              else if (/\.make$/.test(key)) setIfEmpty('make', v);
              else if (/\.model$/.test(key)) setIfEmpty('model', v);
              else if (/creationdate$/.test(key)) setIfEmpty('date', v);
            }
          }
        }
      }
    };

    for (const b of boxes(dv, 0, dv.byteLength)) {
      if (b.type === 'mvhd') {
        const v = dv.getUint8(b.start);
        const secs = v === 1 ? Number(dv.getBigUint64(b.start + 4)) : dv.getUint32(b.start + 4);
        if (secs > 0) out.utc = new Date((secs - 2082844800) * 1000);
      } else if (b.type === 'udta') {
        readUdta(b.start, b.end);
        for (const c of boxes(dv, b.start, b.end)) if (c.type === 'meta') readMeta(c.start + 4, c.end);
      } else if (b.type === 'meta') {
        readMeta(b.start + 4, b.end);
        readMeta(b.start, b.end);
      }
    }
    return out;
  }

  /** 回傳與 Frame.readExif 相同格式的欄位 */
  async function readVideoMeta(file) {
    let m = {};
    try {
      const moov = await findMoov(file);
      if (moov) m = parseMoov(moov);
    } catch (e) { console.warn('video meta', e); }
    const pad2 = (n) => String(n).padStart(2, '0');
    let date = '', time = '';
    // Apple creationdate 帶有當地時間（2026-09-14T19:42:10+0300），直接取字面上的時間
    const local = m.date && String(m.date).match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    let d = null;
    if (local) { date = `${local[1]}/${local[2]}/${local[3]}`; time = `${local[4]}:${local[5]}`; }
    else d = m.utc || (file.lastModified ? new Date(file.lastModified) : null);
    if (d && !isNaN(d)) {
      date = `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
      time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    const loc = m.location ? parseIso6709(m.location) : null;
    return {
      make: m.make || '', model: m.model || '', lens: '',
      focal: '', iso: '', fnum: '', exposure: '',
      date, time,
      lat: loc ? loc.lat : null, lon: loc ? loc.lon : null,
      location: '', weather: '', temp: '',
    };
  }

  /* ---------- 載入影片 / GIF 元素 ---------- */

  /** 用瀏覽器原生播放器載入；無法播放（AVI、WMV、部分 MKV）或沒有畫面時會 reject */
  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.loop = true; v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      const timer = setTimeout(() => fail('video load timeout'), 10000);
      function fail(msg) { clearTimeout(timer); v.removeAttribute('src'); v.load(); reject(new Error(msg)); }
      v.onloadeddata = () => {
        v.onloadeddata = null;
        if (!v.videoWidth) { fail('no video track the browser can decode'); return; }
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
        v.onseeked = () => { v.onseeked = null; clearTimeout(timer); resolve(v); };
      };
      v.onerror = () => fail('video decode failed');
      v.src = url;
    });
  }

  /**
   * 瀏覽器無法播放的影片：用 ffmpeg 轉一份預覽用 MP4（最長邊 1920px、無聲）。
   * 輸出時仍使用原始檔，回傳 origW / origH 用來換算裁切座標。
   */
  async function transcodePreview(file, onProgress) {
    const ff = await getFFmpeg((r) => onProgress('download', r));
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, 'bin'])[1].toLowerCase();
    const input = `preview-in.${ext}`;
    await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    const logs = [];
    const onLog = ({ message }) => { logs.push(message); };
    const onProg = ({ progress }) => onProgress('transcode', Math.max(0, Math.min(1, progress)));
    ff.on('log', onLog);
    ff.on('progress', onProg);
    try {
      const code = await ff.exec(['-i', input, '-map', '0:v:0', '-an',
        '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', 'preview.mp4']);
      if (code !== 0) throw new Error('ffmpeg preview failed:\n' + logs.slice(-12).join('\n'));
      const data = await ff.readFile('preview.mp4');
      // 從 ffmpeg 記錄取得原始解析度，例如 "Video: wmv2 ..., 1920x1080"
      const m = logs.join('\n').match(/Stream #0:\d+[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
      return {
        url: URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' })),
        origW: m ? +m[1] : 0, origH: m ? +m[2] : 0,
      };
    } finally {
      ff.off('log', onLog);
      ff.off('progress', onProg);
      for (const n of [input, 'preview.mp4']) { try { await ff.deleteFile(n); } catch (e) { /* 不存在 */ } }
    }
  }

  function snapshot(el, w, h, maxSide) {
    const s = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------- ffmpeg.wasm ---------- */

  const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
  let ffmpegPromise = null;
  let ffmpeg = null;

  async function fetchToBlobURL(url, type, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total || !onProgress) return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }));
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(got / total);
    }
    return URL.createObjectURL(new Blob(chunks, { type }));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /** 第一次使用時才載入 ffmpeg（核心約 32MB，由 CDN 下載後瀏覽器會快取） */
  function getFFmpeg(onDownload) {
    if (!ffmpegPromise) {
      ffmpegPromise = (async () => {
        if (!window.FFmpegWASM) await loadScript('vendor/ffmpeg/ffmpeg.js');
        const inst = new FFmpegWASM.FFmpeg();
        const coreURL = await fetchToBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await fetchToBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', onDownload);
        await inst.load({ coreURL, wasmURL });
        ffmpeg = inst;
        return inst;
      })();
      ffmpegPromise.catch(() => { ffmpegPromise = null; });
    }
    return ffmpegPromise;
  }

  function cancel() {
    if (ffmpeg) { ffmpeg.terminate(); ffmpeg = null; ffmpegPromise = null; }
  }

  /**
   * 輸出影片 / GIF
   * @param job {
   *   file, crop:{x,y,w,h}, layout（Frame.frameLayout，even=true）, overlay: Blob(PNG),
   *   bg: '#ffffff', format: 'mp4'|'mov'|'gif', mute, loops (播放次數), boomerang,
   *   gifInfinite, fps, maxWidth (0=原尺寸)
   * }
   * @param onProgress (phase, ratio)  phase: 'download' | 'encode'
   */
  async function exportVideo(job, onProgress) {
    const ff = await getFFmpeg((r) => onProgress('download', r));
    const ext = (job.file.name.match(/\.([a-z0-9]+)$/i) || [, 'mp4'])[1].toLowerCase();
    const input = `in.${ext}`;
    const out = `out.${job.format}`;
    await ff.writeFile(input, new Uint8Array(await job.file.arrayBuffer()));
    await ff.writeFile('overlay.png', new Uint8Array(await job.overlay.arrayBuffer()));

    const { crop, layout } = job;
    const cw = Math.floor(crop.w / 2) * 2, ch = Math.floor(crop.h / 2) * 2;
    const gif = job.format === 'gif';
    const loops = Math.max(1, Math.min(20, job.loops | 0));
    const bg = job.bg.replace('#', '0x');

    // slot：模板中照片的位置與大小（光痕），裁切後縮放到 slot 再放進畫布
    const scale = job.slot ? `scale=${job.slot.w}:${job.slot.h}:flags=lanczos,setsar=1,` : '';
    const at = job.slot ? `${job.slot.x}:${job.slot.y}` : `${layout.imgX}:${layout.imgY}`;
    let f = `[0:v]crop=${cw}:${ch}:${crop.x}:${crop.y},${scale}`
      + `pad=${layout.width}:${layout.height}:${at}:color=${bg}[p];`
      + `[p][1:v]overlay=0:0[o]`;
    let label = 'o';
    if (job.boomerang) {
      f += `;[o]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[bm]`;
      label = 'bm';
      if (loops > 1 && !(gif && job.gifInfinite)) { f += `;[bm]loop=loop=${loops - 1}:size=32767:start=0[lp]`; label = 'lp'; }
    }
    const chain = [];
    if (gif) chain.push(`fps=${job.fps || 15}`);
    if (job.maxWidth && job.maxWidth < layout.width) chain.push(`scale=${job.maxWidth}:-2:flags=lanczos`);
    if (gif) {
      f += `;[${label}]${chain.length ? chain.join(',') + ',' : ''}split[s0][s1];[s0]palettegen=stats_mode=diff[pal];[s1][pal]paletteuse=dither=bayer:bayer_scale=4[out]`;
    } else {
      f += `;[${label}]${chain.length ? chain.join(',') : 'null'}[out]`;
    }

    const args = [];
    // 用 -stream_loop 重複輸入（不含來回播放與無限循環 GIF）
    if (loops > 1 && !job.boomerang && !(gif && job.gifInfinite)) args.push('-stream_loop', String(loops - 1));
    args.push('-i', input, '-i', 'overlay.png', '-filter_complex', f, '-map', '[out]');
    if (gif) {
      args.push('-loop', job.gifInfinite ? '0' : '-1');
    } else {
      if (job.mute || job.boomerang) args.push('-an');
      else args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '160k');
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p');
      if (job.format === 'mp4') args.push('-movflags', '+faststart');
    }
    args.push(out);

    const onProg = ({ progress }) => onProgress('encode', Math.max(0, Math.min(1, progress)));
    const logs = [];
    const onLog = ({ message }) => { logs.push(message); if (logs.length > 60) logs.shift(); };
    ff.on('progress', onProg);
    ff.on('log', onLog);
    try {
      const code = await ff.exec(args);
      if (code !== 0) throw new Error('ffmpeg failed:\n' + logs.slice(-15).join('\n'));
      const data = await ff.readFile(out);
      const type = gif ? 'image/gif' : job.format === 'mov' ? 'video/quicktime' : 'video/mp4';
      return new Blob([data.buffer], { type });
    } finally {
      ff.off('progress', onProg);
      ff.off('log', onLog);
      for (const n of [input, 'overlay.png', out]) { try { await ff.deleteFile(n); } catch (e) { /* 不存在 */ } }
    }
  }

  /**
   * 逐格輸出（光痕的動態播放器）：每一格由畫布畫好後交給 ffmpeg 編碼
   * @param job { count, fps, format: 'mp4'|'mov'|'gif', getFrame(i) → Promise<Blob>, audioFile, mute, shouldStop() }
   * @param onProgress (phase, ratio)  phase: 'download' | 'frames' | 'encode'
   */
  async function encodeFrames(job, onProgress) {
    const ff = await getFFmpeg((r) => onProgress('download', r));
    const gif = job.format === 'gif';
    const out = `anim.${job.format}`;
    const written = [];
    let audioIn = null;
    const onProg = ({ progress }) => onProgress('encode', Math.max(0, Math.min(1, progress)));
    const logs = [];
    const onLog = ({ message }) => { logs.push(message); if (logs.length > 60) logs.shift(); };
    try {
      for (let i = 0; i < job.count; i++) {
        if (job.shouldStop && job.shouldStop()) throw new Error('cancelled');
        const blob = await job.getFrame(i);
        const name = `fr${String(i).padStart(5, '0')}.jpg`;
        await ff.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
        written.push(name);
        onProgress('frames', (i + 1) / job.count);
      }
      const args = ['-framerate', String(job.fps), '-i', 'fr%05d.jpg'];
      if (job.audioFile && !job.mute && !gif) {
        const ext = (job.audioFile.name.match(/\.([a-z0-9]+)$/i) || [, 'mp4'])[1].toLowerCase();
        audioIn = `audio.${ext}`;
        await ff.writeFile(audioIn, new Uint8Array(await job.audioFile.arrayBuffer()));
        args.push('-i', audioIn);
      }
      if (gif) {
        args.push('-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0');
      } else {
        args.push('-map', '0:v');
        if (audioIn) args.push('-map', '1:a?', '-c:a', 'aac', '-b:a', '160k', '-shortest');
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p');
        if (job.format === 'mp4') args.push('-movflags', '+faststart');
      }
      args.push(out);
      ff.on('progress', onProg);
      ff.on('log', onLog);
      const code = await ff.exec(args);
      if (code !== 0) throw new Error('ffmpeg failed:\n' + logs.slice(-15).join('\n'));
      const data = await ff.readFile(out);
      const type = gif ? 'image/gif' : job.format === 'mov' ? 'video/quicktime' : 'video/mp4';
      return new Blob([data.buffer], { type });
    } finally {
      if (ffmpeg) {
        ff.off('progress', onProg);
        ff.off('log', onLog);
        for (const n of [...written, audioIn, out].filter(Boolean)) { try { await ff.deleteFile(n); } catch (e) { /* 不存在 */ } }
      }
    }
  }

  window.Media = { kindOf, readVideoMeta, loadVideo, transcodePreview, snapshot, exportVideo, encodeFrames, cancel, getFFmpeg };
})();
