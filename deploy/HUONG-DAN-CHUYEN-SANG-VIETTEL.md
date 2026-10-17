# Chuyển hệ thống từ Render sang máy chủ Viettel

Hướng dẫn này dành cho một máy chủ **Linux (Ubuntu 22.04 hoặc 24.04)** do Viettel cấp. Cả hệ thống (cơ sở dữ liệu, website, HTTPS) chạy bằng Docker trên một máy, nên các bước giống nhau dù máy là VPS hay máy chủ ảo.

Mã nguồn đã có sẵn các file cần thiết: `Dockerfile`, `docker-compose.yml`, thư mục `deploy/`.

---

## 0. Chuẩn bị

**Máy chủ Viettel**
- Hệ điều hành Linux Ubuntu 22.04/24.04, quyền `root` hoặc `sudo`, truy cập được bằng SSH.
- Tối thiểu 2 vCPU, 2 GB RAM (khuyên 4 GB), ổ đĩa 30 GB trở lên.
- Địa chỉ IP công khai, mở cổng **80** và **443** ra internet (cổng 22 để SSH, nên giới hạn theo IP của bạn).
- Máy chủ phải **ra được internet**: lúc build cần tải phông chữ và thư viện.

**Tên miền (khuyên dùng)**: ví dụ `canteen.truong.edu.vn`, trỏ bản ghi `A` về IP máy chủ. Có tên miền thì HTTPS tự động. Chưa có thì chạy tạm bằng IP qua HTTP để thử (xem mục 8).

**Từ Render, lấy 3 thứ**
1. `AUTH_SECRET`: Render, mục Environment. Dùng lại đúng giá trị này thì mọi người không bị đăng xuất.
2. **External Database URL** của Postgres: Render, trang database, nút Connect, tab External.
3. **Phiên bản PostgreSQL** (ví dụ 16 hay 17): trang database, mục Info.

---

## 1. Cài Docker trên máy chủ

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
docker --version && docker compose version
```

## 2. Lấy mã nguồn

```bash
sudo mkdir -p /opt/canteen && sudo chown $USER /opt/canteen
git clone https://github.com/phamvinh123-git/hmucanteenorder.git /opt/canteen
cd /opt/canteen
chmod +x deploy/*.sh
```

(Nếu kho mã là private, dùng Personal Access Token của GitHub khi được hỏi mật khẩu.)

## 3. Tạo file cài đặt `.env`

```bash
cp deploy/env.example .env
nano .env
```

Điền:
- `POSTGRES_VERSION` = phiên bản của database trên Render.
- `POSTGRES_PASSWORD` = một mật khẩu dài mới (chỉ chữ và số).
- `AUTH_SECRET` = giá trị lấy từ Render (hoặc tạo mới bằng `openssl rand -hex 32`).
- `CADDY_DOMAIN` và `COOKIE_SECURE`: xem mục 8 (thử bằng IP) hoặc mục 9 (có tên miền).

## 4. Khởi động cơ sở dữ liệu trống

```bash
docker compose up -d db
docker compose ps      # db phải ở trạng thái "healthy"
```

## 5. Lấy dữ liệu từ Render

Chạy trên **máy chủ Viettel** (chỉ cần Docker, không cần cài thêm gì). Thay `<URL>` bằng External Database URL, đặt trong dấu nháy kép:

```bash
docker run --rm -v "$PWD":/out postgres:16-alpine \
  pg_dump --no-owner --no-acl -Fc "<URL>" -f /out/canteen.dump
ls -lh canteen.dump
```

Thay `16` bằng phiên bản của database trên Render (đúng hoặc mới hơn). Nếu Render báo không kết nối được, vào trang database trên Render, mục Access Control, cho phép địa chỉ IP của máy chủ Viettel.

## 6. Nạp dữ liệu vào máy chủ Viettel

```bash
docker compose exec -T db pg_restore --no-owner --no-acl \
  -U canteen -d canteen --clean --if-exists < canteen.dump
```

Có vài dòng cảnh báo kiểu "does not exist, skipping" là bình thường.

## 7. Chạy toàn bộ hệ thống

```bash
docker compose up -d --build
docker compose logs -f app
```

Lần đầu build mất vài phút. Khi log hiện `Ready` và các dòng `...already handled, skipping` là xong (các lệnh nhập dữ liệu một lần đã có dấu trong nhật ký, nên không chạy lại). Nhấn `Ctrl+C` để thoát xem log, hệ thống vẫn chạy.

Kiểm tra:

```bash
docker compose ps       # db, app, caddy đều Up
```

## 8. Thử bằng địa chỉ IP (chưa có tên miền)

Trong `.env`: `CADDY_DOMAIN=:80` và `COOKIE_SECURE=false`, rồi:

```bash
docker compose up -d
```

Mở `http://<IP máy chủ>`, đăng nhập bằng tài khoản admin, kiểm tra số sinh viên, lịch tuần, nhật ký có giống trên Render. Đây mới chỉ là thử, **dùng thật nên chuyển sang HTTPS với tên miền** (mục 9), vì mật khẩu đi qua HTTP không được mã hóa.

## 9. Chính thức chuyển sang máy chủ Viettel

Chọn thời điểm ít người dùng (ví dụ đêm), báo bảo trì khoảng 30 phút.

1. Một ngày trước: hạ TTL của tên miền xuống 300 giây.
2. Đúng lúc chuyển: **tạm dừng Render** (Render, Suspend service) để không còn ai ghi dữ liệu mới.
3. Làm lại mục 5 để lấy bản dữ liệu mới nhất, rồi mục 6 để nạp lại (có `--clean` nên ghi đè).
4. Sửa `.env`: `CADDY_DOMAIN=canteen.truong.edu.vn`, `COOKIE_SECURE=true`.
5. `docker compose up -d --build`.
6. Trỏ bản ghi `A` của tên miền về IP máy chủ Viettel. Vài phút sau, Caddy tự lấy chứng chỉ HTTPS.
7. Mở `https://canteen.truong.edu.vn`, đăng nhập, kiểm tra lại. Xóa file `canteen.dump` khi xong vì trong đó có toàn bộ dữ liệu.

**Quay lại Render nếu có sự cố:** mở lại (Resume) service Render rồi trỏ tên miền về Render. Dữ liệu nhập trên máy chủ Viettel sau thời điểm chuyển sẽ không có trên Render, nên cần tự đối chiếu. Hãy giữ Render ít nhất 1 đến 2 tuần, nhưng đừng để hai nơi cùng nhận dữ liệu.

## 10. Sao lưu hằng ngày

Thử một lần:

```bash
sh deploy/backup.sh
ls -lh backups
```

Đặt chạy tự động lúc 2 giờ sáng:

```bash
crontab -e
# thêm dòng:
0 2 * * * /opt/canteen/deploy/backup.sh >> /opt/canteen/backups/backup.log 2>&1
```

Giữ 30 ngày gần nhất trong thư mục `backups`. **Định kỳ chép thư mục này sang máy khác** (máy tính văn phòng, ổ ngoài): sao lưu cùng ổ đĩa với máy chủ không cứu được khi hỏng ổ.

Nạp lại từ một bản sao lưu (làm khi cần):

```bash
docker compose exec -T db pg_restore --no-owner --no-acl -U canteen -d canteen --clean --if-exists < backups/canteen-2026-10-20-0200.dump
```

## 11. Cập nhật khi có chức năng mới

Sau khi code được đẩy lên GitHub như trước, trên máy chủ chạy:

```bash
cd /opt/canteen && sh deploy/update.sh
```

Lệnh tự lấy mã mới, build lại, chạy lại website. Cơ sở dữ liệu giữ nguyên, các thay đổi cấu trúc dữ liệu tự áp dụng khi khởi động. Website ngừng khoảng 1 đến 2 phút trong lúc khởi động lại.

### Tự động cập nhật (không cần ai đăng nhập vào máy chủ)

Để mỗi lần đẩy code lên GitHub, máy chủ tự lấy bản mới và chạy lại trong vòng vài phút, thêm vào cron:

```bash
crontab -e
# thêm dòng:
*/5 * * * * /opt/canteen/deploy/auto-update.sh >> /opt/canteen/backups/auto-update.log 2>&1
```

Mỗi lần có bản mới, script tự sao lưu cơ sở dữ liệu trước rồi mới cập nhật. Không cần mật khẩu nào ngoài lần cài đặt ban đầu. Xem kết quả: `tail /opt/canteen/backups/auto-update.log`. Muốn tạm dừng tự cập nhật thì đặt dấu `#` đầu dòng trong cron.

