// Lấy trang truyện từ MangaDex: chọn bộ / chương / 2 trang liên tiếp + proxy ảnh
import { VERSION } from "./version.js";
import { clientScriptBase64 } from "./panels-client.js";

const API = "https://api.mangadex.org";
export const UA = `TRMNL-MangaDex-Pages/${VERSION} (personal e-ink display; Cloudflare Worker)`;
export const RATINGS = ["safe", "suggestive", "erotica", "pornographic"];
export const AUTO_AUTHOR = "Junji Ito";
const MAX_ATTEMPTS = 8;
const AUTHOR_CACHE_MS = 6 * 60 * 60 * 1000;

export const DEFAULT_SETTINGS = {
  author: AUTO_AUTHOR, // "" = ngẫu nhiên toàn bộ MangaDex
  ratings: ["safe", "suggestive"],
  dir: "auto", // auto | rtl | ltr
  quality: "data-saver", // data-saver | data  (chế độ ô truyện luôn dùng ảnh gốc)
  view: "auto", // auto = 1–2 ô (ưu tiên 1 ô nếu đủ lấp màn hình) | panels = 2 ô | pages = 2 trang
  lang: "en",
  longStrip: false,
};

/* ------------------------------------------------------------------ */
/* Tuỳ chọn: cài đặt đã lưu + tham số trên URL (URL được ưu tiên)       */
/* ------------------------------------------------------------------ */

export function mergeOptions(settings, params) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const p = params || new URLSearchParams();
  let ratings = s.ratings;
  if (p.get("rating")) {
    const r = p.get("rating").split(",").map((x) => x.trim().toLowerCase()).filter((x) => RATINGS.includes(x));
    if (r.length) ratings = r;
  }
  const langRaw = (p.get("lang") || s.lang || "en").trim();
  const lang = /^[a-z]{2}(-[a-z]{2,3})?$/i.test(langRaw) ? langRaw.toLowerCase() : "en";
  // Bản cũ lưu "panels" mặc định → chuyển sang auto (trừ khi người dùng đã tự chọn)
  const stored = s.view === "panels" && !s.viewPicked ? "auto" : s.view;
  const vRaw = p.get("view") || stored;
  const view = ["pages", "panels", "auto"].includes(vRaw) ? vRaw : "auto";
  // Ô truyện được phóng to → cần ảnh gốc cho nét
  const quality = view !== "pages" || (p.get("quality") || s.quality) === "data" ? "data" : "data-saver";
  const dirRaw = p.get("dir") || s.dir;
  const dir = ["rtl", "ltr"].includes(dirRaw) ? dirRaw : "auto";
  const longStrip = p.has("longstrip") ? p.get("longstrip") === "1" : !!s.longStrip;
  let author = s.author || "";
  const mode = (p.get("mode") || "").toLowerCase();
  if (mode === "auto") author = AUTO_AUTHOR;
  if (mode === "random") author = "";
  if (p.get("author")) author = p.get("author").trim();
  author = author.slice(0, 60);
  // Chọn chính xác từ /search: mã tác giả / mã bộ truyện (bỏ qua nếu URL đổi chế độ)
  let authorId = s.authorId || "";
  let mangaId = s.mangaId || "";
  const mangaTitle = s.mangaTitle || "";
  if (mode === "auto" || mode === "random" || p.get("author")) {
    authorId = "";
    mangaId = "";
  }
  if (p.get("manga") && isUuid(p.get("manga"))) mangaId = p.get("manga");
  // Bộ truyện chọn từ /search có thể dùng ngôn ngữ riêng (vd. 🇻🇳 khi không có EN)
  const mangaLang = s.mangaLang || "";
  const effLang = mangaId && mangaLang && !p.get("lang") ? mangaLang : lang;
  return { ratings, lang: effLang, quality, dir, longStrip, author, view, authorId, mangaId, mangaTitle };
}

/* ------------------------------------------------------------------ */
/* Chọn 2 trang                                                         */
/* ------------------------------------------------------------------ */

