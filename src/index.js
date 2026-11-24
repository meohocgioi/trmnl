/**
 * TRMNL × MangaDex — Cloudflare Worker
 *
 *   GET  /          → JSON cho TRMNL (Polling URL)
 *   GET  /preview   → xem thử khung 800×480 trên trình duyệt
 *   GET  /img?...   → proxy ảnh trang truyện (MangaDex không cho hotlink)
 *   GET  /setup     → trang cài đặt bot Telegram (dán token 1 lần)
 *   POST /tg        → webhook Telegram
 *
 * Cài đặt + trạng thái được lưu trong 1 Durable Object (miễn phí, tự tạo khi deploy).
 */
import { DurableObject } from "cloudflare:workers";
import { VERSION } from "./version.js";
import { mergeOptions, pickPages, publicResult, handleImage, pinChapter, isUuid, loadHistory, recordHistory } from "./manga.js";
import { tg, handleUpdate, notifyNewVersion, COMMANDS } from "./telegram.js";
import { setupPage, previewPage } from "./pages.js";
import { buildClientScript } from "./panels-client.js";
import { labPage } from "./lab.js";
import { AUTO_AUTHOR } from "./manga.js";

export class Store extends DurableObject {
  async getItem(key) {
    return (await this.ctx.storage.get(key)) ?? null;
  }
  async setItem(key, value) {
    await this.ctx.storage.put(key, value);
  }
  async deleteItem(key) {
    await this.ctx.storage.delete(key);
  }
}

function getStore(env) {
  return env.STORE.get(env.STORE.idFromName("main"));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const store = getStore(env);
    try {
      switch (url.pathname) {
        case "/":
        case "/pages":
          return await handleTrmnl(url, env, ctx, store);
        case "/img":
          return await handleImage(url, ctx);
        case "/preview": {
          if (!(await keyOk(url, store))) return html(previewPage({ ok: false, error: "Link thiếu mã khoá. Gõ /url cho bot để lấy link xem thử." }), 403);
          const settings = await store.getItem("settings");
          let d;
          try {
            d = await pickPages(mergeOptions(settings, url.searchParams), url.origin, store);
          } catch (e) {
            d = { ok: false, error: e.message };
          }
          return html(previewPage(d));
        }
        case "/setup":
          return await handleSetup(request, url, env, store);
        case "/lab":
        case "/lab/pick":
        case "/lab/vote":
          return await handleLab(request, url, env, store);
        case "/tg":
          return await handleWebhook(request, url, env, ctx, store);
        case "/panels.js":
          return new Response(buildClientScript(), {
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "public, max-age=300",
              "Access-Control-Allow-Origin": "*",
            },
          });
        case "/pin": {
          // Ghim 1 chương/trang cho lần làm mới TRMNL tới (cần mã khoá): /pin?key=…&ch=<chapterId>&p=<index trang đầu, từ 0>
          const cfg = (await store.getItem("config")) || {};
          if (!cfg.accessKey || url.searchParams.get("key") !== cfg.accessKey) return json({ ok: false, error: "forbidden" }, 403);
          const ch = url.searchParams.get("ch") || "";
          const idx = Number.parseInt(url.searchParams.get("p") || "0", 10);
          if (!isUuid(ch) || !(idx >= 0)) return json({ ok: false, error: "ch/p không hợp lệ" }, 400);
          const settings = await store.getItem("settings");
          const r = await pinChapter(ch, idx, mergeOptions(settings, url.searchParams), url.origin);
          await store.setItem("pin_next", r);
          return json({ ok: true, pinned: `${r.manga_title} · ${r.chapter_label} · p.${r.page_first}–${r.page_second}`, view: r.view });
        }
        case "/notify": {
          // Gọi ngay sau khi deploy để bot nhắn change log liền (cần mã khoá)
          const cfg = (await store.getItem("config")) || {};
          if (!cfg.accessKey || url.searchParams.get("key") !== cfg.accessKey) return json({ ok: false, error: "forbidden" }, 403);
          const token = await botToken(env, store);
          const before = cfg.notifiedVersion || "";
          await notifyNewVersion(store, token);
          return json({ ok: true, version: VERSION, notified: before !== VERSION });
        }
        case "/version":
          return json({ version: VERSION });
        case "/favicon.ico":
          return new Response(null, { status: 204 });
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (err) {
      const message = (err && err.message) || String(err);
      if (url.pathname === "/img") return new Response(message, { status: 502 });
      return json({ ok: false, error: message });
    }
  },

  // Chạy định kỳ (xem wrangler.jsonc): báo change log sau khi có bản mới
  async scheduled(event, env, ctx) {
    const store = getStore(env);
    const token = await botToken(env, store);
    ctx.waitUntil(notifyNewVersion(store, token).catch(() => {}));
  },
};

