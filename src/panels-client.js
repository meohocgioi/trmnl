// Script chạy TRONG trình duyệt của TRMNL (và trang /preview):
// tìm các ô truyện trên 2 trang, chọn 2 ô liền nhau, phóng to cho kín màn hình.
// Worker phục vụ file này tại /panels.js → sửa thuật toán chỉ cần cập nhật GitHub.
//
// Các hàm dưới đây phải TỰ ĐỦ (không dùng biến bên ngoài) vì được gửi đi dạng text.

// gray: mảng độ sáng 0..255 (w*h). Trả về các ô theo thứ tự đọc, toạ độ dạng tỉ lệ 0..1.
// Thuật toán CŨ (≤ v1.5.3) – chỉ giữ để so sánh trong trang /lab
export function detectPanelsV1(gray, w, h, rtl) {
  const INK = 200; // điểm tối hơn mức này = có mực
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = gray[i] < INK ? 1 : 0;

  const minGap = Math.max(1, Math.round(w * 0.004)); // khe trắng tối thiểu giữa 2 ô
  const minW = w * 0.1;
  const minH = h * 0.06;
  const out = [];

  const rowInk = (y, x0, x1) => {
    let c = 0;
    const o = y * w;
    for (let x = x0; x < x1; x++) c += ink[o + x];
    return c;
  };
  const colInk = (x, y0, y1) => {
    let c = 0;
    for (let y = y0; y < y1; y++) c += ink[y * w + x];
    return c;
  };
  const tolFor = (span) => Math.max(2, Math.floor(span * 0.012));
  const edge = (span) => Math.max(1, Math.round(span * 0.012));
  // Hàng/cột là "khe" khi gần như trắng VÀ hai đầu không chạm viền ô
  // (hàng nằm trong 1 ô nền trắng vẫn chạm viền trái/phải → không phải khe)
  const rowEmpty = (y, x0, x1) => {
    if (rowInk(y, x0, x1) > tolFor(x1 - x0)) return false;
    const m = edge(x1 - x0);
    return rowInk(y, x0, x0 + m) === 0 || rowInk(y, x1 - m, x1) === 0;
  };
  const colEmpty = (x, y0, y1) => {
    if (colInk(x, y0, y1) > tolFor(y1 - y0)) return false;
    const m = edge(y1 - y0);
    return colInk(x, y0, y0 + m) === 0 || colInk(x, y1 - m, y1) === 0;
  };

  function trim(r) {
    let { x0, y0, x1, y1 } = r;
    const tr = tolFor(x1 - x0);
    while (y0 < y1 && rowInk(y0, x0, x1) <= tr) y0++;
    while (y1 > y0 && rowInk(y1 - 1, x0, x1) <= tr) y1--;
    const tc = tolFor(y1 - y0);
    while (x0 < x1 && colInk(x0, y0, y1) <= tc) x0++;
    while (x1 > x0 && colInk(x1 - 1, y0, y1) <= tc) x1--;
    if (x1 - x0 < 4 || y1 - y0 < 4) return null;
    return { x0, y0, x1, y1 };
  }

  // Tách 1 dải thành các đoạn có mực, ngăn bởi khe trắng dài >= minGap
  function segments(from, to, isEmpty) {
    const segs = [];
    let start = -1;
    let gap = 0;
    for (let i = from; i < to; i++) {
      if (isEmpty(i)) {
        gap++;
        if (start >= 0 && gap >= minGap) {
          segs.push([start, i - gap + 1]);
          start = -1;
        }
      } else {
        if (start < 0) start = i;
        gap = 0;
      }
    }
    if (start >= 0) segs.push([start, to - gap]);
    return segs;
  }

  // Bóc khung viền đen bao quanh (vd: cả trang được đóng khung) để lộ khe trắng bên trong
  function peel(r) {
    let { x0, y0, x1, y1 } = r;
    const maxY = Math.max(2, Math.round((y1 - y0) * 0.04));
    const maxX = Math.max(2, Math.round((x1 - x0) * 0.04));
    const full = (cnt, span) => cnt >= span * 0.85;
    let k = 0;
    while (k < maxY && y1 - y0 > 8 && full(rowInk(y0, x0, x1), x1 - x0)) { y0++; k++; }
    k = 0;
    while (k < maxY && y1 - y0 > 8 && full(rowInk(y1 - 1, x0, x1), x1 - x0)) { y1--; k++; }
    k = 0;
    while (k < maxX && x1 - x0 > 8 && full(colInk(x0, y0, y1), y1 - y0)) { x0++; k++; }
    k = 0;
    while (k < maxX && x1 - x0 > 8 && full(colInk(x1 - 1, y0, y1), y1 - y0)) { x1--; k++; }
    return { x0, y0, x1, y1 };
  }

  function split(r0, depth) {
    let r = trim(r0);
    if (!r) return;
    // Chỉ ở cấp trang: có khung bao cả trang → bóc khung, cắt lại phần trắng, tách bên trong
    const pr = depth === 0 ? peel(r) : r;
    if (pr.x0 !== r.x0 || pr.y0 !== r.y0 || pr.x1 !== r.x1 || pr.y1 !== r.y1) {
      const inner = trim(pr);
      if (inner && (inner.x1 - inner.x0) * (inner.y1 - inner.y0) > 0.5 * (r.x1 - r.x0) * (r.y1 - r.y0)) r = inner;
    }
    if (depth > 7) return leaf(r);
    const bands = segments(r.y0, r.y1, (y) => rowEmpty(y, r.x0, r.x1)).filter(([a, b]) => b - a >= 3);
    if (bands.length > 1) {
      for (const [a, b] of bands) split({ x0: r.x0, y0: a, x1: r.x1, y1: b }, depth + 1);
      return;
    }
    let cols = segments(r.x0, r.x1, (x) => colEmpty(x, r.y0, r.y1)).filter(([a, b]) => b - a >= 3);
    if (cols.length > 1) {
      if (rtl) cols = cols.reverse(); // manga Nhật: ô bên phải đọc trước
      for (const [a, b] of cols) split({ x0: a, y0: r.y0, x1: b, y1: r.y1 }, depth + 1);
      return;
    }
    leaf(r);
  }

  function leaf(r) {
    if (r.x1 - r.x0 < minW || r.y1 - r.y0 < minH) return; // bỏ chữ lẻ, số trang, logo nhóm dịch
    const pad = 1;
    const x0 = Math.max(0, r.x0 - pad);
    const y0 = Math.max(0, r.y0 - pad);
    const x1 = Math.min(w, r.x1 + pad);
    const y1 = Math.min(h, r.y1 + pad);
    out.push({ x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h });
  }

  split({ x0: 0, y0: 0, x1: w, y1: h }, 0);
  if (out.length >= 2) return out;
  // Cả trang chỉ ra ≤1 ô: có thể lề trang bị sần/xám (giấy scan) che mất khe →
  // thu vùng phân tích vào trong dần để né lề, giữ kết quả đầu tiên tìm được ≥ 2 ô
  const first = out.slice();
  for (const f of [0.04, 0.07, 0.1, 0.13]) {
    out.length = 0;
    split({ x0: Math.round(w * f), y0: Math.round(h * f), x1: Math.round(w * (1 - f)), y1: Math.round(h * (1 - f)) }, 0);
    if (out.length >= 2) return out;
  }
  return first;
}