## 12. Bảo mật tối thiểu

- Tường lửa chỉ mở cổng 80 và 443 ra ngoài, SSH (22) giới hạn theo IP của bạn. Không mở cổng 5432 (database chỉ nội bộ, đã cấu hình sẵn như vậy).
- Dùng khóa SSH, tắt đăng nhập `root` bằng mật khẩu.
- Cập nhật hệ điều hành định kỳ: `sudo apt update && sudo apt upgrade`.
- Không gửi file `.env` và các file `.dump` qua tin nhắn hay email.
- Khi xong việc chuyển, vào Render xóa các biến môi trường chứa dữ liệu (`SEED_DATA_B64`, `ROSTER_DATA_B64`, `OFFICERS_DATA_B64`) và xóa database ở Render sau khi chắc chắn không dùng lại.

## 13. Xử lý sự cố nhanh

| Hiện tượng | Cách xử lý |
|---|---|
| Không đăng nhập được khi dùng IP qua HTTP | Trong `.env` đặt `COOKIE_SECURE=false`, chạy `docker compose up -d`. Dùng HTTPS thì để `true`. |
| Website báo lỗi 502 | `docker compose logs app` xem lỗi. Thường do database chưa sẵn sàng hoặc sai `POSTGRES_PASSWORD`. |
| Giờ hủy cơm lệch giờ | Container đã đặt múi giờ Việt Nam (`TZ=Asia/Ho_Chi_Minh`), không cần chỉnh giờ của máy. Kiểm tra bằng `docker compose exec app date`. |
| HTTPS không lấy được chứng chỉ | Tên miền chưa trỏ đúng về IP, hoặc cổng 80/443 chưa mở trên tường lửa của Viettel. |
| Build lỗi tải phông chữ | Máy chủ chưa ra được internet (cần mở kết nối ra ngoài). |
| Máy chủ khởi động lại | Hệ thống tự chạy lại (`restart: unless-stopped`). Kiểm tra `docker compose ps`. |
| Xem log | `docker compose logs --tail 200 app` |
