# TRMNL × MangaDex

Hiện **2 trang truyện liên tiếp** (ví dụ 11 & 12) lấy ngẫu nhiên từ [MangaDex](https://mangadex.org) (bản tiếng Anh) lên màn hình e-ink **TRMNL**, và **điều khiển qua bot Telegram**.

- Chế độ **auto** (mặc định): chỉ truyện của **Junji Ito** – tự chọn bộ, chương, trang.
- Chế độ **ngẫu nhiên**: bất kỳ truyện nào trên MangaDex.
- Chạy trên **Cloudflare Workers** (miễn phí). Không cần VPS, không chạy gì trên máy bạn.
- Mỗi lần code mới được đẩy lên repo này, Cloudflare **tự cập nhật** và bot **nhắn change log** cho bạn.

---

## Cài đặt (chỉ làm 1 lần, khoảng 15 phút)

### Bước 1 – Đưa repo lên Cloudflare
1. Vào <https://dash.cloudflare.com> (đăng ký miễn phí nếu chưa có).
2. Menu trái: **Workers & Pages** → **Create** (Create application).
3. Chọn **Import a repository** / **Continue with GitHub** → cho phép Cloudflare truy cập GitHub → chọn repo **`meohocgioi/trmnl`**.
4. Để nguyên mọi thứ mặc định (tên project **`trmnl`**, deploy command `npx wrangler deploy`) → bấm **Deploy**.
5. Đợi 1–2 phút. Xong sẽ có link dạng `https://trmnl.<tên-của-bạn>.workers.dev`.

### Bước 2 – Tạo bot Telegram
1. Mở `https://trmnl.<tên-của-bạn>.workers.dev/setup`.
2. Trên Telegram, chat với **@BotFather** → gõ `/newbot` → đặt tên → copy **token**.
3. Dán token vào trang setup → **Lưu**.
4. Bấm nút **Mở @tên_bot** → bấm **Start**. Người bấm Start **đầu tiên** trở thành chủ bot (chỉ chủ bot điều khiển được).

### Bước 3 – Nối với TRMNL
1. Tải file [`trmnl-plugin.zip`](trmnl-plugin.zip) trong repo này.
2. Trên TRMNL: **Plugins → Private Plugin → Import new** → chọn file zip.
3. Mở plugin vừa tạo → ô **Polling URL** → dán link mà bot trả lời khi bạn gõ `/url` → **Save** → **Force refresh**.

Xong! 🎉

---

## Lệnh Telegram

| Lệnh | Tác dụng |
|---|---|
| `/now` | Xem 2 trang đang hiện trên TRMNL |
| `/new` | Random 2 trang mới |
| `/auto` | Chỉ truyện Junji Ito |
| `/random` | Ngẫu nhiên toàn bộ MangaDex |
| `/author Tên` | Chỉ truyện của 1 tác giả, ví dụ `/author Kentaro Miura` |
| `/settings` | Chỉnh nội dung (safe/suggestive…), hướng đọc, chất lượng ảnh bằng nút bấm |
| `/url` | Link dán vào TRMNL + link xem thử |
| `/version` | Phiên bản & change log |

Dưới mỗi cặp trang có nút: **🎲 Cặp khác** · **▶️ 2 trang tiếp** · **📌 Lên TRMNL lần tới** (cặp này sẽ hiện ở lần làm mới tiếp theo của TRMNL).

## Các đường dẫn

| Đường dẫn | Dùng để |
|---|---|
| `/?key=…` | JSON cho TRMNL (Polling URL) – lấy link đầy đủ bằng lệnh `/url` |
| `/preview?key=…` | Xem thử khung 800×480 trên trình duyệt |
| `/setup` | Trang cài đặt bot / nối lại bot |
| `/img` | Proxy ảnh (MangaDex không cho lấy ảnh trực tiếp) |

Có thể thêm tham số vào URL để ghi đè cài đặt, ví dụ `&mode=random`, `&rating=safe`, `&dir=ltr`.

## Bảo mật
- Repo công khai chỉ cho người khác **xem** code; chỉ chủ repo (và người được cấp quyền) mới sửa được. Đừng merge Pull Request của người lạ.
- **Không có token/mật khẩu nào trong code.** Token bot được lưu trong Cloudflare.
- Sau khi cài bot, link TRMNL và `/preview` cần **mã khoá riêng** (`?key=…`) – người lạ đoán ra địa chỉ cũng không dùng được.
- Lệnh Telegram chỉ nhận từ chủ bot; webhook có mã bí mật nên không giả mạo được.
- Nên bật **xác minh 2 bước (2FA)** cho GitHub và Cloudflare.

## Gặp lỗi?
- **Bot không trả lời** → mở `/setup` → bấm **Nối lại bot**.
- **TRMNL báo lỗi / HTTP 429** → MangaDex đang giới hạn tạm thời, đợi rồi Force refresh.
- Gửi ảnh chụp màn hình hoặc kết quả `/preview` cho người hỗ trợ.

## Ghi công
Dữ liệu và ảnh từ **MangaDex** và các **nhóm dịch** (tên nhóm luôn hiện trên màn hình). Dự án cá nhân, không quảng cáo, không thu phí – theo [MangaDex API Acceptable Usage Policy](https://api.mangadex.org/docs/).
