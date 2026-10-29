# Chuyển dữ liệu Cost Ly cũ vào mục "Giá vốn" của canteen

Cost Ly cũ (https://cost-ly.onrender.com) lưu dữ liệu trong database `cost-ly-db` của Render, bảng `documents`. Mục "Giá vốn" của canteen dùng bảng riêng `CostDocument` trong cơ sở dữ liệu canteen. Chuyển dữ liệu gồm 3 bước, làm **trên máy chủ Viettel** (SSH).

## 1. Cho máy chủ được phép đọc database Cost Ly trên Render

Database này đang chặn mọi kết nối từ ngoài. Làm tạm:

1. Trên máy chủ Viettel, xem địa chỉ IP mà máy chủ dùng để ra internet:

   ```
   curl -s https://ifconfig.me
   ```

2. Render Dashboard, mục Databases, chọn `cost-ly-db`, vào **Networking** (Inbound IP Rules), thêm IP vừa thấy (ví dụ `171.244.197.67/32`), mô tả "chuyển Cost Ly". Lưu lại.
3. Cũng trên trang đó bấm **Connect**, tab **External**, copy **External Database URL**. URL này có mật khẩu, **không gửi cho ai**.

## 2. Xuất dữ liệu ra file

Cài công cụ nếu chưa có:

```
apt install -y postgresql-client
```

Đặt URL vào biến tạm (dán URL ở giữa hai dấu nháy đơn, rồi Enter; biến mất khi thoát SSH):

```
export COSTLY_URL='dán-External-Database-URL-vào-đây'
```

Xuất bảng `documents` ra file (chạy trong thư mục `/opt/canteen`):

```
cd /opt/canteen
psql "$COSTLY_URL" -At -c "select coalesce(json_agg(json_build_object('tenant',tenant,'collection',collection,'id',id,'data',data)),'[]'::json) from documents" > costly.json
unset COSTLY_URL
ls -l costly.json
```

File phải có dung lượng lớn hơn vài trăm byte.

## 3. Nhập vào canteen

Xem trong file có những quán nào (chưa đổi gì):

```
node prisma/import-costly.mjs costly.json
```

Kết quả kiểu: `shop "chuquan": 40 nguyên liệu, 6 bán thành phẩm, 12 công thức`. Chọn quán muốn nhập (thường là quán có nhiều dữ liệu nhất), xem thử:

```
node prisma/import-costly.mjs costly.json --tenant chuquan
```

Đúng thì nhập thật:

```
node prisma/import-costly.mjs costly.json --tenant chuquan --apply
```

Mở https://canteen.taichinhketoan-hmu.edu.vn/costly (đăng nhập quản lý hoặc admin): nguyên liệu, bán thành phẩm và công thức xuất hiện đầy đủ.

## 4. Dọn dẹp

- Xóa file xuất (có dữ liệu thật): `rm costly.json`
- Render, `cost-ly-db`, Networking: **xóa** dòng IP vừa thêm.
- Khi đã dùng ổn một thời gian, có thể tắt dịch vụ `cost-ly` cũ trên Render.
