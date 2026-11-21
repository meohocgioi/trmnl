// Bot Telegram: chỉ chủ bot điều khiển được
import { VERSION, CHANGELOG } from "./version.js";
import {
  AUTO_AUTHOR,
  DEFAULT_SETTINGS,
  mergeOptions,
  pickPages,
  nextPages,
  authorMangaList,
  isUuid,
} from "./manga.js";

export const COMMANDS = [
  ["now", "2 trang đang hiện trên TRMNL"],
  ["new", "Random 2 trang mới"],
  ["auto", "Chế độ auto: chỉ truyện Junji Ito"],
  ["random", "Ngẫu nhiên toàn bộ MangaDex"],
  ["author", "Chỉ lấy truyện của 1 tác giả: /author Tên"],
  ["settings", "Xem & chỉnh cài đặt"],
  ["url", "Link dán vào TRMNL + link xem thử"],
  ["version", "Phiên bản & change log"],
  ["help", "Danh sách lệnh"],
];

export async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) {
    const err = new Error(`Telegram ${method}: ${data.description || res.status}`);
    err.tg = data;
    throw err;
  }
  return data.result;
}

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/* ------------------------------------------------------------------ */

export async function handleUpdate(update, { store, origin, token, ctx }) {
  const config = (await store.getItem("config")) || {};
  if (update.message) return onMessage(update.message, { store, origin, token, ctx, config });
  if (update.callback_query) return onCallback(update.callback_query, { store, origin, token, ctx, config });
}

async function onMessage(msg, env) {
  const { store, token, config } = env;
  const chatId = msg.chat.id;
  const fromId = msg.from && msg.from.id;
  const text = (msg.text || "").trim();
  const m = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const cmd = m ? m[1].toLowerCase() : "";
  const arg = m && m[2] ? m[2].trim() : "";

  // Người đầu tiên bấm /start trở thành chủ bot
  if (!config.ownerId && cmd === "start" && msg.chat.type === "private") {
    config.ownerId = fromId;
    config.ownerName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
    config.notifiedVersion = VERSION;
    await store.setItem("config", config);
    await send(token, chatId, `🎉 <b>Bạn đã là chủ bot.</b> Từ giờ chỉ bạn điều khiển được bot này.\n\n${helpText()}`);
    return;
  }
  if (!config.ownerId || fromId !== config.ownerId) {
    if (cmd === "start") await send(token, chatId, "🔒 Đây là bot riêng.");
    return;
  }

  const settings = { ...DEFAULT_SETTINGS, ...((await store.getItem("settings")) || {}) };

  switch (cmd) {
    case "start":
    case "help":
      return send(token, chatId, helpText());
    case "now": {
      const last = await store.getItem("last_trmnl");
      if (last && last.ok) return sendPick(env, chatId, last, "📺 <i>Đang hiện trên TRMNL</i>");
      await send(token, chatId, "TRMNL chưa lấy trang nào – mình random một cặp mới cho bạn:");
      return newPick(env, chatId, settings);
    }
    case "new":
      return newPick(env, chatId, settings);
    case "auto":
      settings.author = AUTO_AUTHOR;
      await store.setItem("settings", settings);
      return send(token, chatId, `✅ Chế độ <b>auto</b>: chỉ truyện của <b>${AUTO_AUTHOR}</b>.\n\n${settingsText(settings)}`, settingsKeyboard(settings));
    case "random":
      settings.author = "";
      await store.setItem("settings", settings);
      return send(token, chatId, `✅ Chế độ <b>ngẫu nhiên</b> toàn bộ MangaDex.\n\n${settingsText(settings)}`, settingsKeyboard(settings));
    case "author": {
      if (!arg) return send(token, chatId, "Gõ kèm tên tác giả, ví dụ:\n<code>/author Kentaro Miura</code>");
      await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" });
      try {
        const o = mergeOptions({ ...settings, author: arg.slice(0, 60) });
        const list = await authorMangaList(o, store, { force: true });
        settings.author = arg.slice(0, 60);
        await store.setItem("settings", settings);
        return send(
          token,
          chatId,
          `✅ Tác giả: <b>${esc(list.authorName)}</b> – ${list.mangas.length} bộ có bản ${o.lang.toUpperCase()}.\n\n${settingsText(settings)}`,
          settingsKeyboard(settings)
        );
      } catch (e) {
        return send(token, chatId, `⚠️ ${esc(e.message)}`);
      }
    }
    case "settings":
    case "status":
      return send(token, chatId, settingsText(settings), settingsKeyboard(settings));
    case "url":
      return send(
        token,
        chatId,
        `📋 <b>Polling URL</b> (dán vào plugin TRMNL):\n<code>${esc(env.origin)}/</code>\n\n👀 Xem thử trên trình duyệt:\n${esc(env.origin)}/preview\n\n⚙️ Trang cài đặt:\n${esc(env.origin)}/setup`
      );
    case "version":
      return send(token, chatId, changelogText(CHANGELOG[0], true));
    default:
      return send(token, chatId, "Không hiểu lệnh này. Gõ /help để xem danh sách lệnh.");
  }
}

