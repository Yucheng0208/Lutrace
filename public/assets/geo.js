/* 地點（OpenStreetMap Nominatim 反查）與天氣（Open-Meteo）自動偵測 */
(function () {
  'use strict';

  /* ---------- 反查地名 ---------- */

  // Nominatim 使用規範：每秒最多 1 次請求，並快取結果
  const geoCache = new Map();
  let queue = Promise.resolve();
  let lastCall = 0;

  function throttled(fn) {
    const run = queue.then(async () => {
      const wait = lastCall + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      return fn();
    });
    queue = run.catch(() => {});
    return run;
  }

  async function reverseGeocode(lat, lon, lang) {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)},${lang}`;
    if (geoCache.has(key)) return geoCache.get(key);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1`
      + `&lat=${lat}&lon=${lon}&accept-language=${encodeURIComponent(lang)}`;
    const p = throttled(async () => {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`geocode ${res.status}`);
      const json = await res.json();
      return json.address || null;
    });
    geoCache.set(key, p);
    p.catch(() => geoCache.delete(key));
    return p;
  }

  /**
   * 把 Nominatim 的 address 組成顯示字串
   * format: country-city | city-district | full | city
   * 中文、日文由大到小以空白分隔（臺灣 新北市）；英文由小到大以逗號分隔（New Taipei, Taiwan）
   */
  function formatPlace(a, format, uiLang) {
    if (!a) return '';
    let country = a.country || '';
    if (!country && a.country_code) {
      try { country = new Intl.DisplayNames([uiLang], { type: 'region' }).of(a.country_code.toUpperCase()); } catch (e) { /* ignore */ }
    }
    const city = a.city || a.municipality || a.county || a.state || a.province || a.region || a.town || a.village || '';
    let district = a.city_district || a.suburb || a.district || a.borough || a.town || a.village || a.quarter || '';
    if (district === city) district = '';
    let parts;
    switch (format) {
      case 'city-district': parts = [city, district]; break;
      case 'full': parts = [country, city, district]; break;
      case 'city': parts = [city || country]; break;
      default: parts = [country, city];
    }
    parts = parts.filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
    if (uiLang === 'en') return parts.reverse().join(', ');
    return parts.join(' ');
  }

  /* ---------- 天氣 ---------- */

  const weatherCache = new Map();

  // WMO weather code → 內部天氣代碼
  function codeToKey(code) {
    if (code == null) return '';
    if (code <= 1) return 'clear';
    if (code === 2) return 'partly';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunder';
    return '';
  }

  /**
   * 依座標與「當地時間」查詢該小時天氣
   * @param dateStr YYYY-MM-DD   @param hour 0-23
   * @returns { key, temp } temp 為攝氏
   */
  async function weatherAt(lat, lon, dateStr, hour) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${dateStr}`;
    if (!weatherCache.has(key)) {
      const daysAgo = (Date.now() - new Date(`${dateStr}T12:00:00`).getTime()) / 86400000;
      const host = daysAgo > 5 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
      const url = `${host}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
        + `&start_date=${dateStr}&end_date=${dateStr}&hourly=weather_code,temperature_2m&timezone=auto`;
      const p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`weather ${r.status}`);
        return r.json();
      });
      weatherCache.set(key, p);
      p.catch(() => weatherCache.delete(key));
    }
    const json = await weatherCache.get(key);
    const h = json.hourly;
    if (!h || !h.time) return null;
    const i = Math.min(Math.max(hour, 0), h.time.length - 1);
    const temp = h.temperature_2m[i];
    return { key: codeToKey(h.weather_code[i]), temp: temp == null ? '' : Math.round(temp) };
  }

  /* ---------- 目前位置 ---------- */

  // 多張相片共用同一次定位結果（10 分鐘內），只會詢問一次權限
  let positionPromise = null;
  let positionAt = 0;
  function currentPosition() {
    if (positionPromise && Date.now() - positionAt < 600000) return positionPromise;
    positionAt = Date.now();
    positionPromise = requestPosition();
    positionPromise.catch(() => { positionPromise = null; });
    return positionPromise;
  }

  function requestPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        reject,
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
      );
    });
  }

  function formatCoords(lat, lon) {
    if (lat == null || lon == null) return '';
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lon).toFixed(4)}°${ew}`;
  }

  function parseCoords(text) {
    const m = String(text).match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?/i);
    if (!m) return null;
    let lat = parseFloat(m[1]), lon = parseFloat(m[3]);
    if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat);
    if (m[4] && /w/i.test(m[4])) lon = -Math.abs(lon);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  }

  window.Geo = { reverseGeocode, formatPlace, weatherAt, currentPosition, formatCoords, parseCoords };
})();
