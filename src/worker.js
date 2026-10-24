/**
 * 光痕 Lutrace — Cloudflare Worker（/api/fetch 取自 Lumark）
 * 靜態網站由 assets 提供；這裡處理：
 *   /api/fetch   代替瀏覽器下載使用者貼上的照片 / 影片網址（很多網站不允許跨網域讀取）
 *   /api/music   解析音樂連結（Spotify、Apple Music、YouTube、KKBOX…）的歌名、歌手與封面
 *   /api/search  用歌名搜尋歌曲（iTunes Search API）
 */

const MAX_BYTES = 300 * 1024 * 1024; // 300 MB
const MEDIA_TYPE = /^(image|video)\//i;
const MEDIA_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|svg|heic|heif|tiff?|dng|nef|cr2|cr3|arw|raf|orf|rw2|mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpg|mpeg|ts|3gp)$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fetch') return proxyMedia(request, url);
    if (url.pathname === '/api/music') return musicMeta(request, url);
    if (url.pathname === '/api/search') return searchSongs(request, url);
    return env.ASSETS.fetch(request);
  },
};

function error(status, code) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** 只接受本站頁面發出的請求，避免被當成公開代理；回傳錯誤 Response 或 null */
function guard(request, url) {
  if (request.method !== 'GET') return error(405, 'method');
  const site = request.headers.get('sec-fetch-site');
  const origin = request.headers.get('origin');
  if ((site && site !== 'same-origin') || (origin && origin !== url.origin)) return error(403, 'forbidden');
  return null;
}

/** 取出並檢查 ?url= 的目標網址；不合格時回傳 null */
function targetOf(url) {
  let target;
  try { target = new URL(url.searchParams.get('url') || ''); } catch { return null; }
  if (!/^https?:$/.test(target.protocol) || target.username || target.password) return null;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(target.hostname) || target.hostname === url.hostname) return null;
  return target;
}

async function proxyMedia(request, url) {
  const denied = guard(request, url);
  if (denied) return denied;
  const target = targetOf(url);
  if (!target) return error(400, 'invalid_url');

  let upstream;
  try {
    upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LutraceFetcher/1.0)', accept: 'image/*,video/*,*/*;q=0.5' },
      cf: { cacheTtl: 300 },
    });
  } catch {
    return error(502, 'fetch_failed');
  }
  if (!upstream.ok || !upstream.body) return error(502, 'fetch_failed');

  const type = (upstream.headers.get('content-type') || '').split(';')[0].trim();
  const looksLikeMedia = MEDIA_TYPE.test(type)
    || ((type === 'application/octet-stream' || type === 'binary/octet-stream' || !type) && MEDIA_EXT.test(new URL(upstream.url).pathname));
  if (!looksLikeMedia) return error(415, 'not_media');

  const length = Number(upstream.headers.get('content-length')) || 0;
  if (length > MAX_BYTES) return error(413, 'too_large');

  // 沒有 Content-Length 時邊傳邊計算，超過上限就中斷
  let sent = 0;
  const limiter = new TransformStream({
    transform(chunk, controller) {
      sent += chunk.byteLength;
      if (sent > MAX_BYTES) controller.error(new Error('too_large'));
      else controller.enqueue(chunk);
    },
  });

  const headers = new Headers({
    'content-type': type || 'application/octet-stream',
    'cache-control': 'private, max-age=300',
    'x-content-type-options': 'nosniff',
    'x-final-url': upstream.url,
  });
  if (length) headers.set('content-length', String(length));
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) headers.set('content-disposition', disposition);
  return new Response(upstream.body.pipeThrough(limiter), { status: 200, headers });
}

/* ---------- 音樂連結 ---------- */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=600' },
  });
}

async function getJson(href) {
  const res = await fetch(href, { headers: { 'user-agent': UA, accept: 'application/json' }, cf: { cacheTtl: 600 } });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

/** 讀取網頁前 1.5 MB，取出 og / twitter / music 標籤 */
async function pageMeta(href, lang, ua) {
  const res = await fetch(href, {
    redirect: 'follow',
    headers: { 'user-agent': ua || UA, accept: 'text/html,application/xhtml+xml', 'accept-language': lang || 'zh-TW,zh;q=0.9,en;q=0.8' },
    cf: { cacheTtl: 600 },
  });
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let html = '';
  while (html.length < 1500000) {
    const { done, value } = await reader.read();
    if (done) break;
    html += dec.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  try { reader.cancel(); } catch { /* ignore */ }
  const meta = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in meta)) meta[key.toLowerCase()] = decodeEntities(val);
  }
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  if (title && !meta.title) meta.title = decodeEntities(title.trim());
  meta.finalUrl = res.url;
  return meta;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function absolute(img, base) {
  if (!img) return '';
  try { return new URL(img, base).href; } catch { return ''; }
}

/** Apple Music / iTunes：用 lookup API 取得高解析度封面（最大 3000px，取 1500px） */
function bigArtwork(u) { return u ? u.replace(/\/\d+x\d+(bb)?(-\d+)?\.(jpg|png|webp)$/i, '/1500x1500bb.jpg') : ''; }

