# Plan: Thêm dạng đề SQL (chỉ SELECT)

## Mục tiêu
Cho phép người dùng gõ lệnh SQL trực tiếp trên web, thực thi bằng sql.js (SQLite WASM) từ CDN, chấm bằng so sánh kết quả. Chỉ hỗ trợ SELECT; nếu dùng DML/DDL → báo sai.

## Ràng buộc
- sql.js 1.10.3 từ cdnjs, không build tool, chạy được trên GitHub Pages.
- Giao diện tiếng Việt.
- Không server.

## Schema dữ liệu (JSON section)
```json
{
  "type": "sql",
  "q": "Câu hỏi...",
  "setupSql": "CREATE TABLE ...; INSERT INTO ...;",
  "answer": "SELECT ...;",
  "ordered": true
}
```
- `setupSql`: tạo snapshot ban đầu (bảng + dữ liệu).
- `answer`: SELECT mẫu.
- `ordered`: mặc định true.

## Files
- Mới: `sql-engine.js` — load sql.js lazy, createDb, run, normalize, compare, grade, renderTable, escape.
- Sửa: `index.html`, `outline.js`, `practice.js`, `test.js`, `styles.css`.

## Luồng thực thi
- Mỗi lần Chạy/Kiểm tra/Nộp bài: `new SQL.Database()` → exec setupSql → exec SQL user → close.
- Nhiều câu `;`: lấy kết quả câu cuối.
- So sánh: số cột, số dòng, từng dòng JSON.stringify sau chuẩn hoá số; không so tên cột; ordered=true mặc định không sort.
- DML/DDL → wrong.

## UI
- Textarea SQL, nút Chạy (hiện bảng kết quả/lỗi), Kiểm tra (Practice) / Nộp bài (Test).
- Outline: câu hỏi + đáp án SQL.
- Escape HTML khi render dữ liệu.

## Trạng thái
- [ ] Tạo sql-engine.js
- [ ] Sửa index.html
- [ ] Sửa outline.js
- [ ] Sửa practice.js
- [ ] Sửa test.js
- [ ] Sửa styles.css
- [ ] Thêm dữ liệu mẫu (tuỳ chọn)
```