// Xếp 2 ô (tỉ lệ rộng/cao a1, a2) vào khung W×H: ngang hoặc dọc, chọn cách phủ kín nhất
export function detectPanels(gray, w, h, rtl) {
  const INK = 200; // điểm tối hơn mức này = có mực
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = gray[i] < INK ? 1 : 0;

  const minGap = Math.max(1, Math.round(w * 0.004)); // khe trắng tối thiểu giữa 2 ô
  const minW = w * 0.1;
  const minH = h * 0.06;
  const out = [];

  const rowInk = (y, x0, x1) => {
    let c = 0;
    const o = y * w;
    for (let x = x0; x < x1; x++) c += ink[o + x];
    return c;
  };
  const colInk = (x, y0, y1) => {
    let c = 0;
    for (let y = y0; y < y1; y++) c += ink[y * w + x];
    return c;
  };
  const tolFor = (span) => Math.max(2, Math.floor(span * 0.012));
  const edge = (span) => Math.max(1, Math.round(span * 0.012));
  // Hàng/cột là "khe" khi gần như trắng VÀ hai đầu không chạm viền ô
  // (hàng nằm trong 1 ô nền trắng vẫn chạm viền trái/phải → không phải khe)
  const rowEmpty = (y, x0, x1) => {
    if (rowInk(y, x0, x1) > tolFor(x1 - x0)) return false;
    const m = edge(x1 - x0);
    return rowInk(y, x0, x0 + m) === 0 || rowInk(y, x1 - m, x1) === 0;
  };
  const colEmpty = (x, y0, y1) => {
    if (colInk(x, y0, y1) > tolFor(y1 - y0)) return false;
    const m = edge(y1 - y0);
    return colInk(x, y0, y0 + m) === 0 || colInk(x, y1 - m, y1) === 0;
  };

  function trim(r) {
    let { x0, y0, x1, y1 } = r;
    const tr = tolFor(x1 - x0);
    while (y0 < y1 && rowInk(y0, x0, x1) <= tr) y0++;
    while (y1 > y0 && rowInk(y1 - 1, x0, x1) <= tr) y1--;
    const tc = tolFor(y1 - y0);
    while (x0 < x1 && colInk(x0, y0, y1) <= tc) x0++;
    while (x1 > x0 && colInk(x1 - 1, y0, y1) <= tc) x1--;
    if (x1 - x0 < 4 || y1 - y0 < 4) return null;
    return { x0, y0, x1, y1 };
  }

  // Khe thật giữa 2 ô không bị nét nào chạy XUYÊN qua (chân nhân vật, cạnh khung...)
  function crossedH(g0, g1, x0, x1) {
    const n = g1 - g0;
    if (n < 2) return false;
    for (let x = x0; x < x1; x++) {
      let c = 0;
      for (let y = g0; y < g1; y++) c += ink[y * w + x];
      if (c >= n * 0.9) return true;
    }
    return false;
  }
  function crossedV(g0, g1, y0, y1) {
    const n = g1 - g0;
    if (n < 2) return false;
    for (let y = y0; y < y1; y++) {
      let c = 0;
      const o = y * w;
      for (let x = g0; x < g1; x++) c += ink[o + x];
      if (c >= n * 0.9) return true;
    }
    return false;
  }
  // Gộp 2 đoạn liền nhau nếu khe giữa chúng bị nét vẽ xuyên qua
  function mergeCrossed(segs, crossed) {
    const outS = [];
    for (const sg of segs) {
      const last = outS[outS.length - 1];
      if (last && crossed(last[1], sg[0])) last[1] = sg[1];
      else outS.push([sg[0], sg[1]]);
    }
    return outS;
  }

  // Tách 1 dải thành các đoạn có mực, ngăn bởi khe trắng dài >= minGap
  function segments(from, to, isEmpty) {
    const segs = [];
    let start = -1;
    let gap = 0;
    for (let i = from; i < to; i++) {
      if (isEmpty(i)) {
        gap++;
        if (start >= 0 && gap >= minGap) {
          segs.push([start, i - gap + 1]);
          start = -1;
        }
      } else {
        if (start < 0) start = i;
        gap = 0;
      }
    }
    if (start >= 0) segs.push([start, to - gap]);
    return segs;
  }

  // Bóc khung viền đen bao quanh (vd: cả trang được đóng khung) để lộ khe trắng bên trong
  function peel(r) {
    let { x0, y0, x1, y1 } = r;
    const maxY = Math.max(2, Math.round((y1 - y0) * 0.04));
    const maxX = Math.max(2, Math.round((x1 - x0) * 0.04));
    // Khung trang = đường kẻ LIỀN MẠCH gần hết chiều dài (cho phép đứt vài điểm do scan).
    // Cạnh của các ô xếp chồng (bị ngắt ở mỗi khe) KHÔNG phải khung trang → không bóc.
    const longRun = (get, n) => {
      let best = 0, run = 0, miss = 0;
      for (let i = 0; i < n; i++) {
        if (get(i)) { run += miss + 1; miss = 0; }
        else if (run > 0 && miss < 2) miss++;
        else { run = 0; miss = 0; }
        if (run > best) best = run;
      }
      return best;
    };
    const fullRow = (y) => longRun((i) => ink[y * w + x0 + i], x1 - x0) >= (x1 - x0) * 0.92;
    const fullCol = (x) => longRun((i) => ink[(y0 + i) * w + x], y1 - y0) >= (y1 - y0) * 0.92;
    // Chỉ bóc khi cả 4 cạnh đều là đường liền (khung kín bao cả trang)
    if (!(fullRow(y0) && fullRow(y1 - 1) && fullCol(x0) && fullCol(x1 - 1))) return { x0, y0, x1, y1 };
    let k = 0;
    while (k < maxY && y1 - y0 > 8 && fullRow(y0)) { y0++; k++; }
    k = 0;
    while (k < maxY && y1 - y0 > 8 && fullRow(y1 - 1)) { y1--; k++; }
    k = 0;
    while (k < maxX && x1 - x0 > 8 && fullCol(x0)) { x0++; k++; }
    k = 0;
    while (k < maxX && x1 - x0 > 8 && fullCol(x1 - 1)) { x1--; k++; }
    return { x0, y0, x1, y1 };
  }

  function split(r0, depth) {
    let r = trim(r0);
    if (!r) return;
    // Chỉ ở cấp trang: có khung bao cả trang → bóc khung, cắt lại phần trắng, tách bên trong
    const pr = depth === 0 ? peel(r) : r;
    if (pr.x0 !== r.x0 || pr.y0 !== r.y0 || pr.x1 !== r.x1 || pr.y1 !== r.y1) {
      const inner = trim(pr);
      if (inner && (inner.x1 - inner.x0) * (inner.y1 - inner.y0) > 0.5 * (r.x1 - r.x0) * (r.y1 - r.y0)) r = inner;
    }
    if (depth > 7) return leaf(r);
    const bands = mergeCrossed(
      segments(r.y0, r.y1, (y) => rowEmpty(y, r.x0, r.x1)),
      (g0, g1) => crossedH(g0, g1, r.x0, r.x1)
    ).filter(([a, b]) => b - a >= 3);
    if (bands.length > 1) {
      for (const [a, b] of bands) split({ x0: r.x0, y0: a, x1: r.x1, y1: b }, depth + 1);
      return;
    }
    let cols = mergeCrossed(
      segments(r.x0, r.x1, (x) => colEmpty(x, r.y0, r.y1)),
      (g0, g1) => crossedV(g0, g1, r.y0, r.y1)
    ).filter(([a, b]) => b - a >= 3);
    if (cols.length > 1) {
      if (rtl) cols = cols.reverse(); // manga Nhật: ô bên phải đọc trước
      for (const [a, b] of cols) split({ x0: a, y0: r.y0, x1: b, y1: r.y1 }, depth + 1);
      return;
    }
    leaf(r);
  }

  function leaf(r) {
    if (r.x1 - r.x0 < minW || r.y1 - r.y0 < minH) return; // bỏ chữ lẻ, số trang, logo nhóm dịch
    const pad = 1;
    const x0 = Math.max(0, r.x0 - pad);
    const y0 = Math.max(0, r.y0 - pad);
    const x1 = Math.min(w, r.x1 + pad);
    const y1 = Math.min(h, r.y1 + pad);
    // Mật độ nét vẽ ở phần LÕI ô (bỏ 8% mỗi cạnh để không tính khung viền)
    const ix0 = Math.round(r.x0 + (r.x1 - r.x0) * 0.08), ix1 = Math.round(r.x1 - (r.x1 - r.x0) * 0.08);
    const iy0 = Math.round(r.y0 + (r.y1 - r.y0) * 0.08), iy1 = Math.round(r.y1 - (r.y1 - r.y0) * 0.08);
    let dark = 0;
    for (let y = iy0; y < iy1; y++) dark += rowInk(y, ix0, ix1);
    const inkD = dark / Math.max(1, (ix1 - ix0) * (iy1 - iy0));
    out.push({ x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h, ink: inkD });
  }

  split({ x0: 0, y0: 0, x1: w, y1: h }, 0);
  if (out.length >= 2) return out;
  // Cả trang chỉ ra ≤1 ô: có thể lề trang bị sần/xám (giấy scan) che mất khe →
  // thu vùng phân tích vào trong dần để né lề, giữ kết quả đầu tiên tìm được ≥ 2 ô
  const first = out.slice();
  for (const f of [0.04, 0.07, 0.1, 0.13]) {
    out.length = 0;
    split({ x0: Math.round(w * f), y0: Math.round(h * f), x1: Math.round(w * (1 - f)), y1: Math.round(h * (1 - f)) }, 0);
    if (out.length >= 2) return out;
  }
  return first;
}