async function appleMusic(target) {
  const id = target.searchParams.get('i') || (target.pathname.match(/\/(\d+)(?:\/?$|\?)/) || target.pathname.match(/id(\d+)/) || [])[1];
  const cc = (target.pathname.match(/^\/([a-z]{2})\//i) || [, 'us'])[1];
  if (!id) return null;
  const data = await getJson(`https://itunes.apple.com/lookup?id=${id}&country=${cc}`);
  const r = (data.results || []).find((x) => x.wrapperType === 'track') || (data.results || [])[0];
  if (!r) return null;
  return {
    title: r.trackName || r.collectionName || '', artist: r.artistName || '', album: r.collectionName || '',
    image: bigArtwork(r.artworkUrl100), year: (r.releaseDate || '').slice(0, 4), source: 'Apple Music',
  };
}

function youtubeId(target) {
  const h = target.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (h === 'youtu.be') return target.pathname.slice(1).split('/')[0];
  return target.searchParams.get('v') || (target.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/) || [])[1] || '';
}

async function youtube(target) {
  const id = youtubeId(target);
  if (!id) return null;
  const o = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
  let title = o.title || '', artist = (o.author_name || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '');
  // 「歌手 - 歌名（Official Video）」的常見格式
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) { artist = m[1].trim(); title = m[2]; }
  title = title.replace(/\s*[\(\[【（](official|music|lyric|audio|mv|m\/v|官方|完整|高畫質|hd|4k)[^\)\]】）]*[\)\]】）]/gi, '').trim();
  // 先試最高解析度的縮圖，沒有就用 hqdefault
  let image = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  try { const h = await fetch(image, { method: 'HEAD' }); if (!h.ok) image = o.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; } catch { image = o.thumbnail_url; }
  return { title, artist, album: '', image, source: 'YouTube' };
}

async function spotify(target, lang) {
  const o = await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(target.href)}`);
  let artist = '', album = '', year = '', image = (o.thumbnail_url || '').replace('ab67616d00001e02', 'ab67616d0000b273');
  try {
    // Spotify 只對預覽機器人輸出完整的 og 標籤
    const meta = await pageMeta(target.href, lang, 'facebookexternalhit/1.1');
    if (meta['og:image']) image = meta['og:image'];
    // og:description 例：「Artist · Album · Song · 2023」或「Listen to … on Spotify. Song · Artist · 2023」
    const desc = meta['og:description'] || '';
    const parts = desc.replace(/^.*Spotify\.\s*/i, '').split(/\s*·\s*/).filter(Boolean);
    if (meta['music:musician_description']) artist = meta['music:musician_description'];
    if (!artist && parts.length >= 2) artist = /^(song|歌曲|曲)$/i.test(parts[0]) ? parts[1] : parts[0];
    year = (parts.find((p) => /^\d{4}$/.test(p)) || '');
    if (/\/album\//.test(target.pathname)) album = o.title;
    else if (parts.length >= 4 && /^(song|歌曲|曲)$/i.test(parts[2])) album = parts[1];
  } catch { /* 只用 oEmbed 的資料 */ }
  return { title: o.title || '', artist, album, image, year, source: 'Spotify' };
}

async function generic(target, lang) {
  const meta = await pageMeta(target.href, lang);
  let title = meta['og:title'] || meta['twitter:title'] || meta.title || '';
  let artist = meta['music:musician_description'] || meta['og:music:artist'] || meta['twitter:audio:artist_name'] || '';
  const image = absolute(meta['og:image'] || meta['twitter:image'] || meta['og:image:url'], meta.finalUrl);
  // 「歌名 - 歌手」或「歌手 - 歌名」：多數音樂網站把歌名放前面
  if (!artist) {
    const m = title.match(/^(.+?)\s+[-–—|｜]\s+(.+?)(?:\s+[-–—|｜]\s+.+)?$/);
    if (m) { title = m[1].trim(); artist = m[2].trim(); }
  }
  title = title.replace(/\s*[-–—|｜]\s*(KKBOX|SoundCloud|StreetVoice.*|Bandcamp|LINE MUSIC.*)$/i, '').trim();
  artist = artist.replace(/\s*[-–—|｜]\s*(KKBOX|SoundCloud|StreetVoice.*|Bandcamp|LINE MUSIC.*)$/i, '').trim();
  return { title, artist, album: '', image, source: new URL(meta.finalUrl || target.href).hostname.replace(/^www\./, '') };
}

async function musicMeta(request, url) {
  const denied = guard(request, url);
  if (denied) return denied;
  const target = targetOf(url);
  if (!target) return error(400, 'invalid_url');
  const lang = request.headers.get('accept-language') || '';
  const host = target.hostname.replace(/^www\./, '');
  try {
    let info = null;
    if (/(^|\.)spotify\.com$/.test(host)) info = await spotify(target, lang);
    else if (/(^|\.)music\.apple\.com$|(^|\.)itunes\.apple\.com$/.test(host)) info = await appleMusic(target);
    else if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) info = await youtube(target);
    if (!info || !info.image) info = { ...(await generic(target, lang)), ...(info || {}) };
    if (!info.title && !info.image) return error(404, 'not_found');
    return json(info);
  } catch (e) {
    return error(502, 'fetch_failed');
  }
}

async function searchSongs(request, url) {
  const denied = guard(request, url);
  if (denied) return denied;
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return error(400, 'empty');
  const cc = /^[a-z]{2}$/i.test(url.searchParams.get('country') || '') ? url.searchParams.get('country') : 'tw';
  try {
    const data = await getJson(`https://itunes.apple.com/search?media=music&entity=song&limit=10&country=${cc}&term=${encodeURIComponent(q)}`);
    return json({
      results: (data.results || []).map((r) => ({
        title: r.trackName, artist: r.artistName, album: r.collectionName,
        image: bigArtwork(r.artworkUrl100), thumb: r.artworkUrl100, year: (r.releaseDate || '').slice(0, 4),
        source: 'Apple Music',
      })),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'fetch_failed', detail: String(e && e.message) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
}