async function onCallback(cq, env) {
  const { store, token, config } = env;
  const chatId = cq.message && cq.message.chat.id;
  if (!config.ownerId || cq.from.id !== config.ownerId) {
    return tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "🔒 Bot riêng" });
  }
  const data = cq.data || "";
  const settings = { ...DEFAULT_SETTINGS, ...((await store.getItem("settings")) || {}) };
  const ack = (text) => tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text }).catch(() => {});

  if (data === "new") {
    await ack("🎲 Đang random…");
    return newPick(env, chatId, settings);
  }

  const nx = data.match(/^nx:([0-9a-f-]{36})$/);
  if (nx && isUuid(nx[1])) {
    const prev = await store.getItem(`pick:${nx[1]}`);
    if (!prev) return ack("Cặp này cũ quá, bấm 🎲 để random mới");
    await ack("▶️ Đang lấy 2 trang tiếp…");
    try {
      const next = await nextPages(prev, mergeOptions(settings), env.origin);
      if (!next) return send(token, chatId, "📕 Hết chương rồi. Bấm 🎲 để random cặp khác.", pickKeyboard(null));
      return sendPick(env, chatId, next);
    } catch (e) {
      return send(token, chatId, `⚠️ ${esc(e.message)}`);
    }
  }

  const pin = data.match(/^pin:([0-9a-f-]{36})$/);
  if (pin && isUuid(pin[1])) {
    const prev = await store.getItem(`pick:${pin[1]}`);
    if (!prev) return ack("Cặp này cũ quá rồi");
    await store.setItem("pin_next", prev);
    return ack("📌 Sẽ hiện trên TRMNL ở lần làm mới tới");
  }

  const set = data.match(/^set:(\w+):([\w,]+)$/);
  if (set) {
    const [, key, val] = set;
    if (key === "m") settings.author = val === "auto" ? AUTO_AUTHOR : "";
    if (key === "r") settings.ratings = val.split(",").filter((x) => DEFAULT_SETTINGS.ratings.concat(["erotica"]).includes(x));
    if (key === "d" && ["auto", "rtl", "ltr"].includes(val)) settings.dir = val;
    if (key === "q" && ["data", "data-saver"].includes(val)) settings.quality = val;
    if (!settings.ratings.length) settings.ratings = ["safe"];
    await store.setItem("settings", settings);
    await ack("✅ Đã lưu");
    return tg(token, "editMessageText", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      text: settingsText(settings),
      parse_mode: "HTML",
      reply_markup: settingsKeyboard(settings),
    }).catch(() => {});
  }
  return ack("");
}

/* ------------------------------------------------------------------ */

async function newPick(env, chatId, settings) {
  const { token } = env;
  await tg(token, "sendChatAction", { chat_id: chatId, action: "upload_photo" }).catch(() => {});
  try {
    const r = await pickPages(mergeOptions(settings), env.origin, env.store);
    return sendPick(env, chatId, r);
  } catch (e) {
    return send(token, chatId, `⚠️ ${esc(e.message)}`, pickKeyboard(null));
  }
}

async function sendPick(env, chatId, r, header = "") {
  const { token, store } = env;
  await store.setItem(`pick:${r.chapter_id}`, r);
  const caption =
    (header ? header + "\n" : "") +
    `<b>${esc(r.manga_title)}</b>\n` +
    `${esc(r.chapter_label)} · trang ${r.page_first}–${r.page_second}/${r.pages_total}\n` +
    (r.author ? `✍️ ${esc(r.author)}\n` : "") +
    `${esc(r.credit)} · <a href="${esc(r.chapter_url)}">Mở trên MangaDex</a>` +
    (r.direction === "rtl" ? "\n<i>Đọc phải → trái</i>" : "");
  try {
    await tg(token, "sendMediaGroup", {
      chat_id: chatId,
      media: [
        { type: "photo", media: r.first_image, caption, parse_mode: "HTML" },
        { type: "photo", media: r.second_image },
      ],
    });
    return send(token, chatId, `Trang ${r.page_first}–${r.page_second}:`, pickKeyboard(r));
  } catch (e) {
    // Telegram không tải được ảnh → gửi link thay thế
    return send(
      token,
      chatId,
      `${caption}\n\n<a href="${esc(r.first_image)}">Trang ${r.page_first}</a> · <a href="${esc(r.second_image)}">Trang ${r.page_second}</a>`,
      pickKeyboard(r)
    );
  }
}

