// Mỗi lần cập nhật: tăng VERSION và thêm 1 mục lên ĐẦU CHANGELOG.
// Bot sẽ tự nhắn change log mới nhất cho chủ bot sau khi Cloudflare triển khai xong.
export const VERSION = "1.1.2";

export const CHANGELOG = [
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
