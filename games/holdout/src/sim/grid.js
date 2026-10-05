/* HOLDOUT - spatial hash for enemies.
   Rebuilt every tick around the player with a counting sort, so it costs a
   few passes over flat typed arrays and allocates nothing. Everything that
   asks "which enemies are near this point" - weapons, shots, separation -
   goes through query(), which writes candidate indices into a caller-owned
   buffer instead of taking a callback, again so nothing is allocated. */
export class Grid {
  constructor(cell, dim, capacity) {
    this.cell = cell;
    this.dim = dim;
    this.start = new Int32Array(dim * dim + 1);
    this.cursor = new Int32Array(dim * dim);
    this.items = new Int32Array(capacity);
    this.cellOf = new Int32Array(capacity);
    this.ox = 0;
    this.oy = 0;
  }

  cellIndex(x, y) {
    const gx = Math.floor((x - this.ox) / this.cell);
    const gy = Math.floor((y - this.oy) / this.cell);
    if (gx < 0 || gy < 0 || gx >= this.dim || gy >= this.dim) return -1;
    return gy * this.dim + gx;
  }

  build(cx, cy, high, alive, xs, ys) {
    const half = (this.dim * this.cell) / 2;
    this.ox = cx - half;
    this.oy = cy - half;
    const { start, cursor, items, cellOf } = this;
    start.fill(0);
    for (let i = 0; i < high; i++) {
      const c = alive[i] ? this.cellIndex(xs[i], ys[i]) : -1;
      cellOf[i] = c;
      if (c >= 0) start[c + 1]++;
    }
    const n = this.dim * this.dim;
    for (let c = 0; c < n; c++) start[c + 1] += start[c];
    cursor.set(start.subarray(0, n));
    for (let i = 0; i < high; i++) {
      const c = cellOf[i];
      if (c >= 0) items[cursor[c]++] = i;
    }
  }

  /** Enemy indices in the cells overlapping a circle; returns the count. */
  query(x, y, r, out) {
    const d = this.dim, cs = this.cell;
    const gx0 = Math.max(0, Math.floor((x - r - this.ox) / cs));
    const gy0 = Math.max(0, Math.floor((y - r - this.oy) / cs));
    const gx1 = Math.min(d - 1, Math.floor((x + r - this.ox) / cs));
    const gy1 = Math.min(d - 1, Math.floor((y + r - this.oy) / cs));
    const { start, items } = this;
    let n = 0;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = gy * d + gx;
        for (let k = start[c], e = start[c + 1]; k < e; k++) out[n++] = items[k];
      }
    }
    return n;
  }
}
