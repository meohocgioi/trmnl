// Bot Telegram: chỉ chủ bot điều khiển được
import { VERSION, CHANGELOG, GITHUB_REPO } from "./version.js";
import {
  AUTO_AUTHOR,
  DEFAULT_SETTINGS,
  mergeOptions,
  pickPages,
  nextPages,
  authorMangaList,
  isUuid,
  searchTitles,
  searchAuthors,
  getManga,
  getAuthor,
} from "./manga.js";

export const COMMANDS = [
  ["now", "2 trang đang hiện trên TRMNL"],
  ["new", "Random 2 trang mới"],
  ["search", "Tìm truyện theo tên hoặc tác giả"],
  ["title", "Tìm theo tên truyện: /title Dragon"],
  ["author", "Tìm theo tác giả: /author Akira"],
  ["auto", "Chế độ auto: chỉ truyện Junji Ito"],
  ["random", "Ngẫu nhiên toàn bộ MangaDex"],
  ["settings", "Xem & chỉnh cài đặt"],
  ["url", "Link dán vào TRMNL + link xem thử"],
  ["update", "Cập nhật bot / kiểm tra bản mới"],
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

  // Tin nhắn thường (không phải lệnh) → nếu đang chờ từ khoá tìm kiếm thì tìm luôn
  if (!cmd) {
    const aw = await store.getItem("await_search");
    if (aw && text && Date.now() - aw.at < 15 * 60 * 1000) {
      await store.deleteItem("await_search");
      return doSearch(env, chatId, aw.type, text.slice(0, 80), 1, settings);
    }
    return send(token, chatId, card("💡", "Bạn muốn tìm truyện?", hint("Gõ /search rồi chọn Title hoặc Author.")), searchStartKeyboard());
  }
  await store.deleteItem("await_search");

  switch (cmd) {
    case "search":
      return send(
        token,
        chatId,
        card("🔎", "Tìm truyện cho TRMNL", quote(["📖 <b>Title</b> — tìm theo tên truyện", "✍️ <b>Author</b> — tìm theo tác giả"]), hint("Chọn một kiểu tìm bên dưới.")),
        searchStartKeyboard()
      );
    case "title":
      return arg ? doSearch(env, chatId, "t", arg.slice(0, 80), 1, settings) : askQuery(env, chatId, "t");
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
      clearPick(settings);
      settings.author = AUTO_AUTHOR;
      await store.setItem("settings", settings);
      return send(token, chatId, settingsText(settings, "✅", `Đã chuyển sang Auto – ${AUTO_AUTHOR}`), settingsKeyboard(settings));
    case "random":
      clearPick(settings);
      settings.author = "";
      await store.setItem("settings", settings);
      return send(token, chatId, settingsText(settings, "✅", "Đã chuyển sang Ngẫu nhiên toàn bộ"), settingsKeyboard(settings));
    case "author":
      return arg ? doSearch(env, chatId, "a", arg.slice(0, 80), 1, settings) : askQuery(env, chatId, "a");
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
    case "update":
      return updateCmd(env, chatId);
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

  if (data === "noop") return ack("");
  if (data === "srch") {
    await ack("");
    return send(token, chatId, card("🔎", "Tìm truyện cho TRMNL", hint("Chọn một kiểu tìm bên dưới.")), searchStartKeyboard());
  }
  const q = data.match(/^q:([ta])$/);
  if (q) {
    await ack("");
    return askQuery(env, chatId, q[1]);
  }
  const sp = data.match(/^sp:(\d+)$/);
  if (sp) {
    const last = await store.getItem("search_last");
    if (!last) return ack("Tìm lại nhé – kết quả cũ đã hết hạn");
    await ack(`Trang ${sp[1]}`);
    return doSearch(env, chatId, last.type, last.q, Number(sp[1]), settings, cq.message.message_id);
  }
  const sel = data.match(/^sel:([ma]):([0-9a-f-]{36})$/);
  if (sel && isUuid(sel[2])) {
    await ack("⏳ Đang chuẩn bị cho TRMNL…");
    return selectResult(env, chatId, sel[1], sel[2], settings);
  }
  const pv = data.match(/^pv:([0-9a-f-]{36})$/);
  if (pv && isUuid(pv[1])) {
    const r = await store.getItem(`pick:${pv[1]}`);
    if (!r) return ack("Không còn bản xem trước");
    await ack("");
    return sendPick(env, chatId, r, "📌 <b>Sẽ hiện trên TRMNL ở lần làm mới tới</b>");
  }

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
    if (key === "m") {
      clearPick(settings);
      settings.author = val === "auto" ? AUTO_AUTHOR : "";
    }
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

/* ---------- Tìm kiếm ---------- */

const TYPE_NAME = { t: "tên truyện", a: "tác giả" };
const STATUS_VI = { ongoing: "đang ra", completed: "hoàn thành", hiatus: "tạm ngưng", cancelled: "đã huỷ" };
const short = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

function clearPick(s) {
  delete s.mangaId;
  delete s.mangaTitle;
  delete s.authorId;
}

function searchStartKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📖 Title", callback_data: "q:t" },
        { text: "✍️ Author", callback_data: "q:a" },
      ],
    ],
  };
}