export async function pickPages(o, origin, store) {
  let lastError = null;
  // Chế độ 1 bộ truyện (chọn từ /search title)
  const single = o.mangaId ? compactManga((await api(`/manga/${o.mangaId}`)).data) : null;
  if (single && single.langs && !single.langs.includes(o.lang)) {
    const err = new Error(`"${single.title}" không có bản ${o.lang.toUpperCase()} trên MangaDex`);
    err.code = "NO_LANG";
    throw err;
  }
  const byAuthor = !single && o.author ? await authorMangaList(o, store) : null;
  let pool = byAuthor ? byAuthor.mangas.filter((m) => !byAuthor.dead.includes(m.id)) : null;
  const maxAttempts = single ? 4 : byAuthor ? 15 : MAX_ATTEMPTS;
  let deadChanged = false;
  if (pool && !pool.length) {
    // Bộ nào cũng từng "rỗng" → có thể MangaDex lỗi tạm thời, thử lại từ đầu
    byAuthor.dead = [];
    deadChanged = true;
    pool = [...byAuthor.mangas];
  }

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) await sleep(250); // tôn trọng rate limit ~5 req/s
      try {
        let manga;
        if (single) {
          manga = single;
        } else if (pool) {
          if (!pool.length) break;
          manga = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        } else {
          const res = await api("/manga/random", o.ratings.map((r) => ["contentRating[]", r]));
          manga = compactManga(res.data);
          if (manga.langs && !manga.langs.includes(o.lang)) continue;
        }
        if (!single && !o.longStrip && manga.longStrip) continue;

        const chapter = await randomChapter(manga.id, o);
        if (!chapter) {
          if (byAuthor) {
            byAuthor.dead.push(manga.id);
            deadChanged = true;
          }
          continue;
        }
        const home = await atHome(chapter.id);
        const files = o.quality === "data" ? home.chapter.data : home.chapter.dataSaver;
        if (!Array.isArray(files) || files.length < 2) continue;

        const i = Math.floor(Math.random() * (files.length - 1));
        const ca = chapter.attributes || {};
        const meta = {
          manga,
          chapter: { id: chapter.id, label: chapterLabel(ca), title: ca.title || "", group: groupName(chapter) },
          author: byAuthor ? byAuthor.authorName : "",
          authorTitles: byAuthor ? byAuthor.mangas.length : 0,
        };
        return buildResult(meta, home, i, o, origin, attempt);
      } catch (err) {
        lastError = err;
        if (err.status === 429 || err.status === 403) break; // bị giới hạn → dừng ngay
      }
    }
  } finally {
    if (deadChanged && store) await store.setItem(byAuthor.key, byAuthor);
  }
  const finalError = new Error(
    lastError
      ? `Không lấy được trang truyện: ${lastError.message}`
      : single
      ? `"${single.title}" chưa có chương ${o.lang.toUpperCase()} đọc được trên MangaDex (có thể chỉ có link ngoài)`
      : o.author
      ? `Chưa tìm được chương ${o.lang.toUpperCase()} đọc được của ${o.author} – sẽ thử bộ khác ở lần sau`
      : `Không tìm được chương phù hợp sau ${maxAttempts} lần thử`
  );
  if (single && !lastError) finalError.code = "NO_LANG";
  throw finalError;
}

// 2 trang tiếp theo trong cùng chương (dùng cho nút ▶️)
export async function nextPages(prev, o, origin) {
  const home = await atHome(prev.chapter_id);
  const files = o.quality === "data" ? home.chapter.data : home.chapter.dataSaver;
  const i = prev.page_second; // index 0-based của trang sau trang thứ 2
  if (!Array.isArray(files) || i + 1 >= files.length) return null; // hết chương
  return buildResult(prev._meta, home, i, o, origin, 0);
}