function send(token, chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return tg(token, "sendMessage", body);
}

function pickKeyboard(r) {
  const row = [{ text: "🎲 Cặp khác", callback_data: "new" }];
  if (r && r.page_second + 2 <= r.pages_total) row.push({ text: "▶️ 2 trang tiếp", callback_data: `nx:${r.chapter_id}` });
  const rows = [row];
  if (r) rows.push([{ text: "📌 Lên TRMNL lần tới", callback_data: `pin:${r.chapter_id}` }]);
  return { inline_keyboard: rows };
}

function settingsText(s) {
  const mode = s.author ? (s.author === AUTO_AUTHOR ? `Auto – ${AUTO_AUTHOR}` : `Tác giả – ${esc(s.author)}`) : "Ngẫu nhiên toàn bộ";
  const dir = { auto: "Tự động (manga Nhật: phải→trái)", rtl: "Phải → trái", ltr: "Trái → phải" }[s.dir] || s.dir;
  return (
    `⚙️ <b>Cài đặt</b>\n` +
    `Chế độ: <b>${mode}</b>\n` +
    `Nội dung: <b>${s.ratings.join(", ")}</b>\n` +
    `Hướng đọc: <b>${dir}</b>\n` +
    `Chất lượng ảnh: <b>${s.quality === "data" ? "Gốc" : "Nhẹ (data-saver)"}</b>\n` +
    `Ngôn ngữ: <b>${s.lang.toUpperCase()}</b>\n\n` +
    `<i>TRMNL áp dụng ở lần làm mới tiếp theo.</i>`
  );
}

function settingsKeyboard(s) {
  const on = (cond, label) => (cond ? `✅ ${label}` : label);
  const r = s.ratings.join(",");
  return {
    inline_keyboard: [
      [
        { text: on(s.author === AUTO_AUTHOR, "Auto Junji Ito"), callback_data: "set:m:auto" },
        { text: on(!s.author, "Ngẫu nhiên"), callback_data: "set:m:random" },
      ],
      [
        { text: on(r === "safe", "Safe"), callback_data: "set:r:safe" },
        { text: on(r === "safe,suggestive", "+Suggestive"), callback_data: "set:r:safe,suggestive" },
        { text: on(r === "safe,suggestive,erotica", "+Erotica"), callback_data: "set:r:safe,suggestive,erotica" },
      ],
      [
        { text: on(s.dir === "auto", "Hướng: Auto"), callback_data: "set:d:auto" },
        { text: on(s.dir === "rtl", "P→T"), callback_data: "set:d:rtl" },
        { text: on(s.dir === "ltr", "T→P"), callback_data: "set:d:ltr" },
      ],
      [
        { text: on(s.quality === "data-saver", "Ảnh nhẹ"), callback_data: "set:q:data-saver" },
        { text: on(s.quality === "data", "Ảnh gốc"), callback_data: "set:q:data" },
      ],
    ],
  };
}

function helpText() {
  return (
    `📚 <b>TRMNL × MangaDex</b> · v${VERSION}\n\n` +
    COMMANDS.map(([c, d]) => `/${c} – ${esc(d)}`).join("\n")
  );
}

export function changelogText(entry, isCommand = false) {
  return (
    (isCommand ? `ℹ️ Phiên bản hiện tại: <b>v${VERSION}</b>\n\n` : `🆕 <b>Đã cập nhật lên v${entry.version}</b>\n\n`) +
    `<b>Change log v${entry.version}</b> (${entry.date})\n` +
    entry.changes.map((c) => `• ${esc(c)}`).join("\n")
  );
}

// Sau khi Cloudflare triển khai bản mới: nhắn change log + cập nhật menu lệnh
export async function notifyNewVersion(store, token) {
  const config = (await store.getItem("config")) || {};
  if (!token || !config.ownerId || config.notifiedVersion === VERSION) return;
  config.notifiedVersion = VERSION;
  await store.setItem("config", config);
  await tg(token, "setMyCommands", { commands: COMMANDS.map(([command, description]) => ({ command, description })) }).catch(() => {});
  await send(token, config.ownerId, changelogText(CHANGELOG[0]));
}