// Xếp 2 ô (tỉ lệ rộng/cao a1, a2) vào khung W×H: ngang hoặc dọc, chọn cách phủ kín nhất
// Chọn 1 ô hoặc 2 ô liền nhau để hiện. pages: [{ panels:[{x,y,w,h,ink}], aspect }]
// strategy: "E" (mặc định, từ lựa chọn của bạn ở /lab: A×5 + B×5) · "A" ô to nhất · "B" nhiều nét vẽ
//           "C" luôn 2 ô liền nhau · "D" cách cũ (không lọc)
// (E được tinh chỉnh từ các lượt bình chọn ở trang /lab)
export function choosePanels(pages, strategy, W, H, gap, seed, viewMode) {
  const all = [];
  pages.forEach((pg, k) => pg.panels.forEach((r) => all.push({ k, r, aspectPage: pg.aspect })));
  if (!all.length) return null;
  const aspect = (p) => (p.r.w / p.r.h) * p.aspectPage;
  const inkOf = (p) => (typeof p.r.ink === "number" ? p.r.ink : 0.1);
  // Bỏ ô gần như trống (< 1.5% nét vẽ) và dải mỏng (cao < 10% / rộng < 15% trang)
  const usable = (p) => strategy === "D" || (inkOf(p) >= 0.015 && p.r.h >= 0.1 && p.r.w >= 0.15);
  const singles = viewMode === "auto" && strategy !== "C"
    ? all.map((p, i) => ({ i, n: 1, L: layoutSingle(aspect(p), W, H), ok: usable(p), ink: inkOf(p) }))
    : [];
  const pairs = [];
  for (let i = 0; i + 1 < all.length; i++) {
    pairs.push({
      i, n: 2,
      L: layoutPair(aspect(all[i]), aspect(all[i + 1]), W, H, gap),
      ok: usable(all[i]) && usable(all[i + 1]),
      ink: (inkOf(all[i]) + inkOf(all[i + 1])) / 2,
    });
  }
  let cands = singles.concat(pairs).filter((c) => c.ok);
  if (!cands.length) cands = singles.concat(pairs);
  if (!cands.length) cands = all.map((p, i) => ({ i, n: 1, L: layoutSingle(aspect(p), W, H), ink: inkOf(p) }));
  const pick = (list) => list[Math.abs(seed) % list.length];
  const best = (list, f) => list.reduce((a, b) => (f(b) > f(a) ? b : a));
  const GOOD = 0.72;
  let chosen;
  const content = (c) => Math.sqrt(Math.min(1, c.ink / 0.08)); // nhiều nét vẽ → điểm cao (bão hoà ở 8%)
  if (strategy === "E") {
    // Học từ 2 lượt /lab của bạn (khớp 6/7 ví dụ có lựa chọn khác nhau):
    //  điểm = độ phủ màn hình × mật độ nét vẽ (tối đa 45%, tránh ô gần như đen kịt) × 1.3 nếu chỉ 1 ô.
    //  → 1 ô to được ưu tiên, trừ khi 2 ô liền nhau có nhiều nội dung hơn rõ rệt (≥ 30%).
    const good = cands.filter((c) => c.L.fill >= GOOD);
    const list = good.length ? good : cands;
    const score = (c) => c.L.fill * Math.min(c.ink, 0.45) * (c.n === 1 ? 1.3 : 1);
    const top = score(best(list, score));
    chosen = pick(list.filter((c) => score(c) >= top * 0.9));
  } else if (strategy === "B") {
    const score = (c) => c.L.fill * Math.sqrt(Math.min(1, c.ink / 0.08));
    const top = score(best(cands, score));
    chosen = pick(cands.filter((c) => score(c) >= top * 0.85));
  } else if (strategy === "C") {
    const pc = cands.filter((c) => c.n === 2);
    const list = pc.length ? pc : cands;
    const good = list.filter((c) => c.L.fill >= 0.6);
    chosen = good.length ? pick(good) : best(list, (c) => c.L.fill);
  } else {
    const gs = cands.filter((c) => c.n === 1 && c.L.fill >= GOOD);
    const gp = cands.filter((c) => c.n === 2 && c.L.fill >= GOOD);
    chosen = gs.length ? pick(gs) : gp.length ? pick(gp) : best(cands, (c) => c.L.fill);
  }
  return { i: chosen.i, n: chosen.n, L: chosen.L, items: all.slice(chosen.i, chosen.i + chosen.n), total: all.length };
}