function buildResult(meta, home, i, o, origin, attempts) {
  const { manga, chapter } = meta;
  const files = o.quality === "data" ? home.chapter.data : home.chapter.dataSaver;
  const imgUrl = (idx, q = o.quality) => {
    const list = q === "data" ? home.chapter.data : home.chapter.dataSaver;
    return (
      `${origin}/img?` +
      new URLSearchParams({ ch: chapter.id, p: String(idx), q, b: home.baseUrl, h: home.chapter.hash, f: list[idx] }).toString()
    );
  };
  const first = { page: i + 1, image: imgUrl(i) };
  const second = { page: i + 2, image: imgUrl(i + 1) };
  const direction = o.dir !== "auto" ? o.dir : manga.orig === "ja" ? "rtl" : "ltr";
  const [left, right] = direction === "rtl" ? [second, first] : [first, second];
  return {
    ok: true,
    mode: o.mangaId ? "title" : o.author ? (o.author === AUTO_AUTHOR ? "auto" : "author") : "random",
    author: meta.author || "",
    author_titles: meta.authorTitles || 0,
    manga_id: manga.id,
    manga_title: manga.title,
    manga_url: `https://mangadex.org/title/${manga.id}`,
    original_language: manga.orig || "",
    content_rating: manga.rating || "",
    chapter_id: chapter.id,
    chapter_url: `https://mangadex.org/chapter/${chapter.id}/${i + 1}`,
    chapter_label: chapter.label,
    chapter_title: chapter.title,
    group: chapter.group,
    credit: chapter.group ? `${chapter.group} · MangaDex` : "MangaDex",
    pages_total: files.length,
    page_first: first.page,
    page_second: second.page,
    first_image: first.image,
    second_image: second.image,
    // Ảnh nhẹ cho Telegram (giới hạn 5MB/ảnh)
    tg_first_image: imgUrl(i, "data-saver"),
    tg_second_image: imgUrl(i + 1, "data-saver"),
    view: o.view,
    panel_seed: Math.floor(Math.random() * 1e9),
    script_url: `${origin}/panels.js?v=${VERSION}`,
    // Script nhúng thẳng vào markup (máy chủ TRMNL không chạy script từ trang ngoài)
    panels_js_b64: o.view !== "pages" ? clientScriptBase64() : "",
    first_on_left: direction !== "rtl",
    direction,
    left_image: left.image,
    left_page: left.page,
    right_image: right.image,
    right_page: right.page,
    attempts,
    generated_at: new Date().toISOString(),
    _meta: meta, // dùng nội bộ cho nút ▶️
  };
}

// Ghim đúng 1 chương + trang (index 0-based của trang đầu) — dùng để kiểm tra / Telegram
export async function pinChapter(chapterId, idx, o, origin) {
  const ch = await api(`/chapter/${chapterId}`, [["includes[]", "manga"], ["includes[]", "scanlation_group"]]);
  const c = ch.data;
  const mrel = (c.relationships || []).find((r) => r.type === "manga");
  const manga = compactManga(mrel || { id: "", attributes: {} });
  const home = await atHome(chapterId);
  const files = o.quality === "data" ? home.chapter.data : home.chapter.dataSaver;
  if (!Array.isArray(files) || idx < 0 || idx + 1 >= files.length) throw new Error("Trang không hợp lệ");
  const ca = c.attributes || {};
  const meta = { manga, chapter: { id: c.id, label: chapterLabel(ca), title: ca.title || "", group: groupName(c) }, author: "", authorTitles: 0 };
  return buildResult(meta, home, idx, o, origin, 0);
}

export function publicResult(r) {
  if (!r || !r.ok) return r;
  const { _meta, ...rest } = r;
  return rest;
}

