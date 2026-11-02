# Cấu trúc dữ liệu

Giao diện hiển thị hai cây độc lập:

```text
Mặt hàng                      Khu vực
├── Mực                       ├── Hà Nội
│   ├── caption               │   ├── Group A → URL
│   └── ảnh/video              │   └── Group B → URL
└── Tôm                       └── TP.HCM
    ├── caption                   └── Group C → URL
    └── ảnh/video
```

`products` chỉ chứa tên và caption của mặt hàng (cùng ID và thời điểm tạo). `product_images` liên kết ảnh/video theo thứ tự; tên bảng cũ được giữ để dữ liệu đang có tiếp tục hoạt động. `regions` chứa tên khu vực; `groups` chứa tên, URL và khu vực cha. Caption và bộ tệp tùy chỉnh cho cặp mặt hàng–khu vực nằm ở `product_region_content` và `product_region_images`, không nhân bản mặt hàng hoặc group.

Mỗi lượt bấm đăng tạo một bản ghi `posting_runs`. `posting_run_groups` giữ kết quả từng group; `posting_run_images` giữ bộ ảnh/video đã chọn. Tên, URL và caption được chụp lại lúc bắt đầu để lịch sử không đổi khi bạn sửa dữ liệu gốc. Không có ràng buộc chống đăng lại cùng mặt hàng vào cùng group.

`images` chứa nội dung ảnh/video dạng `bytea`; tên bảng cũ được giữ để không cần di chuyển các ảnh đã lưu. Phiên Facebook và mật khẩu giao diện nằm trong Railway Variables, không lưu trong PostgreSQL.

Khi khởi động với `DATABASE_URL`, ứng dụng tạo các bảng từ `sql/schema.sql`. Nếu database còn dữ liệu ở bảng JSONB `app_state` cũ và các bảng mới đang trống, ứng dụng chuyển dữ liệu cũ sang bảng mới trong một transaction. `app_state` được giữ lại làm bản gốc để đối chiếu, nhưng các lần lưu tiếp theo chỉ ghi vào các bảng mới.
