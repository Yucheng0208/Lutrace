/* 裁切框：滑鼠與觸控都可拖曳、縮放，可鎖定比例 */
(function () {
  'use strict';

  const MIN = 32; // 最小裁切邊長（原圖像素）

  class CropEditor {
    constructor({ area, img, box, onChange }) {
      this.area = area;
      this.img = img;
      this.box = box;
      this.onChange = onChange;
      this.W = 0; this.H = 0;
      this.crop = null;
      this.ratio = null; // 寬/高，null = 自由
      this.drag = null;

      box.addEventListener('pointerdown', (e) => this.start(e));
      window.addEventListener('pointermove', (e) => this.move(e));
      window.addEventListener('pointerup', () => this.end());
      window.addEventListener('pointercancel', () => this.end());
      new ResizeObserver(() => this.render()).observe(area);
      img.addEventListener('load', () => this.render());
    }

    load(src, W, H, crop, ratio) {
      this.W = W; this.H = H;
      this.ratio = ratio;
      this.crop = crop ? { ...crop } : { x: 0, y: 0, w: W, h: H };
      this.box.classList.toggle('locked', !!ratio);
      if (this.img.getAttribute('src') !== src) this.img.src = src;
      else this.render();
    }

    setRatio(ratio) {
      this.ratio = ratio;
      this.box.classList.toggle('locked', !!ratio);
      if (ratio) {
        // 以目前中心點放入最大的指定比例框
        const c = this.crop;
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        let w = this.W, h = w / ratio;
        if (h > this.H) { h = this.H; w = h * ratio; }
        const x = clamp(cx - w / 2, 0, this.W - w);
        const y = clamp(cy - h / 2, 0, this.H - h);
        this.crop = { x, y, w, h };
      }
      this.commit();
    }

    reset() {
      this.ratio = null;
      this.box.classList.remove('locked');
      this.crop = { x: 0, y: 0, w: this.W, h: this.H };
      this.commit();
    }

    /* 原圖像素 → 畫面座標 */
    geom() {
      const a = this.area.getBoundingClientRect();
      const r = this.img.getBoundingClientRect();
      return { ox: r.left - a.left, oy: r.top - a.top, s: r.width / this.W };
    }

    render() {
      if (!this.crop || !this.W || !this.img.complete) return;
      const { ox, oy, s } = this.geom();
      const c = this.crop;
      Object.assign(this.box.style, {
        left: `${ox + c.x * s}px`, top: `${oy + c.y * s}px`,
        width: `${c.w * s}px`, height: `${c.h * s}px`,
      });
    }

    commit() {
      this.render();
      const c = this.crop;
      this.onChange({ x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) }, this.ratio);
    }

    start(e) {
      e.preventDefault();
      this.box.setPointerCapture?.(e.pointerId);
      this.drag = { h: e.target.dataset.h || 'move', px: e.clientX, py: e.clientY, c: { ...this.crop }, s: this.geom().s };
    }

    move(e) {
      const d = this.drag;
      if (!d) return;
      const dx = (e.clientX - d.px) / d.s;
      const dy = (e.clientY - d.py) / d.s;
      const { W, H } = this;
      const c = d.c;
      let { x, y, w, h } = c;

      if (d.h === 'move') {
        x = clamp(c.x + dx, 0, W - c.w);
        y = clamp(c.y + dy, 0, H - c.h);
      } else if (this.ratio) {
        const r = this.ratio;
        const east = d.h.includes('e'), south = d.h.includes('s');
        const ax = east ? c.x : c.x + c.w; // 對角固定點
        const ay = south ? c.y : c.y + c.h;
        const nw = c.w + (east ? dx : -dx);
        const nh = c.h + (south ? dy : -dy);
        w = Math.max(nw, nh * r);
        const maxW = Math.min(east ? W - ax : ax, (south ? H - ay : ay) * r);
        w = clamp(w, Math.min(MIN, maxW), maxW);
        h = w / r;
        x = east ? ax : ax - w;
        y = south ? ay : ay - h;
      } else {
        let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
        if (d.h.includes('w')) x1 = clamp(c.x + dx, 0, x2 - MIN);
        if (d.h.includes('e')) x2 = clamp(x2 + dx, x1 + MIN, W);
        if (d.h.includes('n')) y1 = clamp(c.y + dy, 0, y2 - MIN);
        if (d.h.includes('s')) y2 = clamp(y2 + dy, y1 + MIN, H);
        x = x1; y = y1; w = x2 - x1; h = y2 - y1;
      }
      this.crop = { x, y, w, h };
      this.commit();
    }

    end() { this.drag = null; }
  }

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  window.CropEditor = CropEditor;
})();
