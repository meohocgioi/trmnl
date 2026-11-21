// Script chạy TRONG trình duyệt của TRMNL (và trang /preview):
// tìm các ô truyện trên 2 trang, chọn 2 ô liền nhau, phóng to cho kín màn hình.
// Worker phục vụ file này tại /panels.js → sửa thuật toán chỉ cần cập nhật GitHub.
//
// Các hàm dưới đây phải TỰ ĐỦ (không dùng biến bên ngoài) vì được gửi đi dạng text.

// gray: mảng độ sáng 0..255 (w*h). Trả về các ô theo thứ tự đọc, toạ độ dạng tỉ lệ 0..1.
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

  function split(r0, depth) {
    const r = trim(r0);
    if (!r) return;
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
  return out;
}

// Xếp 2 ô (tỉ lệ rộng/cao a1, a2) vào khung W×H: ngang hoặc dọc, chọn cách phủ kín nhất
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
  if (root.dataset.view !== "panels") {
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
    return detectPanels(gray, AW, AH, rtl);
  }

  function render(pages) {
    // pages: [{ panels:[...], aspect: natW/natH }]
    const all = [];
    pages.forEach((pg, k) => pg.panels.forEach((r) => all.push({ k, r, aspectPage: pg.aspect })));
    log("tìm thấy", all.length, "ô", pages.map((p) => p.panels.length));
    if (all.length < 2) {
      status("⚠ chỉ thấy " + all.length + " ô");
      return log("ít hơn 2 ô → giữ chế độ 2 trang");
    }
    const box = root.getBoundingClientRect();
    const aspect = (p) => (p.r.w / p.r.h) * p.aspectPage;
    const options = [];
    for (let k = 0; k + 1 < all.length; k++) {
      options.push({ k, L: layoutPair(aspect(all[k]), aspect(all[k + 1]), box.width, box.height, GAP) });
    }
    const good = options.filter((o) => o.L.fill >= 0.72);
    const pool = good.length ? good : [options.reduce((a, b) => (b.L.fill > a.L.fill ? b : a))];
    const chosen = pool[seed % pool.length];
    const i = chosen.k;
    const L = chosen.L;
    const pair = [all[i], all[i + 1]];

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:" + GAP + "px;" +
      "flex-direction:" + (L.mode === "row" ? (rtl ? "row-reverse" : "row") : "column");
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
    if (info) info.textContent = "ô " + (i + 1) + "–" + (i + 2) + "/" + all.length + " · ";
    log("xong: ô", i + 1, "–", i + 2, L.mode, "phủ", Math.round(L.fill * 100) + "%");
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
      return viaFetch();
    })
    .then(render)
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
    detectPanels.toString() + "\n" +
    layoutPair.toString() + "\n" +
    clientMain.toString() + "\n" +
    'if (document.getElementById("mdx-root")) clientMain(); else document.addEventListener("DOMContentLoaded", clientMain);\n'
  );
}