async function randomChapter(mangaId, o) {
  const base = [["translatedLanguage[]", o.lang], ["includes[]", "scanlation_group"]];
  const strict = [["includeExternalUrl", "0"], ["includeEmptyPages", "0"], ["includeFuturePublishAt", "0"]];
  const feed = async (limit, offset) => {
    const paging = [["limit", String(limit)], ["offset", String(offset)]];
    try {
      return await api(`/manga/${mangaId}/feed`, [...base, ...strict, ...paging]);
    } catch (e) {
      if (e.status === 400) return api(`/manga/${mangaId}/feed`, [...base, ...paging]);
      throw e;
    }
  };
  const PAGE = 100;
  let res = await feed(PAGE, 0);
  let list = res.data || [];
  const total = Math.min(Number(res.total) || list.length, 10000);
  if (total > list.length) {
    const offset = Math.floor(Math.random() * (total - PAGE + 1));
    await sleep(200);
    res = await feed(PAGE, offset);
    list = res.data || [];
  }
  const usable = list.filter((c) => {
    const at = c.attributes || {};
    if (at.externalUrl) return false;
    if (typeof at.pages === "number" && at.pages < 2) return false;
    if (at.translatedLanguage && at.translatedLanguage !== o.lang) return false;
    return true;
  });
  return usable.length ? usable[Math.floor(Math.random() * usable.length)] : null;
}

/* ------------------------------------------------------------------ */
/* Chế độ tác giả                                                       */
/* ------------------------------------------------------------------ */

// "Itō Junji" / "Itou Junji" / "Junji Ito" → "ito junji"
export function normName(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/ou/g, "o").replace(/oh$/, "o").replace(/uu/g, "u"))
    .sort()
    .join(" ");
}

async function resolveAuthorIds(name) {
  const res = await api("/author", [["name", name], ["limit", "20"]]);
  const all = res.data || [];
  const target = normName(name);
  const exact = all.filter((x) => normName((x.attributes || {}).name || "") === target);
  const chosen = exact.length ? exact : all.slice(0, 1);
  if (!chosen.length) throw new Error(`Không tìm thấy tác giả "${name}" trên MangaDex`);
  return { ids: chosen.map((x) => x.id), authorName: chosen[0].attributes.name };
}

export async function authorMangaList(o, store, { force = false } = {}) {
  const key = `author:${o.authorId || normName(o.author)}|${o.lang}|${o.ratings.join(",")}`;
  if (!force && store) {
    const hit = await store.getItem(key);
    if (hit && Date.now() - hit.at < AUTHOR_CACHE_MS && hit.mangas && hit.mangas.length) return hit;
  }
  const { ids, authorName } = o.authorId
    ? { ids: [o.authorId], authorName: o.author || (await getAuthor(o.authorId)).name }
    : await resolveAuthorIds(o.author);
  const seen = new Map();
  for (const id of ids) {
    for (let offset = 0; offset < 500; offset += 100) {
      const base = [
        ["authorOrArtist", id],
        ["limit", "100"],
        ["offset", String(offset)],
        ...o.ratings.map((r) => ["contentRating[]", r]),
      ];
      let res;
      try {
        res = await api("/manga", [...base, ["availableTranslatedLanguage[]", o.lang]]);
      } catch (e) {
        if (e.status !== 400) throw e;
        res = await api("/manga", base);
      }
      for (const m of res.data || []) seen.set(m.id, compactManga(m));
      if (offset + 100 >= (Number(res.total) || 0)) break;
      await sleep(200);
    }
  }
  const mangas = [...seen.values()].filter((m) => !m.langs || m.langs.includes(o.lang));
  if (!mangas.length) throw new Error(`Tác giả "${authorName}" không có truyện ${o.lang.toUpperCase()} trên MangaDex`);
  const entry = { key, at: Date.now(), authorName, mangas, dead: [] };
  if (store) await store.setItem(key, entry);
  return entry;
}

/* ------------------------------------------------------------------ */
/* Tìm kiếm (lệnh /search trên Telegram) — 10 kết quả mỗi trang         */
/* ------------------------------------------------------------------ */

export const SEARCH_PAGE = 10;
const MAX_RESULTS = 10000; // MangaDex: offset + limit <= 10000

