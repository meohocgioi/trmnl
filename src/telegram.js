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

/* ---------- Rich message: khuôn thẻ dùng chung cho mọi tin nhắn ---------- */
// Thẻ = tiêu đề in đậm + các khối, cách nhau 1 dòng trống
const card = (icon, title, ...blocks) => [`${icon} <b>${title}</b>`, ...blocks.filter(Boolean)].join("\n\n");
// Khối trích dẫn (expandable = thu gọn, chạm để mở)
const quote = (lines, expandable = false) =>
  `<blockquote${expandable ? " expandable" : ""}>${[].concat(lines).filter(Boolean).join("\n")}</blockquote>`;
// Dòng "nhãn: giá trị"
const kv = (label, value) => `${label}: <b>${value}</b>`;
const hint = (t) => `<i>${t}</i>`;
const errorCard = (title, message, tip) => card("⚠️", title, quote(esc(message)), tip && hint(tip));

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
    await send(token, chatId, card("🎉", "Bạn đã là chủ bot", quote("Từ giờ chỉ bạn điều khiển được bot này."), helpBody()));
    return;
  }
  if (!config.ownerId || fromId !== config.ownerId) {
    if (cmd === "start") await send(token, chatId, card("🔒", "Bot riêng", quote("Bot này chỉ phục vụ chủ sở hữu.")));
    return;
  }

  const settings = { ...DEFAULT_SETTINGS, ...((await store.getItem("settings")) || {}) };

  switch (cmd) {
    case "start":
    case "help":
      return send(token, chatId, helpText(settings));
    case "now": {
      const last = await store.getItem("last_trmnl");
      if (last && last.ok) return sendPick(env, chatId, last, "📺 <b>Đang hiện trên TRMNL</b>");
      await send(token, chatId, card("📺", "TRMNL chưa lấy trang nào", hint("Mình random một cặp mới cho bạn…")));
      return newPick(env, chatId, settings);
    }
    case "new":
      return newPick(env, chatId, settings);
    case "auto":
      settings.author = AUTO_AUTHOR;
      await store.setItem("settings", settings);
      return send(token, chatId, settingsText(settings, "✅", `Đã chuyển sang Auto – ${AUTO_AUTHOR}`), settingsKeyboard(settings));
    case "random":
      settings.author = "";
      await store.setItem("settings", settings);
      return send(token, chatId, settingsText(settings, "✅", "Đã chuyển sang Ngẫu nhiên toàn bộ"), settingsKeyboard(settings));
    case "author": {
      if (!arg) return send(token, chatId, card("✍️", "Chọn tác giả", quote(["Gõ kèm tên tác giả, ví dụ:", "<code>/author Kentaro Miura</code>"]), hint("Gõ /auto để quay lại Junji Ito.")));
      await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" });
      try {
        const o = mergeOptions({ ...settings, author: arg.slice(0, 60) });
        const list = await authorMangaList(o, store, { force: true });
        settings.author = arg.slice(0, 60);
        await store.setItem("settings", settings);
        return send(
          token,
          chatId,
          card(
            "✅",
            "Đã chọn tác giả",
            quote([kv("✍️ Tác giả", esc(list.authorName)), kv("📚 Số bộ có bản " + o.lang.toUpperCase(), list.mangas.length)]),
            settingsBody(settings)
          ),
          settingsKeyboard(settings)
        );
      } catch (e) {
        return send(token, chatId, errorCard("Không chọn được tác giả", e.message, "Kiểm tra lại chính tả tên tác giả (tiếng Anh/romaji)."));
      }
    }
    case "settings":
    case "status":
      return send(token, chatId, settingsText(settings), settingsKeyboard(settings));
    case "url": {
      const k = config.accessKey ? `?key=${config.accessKey}` : "";
      return send(
        token,
        chatId,
        card(
          "🔗",
          "Liên kết của bạn",
          quote(["📺 <b>Polling URL</b> – dán vào plugin TRMNL", `<code>${esc(env.origin)}/${k}</code>`]),
          quote(["👀 <b>Xem thử</b> trên trình duyệt", `${esc(env.origin)}/preview${k}`]),
          quote(["⚙️ <b>Trang cài đặt bot</b>", `${esc(env.origin)}/setup`]),
          hint("🔒 Link có mã khoá riêng – đừng chia sẻ công khai. Chạm vào link để copy.")
        )
      );
    }
    case "version":
      return send(token, chatId, versionText());
    default:
      return send(token, chatId, card("🤔", "Không hiểu lệnh này", hint("Gõ /help để xem danh sách lệnh.")));
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
      if (!next) return send(token, chatId, card("📕", "Hết chương rồi", hint("Bấm 🎲 để random cặp khác.")), pickKeyboard(null));
      return sendPick(env, chatId, next);
    } catch (e) {
      return send(token, chatId, errorCard("Không lấy được 2 trang tiếp", e.message, "Bấm 🎲 để random cặp khác."), pickKeyboard(null));
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
    if (key === "v" && ["auto", "panels", "pages"].includes(val)) {
      settings.view = val;
      settings.viewPicked = true;
    }
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
    return send(token, chatId, errorCard("Không lấy được trang truyện", e.message, "Bấm 🎲 để thử lại."), pickKeyboard(null));
  }
}