export function layoutPair(a1, a2, W, H, gap) {
  const hr = Math.min(H, (W - gap) / (a1 + a2));
  const rowArea = hr * hr * (a1 + a2);
  const wc = Math.min(W, (H - gap) / (1 / a1 + 1 / a2));
  const colArea = wc * wc * (1 / a1 + 1 / a2);
  if (rowArea >= colArea) {
    return { mode: "row", fill: rowArea / (W * H), sizes: [{ w: a1 * hr, h: hr }, { w: a2 * hr, h: hr }] };
  }
  return { mode: "col", fill: colArea / (W * H), sizes: [{ w: wc, h: wc / a1 }, { w: wc, h: wc / a2 }] };
}

// 1 ô: phóng to vừa khung, giữ tỉ lệ
export function layoutSingle(a, W, H) {
  const w = Math.min(W, a * H);
  const h = w / a;
  return { mode: "single", fill: (w * h) / (W * H), sizes: [{ w, h }] };
}

export function clientMain() {
  const t0 = Date.now();
  const log = (...a) => console.log("[mdx +" + (Date.now() - t0) + "ms]", ...a);
  // Ghi trạng thái lên thanh tiêu đề để thấy được ngay trên màn hình TRMNL
  const status = (t) => {
    const el = document.getElementById("mdx-panels");
    if (el) el.textContent = t ? t + " · " : "";
  };
  const root = document.getElementById("mdx-root");
  if (!root) return log("không thấy #mdx-root");
  if (root.dataset.done || window.__mdxStarted) return;
  window.__mdxStarted = true;
  status("⏳");
  const viewMode = root.dataset.view; // auto = 1–2 ô, panels = 2 ô, pages = 2 trang
  if (viewMode !== "panels" && viewMode !== "auto") {
    status("");
    return log("chế độ 2 trang → giữ nguyên");
  }
  const rtl = root.dataset.dir === "rtl";
  const seed = parseInt(root.dataset.seed || "0", 10) || 0;
  // Lấy ảnh NGAY khi script chạy (trước khi framework TRMNL kịp đụng vào)
  let imgs = Array.prototype.slice.call(root.querySelectorAll("img"));
  if (imgs.every((im) => im.dataset.order)) imgs.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
  else if (rtl) imgs.reverse();
  imgs = imgs.slice(0, 2);
  if (imgs.length < 2) return log("không đủ 2 ảnh trong #mdx-root");
  const srcs = imgs.map((im) => im.currentSrc || im.src);
  status("⏳");
  log("bắt đầu", { rtl, seed, srcs: srcs.map((u) => u.slice(0, 80)) });

  const GAP = 8;

  // Phân tích 1 ảnh (img hoặc ImageBitmap) → danh sách ô
  function analyze(source, natW, natH) {
    const AW = Math.min(600, natW);
    const AH = Math.round((natH * AW) / natW);
    const c = document.createElement("canvas");
    c.width = AW;
    c.height = AH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, AW, AH);
    ctx.drawImage(source, 0, 0, AW, AH);
    const px = ctx.getImageData(0, 0, AW, AH).data; // lỗi nếu ảnh bị chặn CORS
    const gray = new Uint8Array(AW * AH);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
    const panels = detectPanels(gray, AW, AH, rtl);
    debugPages.push({ gray, AW, AH, natW, natH, panels });
    return panels;
  }
  const debugPages = [];
  let path = "A";

  // Chế độ chẩn đoán (data-debug="1"): vẽ ảnh đã phân tích + khung ô tìm được
  function renderDebug() {
    const box = root.getBoundingClientRect();
    const c = document.createElement("canvas");
    c.width = Math.floor(box.width);
    c.height = Math.floor(box.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    const n = debugPages.length || 1;
    const slotW = c.width / n;
    const textH = 40;
    debugPages.forEach((pg, k) => {
      const sc = Math.min((slotW - 10) / pg.AW, (c.height - textH) / pg.AH);
      const ox = k * slotW + 5;
      const img = ctx.createImageData(pg.AW, pg.AH);
      for (let i = 0; i < pg.gray.length; i++) {
        const v = pg.gray[i] < 200 ? 0 : 255; // đúng ngưỡng "có mực" của thuật toán
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      const tmp = document.createElement("canvas");
      tmp.width = pg.AW;
      tmp.height = pg.AH;
      tmp.getContext("2d").putImageData(img, 0, 0);
      ctx.drawImage(tmp, ox, textH, pg.AW * sc, pg.AH * sc);
      ctx.lineWidth = 4;
      pg.panels.forEach((r, q) => {
        const x = ox + r.x * pg.AW * sc, y = textH + r.y * pg.AH * sc, w = r.w * pg.AW * sc, h = r.h * pg.AH * sc;
        ctx.strokeStyle = "#000";
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "#000";
        ctx.fillRect(x, y, 26, 22);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(String(q + 1), x + 6, y + 18);
      });
      ctx.fillStyle = "#000";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("P" + (k + 1) + " " + pg.natW + "x" + pg.natH + " -> " + pg.AW + "x" + pg.AH + " | " + pg.panels.length + " o | " + path, ox, 16);
      let dark = 0;
      for (let i = 0; i < pg.gray.length; i++) if (pg.gray[i] < 200) dark++;
      ctx.fillText("muc " + Math.round((dark * 100) / pg.gray.length) + "%", ox, 34);
    });
    root.innerHTML = "";
    root.appendChild(c);
    root.dataset.done = "1";
    status("DEBUG");
  }

  function render(pages) {
    // pages: [{ panels:[...], aspect: natW/natH }]
    const all = [];
    pages.forEach((pg, k) => pg.panels.forEach((r) => all.push({ k, r, aspectPage: pg.aspect })));
    log("tìm thấy", all.length, "ô", pages.map((p) => p.panels.length));
    if (all.length < (viewMode === "auto" ? 1 : 2)) {
      status("⚠ chỉ thấy " + all.length + " ô");
      return log("ít hơn 2 ô → giữ chế độ 2 trang");
    }
    const box = root.getBoundingClientRect();
    const ch = choosePanels(pages, root.dataset.algo || "E", box.width, box.height, GAP, seed, viewMode);
    const i = ch.i;
    const L = ch.L;
    const pair = ch.items;
    const chosen = ch;
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:" + GAP + "px;" +
      "flex-direction:" + (L.mode === "col" ? "column" : rtl ? "row-reverse" : "row");
    pair.forEach((p, n) => {
      const sz = L.sizes[n];
      const cell = document.createElement("div");
      cell.style.cssText =
        "position:relative;overflow:hidden;flex:none;width:" + Math.floor(sz.w) + "px;height:" + Math.floor(sz.h) + "px";
      const im = document.createElement("img");
      im.src = srcs[p.k];
      im.setAttribute("crossorigin", "anonymous");
      im.className = "image image-dither";
      im.style.cssText = "position:absolute;height:auto;";
      im.style.setProperty("width", 100 / p.r.w + "%", "important");
      im.style.setProperty("max-width", "none", "important");
      im.style.setProperty("max-height", "none", "important");
      im.style.left = (-p.r.x / p.r.w) * 100 + "%";
      im.style.top = (-p.r.y / p.r.h) * 100 + "%";
      cell.appendChild(im);
      wrap.appendChild(cell);
    });
    root.innerHTML = "";
    root.appendChild(wrap);
    root.dataset.done = "1";
    const info = document.getElementById("mdx-panels");
    const label = chosen.n === 1 ? "ô " + (i + 1) : "ô " + (i + 1) + "–" + (i + 2);
    if (info) info.textContent = label + "/" + ch.total + " · ";
    log("xong:", label, L.mode, "phủ", Math.round(L.fill * 100) + "%");
  }

  // Cách A: đọc thẳng từ ảnh đang hiện (nhanh nhất, xong trước khi trang load xong)
  function viaImages() {
    const loaded = (img) =>
      new Promise((resolve) => {
        if (img.complete) return resolve(!!img.naturalWidth); // đã xong (thành công hoặc lỗi)
        img.addEventListener("load", () => resolve(true), { once: true });
        img.addEventListener("error", () => resolve(false), { once: true });
        setTimeout(() => resolve(false), 15000);
      });
    return Promise.all(imgs.map(loaded)).then((ok) => {
      if (ok.indexOf(false) >= 0) throw new Error("ảnh không tải được / quá lâu");
      log("ảnh đã tải", imgs.map((im) => im.naturalWidth + "x" + im.naturalHeight));
      return imgs.map((im) => ({ panels: analyze(im, im.naturalWidth, im.naturalHeight), aspect: im.naturalWidth / im.naturalHeight }));
    });
  }

  // Cách B: tự tải bản nhẹ (data-saver) qua fetch → không phụ thuộc thuộc tính CORS của thẻ img
  function viaFetch() {
    return Promise.all(
      srcs.map((u) => {
        const url = new URL(u);
        url.searchParams.set("q", "data-saver");
        ["b", "h", "f"].forEach((k) => url.searchParams.delete(k)); // Worker tự tra lại file bản nhẹ
        return fetch(url.toString(), { mode: "cors" })
          .then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.blob();
          })
          .then((b) => createImageBitmap(b));
      })
    ).then((bms) => {
      log("bản nhẹ đã tải", bms.map((b) => b.width + "x" + b.height));
      return bms.map((b) => ({ panels: analyze(b, b.width, b.height), aspect: b.width / b.height }));
    });
  }

  viaImages()
    .catch((e) => {
      log("cách A lỗi:", String((e && e.message) || e), "→ thử cách B");
      path = "B:" + String((e && e.message) || e).slice(0, 30);
      debugPages.length = 0;
      return viaFetch();
    })
    .then((pages) => (root.dataset.debug === "1" ? renderDebug() : render(pages)))
    .catch((e) => {
      const msg = String((e && e.message) || e);
      status("⚠ " + msg.slice(0, 40));
      log("lỗi, giữ chế độ 2 trang:", msg);
    });
}

// Bản chỉ gồm ký tự ASCII (tiếng Việt → \uXXXX) để nhúng an toàn qua base64
export function buildClientScriptAscii() {
  return buildClientScript().replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

let cachedB64 = null;
export function clientScriptBase64() {
  if (!cachedB64) cachedB64 = btoa(buildClientScriptAscii());
  return cachedB64;
}

export function buildClientScript() {
  return (
    "/* TRMNL × MangaDex – panel mode */\n" +
    // Công cụ đóng gói của Cloudflare có thể chèn __name(fn, "tên") vào code → định nghĩa sẵn cho trình duyệt
    "var __name = function (f) { return f; };\n" +
    detectPanels.toString() + "\n" +
    choosePanels.toString() + "\n" +
    layoutPair.toString() + "\n" +
    layoutSingle.toString() + "\n" +
    clientMain.toString() + "\n" +
    'if (document.getElementById("mdx-root")) clientMain(); else document.addEventListener("DOMContentLoaded", clientMain);\n'
  );
}