/* ------------------------------------------------------------------ */

async function handleTrmnl(url, env, ctx, store) {
  if (!(await keyOk(url, store))) {
    return json({ ok: false, error: "Thiếu hoặc sai mã khoá. Gõ /url cho bot để lấy link mới dán vào TRMNL." }, 403);
  }
  ctx.waitUntil(botToken(env, store).then((t) => notifyNewVersion(store, t)).catch(() => {}));
  const [settings, pinned, history] = await Promise.all([store.getItem("settings"), store.getItem("pin_next"), loadHistory(store)]);
  let result;
  if (pinned && pinned.ok && !url.searchParams.has("nopin")) {
    result = { ...pinned, pinned: true, generated_at: new Date().toISOString() };
    await store.deleteItem("pin_next");
  } else {
    try {
      result = await pickPages(mergeOptions(settings, url.searchParams), url.origin, store, history.avoid, history.hist);
    } catch (e) {
      return json({ ok: false, error: e.message });
    }
  }
  await recordHistory(store, history, result); // ghi nhớ 7 ngày; nếu lặp cặp cũ → đổi sang ô khác
  await store.setItem("last_trmnl", result);
  // Tạm thời: kèm kết quả /lab mới nhất (trong 3 giờ) để Claude đọc qua TRMNL và tinh chỉnh thuật toán
  const out = publicResult(result);
  const lv = (await store.getItem("lab_votes")) || [];
  const last = lv[lv.length - 1];
  if (last && Date.now() - Date.parse(last.at) < 3 * 3600e3) out.lab_last = { at: last.at, code: last.code, info: last.info || {} };
  return json(out);
}

async function handleWebhook(request, url, env, ctx, store) {
  if (request.method !== "POST") return new Response("OK");
  const config = (await store.getItem("config")) || {};
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!config.webhookSecret || secret !== config.webhookSecret) return new Response("Forbidden", { status: 403 });
  const token = await botToken(env, store);
  await ensureAccessKey(store);
  const update = await request.json().catch(() => null);
  if (!update || !token) return new Response("OK");
  // Trả lời Telegram ngay, xử lý phía sau (lấy ảnh từ MangaDex có thể mất vài giây)
  ctx.waitUntil(
    (async () => {
      await notifyNewVersion(store, token).catch(() => {});
      await handleUpdate(update, { store, origin: url.origin, token, ctx }).catch((e) => console.log("update error", e));
    })()
  );
  return new Response("OK");
}

async function handleSetup(request, url, env, store) {
  const config = (await store.getItem("config")) || {};
  let message = "";
  let error = "";

  if (request.method === "POST") {
    const form = await request.formData();
    const action = form.get("action") || "";
    const submitted = String(form.get("token") || "").trim();
    if (!action && submitted) {
      if (config.botToken || env.BOT_TOKEN) {
        error = "Bot đã có token rồi. Muốn đổi bot, hãy nhờ người hỗ trợ.";
      } else if (!/^\d{5,}:[\w-]{30,}$/.test(submitted)) {
        error = "Token không đúng định dạng. Copy lại nguyên văn từ BotFather nhé.";
      } else {
        try {
          await tg(submitted, "getMe");
          config.botToken = submitted;
          await store.setItem("config", config);
          message = "✅ Đã lưu token.";
        } catch (e) {
          error = "Telegram báo token sai hoặc đã bị thu hồi.";
        }
      }
    }
    const token = await botToken(env, store);
    if (token && !error) {
      try {
        await registerWebhook(token, url.origin, store);
        message = (message ? message + " " : "") + "✅ Đã nối bot với Worker.";
      } catch (e) {
        error = e.message;
      }
    }
  }

  const fresh = (await store.getItem("config")) || {};
  const token = await botToken(env, store);
  let bot = null;
  let webhook = null;
  if (token) {
    bot = await tg(token, "getMe").catch(() => null);
    webhook = await tg(token, "getWebhookInfo").catch(() => null);
  }
  return html(setupPage({ origin: url.origin, config: { ...fresh, botToken: token }, bot, webhook, message, error }));
}