async function sendPick(env, chatId, r, header = "") {
  const { token, store } = env;
  await store.setItem(`pick:${r.chapter_id}`, r);
  const viewNote = { auto: "🔍 TRMNL hiện 1–2 ô trong 2 trang này", panels: "🔍 TRMNL hiện 2 ô liền nhau trong 2 trang này" }[r.view];
  const caption = [
    header,
    `📚 <b>${esc(r.manga_title)}</b>`,
    quote([
      `📖 ${esc(r.chapter_label)}${r.chapter_title ? " · <i>" + esc(r.chapter_title) + "</i>" : ""}`,
      `📄 Trang <b>${r.page_first}–${r.page_second}</b> / ${r.pages_total}`,
      r.author && `✍️ ${esc(r.author)}`,
      `👥 ${esc(r.credit)}`,
    ]),
    [viewNote && hint(viewNote), r.direction === "rtl" && hint("↩️ Đọc phải → trái")].filter(Boolean).join("\n"),
    `🔗 <a href="${esc(r.chapter_url)}">Mở chương trên MangaDex</a>`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const img1 = r.tg_first_image || r.first_image;
  const img2 = r.tg_second_image || r.second_image;
  try {
    await tg(token, "sendMediaGroup", {
      chat_id: chatId,
      media: [
        { type: "photo", media: img1, caption, parse_mode: "HTML" },
        { type: "photo", media: img2 },
      ],
    });
    return send(token, chatId, `🎛 <b>Trang ${r.page_first}–${r.page_second}</b> · <i>${esc(r.manga_title)}</i>`, pickKeyboard(r));
  } catch (e) {
    // Telegram không tải được ảnh → gửi link thay thế
    return send(
      token,
      chatId,
      `${caption}\n\n<a href="${esc(img1)}">Trang ${r.page_first}</a> · <a href="${esc(img2)}">Trang ${r.page_second}</a>`,
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

function settingsBody(s) {
  const mode = s.author ? (s.author === AUTO_AUTHOR ? `Auto – ${AUTO_AUTHOR}` : `Tác giả – ${esc(s.author)}`) : "Ngẫu nhiên toàn bộ";
  const dir = { auto: "Tự động", rtl: "Phải → trái", ltr: "Trái → phải" }[s.dir] || s.dir;
  const quality = effectiveView(s) !== "pages" ? "Gốc (tự động)" : s.quality === "data" ? "Gốc" : "Nhẹ";
  return [
    "🖼 <b>Hiển thị</b>",
    quote([kv("Kiểu", viewName(s)), kv("Hướng đọc", dir), kv("Ảnh", quality)]),
    "📚 <b>Nguồn truyện</b>",
    quote([kv("Chế độ", mode), kv("Nội dung", s.ratings.join(", ")), kv("Ngôn ngữ", s.lang.toUpperCase())]),
  ].join("\n");
}

function settingsText(s, icon = "⚙️", title = "Cài đặt") {
  return card(icon, title, settingsBody(s), hint("TRMNL áp dụng ở lần làm mới tiếp theo. Bấm nút bên dưới để đổi."));
}

function effectiveView(s) {
  return s.view === "panels" && !s.viewPicked ? "auto" : s.view || "auto";
}

function viewName(s) {
  return { auto: "1–2 ô truyện (tự động)", panels: "2 ô truyện liền nhau", pages: "2 trang" }[effectiveView(s)];
}

function settingsKeyboard(s) {
  const on = (cond, label) => (cond ? `✅ ${label}` : label);
  const r = s.ratings.join(",");
  return {
    inline_keyboard: [
      [
        { text: on(effectiveView(s) === "auto", "🔍 1–2 ô"), callback_data: "set:v:auto" },
        { text: on(effectiveView(s) === "panels", "🔍 2 ô"), callback_data: "set:v:panels" },
        { text: on(effectiveView(s) === "pages", "📖 2 trang"), callback_data: "set:v:pages" },
      ],
      [
        { text: on(s.author === AUTO_AUTHOR, "✍️ Junji Ito"), callback_data: "set:m:auto" },
        { text: on(!s.author, "🎲 Ngẫu nhiên"), callback_data: "set:m:random" },
      ],
      [
        { text: on(r === "safe", "🟢 Safe"), callback_data: "set:r:safe" },
        { text: on(r === "safe,suggestive", "+Suggestive"), callback_data: "set:r:safe,suggestive" },
        { text: on(r === "safe,suggestive,erotica", "+Erotica"), callback_data: "set:r:safe,suggestive,erotica" },
      ],
      [
        { text: on(s.dir === "auto", "↔️ Tự động"), callback_data: "set:d:auto" },
        { text: on(s.dir === "rtl", "⬅️ P→T"), callback_data: "set:d:rtl" },
        { text: on(s.dir === "ltr", "➡️ T→P"), callback_data: "set:d:ltr" },
      ],
      // Chọn chất lượng ảnh chỉ có ý nghĩa ở chế độ 2 trang (ô truyện luôn dùng ảnh gốc)
      ...(effectiveView(s) === "pages"
        ? [
            [
              { text: on(s.quality === "data-saver", "🪶 Ảnh nhẹ"), callback_data: "set:q:data-saver" },
              { text: on(s.quality === "data", "🖼 Ảnh gốc"), callback_data: "set:q:data" },
            ],
          ]
        : []),
    ],
  };
}

const HELP_GROUPS = [
  ["🖼", "Xem truyện", ["now", "new"]],
  ["📚", "Chọn nguồn truyện", ["auto", "random", "author"]],
  ["⚙️", "Cài đặt & thông tin", ["settings", "url", "version", "help"]],
];

function helpBody() {
  const desc = Object.fromEntries(COMMANDS);
  return HELP_GROUPS.map(([icon, title, cmds]) => `${icon} <b>${title}</b>\n` + quote(cmds.map((c) => `/${c} — ${esc(desc[c])}`))).join("\n\n");
}

function helpText(s) {
  const now = s ? quote([kv("Hiển thị", viewName(s)), kv("Nguồn", s.author ? esc(s.author) : "Ngẫu nhiên toàn bộ")]) : "";
  return card("📚", "TRMNL × MangaDex", hint(`Phiên bản v${VERSION}`) + (now ? "\n" + now : ""), helpBody());
}

function changesQuote(entry, expandable = false) {
  return quote(entry.changes.map((c) => `• ${esc(c)}`), expandable);
}

export function changelogText(entry) {
  return card("🆕", `Đã cập nhật lên v${entry.version}`, hint(`Change log · ${entry.date}`), changesQuote(entry));
}

function versionText() {
  const [latest, ...older] = CHANGELOG;
  const olderBlock = older.length
    ? "🗂 <b>Các bản trước</b>\n" +
      quote(
        older.slice(0, 6).flatMap((e) => [`<b>v${e.version}</b> · ${e.date}`, ...e.changes.map((c) => `• ${esc(c)}`), ""]),
        true
      )
    : "";
  return card("ℹ️", `Phiên bản v${VERSION}`, hint(`Change log · ${latest.date}`), changesQuote(latest), olderBlock);
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
