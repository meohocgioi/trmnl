// Các trang HTML: /setup (cài đặt bot) và /preview (xem thử khung TRMNL)
import { VERSION } from "./version.js";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

const STYLE = `
  body{margin:0;padding:24px;background:#f4f4f2;font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.55}
  main{max-width:640px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:12px;padding:24px}
  h1{font-size:22px;margin:0 0 4px}
  .muted{color:#666;font-size:14px}
  input{width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #bbb;border-radius:8px;margin:8px 0}
  button{padding:12px 18px;font-size:16px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer}
  .ok{color:#137333}.err{color:#b3261e}
  code{background:#f0f0f0;padding:2px 6px;border-radius:4px;word-break:break-all}
  ol li{margin-bottom:6px}
  a.btn{display:inline-block;padding:12px 18px;background:#229ED9;color:#fff;border-radius:8px;text-decoration:none}
`;

function shell(title, body) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>${STYLE}</style></head><body><main>${body}
<p class="muted" style="margin-top:24px">TRMNL × MangaDex · v${VERSION}</p></main></body></html>`;
}

export function setupPage({ origin, config, bot, webhook, message, error }) {
  if (!config.botToken && !bot) {
    return shell(
      "Cài đặt bot",
      `<h1>Cài đặt bot Telegram</h1>
<p class="muted">Chỉ cần làm 1 lần.</p>
${error ? `<p class="err">⚠️ ${esc(error)}</p>` : ""}
<ol>
  <li>Mở Telegram, chat với <b>@BotFather</b>, gõ <code>/newbot</code>, đặt tên bot.</li>
  <li>BotFather gửi lại một <b>token</b> dạng <code>123456:ABC-xyz…</code> – copy nó.</li>
  <li>Dán token vào ô dưới rồi bấm <b>Lưu</b>.</li>
</ol>
<form method="post" action="/setup">
  <input name="token" placeholder="Dán bot token vào đây" autocomplete="off" required>
  <button type="submit">Lưu</button>
</form>`
    );
  }
  const owner = config.ownerId
    ? `<p class="ok">✅ Chủ bot: <b>${esc(config.ownerName || config.ownerId)}</b></p>`
    : `<p>👉 Bước cuối: mở bot và bấm <b>Start</b>. Người bấm Start <b>đầu tiên</b> sẽ thành chủ bot.</p>
       ${bot ? `<p><a class="btn" href="https://t.me/${esc(bot.username)}" target="_blank">Mở @${esc(bot.username)}</a></p>` : ""}`;
  return shell(
    "Cài đặt bot",
    `<h1>Bot đã sẵn sàng</h1>
${message ? `<p class="ok">${esc(message)}</p>` : ""}
${error ? `<p class="err">⚠️ ${esc(error)}</p>` : ""}
<p>${bot ? `🤖 Bot: <b>@${esc(bot.username)}</b>` : "🤖 Bot: (không kiểm tra được token)"}</p>
<p>${webhook && webhook.url ? `<span class="ok">✅ Đã nối bot với Worker</span>` : `<span class="err">⚠️ Chưa nối bot với Worker</span>`}
${webhook && webhook.last_error_message ? `<br><span class="err">Lỗi gần nhất: ${esc(webhook.last_error_message)}</span>` : ""}</p>
${owner}
<h3>Dán vào TRMNL (ô Polling URL)</h3>
<p><code>${esc(origin)}/</code></p>
<p><a href="/preview">👀 Xem thử 2 trang truyện</a></p>
<form method="post" action="/setup"><input type="hidden" name="action" value="rewebhook">
<button type="submit">Nối lại bot (nếu bot không trả lời)</button></form>`
  );
}

export function previewPage(d) {
  if (!d.ok) return shell("Preview", `<h1>Lỗi</h1><p class="err">${esc(d.error)}</p><p><a href="">Thử lại</a></p>`);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TRMNL × MangaDex preview</title>
<style>
  body{margin:0;padding:24px;background:#ddd;font-family:system-ui,sans-serif}
  .frame{width:800px;height:480px;background:#fff;display:flex;flex-direction:column;
    border:1px solid #999;box-sizing:border-box;padding:8px;gap:6px;filter:grayscale(1)}
  .pages{flex:1;display:flex;gap:8px;min-height:0}
  .pages div{flex:1;display:flex;align-items:center;justify-content:center;min-width:0}
  .pages img{max-width:100%;max-height:100%;object-fit:contain}
  .bar{display:flex;justify-content:space-between;font-size:13px;border-top:2px solid #000;padding-top:4px}
  .meta{margin-top:12px;font-size:14px;line-height:1.6}
</style></head><body>
<div class="frame">
  <div class="pages">
    <div><img src="${esc(d.left_image)}" alt="page ${d.left_page}"></div>
    <div><img src="${esc(d.right_image)}" alt="page ${d.right_page}"></div>
  </div>
  <div class="bar"><b>${esc(d.manga_title)}</b>
    <span>${esc(d.chapter_label)} · p.${d.page_first}–${d.page_second}/${d.pages_total} · ${esc(d.credit)}</span></div>
</div>
<div class="meta">
  ${d.author ? `Tác giả: <b>${esc(d.author)}</b> (${d.author_titles} bộ) · ` : ""}
  Hướng đọc: <b>${d.direction === "rtl" ? "phải → trái (manga Nhật)" : "trái → phải"}</b> ·
  <a href="${esc(d.chapter_url)}" target="_blank">Mở chương trên MangaDex</a> ·
  <a href="">Random lại</a>
</div>
</body></html>`;
}
