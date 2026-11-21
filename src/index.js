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
import { mergeOptions, pickPages, publicResult, handleImage } from "./manga.js";
import { tg, handleUpdate, notifyNewVersion, COMMANDS } from "./telegram.js";
import { setupPage, previewPage } from "./pages.js";

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
        case "/tg":
          return await handleWebhook(request, url, env, ctx, store);
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
  ctx.waitUntil(botToken(env, store).then((t) => notifyNewVersion(store, t)).catch(() => {}));
  const [settings, pinned] = await Promise.all([store.getItem("settings"), store.getItem("pin_next")]);
  let result;
  if (pinned && pinned.ok && !url.searchParams.has("nopin")) {
    result = { ...pinned, pinned: true, generated_at: new Date().toISOString() };
    await store.deleteItem("pin_next");
  } else {
    try {
      result = await pickPages(mergeOptions(settings, url.searchParams), url.origin, store);
    } catch (e) {
      return json({ ok: false, error: e.message });
    }
  }
  await store.setItem("last_trmnl", result);
  return json(publicResult(result));
}

async function handleWebhook(request, url, env, ctx, store) {
  if (request.method !== "POST") return new Response("OK");
  const config = (await store.getItem("config")) || {};
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!config.webhookSecret || secret !== config.webhookSecret) return new Response("Forbidden", { status: 403 });
  const token = await botToken(env, store);
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
  const secret = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await tg(token, "setWebhook", {
    url: `${origin}/tg`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  config.webhookSecret = secret;
  config.origin = origin;
  await store.setItem("config", config);
  await tg(token, "setMyCommands", {
    commands: COMMANDS.map(([command, description]) => ({ command, description })),
  }).catch(() => {});
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

function html(body) {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
