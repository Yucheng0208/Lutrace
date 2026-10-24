/* 光痕：第 13–30 款模板（照片＋底部播放列、卡帶、歌單、歌詞、小工具、登機證、收據、郵票、明信片、報紙、聊天、掌機、電視、幻燈片、展覽、貼紙、貼文、天氣卡）
 * 一樣以「照片短邊 ≈ 1000 單位」設計；工具函式來自 templates.js 的 Templates.kit
 */
(function () {
  'use strict';

  const {
    F, mix, alpha, lum, ink, tone, rr, setFont, spacing, clip, wrap, fitWrap, fitSize, text, lines,
    shadow, noShadow, rand, hashStr, blurred, cover, weatherIcon, icon, barcode, dateStamp, paperNoise,
    weatherText, artistOf, slotDims, T, A, accentPaint,
  } = Templates.kit;
  const def = Templates.define;
  const PI2 = Math.PI * 2;
  const pad2 = (n) => String(n ?? 0).padStart(2, '0');

  /** 毛玻璃面板：用照片的模糊版本鋪底 */
  function glass(ctx, d, L, x, y, w, h, r, tint) {
    ctx.save();
    rr(ctx, x, y, w, h, r); ctx.clip();
    if (d.still) cover(ctx, blurred(d.still, L.W, L.H, 10), 0, 0, L.W, L.H);
    ctx.fillStyle = tint; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  /** 小縮圖（用照片的靜態版本，影片時不會跟著播放） */
  function thumb(ctx, d, x, y, s, r) {
    ctx.save(); rr(ctx, x, y, s, s, r); ctx.clip();
    if (d.still) cover(ctx, d.still, x, y, s, s); else { ctx.fillStyle = d.accent; ctx.fill(); }
    ctx.restore();
  }
  /** 會跳動的等化器 */
  function eq(ctx, x, y, w, h, color, t, n = 4) {
    const bw = w / (n * 1.6);
    for (let i = 0; i < n; i++) {
      const v = 0.25 + 0.75 * Math.abs(Math.sin(t * (3.1 + i * 0.9) + i * 1.7));
      rr(ctx, x + i * bw * 1.6, y + h * (1 - v), bw, h * v, bw / 2); ctx.fillStyle = color; ctx.fill();
    }
  }
  function progressBar(ctx, x, y, w, h, p, track, fill, knob) {
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = track; ctx.fill();
    rr(ctx, x, y, Math.max(h, w * p), h, h / 2); ctx.fillStyle = fill; ctx.fill();
    if (knob) { ctx.beginPath(); ctx.arc(x + w * p, y + h / 2, h * 1.6, 0, PI2); ctx.fillStyle = fill; ctx.fill(); }
  }
  function controls(ctx, cx, cy, s, color, onPlay, playing) {
    icon(ctx, 'prev', cx - s * 2.1, cy, s * 0.8, color);
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.95, 0, PI2); ctx.fillStyle = color; ctx.fill();
    icon(ctx, playing ? 'pause' : 'play', cx + (playing ? 0 : s * 0.08), cy, s * 0.7, onPlay);
    icon(ctx, 'next', cx + s * 2.1, cy, s * 0.8, color);
  }
  const quoteOr = (d) => d.quote || T(d, '今天的主打歌', 'Track of the day');

  /* ---------- 13. 照片＋底部播放列 ---------- */
  def({
    id: 'miniplayer', zh: '照片＋播放列', en: 'Photo + Player', tag: 'music', ratio: null, suggest: '4/5', anim: true,
    layout(a, sk) {
      const [w, h] = slotDims(a);
      const glassy = sk && sk.mode === 'glass';
      return { W: w, H: glassy ? h : h + 330, slot: { x: 0, y: 0, w, h, r: 0 } };
    },
    draw(ctx, L, d, photo, sk) {
      const an = A(d);
      const glassy = sk.mode === 'glass';
      const W = L.W;
      photo();
      let y0, fg, mute, bgc;
      if (glassy) {
        y0 = L.H - 330 - 40;
        glass(ctx, d, L, 40, y0, W - 80, 330, 56, 'rgba(20,20,24,.38)');
        fg = '#fff'; mute = 'rgba(255,255,255,.72)'; bgc = null;
      } else {
        y0 = L.slot.h;
        bgc = sk.dark ? sk.paper : mix(sk.paper, '#ffffff', 0.4);
        ctx.fillStyle = bgc; ctx.fillRect(0, y0, W, 330);
        fg = ink(bgc, '#141414', '#ffffff'); mute = alpha(fg, 0.58);
      }
      const px = glassy ? 90 : 60;
      thumb(ctx, d, px, y0 + 45, 150, 22);
      const ctlW = 320;
      text(ctx, quoteOr(d), px + 185, y0 + 108, { size: 48, weight: 700, color: fg, max: W - px * 2 - 185 - ctlW, min: 30 });
      text(ctx, artistOf(d), px + 185, y0 + 165, { size: 36, color: mute, max: W - px * 2 - 185 - ctlW });
      controls(ctx, W - px - 140, y0 + 118, 46, fg, bgc || '#111', an.playing);
      progressBar(ctx, px, y0 + 238, W - px * 2, 10, an.progress, alpha(fg, 0.2), fg, true);
      text(ctx, an.elapsed, px, y0 + 296, { size: 30, color: mute });
      const right = [weatherText(d), d.location].filter(Boolean).join('  ·  ');
      if (right) text(ctx, right, W / 2, y0 + 296, { size: 30, color: mute, align: 'center', max: W - px * 2 - 320 });
      text(ctx, an.remain, W - px, y0 + 296, { size: 30, color: mute, align: 'right' });
    },
  });

  /* ---------- 14. 卡帶 ---------- */
  def({
    id: 'cassette', zh: '卡帶', en: 'Cassette', tag: 'music', ratio: 1, anim: true,
    layout() { return { W: 1400, H: 2140, slot: { x: 200, y: 140, w: 1000, h: 1000, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const an = A(d);
      const bg = sk.bg;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const fgBg = ink(bg, '#1a1a1a', '#f2f2f2');
      // 卡帶盒封面（J-card）
      shadow(ctx, 'rgba(0,0,0,.28)', 40, 0, 18);
      ctx.fillStyle = '#fff'; ctx.fillRect(170, 110, 1060, 1150);
      noShadow(ctx);
      photo();
      ctx.fillStyle = accentPaint(ctx, d, 200, 1150, 1000, 80); ctx.fillRect(200, 1150, 1000, 80);
      text(ctx, `${(d.album || 'MIXTAPE').toUpperCase()}  ·  ${quoteOr(d)}`, 230, 1203, { size: 34, weight: 700, color: ink(d.accent), max: 940, ls: 2 });
      // 卡帶本體
      const bx = 150, by = 1340, bw = 1100, bh = 680;
      const body = sk.dark ? 'rgba(40,40,48,.94)' : mix(sk.paper, sk.deep, 0.35);
      shadow(ctx, 'rgba(0,0,0,.3)', 30, 0, 14);
      rr(ctx, bx, by, bw, bh, 46); ctx.fillStyle = body; ctx.fill();
      noShadow(ctx);
      const bInk = sk.dark ? '#f2f2f2' : '#2a2a2a';
      // 標籤
      rr(ctx, bx + 70, by + 60, bw - 140, 400, 24); ctx.fillStyle = '#fffaf0'; ctx.fill();
      ctx.fillStyle = d.accent; ctx.fillRect(bx + 70, by + 380, bw - 140, 22);
      ctx.fillStyle = mix(d.accent, '#ffd166', 0.5); ctx.fillRect(bx + 70, by + 408, bw - 140, 22);
      text(ctx, 'A', bx + 115, by + 150, { size: 80, weight: 900, color: '#2a2a2a', fam: F.round });
      text(ctx, quoteOr(d), bx + 190, by + 140, { size: 60, fam: F.hand, weight: 700, color: '#2a2a2a', max: bw - 400 });
      text(ctx, [d.date, d.location].filter(Boolean).join('  ·  ') || '90 min', bx + 190, by + 200, { size: 32, fam: F.mono, color: '#555', max: bw - 330 });
      text(ctx, '90', bx + bw - 110, by + 150, { size: 40, weight: 700, color: '#2a2a2a', fam: F.mono, align: 'right' });
      // 視窗與捲軸
      const wx = bx + 230, wy = by + 230, ww = bw - 460, wh = 130;
      rr(ctx, wx, wy, ww, wh, 65); ctx.fillStyle = '#1b1b1f'; ctx.fill();
      const cy = wy + wh / 2;
      const leftR = 46 + 30 * (1 - an.progress), rightR = 46 + 30 * an.progress;
      ctx.fillStyle = '#5a3a28';
      ctx.beginPath(); ctx.arc(wx + 110, cy, Math.min(leftR, 62), 0, PI2); ctx.fill();
      ctx.beginPath(); ctx.arc(wx + ww - 110, cy, Math.min(rightR, 62), 0, PI2); ctx.fill();
      for (const [x, dir] of [[wx + 110, 1], [wx + ww - 110, 1]]) {
        ctx.save(); ctx.translate(x, cy); ctx.rotate(an.t * 4 * dir);
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, PI2); ctx.fillStyle = '#f4f2ee'; ctx.fill();
        ctx.fillStyle = '#1b1b1f';
        for (let i = 0; i < 6; i++) { ctx.rotate(PI2 / 6); ctx.fillRect(-5, 14, 10, 20); }
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, PI2); ctx.fill();
        ctx.restore();
      }
      // 下方梯形與螺絲
      ctx.beginPath(); ctx.moveTo(bx + 230, by + bh); ctx.lineTo(bx + 290, by + bh - 150); ctx.lineTo(bx + bw - 290, by + bh - 150); ctx.lineTo(bx + bw - 230, by + bh); ctx.closePath();
      ctx.fillStyle = alpha(bInk, 0.12); ctx.fill();
      for (const [x, y] of [[bx + 40, by + 40], [bx + bw - 40, by + 40], [bx + 40, by + bh - 40], [bx + bw - 40, by + bh - 40], [bx + bw / 2, by + bh - 60]]) {
        ctx.beginPath(); ctx.arc(x, y, 14, 0, PI2); ctx.fillStyle = alpha(bInk, 0.35); ctx.fill();
      }
      text(ctx, `${an.elapsed} / ${an.total}`, L.W / 2, L.H - 50, { size: 30, color: alpha(fgBg, 0.6), fam: F.mono, align: 'center' });
    },
  });

  /* ---------- 15. 歌單 ---------- */
  def({
    id: 'playlist', zh: '歌單', en: 'Playlist', tag: 'music', ratio: 1, anim: true,
    layout() { return { W: 1240, H: 2204, slot: { x: 300, y: 200, w: 640, h: 640, r: 16 } }; },
    draw(ctx, L, d, photo, sk) {
      const an = A(d);
      const dark = !!sk.dark;
      const top = dark ? mix(sk.deep, '#121212', 0.5) : sk.bg;
      const base = dark ? mix(sk.paper, '#000000', 0.3) : mix(sk.paper, '#ffffff', 0.55);
      const g = ctx.createLinearGradient(0, 0, 0, 1100);
      g.addColorStop(0, top); g.addColorStop(1, base);
      ctx.fillStyle = base; ctx.fillRect(0, 0, L.W, L.H);
      ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, 1100);
      const fg = dark ? '#ffffff' : sk.ink, mute = alpha(fg, 0.6);
      const hi = dark ? mix(sk.deep, '#ffffff', 0.35) : mix(sk.deep, '#000000', 0.1);
      icon(ctx, 'chevron', 100, 110, 50, fg, { lw: 7 });
      shadow(ctx, 'rgba(0,0,0,.45)', 60, 0, 24);
      rr(ctx, 300, 200, 640, 640, 16); ctx.fillStyle = '#000'; ctx.fill(); noShadow(ctx);
      photo();
      text(ctx, d.album || T(d, '我的回憶', 'My Memories'), 90, 960, { size: 66, weight: 900, color: fg, max: 1060 });
      text(ctx, [artistOf(d), d.date].filter(Boolean).join('  ·  '), 90, 1022, { size: 34, color: mute, max: 860 });
      icon(ctx, 'heart', 110, 1110, 52, hi, { fill: true });
      icon(ctx, 'dots', 220, 1110, 56, mute);
      icon(ctx, 'shuffle', 970, 1110, 56, hi, { lw: 6 });
      ctx.beginPath(); ctx.arc(1100, 1110, 70, 0, PI2); ctx.fillStyle = hi; ctx.fill();
      icon(ctx, an.playing ? 'pause' : 'play', 1100, 1110, 54, ink(hi));
      const fillers = T(d, ['晚風', '慢慢走', '有你的季節', '城市夜光'], ['Evening Breeze', 'Slow Walk', 'Your Season', 'City Lights']);
      const tracks = [
        [quoteOr(d), artistOf(d)], [d.location, weatherText(d)], [weatherText(d) && T(d, `今天${d.weather}`, `${d.weather} today`), d.location],
        [d.camera, d.shot], [[d.date, d.time].filter(Boolean).join(' '), artistOf(d)],
      ].filter((r) => r[0]);
      while (tracks.length < 6) tracks.push([fillers[tracks.length % fillers.length], artistOf(d)]);
      const r = rand(hashStr(tracks.map((x) => x[0]).join('')));
      tracks.slice(0, 6).forEach(([tt, sub], i) => {
        const y = 1230 + i * 150;
        const on = i === 0;
        rr(ctx, 90, y, 110, 110, 10);
        ctx.fillStyle = on ? accentPaint(ctx, d, 90, y, 110, 110) : alpha(fg, 0.1); ctx.fill();
        if (on) eq(ctx, 113, y + 25, 64, 60, '#fff', an.t);
        else { setFont(ctx, 40, F.round, 700); text(ctx, String(i + 1), 145, y + 70, { size: 40, weight: 700, color: mute, align: 'center', fam: F.round }); }
        text(ctx, tt, 235, y + 52, { size: 44, weight: 700, color: on ? hi : fg, max: 760 });
        text(ctx, sub || '', 235, y + 100, { size: 32, color: mute, max: 760 });
        text(ctx, `${2 + Math.floor(r() * 3)}:${pad2(Math.floor(r() * 60))}`, 1150, y + 72, { size: 32, color: mute, align: 'right', fam: F.mono });
      });
    },
  });

  /* ---------- 16. 歌詞卡 ---------- */
  def({
    id: 'lyrics', zh: '歌詞卡', en: 'Lyrics', tag: 'music', ratio: 1, anim: true,
    layout() { return { W: 1240, H: 2204, slot: { x: 90, y: 150, w: 220, h: 220, r: 18 } }; },
    draw(ctx, L, d, photo, sk) {
      const an = A(d);
      const light = false;
      if (sk.mode === 'blur' && d.still) {
        cover(ctx, blurred(d.still, L.W, L.H, 12), 0, 0, L.W, L.H);
        ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fillRect(0, 0, L.W, L.H);
      } else {
        const g = ctx.createLinearGradient(0, 0, L.W, L.H);
        if (sk.dark) { g.addColorStop(0, '#1d1b22'); g.addColorStop(1, '#0b0b0d'); }
        else { g.addColorStop(0, tone(d.accent, 0.45, 0.7)); g.addColorStop(1, tone(d.accent, 0.22, 0.6)); }
        ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
      }
      const fg = light ? '#141414' : '#ffffff';
      photo();
      text(ctx, quoteOr(d), 350, 240, { size: 48, weight: 700, color: fg, max: 800 });
      text(ctx, artistOf(d), 350, 305, { size: 36, color: alpha(fg, 0.65), max: 800 });
      const lyr = [
        quoteOr(d),
        d.location && T(d, `在${d.location}`, `in ${d.location}`),
        weatherText(d) && T(d, `天氣${d.weather}，${d.temp || '剛剛好'}`, `${d.weather}, ${d.temp || 'just right'}`),
        d.time && T(d, `${d.time} 的光`, `the light at ${d.time}`),
        d.date && T(d, `記住 ${d.date}`, `remember ${d.date}`),
        T(d, '把這一刻唱成歌', 'sing this moment'),
      ].filter(Boolean).slice(0, 5);
      const cur = Math.floor(an.t / 2.2) % lyr.length;
      let y = 620;
      lyr.forEach((l, i) => {
        const f = fitWrap(ctx, l, 1060, 84, F.sans, 900, 2, 54);
        lines(ctx, f.lines, 90, y, f.size * 1.2, { size: f.size, weight: 900, color: i === cur ? fg : alpha(fg, light ? 0.3 : 0.35) });
        y += f.lines.length * f.size * 1.2 + 60;
      });
      progressBar(ctx, 90, 1930, 1060, 10, an.progress, alpha(fg, 0.25), fg, true);
      text(ctx, an.elapsed, 90, 1995, { size: 30, color: alpha(fg, 0.65) });
      text(ctx, an.remain, 1150, 1995, { size: 30, color: alpha(fg, 0.65), align: 'right' });
      controls(ctx, 620, 2100, 46, fg, light ? '#fff' : '#111', an.playing);
    },
  });

  /* ---------- 17. 音樂小工具 ---------- */
  def({
    id: 'widget', zh: '音樂小工具', en: 'Music Widget', tag: 'music', ratio: 1, anim: true,
    layout() { return { W: 1200, H: 1700, slot: { x: 150, y: 330, w: 900, h: 900, r: [70, 70, 0, 0] } }; },
    draw(ctx, L, d, photo, sk) {
      const an = A(d);
      const dark = !!sk.dark;
      const g = ctx.createLinearGradient(0, 0, L.W, L.H);
      g.addColorStop(0, tone(d.accent, dark ? 0.2 : 0.8)); g.addColorStop(1, tone(mix(d.accent, '#7a5cff', 0.5), dark ? 0.1 : 0.66));
      ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
      const ghost = dark ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.45)';
      for (let i = 0; i < 4; i++) { rr(ctx, 150 + i * 240, 110, 180, 180, 44); ctx.fillStyle = ghost; ctx.fill(); }
      for (let i = 0; i < 4; i++) { rr(ctx, 150 + i * 240, 1520, 180, 180, 44); ctx.fillStyle = ghost; ctx.fill(); }
      shadow(ctx, 'rgba(0,0,0,.3)', 50, 0, 20);
      rr(ctx, 150, 330, 900, 1150, 70); ctx.fillStyle = dark ? mix(sk.paper, '#ffffff', 0.05) : mix(sk.paper, '#ffffff', 0.6); ctx.fill(); noShadow(ctx);
      photo();
      const fg = dark ? '#fff' : sk.ink;
      text(ctx, quoteOr(d), 210, 1305, { size: 50, weight: 700, color: fg, max: 620 });
      text(ctx, artistOf(d), 210, 1360, { size: 34, color: alpha(fg, 0.6), max: 620 });
      ctx.beginPath(); ctx.arc(960, 1320, 62, 0, PI2); ctx.fillStyle = accentPaint(ctx, d, 898, 1258, 124, 124); ctx.fill();
      icon(ctx, an.playing ? 'pause' : 'play', 962, 1320, 50, ink(d.accent));
      progressBar(ctx, 210, 1412, 780, 10, an.progress, alpha(fg, 0.15), d.accent, false);
    },
  });

  /* ---------- 18. 登機證 ---------- */
  def({
    id: 'boarding', zh: '登機證', en: 'Boarding Pass', tag: 'fun', ratio: null, suggest: '4/3',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 200, H: h + 230 + 260 + 480 + 420, slot: { x: 100, y: 330, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const dark = !!sk.dark;
      const bg = dark ? '#0d0d12' : tone(d.accent, 0.55, 0.5);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const s = L.slot;
      const x0 = 60, y0 = 100, w = L.W - 120, h = L.H - 200;
      const paper = dark ? mix(sk.paper, '#ffffff', 0.04) : mix(sk.paper, '#ffffff', 0.7);
      const fg = dark ? '#f4f4f6' : sk.ink, mute = alpha(fg, 0.5);
      const acc = dark ? mix(sk.deep, '#ffffff', 0.3) : mix(sk.deep, '#000000', 0.12);
      shadow(ctx, 'rgba(0,0,0,.3)', 50, 0, 20);
      rr(ctx, x0, y0, w, h, 40); ctx.fillStyle = paper; ctx.fill(); noShadow(ctx);
      rr(ctx, x0, y0, w, 200, [40, 40, 0, 0]); ctx.fillStyle = d.accent2 ? accentPaint(ctx, d, x0, y0, w, 200) : acc; ctx.fill();
      text(ctx, T(d, '登機證  BOARDING PASS', 'BOARDING PASS'), x0 + 40, y0 + 92, { size: 46, weight: 900, color: '#fff', ls: 3, max: w - 300 });
      text(ctx, `${d.album || 'LUTRACE'} AIR`.toUpperCase(), x0 + 40, y0 + 150, { size: 30, color: 'rgba(255,255,255,.8)', fam: F.mono, ls: 2, max: w - 300 });
      ctx.save(); ctx.translate(x0 + w - 110, y0 + 100); ctx.rotate(-0.5);
      ctx.fillStyle = '#fff'; ctx.beginPath();
      ctx.moveTo(-70, 0); ctx.lineTo(60, -10); ctx.quadraticCurveTo(80, 0, 60, 10); ctx.lineTo(-70, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-30, -60); ctx.lineTo(-10, -60); ctx.lineTo(30, -4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-30, 60); ctx.lineTo(-10, 60); ctx.lineTo(30, 4); ctx.fill();
      ctx.restore();
      photo();
      let y = s.y + s.h + 110;
      const from = d.location || T(d, '這裡', 'HERE'), to = T(d, '回憶', 'MEMORIES');
      text(ctx, 'FROM', s.x, y - 50, { size: 26, color: mute, fam: F.mono, ls: 3 });
      text(ctx, from, s.x, y + 30, { size: 80, weight: 900, color: fg, max: s.w * 0.42 });
      text(ctx, 'TO', s.x + s.w, y - 50, { size: 26, color: mute, fam: F.mono, ls: 3, align: 'right' });
      text(ctx, to, s.x + s.w, y + 30, { size: 80, weight: 900, color: fg, max: s.w * 0.42, align: 'right' });
      ctx.strokeStyle = alpha(fg, 0.3); ctx.setLineDash([10, 12]); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.x + s.w * 0.43, y); ctx.lineTo(s.x + s.w * 0.57, y); ctx.stroke(); ctx.setLineDash([]);
      y += 130;
      const cells = [
        ['PASSENGER', artistOf(d)], ['FLIGHT', `LT${pad2(d.mo)}${pad2(d.day)}`], ['DATE', d.date],
        ['BOARDING', d.time], ['GATE', d.weather], ['SEAT', `${d.day || 24}A`],
      ].filter((c) => c[1]);
      const cw = s.w / 3;
      cells.forEach(([k, v], i) => {
        const cx = s.x + (i % 3) * cw, cy = y + Math.floor(i / 3) * 140;
        text(ctx, k, cx, cy, { size: 24, color: mute, fam: F.mono, ls: 3 });
        text(ctx, v, cx, cy + 56, { size: 44, weight: 700, color: fg, max: cw - 30 });
      });
      const py = y0 + h - 300;
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      for (const x of [x0, x0 + w]) { ctx.beginPath(); ctx.arc(x, py, 40, 0, PI2); ctx.fill(); }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H); ctx.restore();
      ctx.strokeStyle = alpha(fg, 0.25); ctx.setLineDash([14, 14]); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x0 + 60, py); ctx.lineTo(x0 + w - 60, py); ctx.stroke(); ctx.setLineDash([]);
      if (d.quote) text(ctx, `“${d.quote}”`, s.x, py + 90, { size: 40, weight: 700, color: fg, max: s.w * 0.55 });
      barcode(ctx, s.x + s.w * 0.6, py + 50, s.w * 0.4, 150, d.quote + d.date, fg);
    },
  });

  /* ---------- 19. 收據 ---------- */
  def({
    id: 'receipt', zh: '收據', en: 'Receipt', tag: 'fun', ratio: null, suggest: '1',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 400, H: h + 1380, slot: { x: 200, y: 520, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const bg = sk.bg;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const s = L.slot, px = 110, pw = L.W - 220;
      const paper = '#fbfaf5', fg = '#222';
      shadow(ctx, 'rgba(0,0,0,.25)', 40, 0, 16);
      ctx.beginPath(); ctx.moveTo(px, 100);
      const n = Math.round(pw / 40);
      for (let i = 0; i <= n; i++) ctx.lineTo(px + (pw * i) / n, 100 + (i % 2 ? 20 : 0));
      for (let i = n; i >= 0; i--) ctx.lineTo(px + (pw * i) / n, L.H - 100 - (i % 2 ? 20 : 0));
      ctx.closePath(); ctx.fillStyle = paper; ctx.fill(); noShadow(ctx);
      const cx = L.W / 2;
      text(ctx, (d.album || T(d, '光痕 回憶商店', 'LUTRACE MART')).toUpperCase(), cx, 230, { size: 56, weight: 700, color: fg, fam: F.mono, align: 'center', max: pw - 120 });
      text(ctx, [d.date, d.time].filter(Boolean).join('  ') || '— — —', cx, 300, { size: 32, color: '#555', fam: F.mono, align: 'center' });
      text(ctx, d.location || '', cx, 350, { size: 32, color: '#555', fam: F.mono, align: 'center', max: pw - 120 });
      const dash = (y) => text(ctx, '-'.repeat(60), cx, y, { size: 30, color: '#999', fam: F.mono, align: 'center', max: pw - 100 });
      dash(440);
      photo();
      let y = s.y + s.h + 100;
      const items = [
        [quoteOr(d), '∞'], [weatherText(d) && `${T(d, '天氣', 'WEATHER')} ${weatherText(d)}`, '0'],
        [d.camera, '1'], [T(d, '好心情', 'GOOD MOOD'), '100%'],
      ].filter((r) => r[0]);
      items.forEach(([k, v]) => {
        text(ctx, k, px + 70, y, { size: 36, color: fg, fam: F.mono, max: pw - 300 });
        text(ctx, v, px + pw - 70, y, { size: 36, color: fg, fam: F.mono, align: 'right' });
        y += 62;
      });
      dash(y); y += 80;
      text(ctx, 'TOTAL', px + 70, y, { size: 50, weight: 700, color: fg, fam: F.mono });
      text(ctx, T(d, '愛', 'LOVE'), px + pw - 70, y, { size: 50, weight: 700, color: fg, fam: F.mono, align: 'right' });
      y += 90;
      text(ctx, T(d, '謝謝光臨 ♥ 下次再來', 'THANK YOU ♥ COME AGAIN'), cx, y, { size: 34, color: fg, fam: F.mono, align: 'center', max: pw - 120 });
      barcode(ctx, px + 120, y + 50, pw - 240, 110, d.quote + d.date, fg);
    },
  });

  /* ---------- 20. 郵票 ---------- */
  def({
    id: 'stamp', zh: '郵票', en: 'Stamp', tag: 'photo', ratio: null, suggest: '4/5',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 420, H: h + 420, slot: { x: 210, y: 210, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const bg = sk.bg;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      if (sk.id === 'oat') paperNoise(ctx, 0, 0, L.W, L.H, 4, 'rgba(90,60,20,.08)', 2500);
      const s = L.slot;
      const x0 = s.x - 70, y0 = s.y - 70, w = s.w + 140, h = s.h + 140;
      shadow(ctx, 'rgba(0,0,0,.22)', 24, 4, 10);
      ctx.fillStyle = '#fffdf8'; ctx.fillRect(x0, y0, w, h); noShadow(ctx);
      // 齒孔
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      const r = 18, step = 52;
      for (let x = x0; x <= x0 + w + 1; x += w / Math.round(w / step)) { for (const y of [y0, y0 + h]) { ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill(); } }
      for (let y = y0; y <= y0 + h + 1; y += h / Math.round(h / step)) { for (const x of [x0, x0 + w]) { ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill(); } }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H); ctx.restore();
      photo();
      ctx.save(); shadow(ctx, 'rgba(0,0,0,.4)', 10);
      text(ctx, `${d.y || 2026}`, s.x + 30, s.y + 80, { size: 64, weight: 900, color: '#fff', fam: F.round });
      text(ctx, (d.location || 'LUTRACE').toUpperCase(), s.x + 30, s.y + s.h - 40, { size: 44, weight: 900, color: '#fff', max: s.w * 0.6, ls: 2 });
      text(ctx, d.temp || '♥', s.x + s.w - 30, s.y + 80, { size: 64, weight: 900, color: '#fff', fam: F.round, align: 'right' });
      ctx.restore();
      // 郵戳
      const pcx = s.x + s.w - 40, pcy = s.y + s.h - 20;
      ctx.save(); ctx.translate(pcx, pcy); ctx.rotate(-0.25);
      ctx.strokeStyle = 'rgba(30,30,60,.7)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(0, 0, 150, 0, PI2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 120, 0, PI2); ctx.stroke();
      text(ctx, d.dateDot || d.date || 'TODAY', 0, 14, { size: 34, weight: 700, color: 'rgba(30,30,60,.75)', fam: F.mono, align: 'center', max: 210 });
      text(ctx, (d.weather || 'POST').toUpperCase(), 0, -50, { size: 28, weight: 700, color: 'rgba(30,30,60,.75)', fam: F.mono, align: 'center', max: 190 });
      text(ctx, d.time || '★', 0, 70, { size: 28, weight: 700, color: 'rgba(30,30,60,.75)', fam: F.mono, align: 'center' });
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        for (let x = 170; x <= 420; x += 10) ctx[x === 170 ? 'moveTo' : 'lineTo'](x, -60 + i * 40 + Math.sin(x / 22) * 10);
        ctx.stroke();
      }
      ctx.restore();
      if (d.quote) text(ctx, d.quote, L.W / 2, L.H - 60, { size: 48, fam: F.hand, weight: 700, color: ink(bg, '#2b2b2b', '#f2f2f2'), align: 'center', max: L.W - 160 });
    },
  });

  /* ---------- 21. 明信片 ---------- */
  def({
    id: 'postcard', zh: '明信片', en: 'Postcard', tag: 'photo', ratio: null, suggest: '3/2',
    layout(a) { const [w, h] = slotDims(a); const H = Math.max(h, 1000); return { W: w + 1000, H: H + 160, slot: { x: 80, y: 80 + (H - h) / 2, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const dark = !!sk.dark;
      const paper = sk.paper;
      const fg = sk.ink;
      ctx.fillStyle = paper; ctx.fillRect(0, 0, L.W, L.H);
      if (!dark) paperNoise(ctx, 0, 0, L.W, L.H, 21, 'rgba(0,0,0,.03)', 2000);
      const s = L.slot;
      photo();
      const rx = s.x + s.w + 80, rw = L.W - rx - 80;
      text(ctx, 'POST CARD', rx, 190, { size: 76, color: fg, fam: F.serif, ls: 6, max: rw - 260 });
      // 郵票框
      rr(ctx, rx + rw - 210, 90, 190, 230, 6); ctx.setLineDash([10, 8]); ctx.lineWidth = 4; ctx.strokeStyle = alpha(fg, 0.4); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = accentPaint(ctx, d, rx + rw - 190, 110, 150, 190); ctx.fillRect(rx + rw - 190, 110, 150, 190);
      icon(ctx, 'heart', rx + rw - 115, 205, 80, '#fff', { fill: true });
      ctx.strokeStyle = alpha(fg, 0.25); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(rx, 360); ctx.lineTo(rx + rw, 360); ctx.stroke();
      const lineY = (i) => 470 + i * 110;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(rx, lineY(i) + 16); ctx.lineTo(rx + rw, lineY(i) + 16); ctx.stroke(); }
      const msg = [d.artist ? `To ${d.artist},` : T(d, '給你：', 'Dear you,'), quoteOr(d)];
      const f = fitWrap(ctx, msg[1], rw - 20, 70, F.hand, 700, 2, 44);
      text(ctx, msg[0], rx + 10, lineY(0), { size: 60, fam: F.hand, weight: 700, color: fg, max: rw });
      f.lines.forEach((l, i) => text(ctx, l, rx + 10, lineY(1 + i), { size: f.size, fam: F.hand, weight: 700, color: fg }));
      text(ctx, [d.location, weatherText(d)].filter(Boolean).join(' · '), rx + 10, lineY(3), { size: 48, fam: F.hand, weight: 700, color: alpha(fg, 0.8), max: rw });
      text(ctx, [d.date, d.time].filter(Boolean).join(' '), rx + rw, lineY(4), { size: 48, fam: F.hand, weight: 700, color: alpha(fg, 0.8), align: 'right', max: rw });
    },
  });

  /* ---------- 22. 報紙頭版 ---------- */
  def({
    id: 'newspaper', zh: '報紙頭版', en: 'Newspaper', tag: 'fun', ratio: null, suggest: '4/3',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 200, H: h + 1100, slot: { x: 100, y: 640, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const dark = !!sk.dark;
      const paper = dark ? sk.paper : mix(sk.paper, '#f1ece1', 0.5), fg = sk.ink;
      ctx.fillStyle = paper; ctx.fillRect(0, 0, L.W, L.H);
      if (!dark) paperNoise(ctx, 0, 0, L.W, L.H, 33, 'rgba(0,0,0,.035)', 3000);
      const s = L.slot, x0 = s.x, w = s.w;
      const title = (d.album ? `THE ${d.album}` : T(d, '光痕日報', 'THE DAILY TRACE')).toUpperCase();
      const ts = fitSize(ctx, title, w, 170, F.serif, 400, 70);
      text(ctx, title, L.W / 2, 90 + ts * 0.85, { size: ts, fam: F.serif, color: fg, align: 'center' });
      ctx.fillStyle = fg; ctx.fillRect(x0, 300, w, 6); ctx.fillRect(x0, 372, w, 2);
      text(ctx, [d.dateLong || d.date, d.location, weatherText(d)].filter(Boolean).join('   ·   ').toUpperCase(), L.W / 2, 350, { size: 30, color: fg, fam: F.mono, align: 'center', max: w });
      const f = fitWrap(ctx, quoteOr(d), w, 110, F.serif, 400, 2, 60);
      lines(ctx, f.lines, x0, 400 + f.size, f.size * 1.05, { size: f.size, fam: F.serif, color: fg });
      photo();
      text(ctx, [T(d, '攝影：', 'Photo: ') + (d.camera || artistOf(d)), d.time].filter(Boolean).join(' · '), x0, s.y + s.h + 50, { size: 28, color: alpha(fg, 0.7), fam: F.serif, style: 'italic', max: w });
      const r = rand(hashStr(d.quote || 'news'));
      const cols = 3, gap = 40, cw = (w - gap * (cols - 1)) / cols;
      for (let c = 0; c < cols; c++) {
        let y = s.y + s.h + 110;
        if (c === 0) { text(ctx, T(d, '今日焦點', 'TODAY'), x0, y + 20, { size: 40, weight: 900, color: fg, max: cw }); y += 60; }
        while (y < L.H - 70) {
          const lw = cw * (0.65 + r() * 0.35);
          ctx.fillStyle = alpha(fg, 0.22); ctx.fillRect(x0 + c * (cw + gap), y, lw, 14); y += 34;
        }
      }
    },
  });

  /* ---------- 23. 聊天畫面 ---------- */
  def({
    id: 'chat', zh: '聊天訊息', en: 'Chat', tag: 'fun', ratio: null, suggest: '3/4',
    layout(a) {
      let w = 720, h = 720 / a;
      if (h > 1100) { h = 1100; w = 1100 * a; }
      return { W: 1240, H: h + 1360, slot: { x: 1240 - 70 - w, y: 560, w, h, r: 44 } };
    },
    draw(ctx, L, d, photo, sk) {
      const dark = !!sk.dark;
      const bg = dark ? mix(sk.paper, '#000000', 0.4) : sk.paper;
      const fg = dark ? '#fff' : sk.ink;
      const theirs = dark ? mix(sk.paper, '#ffffff', 0.08) : '#ffffff', mine = sk.dark ? mix(sk.deep, '#ffffff', 0.1) : mix(sk.deep, '#000000', 0.08);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      ctx.fillStyle = dark ? '#18181c' : '#ffffff'; ctx.fillRect(0, 0, L.W, 230);
      icon(ctx, 'chevron', 70, 140, 44, d.accent, { lw: 7 });
      const g = ctx.createLinearGradient(140, 90, 240, 190); g.addColorStop(0, '#ff5c8a'); g.addColorStop(1, '#7a5cff');
      ctx.beginPath(); ctx.arc(200, 140, 56, 0, PI2); ctx.fillStyle = g; ctx.fill();
      const name = d.artist || T(d, '好朋友', 'Bestie');
      text(ctx, [...name][0] || '♥', 200, 158, { size: 50, weight: 900, color: '#fff', align: 'center' });
      text(ctx, name, 285, 132, { size: 46, weight: 700, color: fg, max: 700 });
      text(ctx, T(d, '上線中', 'online'), 285, 182, { size: 30, color: '#34c759' });
      const time = d.time || '';
      if (d.date) { setFont(ctx, 30, F.sans, 500); const pw = ctx.measureText(d.date).width + 60; rr(ctx, 620 - pw / 2, 280, pw, 56, 28); ctx.fillStyle = alpha(fg, 0.08); ctx.fill(); text(ctx, d.date, 620, 318, { size: 30, color: alpha(fg, 0.6), align: 'center' }); }
      const bubble = (str, right, y, color, tc) => {
        setFont(ctx, 42, F.sans, 500);
        const ls = wrap(ctx, str, 760, 3);
        const bw = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 72, bh = ls.length * 58 + 46;
        const x = right ? L.W - 70 - bw : 70;
        rr(ctx, x, y, bw, bh, 44); ctx.fillStyle = color; ctx.fill();
        lines(ctx, ls, x + 36, y + 68, 58, { size: 42, weight: 500, color: tc });
        return y + bh;
      };
      let y = bubble(T(d, '你在哪～？', 'where r u?'), false, 380, theirs, fg);
      photo();
      y = L.slot.y + L.slot.h + 24;
      if (d.quote) y = bubble(d.quote, true, y, mine, '#fff') + 16;
      text(ctx, `${T(d, '已讀', 'Read')} ${time}`, L.W - 80, y + 30, { size: 28, color: alpha(fg, 0.5), align: 'right' });
      y += 60;
      if (d.location || weatherText(d)) {
        rr(ctx, 70, y, 640, 170, 40); ctx.fillStyle = theirs; ctx.fill();
        ctx.beginPath(); ctx.arc(160, y + 85, 50, 0, PI2); ctx.fillStyle = alpha(d.accent, 0.18); ctx.fill();
        icon(ctx, 'pin', 160, y + 85, 54, d.accent, { fill: true, hole: theirs });
        text(ctx, d.location || T(d, '這裡', 'Here'), 235, y + 75, { size: 40, weight: 700, color: fg, max: 450 });
        text(ctx, weatherText(d), 235, y + 128, { size: 32, color: alpha(fg, 0.6), max: 450 });
        y += 190;
      }
      bubble(T(d, '好美！！我也要去 😍', 'omg so pretty 😍'), false, y, theirs, fg);
      ctx.fillStyle = dark ? '#18181c' : '#ffffff'; ctx.fillRect(0, L.H - 150, L.W, 150);
      rr(ctx, 70, L.H - 120, L.W - 240, 84, 42); ctx.strokeStyle = alpha(fg, 0.15); ctx.lineWidth = 3; ctx.stroke();
      text(ctx, T(d, '輸入訊息…', 'Message…'), 110, L.H - 66, { size: 34, color: alpha(fg, 0.4) });
      ctx.beginPath(); ctx.arc(L.W - 100, L.H - 78, 42, 0, PI2); ctx.fillStyle = mine; ctx.fill();
      icon(ctx, 'play', L.W - 96, L.H - 78, 36, '#fff');
    },
  });

  /* ---------- 24. 掌上遊戲機 ---------- */
  def({
    id: 'gameboy', zh: '掌上遊戲機', en: 'Handheld', tag: 'fun', ratio: 10 / 9,
    layout() { return { W: 1400, H: 2300, slot: { x: 145, y: 260, w: 1110, h: 1000, r: 8 } }; },
    draw(ctx, L, d, photo, sk) {
      const body = sk.dark ? sk.paper : mix(sk.paper, sk.deep, 0.25);
      const bInk = sk.dark ? '#f2f2f2' : mix(sk.deep, '#000000', 0.5);
      ctx.fillStyle = tone(d.accent, 0.9, 0.4); ctx.fillRect(0, 0, L.W, L.H);
      shadow(ctx, 'rgba(0,0,0,.3)', 60, 0, 24);
      rr(ctx, 40, 40, 1320, 2220, [50, 50, 220, 50]); ctx.fillStyle = body; ctx.fill(); noShadow(ctx);
      rr(ctx, 95, 150, 1210, 1260, [30, 30, 110, 30]); ctx.fillStyle = '#4a4a55'; ctx.fill();
      text(ctx, 'PIXEL VIBES · STEREO SOUND', 700, 220, { size: 30, color: '#c7c7d6', align: 'center', fam: F.round, ls: 3 });
      ctx.beginPath(); ctx.arc(120 + 10, 700, 14, 0, PI2); ctx.fillStyle = '#ff3b3b'; ctx.fill();
      photo();
      if (d.quote) text(ctx, `♥ ${d.quote}`, 700, 1340, { size: 38, color: '#e6e6f0', align: 'center', max: 1000, fam: F.pixel });
      text(ctx, d.album ? d.album.toUpperCase() : 'LUTRACE', 110, 1520, { size: 70, weight: 900, color: bInk, style: 'italic', fam: F.round, max: 800 });
      text(ctx, 'BOY', 110 + 20 + (setFont(ctx, 70, F.round, 900, 'italic'), Math.min(800, ctx.measureText(d.album ? d.album.toUpperCase() : 'LUTRACE').width)), 1520, { size: 50, weight: 900, color: bInk, style: 'italic', fam: F.round });
      // 十字鍵
      const dx = 330, dy = 1780;
      ctx.fillStyle = '#26262b';
      rr(ctx, dx - 50, dy - 160, 100, 320, 16); ctx.fill();
      rr(ctx, dx - 160, dy - 50, 320, 100, 16); ctx.fill();
      // A / B
      for (const [x, y, l] of [[1120, 1700, 'A'], [940, 1800, 'B']]) {
        ctx.beginPath(); ctx.arc(x, y, 88, 0, PI2); ctx.fillStyle = '#a8174f'; ctx.fill();
        text(ctx, l, x + 70, y + 140, { size: 44, weight: 900, color: bInk, fam: F.round });
      }
      for (const [x, l] of [[560, 'SELECT'], [800, 'START']]) {
        ctx.save(); ctx.translate(x, 2040); ctx.rotate(-0.45);
        rr(ctx, -70, -20, 140, 40, 20); ctx.fillStyle = '#6b6b72'; ctx.fill();
        text(ctx, l, 0, 70, { size: 28, weight: 700, color: bInk, align: 'center', fam: F.round, ls: 2 });
        ctx.restore();
      }
      ctx.save(); ctx.translate(1150, 2080); ctx.rotate(-0.45);
      for (let i = 0; i < 6; i++) { rr(ctx, -120 + i * 44, -90, 18, 180, 9); ctx.fillStyle = alpha('#000', 0.25); ctx.fill(); }
      ctx.restore();
      const meta = [d.date, d.time, weatherText(d)].filter(Boolean).join('  ');
      if (meta) text(ctx, meta, 700, 2210, { size: 30, color: alpha(bInk, 0.7), align: 'center', fam: F.pixel, max: 900 });
    },
  });

  /* ---------- 25. 復古電視 ---------- */
  def({
    id: 'tv', zh: '復古電視', en: 'Retro TV', tag: 'fun', ratio: 4 / 3, anim: true,
    layout() { return { W: 2000, H: 1700, slot: { x: 170, y: 420, w: 1333, h: 1000, r: 60 } }; },
    draw(ctx, L, d, photo, sk) {
      const an = A(d);
      const wall = sk.bg;
      ctx.fillStyle = wall; ctx.fillRect(0, 0, L.W, L.H);
      // 天線
      ctx.strokeStyle = '#333'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(900, 300); ctx.lineTo(650, 60); ctx.moveTo(900, 300); ctx.lineTo(1180, 70); ctx.stroke();
      ctx.beginPath(); ctx.arc(900, 300, 40, Math.PI, 0); ctx.fillStyle = '#333'; ctx.fill();
      const body = sk.mode === 'wood' ? '#8a5a3b' : (sk.dark ? mix(sk.paper, '#ffffff', 0.1) : sk.deep);
      shadow(ctx, 'rgba(0,0,0,.35)', 50, 0, 24);
      rr(ctx, 70, 300, 1860, 1240, 90); ctx.fillStyle = body; ctx.fill(); noShadow(ctx);
      if (sk.mode === 'wood') { ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 6; for (let y = 340; y < 1520; y += 36) { ctx.beginPath(); ctx.moveTo(110, y); ctx.bezierCurveTo(700, y + 20, 1300, y - 20, 1890, y + 6); ctx.stroke(); } }
      rr(ctx, 130, 380, 1413, 1080, 80); ctx.fillStyle = '#1a1a1a'; ctx.fill();
      photo();
      const s = L.slot;
      ctx.save(); rr(ctx, s.x, s.y, s.w, s.h, 60); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let y = s.y; y < s.y + s.h; y += 8) ctx.fillRect(s.x, y, s.w, 3);
      const vg = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, s.h * 0.35, s.x + s.w / 2, s.y + s.h / 2, s.w * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = vg; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.restore();
      ctx.save(); shadow(ctx, 'rgba(0,255,120,.6)', 12);
      text(ctx, `CH ${pad2(d.day || 10)}`, s.x + s.w - 60, s.y + 110, { size: 80, color: '#8dff9e', fam: F.pixel, align: 'right' });
      if (Math.floor(an.t * 2) % 2 === 0) { ctx.beginPath(); ctx.arc(s.x + 80, s.y + 88, 18, 0, PI2); ctx.fillStyle = '#ff4d4d'; ctx.fill(); }
      text(ctx, `PLAY ▶ ${an.elapsed}`, s.x + 115, s.y + 110, { size: 64, color: '#8dff9e', fam: F.pixel });
      if (d.quote) text(ctx, d.quote, s.x + s.w / 2, s.y + s.h - 70, { size: 60, color: '#ffffff', fam: F.pixel, align: 'center', max: s.w - 160 });
      ctx.restore();
      // 右側面板
      const px = 1600;
      for (const [y, rad] of [[520, 95], [800, 95]]) {
        ctx.beginPath(); ctx.arc(px + 170, y, rad, 0, PI2); ctx.fillStyle = '#d8d2c4'; ctx.fill();
        ctx.save(); ctx.translate(px + 170, y); ctx.rotate(an.t * 0.3 + y);
        ctx.fillStyle = '#555'; ctx.fillRect(-10, -rad + 12, 20, 60); ctx.restore();
      }
      for (let i = 0; i < 9; i++) { rr(ctx, px + 60, 980 + i * 42, 220, 18, 9); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill(); }
      const bInk = ink(body, '#2a2218', '#f2ead8');
      text(ctx, [d.date, d.time].filter(Boolean).join(' '), px + 170, 1420, { size: 34, color: bInk, align: 'center', fam: F.pixel, max: 300 });
      ctx.fillStyle = '#222'; ctx.fillRect(300, 1540, 80, 90); ctx.fillRect(1620, 1540, 80, 90);
    },
  });

  /* ---------- 26. 幻燈片 ---------- */
  def({
    id: 'slide', zh: '幻燈片', en: 'Slide', tag: 'photo', ratio: null, suggest: '3/2',
    layout(a) {
      const [w, h] = slotDims(a); const side = Math.max(w, h) + 560;
      return { W: side + 200, H: side + 200, slot: { x: 100 + (side - w) / 2, y: 100 + (side - h) / 2, w, h, r: 14 } };
    },
    draw(ctx, L, d, photo, sk) {
      const g = ctx.createRadialGradient(L.W / 2, L.H / 2, 100, L.W / 2, L.H / 2, L.W * 0.7);
      g.addColorStop(0, '#fffdf6'); g.addColorStop(1, sk.dark ? '#2a2a2e' : mix(sk.bg, '#d9d4c7', 0.5));
      ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
      const side = L.W - 200;
      const mount = sk.paper;
      const mInk = sk.ink;
      shadow(ctx, 'rgba(0,0,0,.3)', 40, 0, 16);
      rr(ctx, 100, 100, side, side, 60); ctx.fillStyle = mount; ctx.fill(); noShadow(ctx);
      photo();
      const s = L.slot;
      ctx.lineWidth = 4; ctx.strokeStyle = alpha(mInk, 0.25); rr(ctx, s.x - 6, s.y - 6, s.w + 12, s.h + 12, 18); ctx.stroke();
      text(ctx, 'LUTRACE  ·  TRANSPARENCY', L.W / 2, 100 + (s.y - 100) / 2 + 14, { size: 36, color: alpha(mInk, 0.7), fam: F.mono, align: 'center', ls: 4, max: side - 160 });
      ctx.save(); ctx.translate(100 + (s.x - 100) / 2 + 12, L.H / 2); ctx.rotate(-Math.PI / 2);
      text(ctx, d.dateDot || d.date || '', 0, 0, { size: 40, color: alpha(mInk, 0.7), fam: F.mono, align: 'center', max: side - 200 });
      ctx.restore();
      ctx.save(); ctx.translate(L.W - 100 - (s.x - 100) / 2 - 12, L.H / 2); ctx.rotate(Math.PI / 2);
      text(ctx, `No. ${pad2(d.day || 24)}  ·  ${d.location || ''}`, 0, 0, { size: 40, color: alpha(mInk, 0.7), fam: F.mono, align: 'center', max: side - 200 });
      ctx.restore();
      if (d.quote) text(ctx, d.quote, L.W / 2, s.y + s.h + (L.H - 100 - s.y - s.h) / 2 + 24, { size: 80, color: sk.dark ? '#fff' : mix(sk.deep, '#000000', 0.3), fam: F.hand, weight: 700, align: 'center', max: side - 160 });
    },
  });

  /* ---------- 27. 美術館展覽 ---------- */
  def({
    id: 'gallery', zh: '美術館', en: 'Gallery', tag: 'fun', ratio: null, suggest: '4/5',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 840, H: h + 1000, slot: { x: 420, y: 380, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const wall = sk.paper;
      ctx.fillStyle = wall; ctx.fillRect(0, 0, L.W, L.H);
      const s = L.slot;
      const sp = ctx.createRadialGradient(L.W / 2, 0, 50, L.W / 2, s.y + s.h / 2, s.h);
      sp.addColorStop(0, 'rgba(255,248,225,.55)'); sp.addColorStop(1, 'rgba(255,248,225,0)');
      ctx.fillStyle = sp; ctx.fillRect(0, 0, L.W, L.H);
      ctx.fillStyle = alpha(sk.dark ? '#000' : '#5a4a3a', 0.12); ctx.fillRect(0, L.H - 160, L.W, 160);
      const mat = 130, fr = 56;
      shadow(ctx, 'rgba(0,0,0,.35)', 50, 10, 26);
      ctx.fillStyle = sk.dark ? '#c9a24d' : '#17161a';
      ctx.fillRect(s.x - mat - fr, s.y - mat - fr, s.w + 2 * (mat + fr), s.h + 2 * (mat + fr));
      noShadow(ctx);
      ctx.fillStyle = '#fbfaf6'; ctx.fillRect(s.x - mat, s.y - mat, s.w + 2 * mat, s.h + 2 * mat);
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 3; ctx.strokeRect(s.x - 6, s.y - 6, s.w + 12, s.h + 12);
      photo();
      const px = s.x + s.w + mat + fr - 520, py = s.y + s.h + mat + fr + 110;
      shadow(ctx, 'rgba(0,0,0,.18)', 12, 2, 6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, 520, 300); noShadow(ctx);
      text(ctx, artistOf(d), px + 36, py + 70, { size: 34, weight: 700, color: '#111', max: 450 });
      text(ctx, quoteOr(d), px + 36, py + 130, { size: 38, color: '#111', fam: F.serif, style: 'italic', max: 450 });
      text(ctx, `${d.y || 2026}`, px + 36, py + 180, { size: 30, color: '#555', max: 450 });
      text(ctx, d.camera || T(d, '數位影像', 'Digital image'), px + 36, py + 225, { size: 28, color: '#555', max: 450 });
      text(ctx, d.location || '', px + 36, py + 265, { size: 28, color: '#555', max: 450 });
    },
  });

  /* ---------- 28. 貼紙 ---------- */
  def({
    id: 'sticker', zh: '貼紙', en: 'Sticker', tag: 'fun', ratio: null, suggest: '1',
    layout(a) { const [w, h] = slotDims(a); return { W: w + 440, H: h + 640, slot: { x: 220, y: 220, w, h, r: 80 } }; },
    draw(ctx, L, d, photo, sk) {
      const dark = !!sk.dark;
      const bg = dark ? sk.bg : tone(d.accent, 0.84, 0.75);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const r = rand(17);
      for (let i = 0; i < 40; i++) icon(ctx, i % 2 ? 'star4' : 'star5', r() * L.W, r() * L.H, 26 + r() * 30, alpha(dark ? '#ffffff' : '#ffffff', dark ? 0.12 : 0.55), { fill: true });
      const s = L.slot;
      shadow(ctx, 'rgba(0,0,0,.25)', 30, 0, 14);
      rr(ctx, s.x - 40, s.y - 40, s.w + 80, s.h + 80, 120); ctx.fillStyle = '#fff'; ctx.fill(); noShadow(ctx);
      photo();
      const badge = (x, y, rad, col, rot, draw) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        shadow(ctx, 'rgba(0,0,0,.2)', 14, 0, 6);
        ctx.beginPath(); ctx.arc(0, 0, rad + 14, 0, PI2); ctx.fillStyle = '#fff'; ctx.fill(); noShadow(ctx);
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, PI2); ctx.fillStyle = col; ctx.fill();
        draw(); ctx.restore();
      };
      if (d.weather || d.temp) badge(s.x + s.w - 10, s.y + 20, 120, '#ffe14d', 0.2, () => {
        if (d.weatherKey && d.weather) weatherIcon(ctx, d.weatherKey, 0, -30, 90, '#1a1a1a', 8);
        text(ctx, d.temp || d.weather, 0, 70, { size: 48, weight: 900, color: '#1a1a1a', align: 'center', max: 190 });
      });
      if (d.date) badge(s.x + 30, s.y + s.h - 10, 110, d.accent, -0.25, () => {
        text(ctx, d.monthYear ? d.monthYear.split(' ')[0] : '', 0, -20, { size: 40, weight: 900, color: ink(d.accent), align: 'center', fam: F.round });
        text(ctx, String(d.day || ''), 0, 50, { size: 76, weight: 900, color: ink(d.accent), align: 'center', fam: F.round });
      });
      const fg = dark ? '#ffffff' : '#2b2b2b';
      if (d.quote) {
        const f = fitWrap(ctx, d.quote, L.W - 200, 92, F.hand, 700, 2, 54);
        lines(ctx, f.lines, L.W / 2, s.y + s.h + 190, f.size * 1.1, { size: f.size, fam: F.hand, weight: 700, color: fg, align: 'center' });
      }
      if (d.location) {
        setFont(ctx, 40, F.sans, 900);
        const tw = Math.min(L.W - 300, ctx.measureText(d.location).width) + 130;
        ctx.save(); ctx.translate(L.W / 2, L.H - 110); ctx.rotate(-0.03);
        rr(ctx, -tw / 2, -50, tw, 100, 50); ctx.fillStyle = dark ? '#ff5c8a' : '#111'; ctx.fill();
        icon(ctx, 'pin', -tw / 2 + 55, -4, 44, '#fff', { fill: true, hole: dark ? '#ff5c8a' : '#111' });
        text(ctx, d.location, -tw / 2 + 95, 14, { size: 40, weight: 900, color: '#fff', max: tw - 130 });
        ctx.restore();
      }
    },
  });

  /* ---------- 29. 社群貼文 ---------- */
  def({
    id: 'post', zh: '社群貼文', en: 'Social Post', tag: 'fun', ratio: null, suggest: '4/5',
    layout(a) { const [w, h] = slotDims(a); return { W: w, H: h + 170 + 400, slot: { x: 0, y: 170, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      const dark = !!sk.dark;
      const bg = dark ? mix(sk.paper, '#000000', 0.6) : mix(sk.paper, '#ffffff', 0.6), fg = dark ? '#f5f5f5' : sk.ink, mute = alpha(fg, 0.55);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const name = (d.artist || 'me').replace(/^@/, '');
      const g = ctx.createLinearGradient(40, 30, 150, 140);
      g.addColorStop(0, '#feda75'); g.addColorStop(0.5, '#d62976'); g.addColorStop(1, '#4f5bd5');
      ctx.beginPath(); ctx.arc(95, 85, 56, 0, PI2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(95, 85, 48, 0, PI2); ctx.fillStyle = bg; ctx.fill();
      thumb(ctx, d, 53, 43, 84, 42);
      text(ctx, name, 180, d.location ? 75 : 98, { size: 40, weight: 700, color: fg, max: L.W - 340 });
      if (d.location) text(ctx, d.location, 180, 125, { size: 32, color: fg, max: L.W - 340 });
      icon(ctx, 'dots', L.W - 80, 85, 56, fg);
      photo();
      const y = L.slot.y + L.slot.h + 90;
      icon(ctx, 'heart', 90, y, 76, '#ff3040', { fill: true });
      // 留言、分享、收藏
      ctx.save(); ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(215, y, 34, Math.PI * 0.75, Math.PI * 2.55); ctx.lineTo(180, y + 38); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(300, y - 30); ctx.lineTo(372, y - 30); ctx.lineTo(330, y + 36); ctx.lineTo(322, y - 2); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L.W - 110, y - 36); ctx.lineTo(L.W - 60, y - 36); ctx.lineTo(L.W - 60, y + 38); ctx.lineTo(L.W - 85, y + 16); ctx.lineTo(L.W - 110, y + 38); ctx.closePath(); ctx.stroke();
      ctx.restore();
      const likes = ((d.mo || 10) * 97 + (d.day || 24) * 31 + 1000).toLocaleString('en-US');
      text(ctx, T(d, `${likes} 個讚`, `${likes} likes`), 50, y + 100, { size: 36, weight: 700, color: fg });
      setFont(ctx, 36, F.sans, 700);
      const nw = ctx.measureText(name).width;
      text(ctx, name, 50, y + 160, { size: 36, weight: 700, color: fg, max: L.W - 100 });
      if (d.quote) text(ctx, d.quote, 50 + Math.min(nw, L.W - 300) + 16, y + 160, { size: 36, color: fg, max: L.W - 120 - nw });
      text(ctx, [d.date, d.time, weatherText(d)].filter(Boolean).join(' · ').toUpperCase(), 50, y + 220, { size: 28, color: mute, max: L.W - 100 });
    },
  });

  /* ---------- 30. 天氣卡 ---------- */
  def({
    id: 'weathercard', zh: '天氣卡', en: 'Weather Card', tag: 'fun', ratio: null, suggest: '4/5', styleable: true,
    layout(a) { const [w, h] = slotDims(a); return { W: w, H: h, slot: { x: 0, y: 0, w, h, r: 0 } }; },
    draw(ctx, L, d, photo, sk) {
      photo();
      const st = d.style || {};
      const fg = st.color && st.color !== 'auto' ? st.color : '#fff';
      const dark = lum(fg) < 0.4;
      const g = ctx.createLinearGradient(0, 0, 0, L.H * 0.45);
      g.addColorStop(0, dark ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H * 0.45);
      ctx.save(); shadow(ctx, 'rgba(0,0,0,.2)', 16);
      if (d.location) { icon(ctx, 'pin', 92, 112, 44, fg, { fill: true, hole: 'rgba(0,0,0,0)' }); text(ctx, d.location, 130, 128, { size: 48, weight: 700, color: fg, max: L.W - 200 }); }
      const temp = d.temp ? d.temp.replace(/[CF]$/, '') : '--°';
      const fam = Templates.kit.fontOf(st.font), wt = st.weight || 700;
      text(ctx, temp, 60, 420, { size: 280, weight: wt, fam, color: fg });
      setFont(ctx, 280, fam, wt);
      const tw = ctx.measureText(temp).width;
      if (d.weatherKey && d.weather) weatherIcon(ctx, d.weatherKey, 60 + tw + 130, 300, 200, fg, 14);
      text(ctx, [d.weather, d.dateLong || d.date].filter(Boolean).join('  ·  '), 70, 500, { size: 46, weight: 700, color: fg, max: L.W - 140 });
      ctx.restore();
      // 逐時預報
      const ph = 330, py = L.H - ph - 50;
      const pc = Templates.kit.panel(ctx, d, L, 50, py, L.W - 100, ph, 50, st.panel || 'blur', fg);
      if (d.quote) text(ctx, d.quote, 100, py + 80, { size: 44, weight: 700, color: pc, max: L.W - 200 });
      ctx.fillStyle = alpha(pc, 0.25); ctx.fillRect(100, py + 115, L.W - 200, 3);
      const base = parseInt(d.temp, 10);
      const n = 5, cw = (L.W - 200) / n;
      for (let i = 0; i < n; i++) {
        const cx = 100 + cw * (i + 0.5);
        const hh = d.h != null ? (d.h + i) % 24 : null;
        text(ctx, i === 0 ? T(d, '現在', 'Now') : hh != null ? `${pad2(hh)}` : '--', cx, py + 175, { size: 34, weight: 700, color: pc, align: 'center' });
        weatherIcon(ctx, d.weatherKey || 'clear', cx, py + 230, 60, pc, 5);
        text(ctx, isNaN(base) ? '--' : `${base + [0, 1, 1, 0, -1][i]}°`, cx, py + 305, { size: 36, weight: 700, color: pc, align: 'center' });
      }
    },
  });
})();
