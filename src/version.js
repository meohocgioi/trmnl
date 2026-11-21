// Mỗi lần cập nhật: tăng VERSION và thêm 1 mục lên ĐẦU CHANGELOG.
// Bot sẽ tự nhắn change log mới nhất cho chủ bot sau khi Cloudflare triển khai xong.
export const VERSION = "1.3.0";

export const CHANGELOG = [
  {
    version: "1.3.0",
    date: "2026-11-21",
    changes: [
      "🔍 Chế độ mới (mặc định): 1–2 ô – ưu tiên 1 ô nếu ô đó đủ lấp màn hình, không thì 2 ô liền nhau",
      "Tìm ô tốt hơn với bản scan có lề trang xám/sần (vd. Tomie: Takeover)",
      "/settings: chọn 🔍 1–2 ô / 🔍 2 ô / 📖 2 trang",
    ],
  },
  {
    version: "1.2.3",
    date: "2026-11-21",
    changes: [
      "🔍 Chế độ 2 ô truyện đã chạy trên TRMNL",
      "Tìm ô tốt hơn với trang có khung viền đen bao quanh (trước đây coi cả trang là 1 ô)",
    ],
  },
  {
    version: "1.2.2",
    date: "2026-11-21",
    changes: ["Thêm chế độ chẩn đoán cho thuật toán tìm ô (chỉ dùng khi sửa lỗi)"],
  },
  {
    version: "1.2.1",
    date: "2026-11-21",
    changes: ["Sửa lỗi script 2 ô truyện bị dừng ngay khi chạy trên TRMNL (lỗi __name do công cụ đóng gói)"],
  },
  {
    version: "1.2.0",
    date: "2026-11-21",
    changes: [
      "Sửa chế độ 2 ô: script giờ được gửi kèm trong dữ liệu (máy chủ TRMNL không chạy script từ trang ngoài)",
      "⚠️ Cần dán lại markup plugin TRMNL 1 lần nữa (file full.liquid mới)",
    ],
  },
  {
    version: "1.1.2",
    date: "2026-11-21",
    changes: ["Chế độ 2 ô: hiện trạng thái trên thanh tiêu đề (⏳ đang xử lý / ⚠ lỗi / ô x–y) để chẩn đoán"],
  },
  {
    version: "1.1.1",
    date: "2026-11-21",
    changes: [
      "Chế độ 2 ô truyện bền hơn trên máy chủ vẽ màn hình của TRMNL (2 cách đọc ảnh)",
      "Ghi log từng bước vào ô JS LOGS của TRMNL để dễ tìm lỗi",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-11-21",
    changes: [
      "🔍 Chế độ mới: 2 Ô TRUYỆN liền nhau (mặc định) – tự tìm ô, phóng to kín màn hình TRMNL",
      "Tự xếp 2 ô ngang hoặc dọc, ưu tiên cặp phủ kín ≥ 72% màn hình",
      "Ô truyện dùng ảnh gốc của MangaDex cho nét hơn",
      "/settings → chọn 🔍 2 ô truyện hoặc 📖 2 trang",
      "⚠️ Cần thay markup plugin TRMNL 1 lần (xem hướng dẫn)",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-21",
    changes: [
      "🔒 Link TRMNL và /preview giờ có mã khoá riêng – người lạ đoán ra link cũng không dùng được",
      "👉 Gõ /url để lấy link mới (có ?key=…) rồi dán lại vào ô Polling URL của TRMNL",
      "Trang /setup không còn hiện tên Telegram của chủ bot",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-11-21",
    changes: [
      "Bản đầu tiên: 2 trang truyện liên tiếp ngẫu nhiên từ MangaDex (tiếng Anh) cho TRMNL",
      "Chế độ auto: chỉ truyện của Junji Ito",
      "Điều khiển qua Telegram: /now, /new, /auto, /random, /author, /settings, /url",
      "Nút 🎲 Cặp khác, ▶️ 2 trang tiếp, 📌 Lên TRMNL lần tới",
      "Tự nhắn change log sau mỗi lần cập nhật",
    ],
  },
];