async function askQuery(env, chatId, type) {
  await env.store.setItem("await_search", { type, at: Date.now() });
  return tg(env.token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: card(type === "t" ? "📖" : "✍️", `Tìm theo ${TYPE_NAME[type]}`, hint(type === "t" ? "Gõ tên truyện, ví dụ: Dragon" : "Gõ tên tác giả, ví dụ: Akira")),
    reply_markup: { force_reply: true, input_field_placeholder: type === "t" ? "Tên truyện…" : "Tên tác giả…" },
  });
}

async function doSearch(env, chatId, type, q, page, settings, editId) {
  const { token, store } = env;
  if (!editId) await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  let res;
  try {
    res = type === "t" ? await searchTitles(q, page, mergeOptions(settings)) : await searchAuthors(q, page);
  } catch (e) {
    return send(token, chatId, errorCard("Không tìm được", e.message, "Thử lại sau ít phút."));
  }
  await store.setItem("search_last", { type, q, at: Date.now() });
  const head = type === "t" ? "📖" : "✍️";
  if (!res.items.length) {
    const text = card("🔎", `Không tìm thấy “${esc(q)}”`, hint(`Không có ${TYPE_NAME[type]} nào khớp. Thử từ khoá khác hoặc viết theo romaji (vd: Itou Junji).`));
    return send(token, chatId, text, searchStartKeyboard());
  }
  const n0 = (page - 1) * 10;
  const lines = res.items.map((it, i) => {
    const n = n0 + i + 1;
    if (type === "t") {
      const meta = [it.authors && "✍️ " + esc(short(it.authors, 40)), it.year, STATUS_VI[it.status] || it.status].filter(Boolean).join(" · ");
      return `<b>${n}.</b> ${esc(it.title)}` + (meta ? `\n      <i>${meta}</i>` : "");
    }
    return `<b>${n}.</b> ${esc(it.name)}` + (it.works ? ` · <i>${it.works} tác phẩm</i>` : "");
  });
  const text = card(
    "🔎",
    `Kết quả cho “${esc(q)}”`,
    hint(`${head} Tìm theo ${TYPE_NAME[type]} · ${res.total} kết quả · trang ${page}/${res.pages}`),
    quote(lines),
    hint("Chạm vào kết quả để hiện lên TRMNL.")
  );
  const rows = res.items.map((it, i) => [
    { text: `${n0 + i + 1}. ${short(type === "t" ? it.title : it.name, 34)}`, callback_data: `sel:${type === "t" ? "m" : "a"}:${it.id}` },
  ]);
  if (res.pages > 1) {
    rows.push([
      page > 1 ? { text: "◀️ Trước", callback_data: `sp:${page - 1}` } : { text: "·", callback_data: "noop" },
      { text: `${page}/${res.pages}`, callback_data: "noop" },
      page < res.pages ? { text: "Sau ▶️", callback_data: `sp:${page + 1}` } : { text: "·", callback_data: "noop" },
    ]);
  }
  rows.push([
    { text: "📖 Tìm title khác", callback_data: "q:t" },
    { text: "✍️ Tìm author khác", callback_data: "q:a" },
  ]);
  const markup = { inline_keyboard: rows };
  if (editId) {
    return tg(token, "editMessageText", { chat_id: chatId, message_id: editId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup }).catch(() => {});
  }
  return send(token, chatId, text, markup);
}

// Chọn 1 kết quả → lưu cài đặt + xếp sẵn 2 trang cho lần làm mới TRMNL tới
async function selectResult(env, chatId, kind, id, settings) {
  const { token, store } = env;
  await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  const next = { ...settings };
  clearPick(next);
  let label;
  let extra = [];
  try {
    if (kind === "m") {
      const m = await getManga(id);
      next.mangaId = id;
      next.mangaTitle = m.title;
      label = kv("📖 Truyện", esc(m.title));
    } else {
      const a = await getAuthor(id);
      next.author = a.name;
      next.authorId = id;
      const list = await authorMangaList(mergeOptions(next), store, { force: true });
      label = kv("✍️ Tác giả", esc(a.name));
      extra = [kv("📚 Số bộ có bản " + next.lang.toUpperCase(), list.mangas.length)];
    }
    const r = await pickPages(mergeOptions(next), env.origin, store); // kiểm tra có trang đọc được
    await store.setItem("settings", next);
    await store.setItem("pin_next", r);
    await store.setItem(`pick:${r.chapter_id}`, r);
    return send(
      token,
      chatId,
      card(
        "✅",
        "Đã chọn cho TRMNL",
        quote([label, ...extra]),
        quote([`📌 Lần làm mới tới: <b>${esc(r.manga_title)}</b>`, `${esc(r.chapter_label)} · trang ${r.page_first}–${r.page_second}`]),
        hint("Bấm nút sau lưng TRMNL để xem ngay. Các lần sau vẫn lấy ngẫu nhiên từ lựa chọn này.")
      ),
      {
        inline_keyboard: [
          [
            { text: "👀 Xem trước", callback_data: `pv:${r.chapter_id}` },
            { text: "🔎 Tìm lại", callback_data: "srch" },
          ],
          [
            { text: "✍️ Về Junji Ito", callback_data: "set:m:auto" },
            { text: "🎲 Ngẫu nhiên", callback_data: "set:m:random" },
          ],
        ],
      }
    );
  } catch (e) {
    return send(token, chatId, errorCard("Chưa dùng được lựa chọn này", e.message, "Cài đặt cũ vẫn giữ nguyên. Thử chọn kết quả khác."), searchStartKeyboard());
  }
}

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

