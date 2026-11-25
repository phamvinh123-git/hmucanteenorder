# Cập nhật tổng hợp lên máy chủ Viettel

Bản mới nhất: commit `bb10b2d` trên nhánh `main` (https://github.com/phamvinh123-git/hmucanteenorder). Một lần cập nhật gom toàn bộ các thay đổi gần đây (Giá vốn, đổi gói, nhiều dịch vụ, Đặt sân 3D, nghỉ lễ). Cơ sở dữ liệu được cập nhật tự động, không cần chạy lệnh riêng.

## 1. Trước khi cập nhật (2 phút)

Sao lưu cơ sở dữ liệu, phòng khi cần quay lại. Trên máy chủ:

```
cd /opt/canteen
mkdir -p backups
set -a; . ./.env; set +a
pg_dump "${DATABASE_URL%%\?*}" -Fc -f backups/truoc-cap-nhat-$(date +%F-%H%M).dump
```

(`${DATABASE_URL%%\?*}` bỏ phần `?schema=...` phía sau địa chỉ, vì `pg_dump` không đọc được phần đó.) Nếu server chạy database trong Docker thì dùng `sh deploy/backup.sh`.

## 2. Cập nhật

```
cd /opt/canteen && git pull && sh deploy/update-any.sh
```

Script tự làm: lấy mã mới, `npm ci --include=dev`, `prisma generate`, `prisma migrate deploy` (thêm các cột và bảng mới), `npm run build`, khởi động lại pm2 `canteen`. Cuối cùng in dòng `Done: bb10b2d ...`. Muốn chỉ xem server chạy kiểu gì mà chưa đổi gì: `sh deploy/update-any.sh --check`.

## 3. Cơ sở dữ liệu thêm gì (tự áp dụng)

| Migration | Nội dung |
| --- | --- |
| `20261104000000_canteen_support_role` | Vai trò Hỗ trợ căng tin |
| `20261104000100_cost_shops` | Các cơ sở của Giá vốn |
| `20261123000000_union_role` | Vai trò Liên chi đoàn |
| `20261123000100_court_booking` | Sân, ca sân, lượt đặt sân |
| `20261125000000_service_roles` | Vai trò Tổ trưởng tổ dịch vụ, Quản lý sân |
| `20261126000000_court_union_approved` | Bước duyệt thứ hai của đặt sân |
| `20261126000100_court_manager` | Người quản lý riêng của từng sân |
| `20261127000000_extra_roles` | Một tài khoản có nhiều vai trò |
| `20261128000000_court_kind_days` | Loại sân và các ngày cho thuê |
| `20261129000000_club_captain_role` | Vai trò Đội trưởng CLB |
| `20261129000100_captain_sports` | Môn mà đội trưởng phụ trách |

Các thay đổi chỉ thêm cột, bảng, giá trị mới, không xóa dữ liệu cũ.

## 4. Việc hệ thống tự làm sau khi cập nhật (không cần bấm gì)

Cả hai chạy ngầm ở lần truy cập đầu tiên sau khi khởi động, mỗi việc chỉ một lần, đều ghi vào **Admin > Nhật ký**:

1. **Hủy cơm ngày 24/11/2026 (Ngày Văn hóa Việt Nam).** Mọi buổi trưa và tối của sinh viên ngày đó bị hủy, mỗi buổi được bù 1 buổi xếp vào cuối lịch (không rơi vào ngày nghỉ); cán bộ bị hủy suất trưa, không bù. Buổi đã lấy cơm giữ nguyên. Dòng nhật ký: "Hủy cơm ngày 24/11/2026 ... tự động". Nếu đã bấm nút **🎌 Nghỉ cả ngày** trước đó thì hệ thống không làm lại. Sau ngày 24/11 việc này không chạy nữa.
2. **Nhận loại sân theo tên.** Sân có chữ "cầu lông" / "bóng bàn" / "bóng đá" / "bóng rổ" được gán đúng loại, cầu lông và bóng bàn cho thuê Thứ 3, 5, 7. Dòng nhật ký: "Tự nhận loại sân theo tên ...". Sau đó mọi chỉnh sửa tay trong **Quản lý sân** được giữ nguyên.

## 5. Có gì mới cho người dùng

- **Căng tin:** đổi gói được cả trưa, tối, trưa và tối; sinh viên khôi phục được buổi đã hủy kể cả khi buổi bù đã bị hủy; nút **🎌 Nghỉ cả ngày** (Admin, Tổ trưởng, Quản lý căng tin) hủy cơm cả ngày lễ, sinh viên được bù, cán bộ không bù; các nút công cụ gom vào menu **Công cụ**.
- **Giá vốn:** vai trò Hỗ trợ căng tin (chỉ thấy Giá vốn), nhiều cơ sở, dữ liệu cốt và công thức chuẩn.
- **Nhiều dịch vụ:** trang chủ dạng ô dịch vụ, menu gọn; **Admin > Tài khoản > Phân quyền** tích nhiều vai trò cho một người, có bảng phân quyền xem mỗi vai trò thấy dịch vụ nào.
- **Đặt sân:** chọn môn, chọn ngày, chọn sân, chọn ca; **Nhà thi đấu** là sơ đồ 3D (3 bóng bàn, cầu lông 2, cầu lông 1) chạm để chọn; lượt đặt gửi Liên chi đoàn duyệt, rồi quản lý sân nếu sân có người quản lý riêng; có hiệu ứng và pháo giấy khi đặt xong.

## 6. Việc làm tay (một lần, nếu chưa làm)

- **Tạo sân nếu chưa có:** `node prisma/seed-courts.mjs` (chỉ xem), rồi `node prisma/seed-courts.mjs --apply`. Tạo cầu lông 1-2, bóng bàn 1-3, bóng đá, bóng rổ với 3 ca 17h-18h, 18h-19h, 19h-20h. Chạy lại không sinh trùng.
- **Cấp quyền đội trưởng:** **Admin > Tài khoản > Phân quyền**, tích **Đội trưởng CLB** và chọn môn. Sân cầu lông, bóng bàn, bóng rổ chỉ đội trưởng nộp đơn được, Liên chi đoàn duyệt.
- **Gán người duyệt:** vào **Admin > Tài khoản > Phân quyền**, tích vai trò **Liên chi đoàn** cho các bạn duyệt sân; tích **Quản lý sân** rồi chọn người quản lý riêng cho sân bóng đá ở tab **Quản lý sân** của Đặt sân.
- **Giá vốn:** `node prisma/seed-giavon.mjs --apply` (thêm `--reset` nếu muốn làm lại từ đầu), rồi nhập giá nguyên liệu. Chuyển dữ liệu Cost Ly cũ theo `deploy/CHUYEN-COST-LY.md`.

## 7. Kiểm tra sau khi cập nhật

1. `pm2 list` thấy `canteen` ở trạng thái `online`; `pm2 logs canteen --lines 50` không có lỗi đỏ.
2. Mở https://canteen.taichinhketoan-hmu.edu.vn, đăng nhập Admin: **Lịch tuần**, ô Thứ 3 24/11 về 0 suất; **Nhật ký** có dòng hủy cơm ngày 24/11 và dòng nhận loại sân.
3. Một tài khoản sinh viên đã có buổi 24/11: lịch không còn buổi đó, cuối lịch có thêm buổi bù.
4. **Đặt sân** bằng tài khoản sinh viên: có nút **🏟️ Nhà thi đấu**, sơ đồ 3D hiện đủ 5 sân, thứ 4 các sân cầu lông và bóng bàn ghi nghỉ. Đặt thử một ca: trạng thái "Chờ Liên chi đoàn duyệt".
5. Tài khoản Liên chi đoàn: tab **Duyệt** thấy yêu cầu vừa gửi, duyệt xong thì sinh viên thấy "Đã duyệt".
6. Nếu giao diện vẫn là bản cũ: nhấn Ctrl+F5 (hoặc xóa cache) trên trình duyệt.

## 8. Khi có sự cố

- Chạy `sh deploy/diagnose.sh` (chỉ đọc, không đổi gì) rồi gửi kết quả.
- Quay lại bản cũ: lệnh cập nhật in dòng `<mã cũ> -> <mã mới>`. Chạy `git reset --hard <mã cũ>`, rồi `npm ci --include=dev && npx prisma generate && npm run build && pm2 restart canteen`. Các thay đổi cơ sở dữ liệu ở mục 3 chỉ thêm nên bản cũ vẫn chạy được; nếu cần quay cả dữ liệu thì khôi phục file sao lưu ở mục 1 (`pg_restore`).
