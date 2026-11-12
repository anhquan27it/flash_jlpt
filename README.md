# FlashJLPT

Hệ thống học tiếng Nhật luyện thi JLPT – trang web học **từ vựng & hán tự JLPT** bằng flashcard, bài tập trắc nghiệm và lặp lại ngắt quãng (SRS).
Hiện có **N4**: 202 hán tự, 451 từ vựng (Bài 15–33), trích xuất từ `kanji/ChuHanN4.pdf`.

## Chạy trang web

Cần **Node.js 22.13+** (máy hiện có Node 24). Không cần cài thư viện nào.

```bash
npm start
```

Mở <http://localhost:3000>. Điện thoại dùng chung Wi-Fi mở địa chỉ `http://<IP-máy-tính>:3000` (in ra khi khởi động).

Tài khoản và tiến trình lưu trong `db/flashjlpt.sqlite` (tạo tự động). Khi chưa đăng nhập, tiến trình lưu trên trình duyệt;
đăng nhập/tạo tài khoản sẽ tự gộp tiến trình đó vào tài khoản.

## Bản GitHub Pages

Mỗi lần push lên `main`, workflow `.github/workflows/pages.yml` tự đăng thư mục `public/` lên GitHub Pages.
GitHub Pages chỉ chạy trang tĩnh nên **không có đăng nhập** – tiến trình được lưu trên trình duyệt.
Muốn dùng tài khoản thì chạy `npm start` hoặc triển khai `server.js` lên dịch vụ hỗ trợ Node.js.

File PDF gốc trong `kanji/` không được đưa lên GitHub (xem `.gitignore`).

## Tính năng

- **Hán tự**: danh sách theo bài, trang chi tiết tập trung vào *từ vựng chứa chữ đó* (âm Hán Việt, On/Kun, phát âm).
- **Từ vựng**: tìm bằng chữ Hán, hiragana, romaji hoặc tiếng Việt không dấu; lọc theo bài/trạng thái.
- **Flashcard**: tự xáo trộn mỗi phiên + nút xáo trộn; Nhật→Việt hoặc Việt→Nhật; Chưa nhớ / Nhớ / Dễ (SRS);
  thẻ chưa nhớ quay lại cuối phiên; hoàn tác; vuốt trái/phải trên điện thoại; phím tắt `Space` `1` `2` `3` `Z` `S` `P`.
  Phiên đang học dở được lưu trên máy sau mỗi thẻ – thoát hay tải lại trang vẫn tiếp tục được.
- **Sao lưu tiến trình** (trang Tài khoản): lưu tiến trình thành file `.json` trên máy và nhập lại từ file (gộp, bản mới hơn được giữ).
- **Bài tập**: 6 dạng – cách đọc, chữ Hán (bẫy cùng âm On kiểu JLPT), nghĩa, từ theo nghĩa, âm Hán Việt, gõ cách đọc (gõ romaji tự đổi sang hiragana).
  Câu sai được đưa vào danh sách ôn.
- **Furigana bật/tắt** ở đầu trang (phím `F`), giao diện sáng/tối, tối ưu desktop & mobile.

## Cập nhật dữ liệu

```bash
npm run build:data
```

`tools/parse_kanji_pdf.py` đọc PDF (cần `pip install pymupdf`), `tools/build_data.py` tạo `public/data/n4.json`.
Nghĩa của các từ xuất hiện dưới nhiều chữ với cách diễn đạt khác nhau được thống nhất trong `MEANING_OVERRIDES`.

## Thêm cấp độ / ngữ pháp sau này

- Thêm file `public/data/n5.json` (cùng cấu trúc: `lessons`, `kanji`, `words`); ứng dụng tải theo `settings.level` (`public/js/store.js`). Khi có từ 2 cấp độ trở lên, thêm nút chọn cấp độ ở trang Tổng quan.
- Mã từ (`id = "từ|cách đọc"`) dùng chung giữa các cấp độ nên tiến trình không bị trùng lặp.

## Cấu trúc

```
server.js              máy chủ: file tĩnh + API đăng nhập/tiến trình (SQLite tích hợp của Node)
public/index.html      khung trang
public/css/app.css     giao diện (màu tương phản cao, sáng/tối)
public/js/store.js     dữ liệu, SRS, lưu & đồng bộ tiến trình
public/js/views/*.js   các trang: home, kanji, vocab, flashcard, quiz (+ quizgen), account
tools/                 script trích xuất dữ liệu từ PDF
```
