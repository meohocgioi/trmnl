/**
 * /lab — trang so sánh cách chọn ô truyện (10 ví dụ, 4 cách chọn A–D).
 * Người dùng chọn cách hợp nhất cho từng ví dụ → gửi kết quả qua bot / copy.
 * Mọi xử lý ảnh chạy trong trình duyệt, giống hệt trên TRMNL.
 */
import { detectPanels, detectPanelsV1, choosePanels, layoutPair, layoutSingle } from "./panels-client.js";

export const LAB_STRATS = [
  ["E", "Mới (A+B)", "Đang dùng: phủ kín màn hình như A, ưu tiên ô nhiều nét vẽ như B"],
  ["A", "Ô to nhất", "Ưu tiên 1 ô phủ kín màn hình, không có thì 2 ô"],
  ["B", "Nhiều nét vẽ", "Ưu tiên ô có nhiều nội dung, vẫn phải vừa màn hình"],
];

// Chạy trong trình duyệt
function labMain() {
  const root = document.getElementById("lab");
  const KEY = root.dataset.key;
  const N = Number(root.dataset.n) || 10;
  const STRATS = JSON.parse(root.dataset.strats);
  const W = 784, H = 416, GAP = 8;
  const votes = {};
  const info = {};
  const summary = document.getElementById("sum");
  const note = document.getElementById("note");

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function code() {
    const parts = [];
    for (let i = 0; i < N; i++) {
      const v = votes[i];
      if (!v) continue;
      parts.push(i + 1 + (v.pick || "?") + (v.wrong ? "x" : ""));
    }
    return parts.join(" ");
  }
  function refresh() {
    const c = code();
    const n = Object.values(votes).filter((v) => v.pick).length;
    summary.textContent = c ? "Kết quả (" + n + "/" + N + "): " + c : "Chưa chọn ví dụ nào";
  }

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("không tải được ảnh"));
      im.src = src;
    });
  }
  function grayOf(im) {
    const AW = Math.min(600, im.naturalWidth);
    const AH = Math.round((im.naturalHeight * AW) / im.naturalWidth);
    const c = document.createElement("canvas");
    c.width = AW;
    c.height = AH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, AW, AH);
    ctx.drawImage(im, 0, 0, AW, AH);
    const px = ctx.getImageData(0, 0, AW, AH).data;
    const g = new Uint8Array(AW * AH);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
    return { g, AW, AH };
  }

  // Vẽ khung 800×480 giống TRMNL (ảnh 1-bit, dither)
  function drawScreen(canvas, imgs, ch, rtl, bar) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 800, 480);
    if (ch) {
      const L = ch.L;
      const sizes = L.sizes;
      const order = ch.items.map((_, n) => n);
      if (L.mode !== "col" && rtl) order.reverse(); // manga Nhật: ô đọc trước nằm bên phải
      const tot = L.mode === "col"
        ? sizes.reduce((a, s) => a + s.h, 0) + GAP * (sizes.length - 1)
        : sizes.reduce((a, s) => a + s.w, 0) + GAP * (sizes.length - 1);
      let pos = L.mode === "col" ? 8 + (H - tot) / 2 : 8 + (W - tot) / 2;
      for (const n of order) {
        const it = ch.items[n];
        const s = sizes[n];
        const im = imgs[it.k];
        const r = it.r;
        const sx = r.x * im.naturalWidth, sy = r.y * im.naturalHeight;
        const sw = r.w * im.naturalWidth, sh = r.h * im.naturalHeight;
        const dx = L.mode === "col" ? 8 + (W - s.w) / 2 : pos;
        const dy = L.mode === "col" ? pos : 8 + (H - s.h) / 2;
        ctx.drawImage(im, sx, sy, sw, sh, dx, dy, s.w, s.h);
        pos += (L.mode === "col" ? s.h : s.w) + GAP;
      }
    }
    // dither Floyd–Steinberg → đen/trắng như màn e-ink
    const id = ctx.getImageData(0, 0, 800, 432);
    const d = id.data;
    const f = new Float32Array(800 * 432);
    for (let i = 0, j = 0; i < f.length; i++, j += 4) f[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
    for (let y = 0; y < 432; y++) {
      for (let x = 0; x < 800; x++) {
        const i = y * 800 + x;
        const o = f[i] < 128 ? 0 : 255;
        const e = f[i] - o;
        f[i] = o;
        if (x + 1 < 800) f[i + 1] += (e * 7) / 16;
        if (y + 1 < 432) {
          if (x > 0) f[i + 799] += (e * 3) / 16;
          f[i + 800] += (e * 5) / 16;
          if (x + 1 < 800) f[i + 801] += e / 16;
        }
      }
    }
    for (let i = 0, j = 0; i < f.length; i++, j += 4) d[j] = d[j + 1] = d[j + 2] = f[i];
    ctx.putImageData(id, 0, 0);
    ctx.fillStyle = "#eee";
    ctx.fillRect(8, 436, 784, 36);
    ctx.fillStyle = "#000";
    ctx.font = "15px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(bar, 18, 454);
  }

  // Ảnh 2 trang + khung ô máy tìm được (thuật toán mới)
  function drawOverlay(canvas, imgs, pages, rtl) {
    const Hh = 420;
    const ws = imgs.map((im) => (im.naturalWidth * Hh) / im.naturalHeight);
    canvas.width = Math.round(ws[0] + ws[1] + 12);
    canvas.height = Hh;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, Hh);
    const xs = rtl ? [ws[1] + 12, 0] : [0, ws[0] + 12]; // trang đầu bên phải nếu đọc phải→trái
    let num = 0;
    pages.forEach((pg, k) => {
      ctx.drawImage(imgs[k], xs[k], 0, ws[k], Hh);
      pg.panels.forEach((r) => {
        num++;
        const skip = (typeof r.ink === "number" && r.ink < 0.015) || r.h < 0.1 || r.w < 0.15;
        const x = xs[k] + r.x * ws[k], y = r.y * Hh, w = r.w * ws[k], h = r.h * Hh;
        ctx.lineWidth = 3;
        ctx.strokeStyle = skip ? "#999" : "#e0002a";
        ctx.setLineDash(skip ? [6, 5] : []);
        ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
        ctx.setLineDash([]);
        ctx.fillStyle = skip ? "#999" : "#e0002a";
        ctx.fillRect(x + 2, y + 2, 24, 20);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(String(num), x + 6, y + 12);
      });
    });
  }

  async function one(i) {
    const card = el("section", "card");
    card.innerHTML = '<h2>Ví dụ ' + (i + 1) + '</h2><p class="st">⏳ Đang lấy trang truyện…</p>';
    document.getElementById("list").appendChild(card);
    const st = card.querySelector(".st");
    try {
      const res = await fetch("/lab/pick?key=" + encodeURIComponent(KEY) + "&i=" + i);
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "lỗi");
      st.textContent = "⏳ Đang tải ảnh…";
      const imgs = await Promise.all([d.first_image, d.second_image].map(loadImg));
      const rtl = d.direction === "rtl";
      st.textContent = "⏳ Đang tìm ô…";
      const grays = imgs.map(grayOf);
      const pagesNew = grays.map((g, k) => ({ panels: detectPanels(g.g, g.AW, g.AH, rtl), aspect: imgs[k].naturalWidth / imgs[k].naturalHeight }));
      const pagesOld = grays.map((g, k) => ({ panels: detectPanelsV1(g.g, g.AW, g.AH, rtl), aspect: imgs[k].naturalWidth / imgs[k].naturalHeight }));
      const nNew = pagesNew.reduce((a, p) => a + p.panels.length, 0);
      const nOld = pagesOld.reduce((a, p) => a + p.panels.length, 0);
      st.innerHTML =
        "<b>" + esc(d.manga_title) + "</b> · " + esc(d.chapter_label) + " · trang " + d.page_first + "–" + d.page_second + "/" + d.pages_total +
        '<br><span class="mut">Thuật toán mới tìm được <b>' + nNew + " ô</b> (cũ: " + nOld + " ô). Khung xám nét đứt = ô bỏ qua (trống / quá mỏng).</span>";
      const ov = el("canvas", "ov");
      card.appendChild(ov);
      drawOverlay(ov, imgs, pagesNew, rtl);

      const grid = el("div", "grid");
      card.appendChild(grid);
      const seen = {};
      info[i] = { t: d.manga_title, ch: d.chapter_label, p: d.page_first, n: nNew, o: {} };
      STRATS.forEach(([sk, name, desc]) => {
        const ch = choosePanels(sk === "D" ? pagesOld : pagesNew, sk, W, H, GAP, d.panel_seed, "auto");
        const sig = ch ? ch.items.map((it) => it.k + ":" + it.r.x.toFixed(3) + "," + it.r.y.toFixed(3) + "," + it.r.w.toFixed(3)).join("|") : "none";
        const same = seen[sig];
        if (!same) seen[sig] = sk;
        const lab = ch ? (ch.n === 1 ? "ô " + (ch.i + 1) : "ô " + (ch.i + 1) + "–" + (ch.i + 2)) + "/" + ch.total : "không có ô";
        if (ch) info[i].o[sk] = { s: lab, f: Math.round(ch.L.fill * 100), k: Math.round(ch.items.reduce((a, it) => a + (it.r.ink || 0), 0) / ch.n * 1000) / 10, sameAs: same || "" };
        const box = el("label", "opt");
        box.innerHTML =
          '<div class="oh"><input type="radio" name="v' + i + '" value="' + sk + '"> <b>' + sk + " · " + esc(name) + "</b>" +
          (same ? ' <span class="same">giống ' + same + "</span>" : "") + '<br><span class="mut">' + esc(desc) + "</span></div>";
        const cv = el("canvas", "scr");
        cv.width = 800;
        cv.height = 480;
        box.appendChild(cv);
        grid.appendChild(box);
        drawScreen(cv, imgs, ch, rtl, d.manga_title + "   " + lab + " · " + d.chapter_label + " · p." + d.page_first + "–" + d.page_second);
      });
      const foot = el("div", "foot");
      foot.innerHTML =
        '<label><input type="radio" name="v' + i + '" value="-"> Không cách nào ổn</label>' +
        '<label><input type="checkbox" class="wrong"> Khung đỏ cắt ô sai</label>';
      card.appendChild(foot);
      card.addEventListener("change", () => {
        const r = card.querySelector('input[type=radio]:checked');
        votes[i] = { pick: r ? r.value : "", wrong: card.querySelector(".wrong").checked };
        card.classList.toggle("done", !!r);
        refresh();
      });
    } catch (e) {
      st.textContent = "⚠ " + (e && e.message ? e.message : e);
    }
  }

  document.getElementById("copy").addEventListener("click", () => {
    const t = "LAB " + code() + (note.value.trim() ? " | " + note.value.trim() : "");
    const ok = () => (document.getElementById("msg").textContent = "✅ Đã copy – dán vào chat với Claude");
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, () => prompt("Copy dòng này:", t));
    else prompt("Copy dòng này:", t);
  });
  document.getElementById("send").addEventListener("click", async () => {
    const msg = document.getElementById("msg");
    msg.textContent = "⏳ Đang gửi…";
    try {
      const r = await fetch("/lab/vote?key=" + encodeURIComponent(KEY), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code(), note: note.value.trim(), votes, info }),
      });
      const d = await r.json();
      msg.textContent = d.ok ? "✅ Đã gửi qua bot Telegram" : "⚠ " + (d.error || "lỗi");
    } catch (e) {
      msg.textContent = "⚠ " + e.message;
    }
  });
  refresh();
  (async () => {
    for (let i = 0; i < N; i++) await one(i); // lần lượt – tôn trọng giới hạn MangaDex
  })();
}