export async function searchTitles(q, page, o) {
  const base = [
    ["title", q],
    ["limit", String(SEARCH_PAGE)],
    ["offset", String((page - 1) * SEARCH_PAGE)],
    ["includes[]", "author"],
    ["order[relevance]", "desc"],
    ...o.ratings.map((r) => ["contentRating[]", r]),
  ];
  let res;
  try {
    res = await api("/manga", base);
  } catch (e) {
    if (e.status !== 400) throw e;
    res = await api("/manga", base.filter(([k]) => k !== "order[relevance]"));
  }
  const total = Math.min(Number(res.total) || 0, MAX_RESULTS);
  const items = (res.data || []).map((m) => {
    const c = compactManga(m);
    const a = m.attributes || {};
    const authors = [...new Set((m.relationships || []).filter((r) => r.type === "author").map((r) => r.attributes && r.attributes.name).filter(Boolean))];
    return { id: m.id, title: c.title, year: a.year || "", status: a.status || "", authors: authors.join(", "), langs: c.langs || [] };
  });
  return { total, pages: Math.max(1, Math.ceil(total / SEARCH_PAGE)), items };
}

export async function searchAuthors(q, page) {
  const base = [["name", q], ["limit", String(SEARCH_PAGE)], ["offset", String((page - 1) * SEARCH_PAGE)]];
  let res;
  try {
    res = await api("/author", [...base, ["order[name]", "asc"]]);
  } catch (e) {
    if (e.status !== 400) throw e;
    res = await api("/author", base);
  }
  const total = Math.min(Number(res.total) || 0, MAX_RESULTS);
  const items = (res.data || []).map((x) => ({
    id: x.id,
    name: (x.attributes && x.attributes.name) || "?",
    works: (x.relationships || []).filter((r) => r.type === "manga").length,
  }));
  return { total, pages: Math.max(1, Math.ceil(total / SEARCH_PAGE)), items };
}

// Ngôn ngữ có chương ĐỌC ĐƯỢC trên MangaDex (bỏ link ngoài / chương rỗng), kèm số chương
export async function readableLanguages(mangaId) {
  const base = [["limit", "500"], ["offset", "0"]];
  let res;
  try {
    res = await api(`/manga/${mangaId}/feed`, [...base, ["includeExternalUrl", "0"], ["includeEmptyPages", "0"], ["includeFuturePublishAt", "0"]]);
  } catch (e) {
    if (e.status !== 400) throw e;
    res = await api(`/manga/${mangaId}/feed`, base);
  }
  const count = new Map();
  for (const c of res.data || []) {
    const at = c.attributes || {};
    if (at.externalUrl || (typeof at.pages === "number" && at.pages < 2) || !at.translatedLanguage) continue;
    count.set(at.translatedLanguage, (count.get(at.translatedLanguage) || 0) + 1);
  }
  return [...count.entries()].map(([lang, n]) => ({ lang, n })).sort((a, b) => b.n - a.n);
}

// Vì sao không đọc được: đếm theo ngôn ngữ số chương bị gỡ (unavailable) và chỉ có link ngoài
export async function unreadableBreakdown(mangaId) {
  const res = await api(`/manga/${mangaId}/feed`, [
    ["limit", "500"],
    ["offset", "0"],
    ["includeUnavailable", "1"],
    ["includeExternalUrl", "1"],
  ]);
  const by = new Map();
  for (const c of res.data || []) {
    const at = c.attributes || {};
    const l = at.translatedLanguage || "?";
    const e = by.get(l) || { lang: l, removed: 0, external: 0 };
    if (at.isUnavailable) e.removed++;
    else if (at.externalUrl) e.external++;
    by.set(l, e);
  }
  return [...by.values()].filter((e) => e.removed || e.external).sort((a, b) => b.removed + b.external - (a.removed + a.external));
}

export async function getManga(id) {
  return compactManga((await api(`/manga/${id}`)).data);
}

export async function getAuthor(id) {
  const x = (await api(`/author/${id}`)).data;
  return { id: x.id, name: (x.attributes && x.attributes.name) || "?" };
}

function compactManga(m) {
  const a = (m && m.attributes) || {};
  return {
    id: m.id,
    title: pickTitle(a),
    orig: a.originalLanguage || "",
    rating: a.contentRating || "",
    langs: Array.isArray(a.availableTranslatedLanguages) ? a.availableTranslatedLanguages : null,
    longStrip: (a.tags || []).some((t) => t && t.attributes && t.attributes.name && t.attributes.name.en === "Long Strip"),
  };
}

