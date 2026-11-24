/**
 * Dấu vân tay hình ảnh của trang truyện (perceptual hash) — nhận ra trang credit / quảng cáo
 * của nhóm dịch, kể cả khi mỗi chương họ lưu lại thành 1 file khác (mã file khác nhau).
 *
 * dHash 16×16: thu nhỏ trang về 17×16 ô xám, so sánh độ sáng 2 ô cạnh nhau → 256 bit.
 * Hai trang "trông giống nhau" (nén lại, đổi cỡ, khác chút chữ) → khác nhau ≤ ~12% số bit.
 */
import decodeJpeg from "./vendor/jpeg-decoder.js";

export const FP_MATCH = 40; // ≤ 40/256 bit khác nhau = cùng 1 hình
const SEEN_MAX = 1500;
const SEEN_TTL = 45 * 24 * 3600e3;

// RGBA → dHash 256 bit (chuỗi hex 64 ký tự)
export function dhashRGBA(data, w, h, channels = 4) {
  const GW = 17, GH = 16;
  const sum = new Float64Array(GW * GH);
  const cnt = new Float64Array(GW * GH);
  // lấy mẫu thưa cho nhanh (mỗi ô vẫn có hàng trăm điểm)
  const step = Math.max(1, Math.floor(Math.min(w, h) / 200));
  for (let y = 0; y < h; y += step) {
    const gy = Math.min(GH - 1, Math.floor((y * GH) / h));
    for (let x = 0; x < w; x += step) {
      const gx = Math.min(GW - 1, Math.floor((x * GW) / w));
      const i = (y * w + x) * channels;
      const g = channels >= 3 ? data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 : data[i];
      sum[gy * GW + gx] += g;
      cnt[gy * GW + gx]++;
    }
  }
  let hex = "";
  let nib = 0, nb = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW - 1; x++) {
      const a = sum[y * GW + x] / (cnt[y * GW + x] || 1);
      const b = sum[y * GW + x + 1] / (cnt[y * GW + x + 1] || 1);
      nib = (nib << 1) | (a < b ? 1 : 0);
      if (++nb === 4) {
        hex += nib.toString(16);
        nib = 0;
        nb = 0;
      }
    }
  }
  return hex;
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

export function fingerprintJpeg(bytes) {
  const img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: false, maxResolutionInMP: 12, maxMemoryUsageInMB: 64 });
  return dhashRGBA(img.data, img.width, img.height, 3);
}

// Dấu vân tay + kích thước của 1 trang (ảnh data-saver, nhẹ). Có cache để không tải lại.
export async function pageInfo(home, idx) {
  const file = home.chapter.dataSaver && home.chapter.dataSaver[idx];
  if (!file || !/\.jpe?g$/i.test(file)) return null; // chỉ giải mã JPEG
  const cacheKey = new Request(`https://fp.cache/v2/${home.chapter.hash}/${file}`);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => null);
    if (hit) {
      const [h, w, ht] = (await hit.text()).split("|");
      if (h) return { h, w: Number(w) || 0, ht: Number(ht) || 0 };
    }
  }
  try {
    const res = await fetch(`${home.baseUrl}/data-saver/${home.chapter.hash}/${file}`, {
      headers: { "User-Agent": "TRMNL-MangaDex-Plugin/1.0" },
    });
    if (!res.ok) return null;
    const img = decodeJpeg(new Uint8Array(await res.arrayBuffer()), { useTArray: true, formatAsRGBA: false, maxResolutionInMP: 12, maxMemoryUsageInMB: 64 });
    const info = { h: dhashRGBA(img.data, img.width, img.height, 3), w: img.width, ht: img.height };
    if (cache) await cache.put(cacheKey, new Response(`${info.h}|${info.w}|${info.ht}`, { headers: { "Cache-Control": "public, max-age=2592000" } })).catch(() => {});
    return info;
  } catch (_) {
    return null;
  }
}

export async function pageFingerprint(home, idx) {
  const i = await pageInfo(home, idx);
  return i ? i.h : null;
}

// Trang chèn của nhóm dịch (credit/quảng cáo): ảnh NẰM NGANG và THẤP hơn hẳn trang truyện bên cạnh.
// (Trang đôi thật cũng nằm ngang nhưng cao bằng trang truyện → không bị tính.)
export function looksInserted(a, ref) {
  return !!(a && ref && a.w > a.ht && ref.ht > ref.w && a.ht < ref.ht * 0.7);
}

/* ---------- Bộ nhớ: trang đã thấy + danh sách chặn ---------- */

export async function loadFp(store) {
  const [seen, block, bad] = await Promise.all([store.getItem("fp_seen"), store.getItem("fp_block"), store.getItem("fp_badkeys")]);
  const now = Date.now();
  return {
    seen: (seen || []).filter((e) => now - e.t < SEEN_TTL).slice(-SEEN_MAX),
    block: block || [],
    bad: bad || {}, // "chapterId:trang" đã biết là trang chặn → khỏi tải lại ảnh
    dirty: false,
  };
}

export async function saveFp(store, fp) {
  if (!fp.dirty) return;
  fp.dirty = false;
  const keys = Object.keys(fp.bad);
  if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete fp.bad[k];
  await Promise.all([store.setItem("fp_seen", fp.seen.slice(-SEEN_MAX)), store.setItem("fp_block", fp.block), store.setItem("fp_badkeys", fp.bad)]);
}

export function isBlocked(fp, h) {
  return !!h && fp.block.some((b) => hamming(b.h, h) <= FP_MATCH);
}

export function addBlock(fp, h, why, label = "") {
  if (!h || isBlocked(fp, h)) return false;
  fp.block.push({ h, why, label: String(label).slice(0, 80), t: Date.now() });
  fp.dirty = true;
  return true;
}

export function removeBlock(fp, h) {
  const before = fp.block.length;
  fp.block = fp.block.filter((b) => hamming(b.h, h) > FP_MATCH);
  fp.dirty = fp.dirty || fp.block.length !== before;
  return before - fp.block.length;
}

// Ghi nhận 1 trang đã thấy. Nếu cùng hình đó đã xuất hiện ở 1 CHƯƠNG KHÁC (khác số chương)
// → đó là trang credit/quảng cáo nhóm dịch chèn vào mọi chương → tự động chặn. Trả về true nếu bị chặn.
export function learnPage(fp, h, chapterId, chapterNo, label) {
  if (!h) return false;
  if (isBlocked(fp, h)) return true;
  const twin = fp.seen.find((e) => e.c !== chapterId && String(e.n) !== String(chapterNo) && hamming(e.h, h) <= FP_MATCH);
  if (twin) {
    addBlock(fp, h, "auto", label);
    return true;
  }
  if (!fp.seen.some((e) => e.c === chapterId && hamming(e.h, h) <= FP_MATCH)) {
    fp.seen.push({ h, c: chapterId, n: String(chapterNo ?? ""), t: Date.now() });
    fp.dirty = true;
  }
  return false;
}

export function markBad(fp, chapterId, idx) {
  if (!fp) return;
  fp.bad[`${chapterId}:${idx}`] = 1;
  fp.dirty = true;
}
export function isBadKey(fp, chapterId, idx) {
  return !!(fp && fp.bad[`${chapterId}:${idx}`]);
}
