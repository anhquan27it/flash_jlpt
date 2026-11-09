# FlashJLPT – ghi chú cho Claude

Web học từ vựng & hán tự JLPT (giao diện tiếng Việt). Xem `README.md` để biết cấu trúc và cách chạy.

## Quy trình sau mỗi lần cập nhật (chủ dự án đã yêu cầu – không cần hỏi lại)

Mỗi khi hoàn thành một thay đổi (tính năng, sửa lỗi, dữ liệu, giao diện…), **tự động commit, push và kiểm tra deploy**:

1. Kiểm tra trước khi commit: `node --check server.js`, kiểm tra cú pháp các file trong `public/js/`,
   và thử thay đổi trong trình duyệt (`npm start` → http://localhost:3000). Không commit code đang hỏng hoặc làm dở.
2. Commit trên nhánh `main` với message tiếng Việt mô tả rõ thay đổi; cuối message giữ dòng `Co-Authored-By` theo hướng dẫn của phiên.
   Mỗi thay đổi độc lập là một commit riêng.
3. `git push origin main` → workflow `.github/workflows/pages.yml` tự deploy `public/` lên
   https://anhquan27it.github.io/flash_jlpt/
4. Kiểm tra deploy thành công (repo công khai, không cần đăng nhập):
   `curl -s "https://api.github.com/repos/anhquan27it/flash_jlpt/actions/runs?per_page=1"` → `conclusion` phải là `success`.
   Nếu thất bại: đọc log, sửa, rồi lại commit/push.
5. Báo cho người dùng: đã commit gì, link trang đã cập nhật.

Không bao giờ commit: `kanji/*.pdf` (tài liệu có bản quyền), `db/` (tài khoản & tiến trình), `tools/raw_*.json`.
Không dùng `--force`, không viết lại lịch sử đã push.

## Lưu ý kỹ thuật

- Mọi đường dẫn trong `public/` phải là **tương đối** (`css/…`, `js/…`, `data/…`, `api/…`) vì GitHub Pages phục vụ dưới `/flash_jlpt/`.
- GitHub Pages là trang tĩnh: không có `api/`, nên `auth.available = false` và tiến trình chỉ lưu trên trình duyệt.
  Đăng nhập/đồng bộ chỉ chạy khi có `server.js`.
- Dữ liệu từ vựng lấy nguyên văn từ giáo trình; không tự bịa nghĩa. Nghĩa trùng lặp được hợp nhất trong `tools/build_data.py` (`MEANING_OVERRIDES`).
