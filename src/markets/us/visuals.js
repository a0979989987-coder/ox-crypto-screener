const colors = (v) => (v >= 0 ? "#00b8d4" : "#ff3078");
export class USBubbles {
  constructor(root, rows, onSelect) {
    this.root = root;
    this.rows = rows;
    this.onSelect = onSelect;
    this.pan = { x: 0, y: 0, scale: 1 };
    this.pointers = new Map();
    root.innerHTML =
      '<canvas aria-label="股票泡泡圖：顏色為完整交易日漲跌，大小為平均成交額的對數權重" tabindex="0"></canvas><div class="us2-visual-legend">藍 ＋／紅 −：完整日漲跌 · 大小：20日平均成交額對數權重 <button type="button">重設視野</button></div>';
    this.canvas = root.querySelector("canvas");
    this.canvas.style.touchAction = "none";
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(root);
    root.querySelector("button").onclick = () => {
      this.pan = { x: 0, y: 0, scale: 1 };
      this.draw();
    };
    this.canvas.onwheel = (e) => {
      e.preventDefault();
      this.pan.scale = Math.max(
        0.5,
        Math.min(4, this.pan.scale * (e.deltaY < 0 ? 1.1 : 0.9)),
      );
      this.draw();
    };
    this.canvas.onpointerdown = (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.start = { x: e.offsetX, y: e.offsetY };
      this.moved = false;
    };
    this.canvas.onpointermove = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const old = this.pointers.get(e.pointerId);
      if (this.pointers.size === 2) {
        const other = [...this.pointers].find(([id]) => id !== e.pointerId)[1];
        const a = Math.hypot(old.x - other.x, old.y - other.y),
          b = Math.hypot(e.offsetX - other.x, e.offsetY - other.y);
        if (a > 0)
          this.pan.scale = Math.max(0.5, Math.min(4, (this.pan.scale * b) / a));
      } else {
        this.pan.x += e.offsetX - old.x;
        this.pan.y += e.offsetY - old.y;
      }
      this.moved =
        this.moved ||
        Math.hypot(e.offsetX - this.start.x, e.offsetY - this.start.y) > 5;
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.draw();
    };
    this.canvas.onpointerup = (e) => {
      if (!this.moved && this.pointers.size === 1) {
        const p = this.positions?.find(
          (p) => Math.hypot(e.offsetX - p.x, e.offsetY - p.y) < p.r,
        );
        if (p) this.onSelect(p.row.symbol);
      }
      this.pointers.delete(e.pointerId);
    };
    this.canvas.onpointercancel = (e) => this.pointers.delete(e.pointerId);
    this.draw();
  }
  draw() {
    const canvas = this.canvas,
      dpr = devicePixelRatio || 1,
      w = this.root.clientWidth,
      h = 330;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const rows = this.rows.slice(0, 60),
      radii = rows.map(
        (row) => 20 + Math.log10(Math.max(1, row.liquidity || 1)) * 2,
      ),
      points = [];
    for (let i = 0; i < rows.length; i++) {
      const r = radii[i];
      let found = false;
      for (let step = 0; step < 1500; step++) {
        const a = step * 2.399963,
          rad = step ? Math.sqrt(step) * 12 : 0,
          x = Math.cos(a) * rad,
          y = Math.sin(a) * rad;
        if (points.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 5)) {
          points.push({ x, y, r, row: rows[i] });
          found = true;
          break;
        }
      }
      if (!found) continue;
    }
    const bound = Math.max(170, ...points.map((p) => Math.abs(p.x) + p.r));
    const fit = Math.min(1, w / (bound * 2.1), h / (bound * 2.1));
    this.positions = points.map((p) => ({
      ...p,
      x: w / 2 + p.x * fit * this.pan.scale + this.pan.x,
      y: h / 2 + p.y * fit * this.pan.scale + this.pan.y,
      r: p.r * fit * this.pan.scale,
    }));
    for (const p of this.positions) {
      const c = colors(p.row.changePct);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = c + "20";
      ctx.fill();
      ctx.strokeStyle = c + "99";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (p.r > 12) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#f4f0e8";
        ctx.font = `600 ${Math.min(13, p.r * 0.32)}px -apple-system, sans-serif`;
        ctx.fillText(p.row.symbol, p.x, p.y - 2);
        ctx.font = `${Math.min(11, p.r * 0.27)}px -apple-system, sans-serif`;
        ctx.fillStyle = c;
        ctx.fillText(
          `${p.row.changePct >= 0 ? "+" : ""}${p.row.changePct.toFixed(2)}%`,
          p.x,
          p.y + 12,
        );
      }
    }
  }
  destroy() {
    this.ro.disconnect();
    this.root.innerHTML = "";
  }
}
export function bindPatternBoard(root, onPath) {
  const canvas = root.querySelector("canvas"),
    ctx = canvas.getContext("2d");
  let points = [],
    pointer = null,
    start = null,
    fromControl = false,
    suppress = false;
  const paint = () => {
    const d = devicePixelRatio || 1,
      w = root.clientWidth,
      h = root.clientHeight;
    canvas.width = w * d;
    canvas.height = h * d;
    ctx.scale(d, d);
    ctx.strokeStyle = "#ffffff08";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    if (points.length > 1) {
      ctx.strokeStyle = "#f4f0e8";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, i) =>
        i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h),
      );
      ctx.stroke();
    }
  };
  const pos = (e) => {
    const r = root.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const down = (e) => {
    if (e.button !== 0) return;
    pointer = e.pointerId;
    start = pos(e);
    fromControl = !!e.target.closest("button,select");
    if (!fromControl) {
      points = [start];
      root.setPointerCapture(pointer);
      e.preventDefault();
      paint();
    }
  };
  const move = (e) => {
    if (pointer !== e.pointerId) return;
    const p = pos(e);
    if (fromControl) {
      if (
        Math.hypot(
          (p.x - start.x) * root.clientWidth,
          (p.y - start.y) * root.clientHeight,
        ) < 8
      )
        return;
      fromControl = false;
      suppress = true;
      points = [start];
      root.setPointerCapture(pointer);
    }
    points.push(p);
    paint();
  };
  const up = (e) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    if (!fromControl && points.length > 4) onPath(points);
  };
  const click = (e) => {
    if (suppress) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppress = false;
    }
  };
  root.addEventListener("pointerdown", down);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", () => (pointer = null));
  root.addEventListener("click", click, true);
  const ro = new ResizeObserver(paint);
  ro.observe(root);
  paint();
  return {
    clear() {
      points = [];
      paint();
      onPath([]);
    },
    destroy() {
      ro.disconnect();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("click", click, true);
    },
  };
}
