// Mỗi lần cập nhật: tăng VERSION và thêm 1 mục lên ĐẦU CHANGELOG.
// Bot sẽ tự nhắn change log mới nhất cho chủ bot sau khi Cloudflare triển khai xong.
export const VERSION = "1.7.4";
export const GITHUB_REPO = "meohocgioi/trmnl";

export const CHANGELOG = [
  {
    version: "1.7.4",
    date: "2026-11-25",
    changes: [
      "🩹 Sửa lỗi TRMNL báo \"Chưa có dữ liệu\" (máy chủ trả lời quá 10 giây): giờ cặp trang kế tiếp được chuẩn bị sẵn ở chế độ nền → TRMNL nhận ngay lập tức",
    ],
  },
  {
    version: "1.7.3",
    date: "2026-11-25",
    changes: [
      "⏱ Có giới hạn thời gian cho bước soi trang credit + nhớ sẵn trang credit đã biết để khỏi tải lại",
    ],
  },
  {
    version: "1.7.2",
    date: "2026-11-24",
    changes: [
      "🚫 Sửa lỗi trang credit vẫn hiện: chế độ lặp lại (khi đã xem hết trang mới trong tuần) quên kiểm tra trang bị chặn",
      "📐 Nhận thêm trang chèn của nhóm dịch theo kích thước: ảnh nằm ngang & thấp hơn hẳn trang truyện → chặn ngay lần đầu gặp",
      "🛡 Màn TRMNL tự kiểm tra lần nữa: gặp trang đã chặn thì bỏ, lấy ô ở trang còn lại",
    ],
  },
  {
    version: "1.7.1",
    date: "2026-11-24",
    changes: [
      "🖼 Sửa lỗi ô truyện bị phóng to & cắt mất nửa (vd. trang credit nằm ngang làm khung giãn cao hơn màn hình) — vùng vẽ luôn được kẹp đúng kích thước màn hình",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-11-24",
    changes: [
      "🚫 Tự loại trang credit / quảng cáo của nhóm dịch: nhận theo HÌNH (dấu vân tay ảnh), hình nào lặp lại ở nhiều chương sẽ bị chặn vĩnh viễn",
      "🔍 Khi đổi bộ truyện, bot tự quét trước trang đầu + 2 trang cuối của vài chương để bắt trang credit ngay từ đầu",
      "✋ Lệnh mới /block (và nút 🚫 Chặn trang): tự tay chặn trang đang hiện, có nút ↩️ Bỏ chặn",
    ],
  },
  {
    version: "1.6.2",
    date: "2026-11-24",
    changes: [
      "🧠 Tinh chỉnh cách chọn ô theo lượt /lab thứ 2: ưu tiên 1 ô to, chỉ ghép 2 ô khi nội dung nhiều hơn rõ rệt (≥ 30%)",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-11-24",
    changes: [
      "🧠 Thuật toán chọn ô mới (E) theo lựa chọn của bạn ở /lab: phải phủ kín màn hình, ưu tiên ô nhiều nét vẽ, 1 ô to được ưu tiên nhẹ",
      "🧪 /lab giờ so sánh E với A và B, lưu chi tiết từng ví dụ để tinh chỉnh tiếp",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-11-24",
    changes: [
      "✂️ Sửa lỗi cắt ô sai (vd. Crayon Shin Chan ra 20 ô, cắt ngang thân nhân vật): chỉ bóc khung khi cả trang được đóng khung kín, khe bị nét vẽ chạy xuyên qua không còn bị coi là khe giữa 2 ô",
      "🚫 Bỏ qua ô gần như trống và dải mỏng",
      "🧪 Lệnh mới /lab: xem 10 ví dụ, chọn cách hiện ô bạn thích (A–D) để tinh chỉnh thuật toán",
    ],
  },
  {
    version: "1.5.3",
    date: "2026-11-23",
    changes: [
      "🔁 Sửa tận gốc lỗi lặp ô truyện: nhận diện trang theo NỘI DUNG ảnh (nhóm dịch hay đăng lại cùng 1 trang ở nhiều chương)",
      "Trang đã hiện ở bất kỳ chương nào sẽ không hiện lại trong 7 ngày",
    ],
  },
  {
    version: "1.5.2",
    date: "2026-11-23",
    changes: [
      "🔁 Sửa lỗi lặp ô truyện: chọn chính xác chương còn trang chưa hiện (trước đây chỉ thử ngẫu nhiên 6 chương)",
      "Bộ truyện đã xem hết trong tuần → lặp cặp trang CŨ NHẤT và chọn ô KHÁC trong đó (không còn trùng y hệt lần trước)",
      "Chọn bộ qua /search: báo số trang đọc được và khi nào sẽ bắt đầu lặp lại",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-11-22",
    changes: [
      "Tắt kiểm tra bản mới mỗi phút để tiết kiệm tài nguyên",
      "Muốn cập nhật ngay: gõ /update (bot tự báo khi TRMNL lấy dữ liệu, tối đa ~15 phút)",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-11-21",
    changes: [
      "🔁 Không lặp lại: trang nào đã lên TRMNL thì 7 ngày sau mới có thể hiện lại",
      "Plugin TRMNL làm mới mỗi 15 phút (trước: mỗi giờ)",
      "/new và /search cũng bỏ qua những trang đã hiện",
      "/settings ghi số trang đã ghi nhớ",
    ],
  },
  {
    version: "1.4.3",
    date: "2026-11-21",
    changes: [
      "📭 Bộ truyện không đọc được: bot ghi rõ từng ngôn ngữ có bao nhiêu chương đã bị gỡ ảnh / chỉ có link ngoài",
    ],
  },
  {
    version: "1.4.2",
    date: "2026-11-21",
    changes: [
      "🌐 Bộ truyện không có chương EN đọc được → bot hiện nút các ngôn ngữ bộ đó có (🇻🇳 Tiếng Việt ưu tiên đầu), kèm số chương",
      "Chọn ngôn ngữ chỉ áp dụng cho bộ đó, các chế độ khác vẫn giữ EN",
      "Kết quả /title tìm mọi bộ (không chỉ bộ có EN) và ghi cờ các ngôn ngữ đang có",
    ],
  },
  {
    version: "1.4.1",
    date: "2026-11-21",
    changes: [
      "🔄 /update: làm mới menu lệnh ngay + so bản đang chạy với bản trên GitHub",
      "Bot tự kiểm tra bản mới mỗi phút (trước: 30 phút) → change log đến gần như ngay sau khi Cloudflare cập nhật xong",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-11-21",
    changes: [
      "🔎 /search: chọn 📖 Title hoặc ✍️ Author rồi gõ từ khoá",
      "Kết quả 10 mục/trang, chuyển trang bằng ◀️ 1/10 ▶️",
      "Chạm 1 kết quả → TRMNL chuyển sang bộ truyện / tác giả đó (giữ kiểu hiển thị 1–2 ô)",
      "Lối tắt: /title Dragon · /author Akira",
      "/settings có thêm nút 🔎 Tìm…",
    ],
  },
  {
    version: "1.3.1",
    date: "2026-11-21",
    changes: [
      "💬 Mọi tin nhắn của bot chuyển sang dạng thẻ (rich message): tiêu đề, khối thông tin, gợi ý",
      "/help chia nhóm lệnh + hiện chế độ đang dùng",
      "/settings chia 2 phần Hiển thị / Nguồn truyện, nút có biểu tượng",
      "/version có thêm mục 'Các bản trước' (chạm để mở)",
    ],
  },
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
