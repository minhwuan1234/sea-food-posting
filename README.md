# Sea Food Posting

Giao diện quản lý mặt hàng, caption, nhiều ảnh, khu vực và group Facebook. Chọn một mặt hàng và một khu vực để đăng lần lượt; mỗi group cách nhau 15 giây. Lịch sử ghi kết quả theo group. Bạn có thể đăng lại cùng bài bất cứ lúc nào.

## Chạy trên Mac

Yêu cầu Node.js 20+. Từ thư mục repo:

```bash
npm ci
npx playwright install chromium
npm run login
npm start
```

Mở `http://127.0.0.1:4173`. Lệnh `login` mở Chromium để bạn tự đăng nhập Facebook; quay lại Terminal và nhấn Enter sau khi vào được tài khoản. Phiên được lưu trong `data/facebook-profile` trên Mac.

## Triển khai Railway

1. Tạo service ứng dụng từ repo GitHub này. Railway tự nhận `Dockerfile` ở thư mục gốc.
2. Thêm service PostgreSQL vào cùng Railway project.
3. Trong Variables của service ứng dụng, đặt:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (thay `Postgres` bằng tên service DB nếu khác).
   - `APP_PASSWORD`: mật khẩu dài, riêng cho giao diện. Tên đăng nhập là `admin`.
   - `FACEBOOK_STORAGE_STATE_BASE64`: phiên Facebook xuất từ Mac theo bước dưới.
4. Deploy service và tạo domain trong Networking. Ứng dụng dùng `PORT` do Railway cấp, lắng nghe trên `0.0.0.0` khi chạy trên Railway.

Xuất phiên Facebook đã đăng nhập trên Mac:

```bash
npm run export-auth
pbcopy < data/facebook-storage-state.base64
```

Dán nội dung clipboard vào biến `FACEBOOK_STORAGE_STATE_BASE64` trên Railway. **Không đưa giá trị này vào Git, ảnh chụp màn hình hoặc tin nhắn.** Nó chứa cookie đăng nhập và cần xuất lại khi phiên hết hạn. Thư mục `data/` đã được bỏ qua bởi Git và Docker.

PostgreSQL lưu mặt hàng, khu vực, lịch sử và ảnh. Ảnh được lưu dạng binary trong DB để không mất khi Railway thay container. Bản đầu chạy một instance ứng dụng; không tăng số replica vì bộ xử lý đăng bài hiện được khóa trong bộ nhớ của một instance.

## Sử dụng

1. Trong **Khu vực & group**, tạo khu vực rồi thêm link group `https://www.facebook.com/groups/...`.
2. Trong **Mặt hàng**, lưu tên, caption và thêm nhiều ảnh. Có thể đặt caption và ảnh riêng cho một khu vực.
3. Trong **Đăng bài**, chọn mặt hàng + khu vực, xem trước rồi bấm **Đăng vào khu vực này**. Đây là thao tác đăng thật.
4. Xem trạng thái từng group trong **Lịch sử**. “Đã gửi” nghĩa là Playwright đã bấm nút Đăng và hộp soạn bài đóng; nếu group duyệt bài, hãy kiểm tra trên Facebook.

Facebook có thể thay đổi giao diện hoặc yêu cầu xác minh tài khoản. Khi đó Playwright dừng ở group gặp lỗi và ghi lý do; hệ thống không tự xử lý CAPTCHA hay xác minh.

## Kiểm tra mã

```bash
npm run check
```