async function registerWebhook(token, origin, store) {
  const config = (await store.getItem("config")) || {};
  const secret = randomHex(24);
  await tg(token, "setWebhook", {
    url: `${origin}/tg`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  config.webhookSecret = secret;
  config.origin = origin;
  await store.setItem("config", config);
  await ensureAccessKey(store);
  await tg(token, "setMyCommands", {
    commands: COMMANDS.map(([command, description]) => ({ command, description })),
  }).catch(() => {});
}

// Mã khoá riêng: sau khi cài bot, link TRMNL & /preview phải có ?key=… (lấy bằng lệnh /url)
async function ensureAccessKey(store) {
  const config = (await store.getItem("config")) || {};
  if (config.accessKey) return config.accessKey;
  config.accessKey = randomHex(12);
  await store.setItem("config", config);
  return config.accessKey;
}

// Trang so sánh cách chọn ô (cần mã khoá)
async function handleLab(request, url, env, store) {
  const config = (await store.getItem("config")) || {};
  if (!config.accessKey || url.searchParams.get("key") !== config.accessKey) {
    return url.pathname === "/lab" ? html("<p>Link thiếu mã khoá. Gõ /lab cho bot để lấy link.</p>", 403) : json({ ok: false, error: "forbidden" }, 403);
  }
  if (url.pathname === "/lab") return html(labPage(config.accessKey, 10));
  if (url.pathname === "/lab/pick") {
    const i = Number.parseInt(url.searchParams.get("i") || "0", 10) || 0;
    const settings = (await store.getItem("settings")) || {};
    let s = settings;
    // 6 ví dụ đầu: nguồn đang chọn · 4 ví dụ cuối: Junji Ito (nếu nguồn đang chọn chưa phải Junji Ito)
    const isIto = !settings.mangaId && !settings.authorId && (settings.author || AUTO_AUTHOR) === AUTO_AUTHOR;
    if (i >= 6 && !isIto) {
      s = { ...settings, author: AUTO_AUTHOR };
      for (const k of ["mangaId", "mangaTitle", "mangaLang", "authorId"]) delete s[k];
    }
    try {
      const r = await pickPages(mergeOptions(s), url.origin, store);
      const { panels_js_b64, ...rest } = publicResult(r);
      return json(rest);
    } catch (e) {
      return json({ ok: false, error: e.message });
    }
  }
  // /lab/vote
  if (request.method !== "POST") return json({ ok: false, error: "POST" }, 405);
  const body = await request.json().catch(() => ({}));
  const entry = { at: new Date().toISOString(), code: String(body.code || "").slice(0, 400), note: String(body.note || "").slice(0, 500), votes: body.votes || {}, info: body.info || {} };
  const all = (await store.getItem("lab_votes")) || [];
  all.push(entry);
  await store.setItem("lab_votes", all.slice(-20));
  const token = await botToken(env, store);
  if (token && config.ownerId) {
    const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    await tg(token, "sendMessage", {
      chat_id: config.ownerId,
      parse_mode: "HTML",
      text: `🧪 <b>Kết quả chọn ô truyện</b>\n\n<code>LAB ${esc(entry.code || "(trống)")}${entry.note ? " | " + esc(entry.note) : ""}</code>\n\n<i>Chạm để copy rồi dán cho Claude.</i>`,
    }).catch(() => {});
  }
  return json({ ok: true });
}

async function keyOk(url, store) {
  const config = (await store.getItem("config")) || {};
  return !config.accessKey || url.searchParams.get("key") === config.accessKey;
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function botToken(env, store) {
  if (env.BOT_TOKEN) return env.BOT_TOKEN;
  const config = (await store.getItem("config")) || {};
  return config.botToken || "";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
