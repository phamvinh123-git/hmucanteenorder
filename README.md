# Đặt suất ăn - Căng tin Phân hiệu ĐHYHN Thanh Hóa

Website đặt suất ăn cho căng tin Phân hiệu Đại học Y Hà Nội tại Thanh Hóa, gồm 4 vai trò:

- **Admin**: quản lý tài khoản (tạo/khóa/đổi vai trò/reset mật khẩu), xem nhật ký hoạt động toàn hệ thống.
- **Bán hàng**: tiếp nhận thông tin sinh viên và đăng ký suất ăn (tự động cấp tài khoản sinh viên với mật khẩu mặc định `123`).
- **Sinh viên**: chọn/hủy bữa ăn, ghi chú, xem lịch dạng bảng, đổi mật khẩu.
- **Quản lý**: có toàn bộ quyền của Bán hàng, cộng thêm xem thống kê (biểu đồ) theo ngày/tuần/tháng.

## Quy tắc nghiệp vụ chính

- Hủy bữa trưa chỉ được chấp nhận trước 8:00 sáng cùng ngày; hủy bữa tối chỉ được chấp nhận trước 14:00 cùng ngày.
- Khi sinh viên hủy 1 buổi trong tổng số buổi đã đăng ký, hệ thống tự động thêm 1 buổi vào cuối lịch để đảm bảo đủ số buổi đã mua (ví dụ đăng ký 14 buổi, hủy 1 buổi giữa chừng thì lịch tự "nhảy" thêm 1 buổi ở cuối).
- Khi số buổi ăn còn lại của sinh viên dưới 2, tên sinh viên được hiển thị màu đỏ trong danh sách của Bán hàng/Quản lý.
- Sinh viên bắt buộc phải đổi mật khẩu trong lần đăng nhập đầu tiên trước khi dùng các chức năng khác.

## Chạy dự án

```bash
npm install
npx prisma migrate dev   # tạo database SQLite (chỉ cần chạy lần đầu / khi đổi schema)
npm run db:seed          # tạo tài khoản Admin mặc định
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

**Tài khoản Admin mặc định** (do `npm run db:seed` tạo, đổi mật khẩu ngay khi đăng nhập lần đầu):
- Số điện thoại: `0900000000`
- Mật khẩu: `admin123`

## Công nghệ

Next.js (App Router) + TypeScript + Tailwind CSS, Prisma + SQLite, xác thực bằng cookie JWT tự viết (không dùng dịch vụ thứ ba), biểu đồ bằng Recharts.

## Build production

```bash
npm run build
npm run start
```

SQLite phù hợp để chạy thử/nội bộ. Khi triển khai thật, nên đổi `DATABASE_URL` trong `.env` sang PostgreSQL/MySQL và cập nhật `provider` trong `prisma/schema.prisma`.