/* ------------------------------------------------------------------ */
/* Proxy ảnh                                                            */
/* ------------------------------------------------------------------ */

export async function handleImage(url, ctx) {
  const p = url.searchParams;
  const ch = p.get("ch") || "";
  const idx = Number.parseInt(p.get("p") || "", 10);
  const q = p.get("q") === "data" ? "data" : "data-saver";
  if (!isUuid(ch) || !(idx >= 0)) return new Response("Bad request", { status: 400 });

  const b = p.get("b") || "";
  const h = p.get("h") || "";
  const f = p.get("f") || "";
  let img = null;
  if (isAllowedBase(b) && /^[a-f0-9]+$/i.test(h) && /^[\w.-]+$/.test(f)) {
    img = await fetchImage(`${b.replace(/\/+$/, "")}/${q}/${h}/${f}`, ctx);
  }
  if (!img || !img.ok) {
    const home = await atHome(ch);
    const files = q === "data" ? home.chapter.data : home.chapter.dataSaver;
    if (!Array.isArray(files) || idx >= files.length) return new Response("Page not found", { status: 404 });
    img = await fetchImage(`${home.baseUrl}/${q}/${home.chapter.hash}/${files[idx]}`, ctx);
  }
  if (!img.ok) return new Response(`Image error ${img.status}`, { status: 502 });
  return new Response(img.body, {
    headers: {
      "Content-Type": img.type || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function fetchImage(imageUrl, ctx) {
  const started = Date.now();
  let res = null;
  try {
    res = await fetch(imageUrl, { headers: { "User-Agent": UA } });
  } catch (_) {
    res = null;
  }
  const ok = !!(res && res.ok && res.body);
  // MangaDex yêu cầu báo cáo kết quả tải ảnh từ các node MangaDex@Home
  let host = "";
  try {
    host = new URL(imageUrl).hostname;
  } catch (_) {}
  if (host && !host.endsWith("mangadex.org")) {
    const report = fetch("https://api.mangadex.network/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        url: imageUrl,
        success: ok,
        cached: !!(res && (res.headers.get("X-Cache") || "").startsWith("HIT")),
        bytes: ok ? Number(res.headers.get("Content-Length")) || 0 : 0,
        duration: Date.now() - started,
      }),
    }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(report);
  }
  if (res && !ok && res.body) res.body.cancel().catch(() => {});
  // Trả thẳng luồng ảnh (không đọc hết vào bộ nhớ) → nhẹ CPU với ảnh gốc vài MB
  return { ok, status: res ? res.status : 0, body: ok ? res.body : null, type: res ? res.headers.get("Content-Type") : null };
}

function isAllowedBase(b) {
  try {
    const u = new URL(b);
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".mangadex.network") || u.hostname === "mangadex.org" || u.hostname.endsWith(".mangadex.org"))
    );
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Tiện ích                                                             */
/* ------------------------------------------------------------------ */

function atHome(chapterId) {
  return api(`/at-home/server/${chapterId}`);
}

async function api(path, params = []) {
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const res = await fetch(`${API}${path}${qs ? "?" + qs : ""}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = new Error(`MangaDex ${path.split("/")[1]} → HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function pickTitle(a) {
  const t = a.title || {};
  if (t.en) return t.en;
  const alt = (a.altTitles || []).find((x) => x && x.en);
  if (alt) return alt.en;
  return Object.values(t)[0] || "Untitled";
}

function groupName(chapter) {
  const g = (chapter.relationships || []).find((r) => r.type === "scanlation_group");
  return (g && g.attributes && g.attributes.name) || "";
}

function chapterLabel(ca) {
  const parts = [];
  if (ca.volume) parts.push(`Vol. ${ca.volume}`);
  parts.push(ca.chapter ? `Ch. ${ca.chapter}` : "Oneshot");
  return parts.join(" ");
}

export function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