function sourceName(s) {
  if (s.mangaId) return `Bộ truyện – ${esc(s.mangaTitle || "?")}`;
  if (s.author) return s.author === AUTO_AUTHOR ? `Auto – ${AUTO_AUTHOR}` : `Tác giả – ${esc(s.author)}`;
  return "Ngẫu nhiên toàn bộ";
}

function settingsBody(s) {
  const mode = sourceName(s);
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
        { text: on(!s.mangaId && s.author === AUTO_AUTHOR, "✍️ Junji Ito"), callback_data: "set:m:auto" },
        { text: on(!s.mangaId && !s.author, "🎲 Ngẫu nhiên"), callback_data: "set:m:random" },
        { text: on(!!s.mangaId || (!!s.author && s.author !== AUTO_AUTHOR), "🔎 Tìm…"), callback_data: "srch" },
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
  ["📚", "Chọn nguồn truyện", ["search", "title", "author", "auto", "random"]],
  ["⚙️", "Cài đặt & thông tin", ["settings", "url", "update", "version", "help"]],
];

function helpBody() {
  const desc = Object.fromEntries(COMMANDS);
  return HELP_GROUPS.map(([icon, title, cmds]) => `${icon} <b>${title}</b>\n` + quote(cmds.map((c) => `/${c} — ${esc(desc[c])}`))).join("\n\n");
}

function helpText(s) {
  const now = s ? quote([kv("Hiển thị", viewName(s)), kv("Nguồn", sourceName(s))]) : "";
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

/* ---------- /update ---------- */

const cmpVer = (a, b) => {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

// Đọc số phiên bản mới nhất trên GitHub (repo công khai) – best effort
async function githubVersion() {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/src/version.js?t=${Date.now()}`, {
      cf: { cacheTtl: 0 },
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return null;
    const m = (await res.text()).match(/VERSION\s*=\s*"([\d.]+)"/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

export async function refreshCommands(token) {
  await tg(token, "setMyCommands", { commands: COMMANDS.map(([command, description]) => ({ command, description })) }).catch(() => {});
}

async function updateCmd(env, chatId) {
  const { token, store } = env;
  await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  await refreshCommands(token);
  const config = (await store.getItem("config")) || {};
  config.notifiedVersion = VERSION; // đã báo trong tin này → cron không nhắn trùng
  await store.setItem("config", config);
  const latest = await githubVersion();
  if (latest && cmpVer(latest, VERSION) > 0) {
    return send(
      token,
      chatId,
      card(
        "⏳",
        `Có bản v${latest} trên GitHub`,
        quote([kv("🟢 Đang chạy", "v" + VERSION), kv("🆕 Trên GitHub", "v" + latest)]),
        hint("Cloudflare đang build bản mới, thường mất 1–2 phút. Bot sẽ tự nhắn change log ngay khi xong (không cần làm gì).")
      )
    );
  }
  const latestLog = CHANGELOG[0];
  return send(
    token,
    chatId,
    card(
      "✅",
      `Bot đang chạy bản mới nhất v${VERSION}`,
      hint(`Change log · ${latestLog.date}`),
      changesQuote(latestLog),
      hint("Menu lệnh đã được làm mới. Nếu chưa thấy lệnh mới trong menu ☰, thoát khung chat rồi mở lại.")
    )
  );
}

// Sau khi Cloudflare triển khai bản mới: nhắn change log + cập nhật menu lệnh
export async function notifyNewVersion(store, token) {
  const config = (await store.getItem("config")) || {};
  if (!token || !config.ownerId || config.notifiedVersion === VERSION) return;
  config.notifiedVersion = VERSION;
  await store.setItem("config", config);
  await refreshCommands(token);
  await send(token, config.ownerId, changelogText(CHANGELOG[0]));
}
