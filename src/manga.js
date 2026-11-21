// Lấy trang truyện từ MangaDex: chọn bộ / chương / 2 trang liên tiếp + proxy ảnh
import { VERSION } from "./version.js";

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
  quality: "data-saver", // data-saver | data
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
  const lang = /^[a-z]{2}(-[a-z]{2})?$/i.test(langRaw) ? langRaw.toLowerCase() : "en";
  const quality = (p.get("quality") || s.quality) === "data" ? "data" : "data-saver";
  const dirRaw = p.get("dir") || s.dir;
  const dir = ["rtl", "ltr"].includes(dirRaw) ? dirRaw : "auto";
  const longStrip = p.has("longstrip") ? p.get("longstrip") === "1" : !!s.longStrip;
  let author = s.author || "";
  const mode = (p.get("mode") || "").toLowerCase();
  if (mode === "auto") author = AUTO_AUTHOR;
  if (mode === "random") author = "";
  if (p.get("author")) author = p.get("author").trim();
  author = author.slice(0, 60);
  return { ratings, lang, quality, dir, longStrip, author };
}

/* ------------------------------------------------------------------ */
/* Chọn 2 trang                                                         */
/* ------------------------------------------------------------------ */

export async function pickPages(o, origin, store) {
  let lastError = null;
  const byAuthor = o.author ? await authorMangaList(o, store) : null;
  let pool = byAuthor ? byAuthor.mangas.filter((m) => !byAuthor.dead.includes(m.id)) : null;
  const maxAttempts = byAuthor ? 15 : MAX_ATTEMPTS;
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
        if (pool) {
          if (!pool.length) break;
          manga = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        } else {
          const res = await api("/manga/random", o.ratings.map((r) => ["contentRating[]", r]));
          manga = compactManga(res.data);
          if (manga.langs && !manga.langs.includes(o.lang)) continue;
        }
        if (!o.longStrip && manga.longStrip) continue;

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
        return buildResult(meta, home, files, i, o, origin, attempt);
      } catch (err) {
        lastError = err;
        if (err.status === 429 || err.status === 403) break; // bị giới hạn → dừng ngay
      }
    }
  } finally {
    if (deadChanged && store) await store.setItem(byAuthor.key, byAuthor);
  }
  throw new Error(
    lastError
      ? `Không lấy được trang truyện: ${lastError.message}`
      : o.author
      ? `Chưa tìm được chương ${o.lang.toUpperCase()} đọc được của ${o.author} – sẽ thử bộ khác ở lần sau`
      : `Không tìm được chương phù hợp sau ${maxAttempts} lần thử`
  );
}

// 2 trang tiếp theo trong cùng chương (dùng cho nút ▶️)
export async function nextPages(prev, o, origin) {
  const home = await atHome(prev.chapter_id);
  const files = o.quality === "data" ? home.chapter.data : home.chapter.dataSaver;
  const i = prev.page_second; // index 0-based của trang sau trang thứ 2
  if (!Array.isArray(files) || i + 1 >= files.length) return null; // hết chương
  return buildResult(prev._meta, home, files, i, o, origin, 0);
}

function buildResult(meta, home, files, i, o, origin, attempts) {
  const { manga, chapter } = meta;
  const imgUrl = (idx) =>
    `${origin}/img?` +
    new URLSearchParams({
      ch: chapter.id,
      p: String(idx),
      q: o.quality,
      b: home.baseUrl,
      h: home.chapter.hash,
      f: files[idx],
    }).toString();
  const first = { page: i + 1, image: imgUrl(i) };
  const second = { page: i + 2, image: imgUrl(i + 1) };
  const direction = o.dir !== "auto" ? o.dir : manga.orig === "ja" ? "rtl" : "ltr";
  const [left, right] = direction === "rtl" ? [second, first] : [first, second];
  return {
    ok: true,
    mode: o.author ? (o.author === AUTO_AUTHOR ? "auto" : "author") : "random",
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
  const key = `author:${normName(o.author)}|${o.lang}|${o.ratings.join(",")}`;
  if (!force && store) {
    const hit = await store.getItem(key);
    if (hit && Date.now() - hit.at < AUTHOR_CACHE_MS && hit.mangas && hit.mangas.length) return hit;
  }
  const { ids, authorName } = await resolveAuthorIds(o.author);
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
  let body = null;
  try {
    res = await fetch(imageUrl, { headers: { "User-Agent": UA } });
    if (res.ok) body = await res.arrayBuffer();
  } catch (_) {
    res = null;
  }
  const ok = !!(res && res.ok && body);
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
        bytes: body ? body.byteLength : 0,
        duration: Date.now() - started,
      }),
    }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(report);
  }
  return { ok, status: res ? res.status : 0, body, type: res ? res.headers.get("Content-Type") : null };
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