export function labPage(key, n = 10) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const script =
    "var __name = function (f) { return f; };\n" +
    [detectPanels, detectPanelsV1, choosePanels, layoutPair, layoutSingle, labMain].map((f) => f.toString()).join("\n") +
    "\nlabMain();\n";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chọn cách hiện ô truyện</title>
<style>
  body{margin:0;background:#f2f2f2;font-family:system-ui,-apple-system,sans-serif;color:#111}
  header{padding:16px;background:#111;color:#fff}
  header h1{margin:0 0 6px;font-size:20px}
  header p{margin:4px 0;font-size:14px;color:#ccc;line-height:1.45}
  main{padding:12px;max-width:1100px;margin:auto}
  .card{background:#fff;border-radius:12px;padding:14px;margin:0 0 16px;box-shadow:0 1px 3px #0002;border:3px solid transparent}
  .card.done{border-color:#1a7f37}
  .card h2{margin:0 0 4px;font-size:18px}
  .st{margin:0 0 10px;font-size:14px;line-height:1.5}
  .mut{color:#666;font-size:13px}
  .ov{width:100%;max-width:640px;height:auto;display:block;margin:0 auto 12px;border:1px solid #ddd}
  .grid{display:grid;grid-template-columns:1fr;gap:12px}
  @media(min-width:760px){.grid{grid-template-columns:1fr 1fr}}
  .opt{display:block;border:2px solid #ddd;border-radius:10px;padding:8px;cursor:pointer}
  .opt:has(input:checked){border-color:#1a7f37;background:#eefbf1}
  .oh{font-size:14px;margin-bottom:6px;line-height:1.4}
  .oh input{transform:scale(1.4);margin-right:6px}
  .same{background:#ffe9a8;border-radius:6px;padding:1px 6px;font-size:12px}
  .scr{width:100%;height:auto;display:block;border:6px solid #222;border-radius:6px;background:#fff}
  .foot{display:flex;flex-wrap:wrap;gap:18px;margin-top:10px;font-size:15px}
  .foot input{transform:scale(1.3);margin-right:6px}
  .bar{position:sticky;bottom:0;background:#fff;border-top:1px solid #ccc;padding:10px 12px;box-shadow:0 -2px 6px #0001}
  .bar .in{max-width:1100px;margin:auto;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  #sum{flex:1 1 100%;font-size:14px;font-family:ui-monospace,monospace}
  #note{flex:1 1 220px;padding:8px;font-size:14px;border:1px solid #bbb;border-radius:8px}
  button{padding:10px 14px;font-size:15px;border-radius:8px;border:0;background:#111;color:#fff}
  #msg{font-size:14px}
</style></head><body>
<header>
  <h1>Chọn cách hiện ô truyện cho TRMNL</h1>
  <p><b>E</b> là thuật toán mới làm từ lựa chọn lần trước của bạn (đang chạy trên TRMNL). Nếu E đúng ý, chọn E.</p>
  <p>${n} ví dụ lấy từ nguồn truyện bạn đang chọn (và vài trang Junji Ito). Mỗi ví dụ có 2 trang truyện với các ô máy tìm được (khung đỏ), rồi ${LAB_STRATS.length} cách chọn ô hiện đúng như màn hình TRMNL 800×480.</p>
  <p>👉 Với mỗi ví dụ, chạm vào cách bạn thấy <b>hợp nhất</b> (hoặc "Không cách nào ổn"). Nếu khung đỏ cắt sai ô, tích "Khung đỏ cắt ô sai". Xong bấm <b>Gửi qua bot</b> hoặc <b>Copy</b> rồi dán cho Claude.</p>
</header>
<main><div id="lab" data-key="${esc(key)}" data-n="${n}" data-strats="${esc(JSON.stringify(LAB_STRATS))}"></div><div id="list"></div></main>
<div class="bar"><div class="in">
  <div id="sum"></div>
  <input id="note" placeholder="Ghi chú thêm (không bắt buộc)">
  <button id="send">📨 Gửi qua bot</button>
  <button id="copy">📋 Copy</button>
  <span id="msg"></span>
</div></div>
<script>${script.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>`;
}
