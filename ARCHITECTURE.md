# Cấu trúc mã

`DESIGN.md` là một file duy nhất chứa tài liệu thiết kế giao diện. Tổ chức ba lớp dưới đây là quy ước cho mã ứng dụng.

```text
src/
├── surface/                 Giao diện với người dùng và HTTP
│   ├── server.js            Khởi tạo Express và ghép các lớp
│   ├── routes/              API theo chức năng
│   │   ├── products.js
│   │   ├── regions.js
│   │   └── posting.js
│   ├── cli.js               Đăng nhập và đăng từ Terminal
│   └── export-auth.js       Xuất phiên Facebook cho Railway
├── business/                Quy tắc nghiệp vụ
│   ├── products.js          Mặt hàng và nội dung theo khu vực
│   ├── regions.js           Khu vực và group
│   ├── posting.js           Lượt đăng, chạy thử và tiến độ
│   ├── facebook.js          Thao tác Playwright
│   ├── validation.js        Kiểm tra dữ liệu đầu vào
│   └── errors.js
└── database/
    └── store.js            Đọc/ghi JSON local hoặc PostgreSQL

public/
├── index.html               Khung giao diện của từng URL
├── css/                     Token, bố cục, component, từng trang
└── js/
    ├── app.js               Chọn trang theo URL
    ├── pages/               Đăng bài, mặt hàng, khu vực, lịch sử
    └── components/          Điều hướng, danh sách, xem trước, tiến độ
```

Mỗi URL (`/dang-bai`, `/mat-hang`, `/khu-vuc`, `/lich-su`) chỉ chạy module và API cần cho trang đó. Module `surface` gọi `business`; `business` dùng kho dữ liệu qua hàm được truyền khi khởi tạo. Mã thao tác Playwright nằm trong lớp nghiệp vụ đăng bài.
