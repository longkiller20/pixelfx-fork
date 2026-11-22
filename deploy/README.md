# Cài game lên VPS: script và bảng điều khiển web

Hướng dẫn này dành cho một VPS **Ubuntu trắng** (chưa cài gì). Một lệnh cài **bảng điều khiển web** chạy ở cổng bạn tự
chọn. Phần còn lại làm trên trình duyệt, bấm nút là xong:

- Node.js, MariaDB, game, dịch vụ tự chạy lại
- mật khẩu trang admin
- tên miền qua **Caddy** hoặc **Nginx**, kèm HTTPS miễn phí
- tường lửa
- sao lưu
- cập nhật
- xem log

Hỗ trợ Ubuntu 20.04, 22.04, 24.04 và Debian 11, 12 (64-bit). Cần quyền root. VPS nên có 1 GB RAM trở lên; máy dưới
2 GB RAM sẽ được tạo thêm 2 GB swap.

## 1. Cài bảng điều khiển

SSH vào VPS rồi chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/longkiller20/pixelfx-fork/main/deploy/install.sh | sudo bash
```

(Máy không có `curl` thì dùng `wget -qO- <cùng địa chỉ> | sudo bash`.)

Script hỏi 3 thứ:

| Hỏi | Ghi chú |
| --- | --- |
| **Cổng của bảng điều khiển** | Cổng bất kỳ từ 1024 đến 65535, ví dụ `28443`. Enter để dùng cổng ngẫu nhiên được gợi ý. Không trùng 3306, 5885, 5886 và cổng đang có chương trình khác dùng. |
| **Tên đăng nhập** | Mặc định `admin`. |
| **Mật khẩu** | Ít nhất 10 ký tự, nhập 2 lần. Enter để tạo mật khẩu ngẫu nhiên; script in nó ra một lần duy nhất, hãy chép lại. |

Sau đó script tự làm:

1. Cài `curl`, `git`, Node.js 22.
2. Tải mã nguồn về `/opt/pixelfx-fork`. Chỉ lấy `game/` và `deploy/` ở commit mới nhất, khoảng 30 MB.
3. Chạy bảng điều khiển bằng systemd (dịch vụ `dvtt-panel`, tự chạy lại khi khởi động máy).
4. In ra địa chỉ để mở, ví dụ `http://203.0.113.10:28443`.

Mất khoảng 20-40 giây.

> **Không mở được trang?** Nhiều nhà cung cấp VPS có tường lửa riêng, gọi là *Security group* hoặc *Firewall*, ở trang
> quản lý VPS. Mở cổng của bảng điều khiển (TCP) ở đó. Dùng tên miền thì mở thêm 80 và 443.

## 2. Cài game trên bảng điều khiển

Đăng nhập rồi vào **Cài đặt nhanh**. Điền các mục sau:

| Mục | Ý nghĩa |
| --- | --- |
| Cổng game | Mặc định 5886. Người chơi vào `http://IP:cổng` khi không dùng tên miền. |
| Cổng trang admin | Mặc định 5885. |
| Tài khoản admin game | Tên (mặc định `admin`) và **mật khẩu cho trang admin của game** (8-72 ký tự). Có mật khẩu rồi thì không còn tài khoản mặc định `admin123456`. |
| Tên miền và reverse proxy | **Không dùng**, **Caddy** (khuyên dùng) hoặc **Nginx + Certbot**. Xem phần 3. |
| Ai được vào trang admin | Qua tên miền admin, qua cổng admin (có thể chỉ cho 1 IP), hoặc chỉ trong máy (vào bằng đường hầm SSH). |
| Tường lửa, sao lưu | Bật ufw; sao lưu database mỗi ngày lúc 03:30, giữ N bản. |

Bấm **Lưu & cài đặt tất cả**. Một cửa sổ hiện log trực tiếp của từng bước:

1. Cài gói: Node.js, MariaDB, git, ufw, swap.
2. Tạo database `dvtt` và tài khoản riêng của game, mật khẩu ngẫu nhiên ghi vào `game/.env`. MariaDB chỉ nghe ở `127.0.0.1`.
3. Tạo người dùng hệ thống `dvtt`, cài thư viện npm, viết `.env`, cài dịch vụ systemd `dvtt`, chạy game và đợi game trả lời.
4. Đặt mật khẩu admin game.
5. Cấu hình tên miền, nếu có chọn.
6. Bật tường lửa: chỉ mở SSH, cổng bảng điều khiển, cổng game hoặc 80/443, cổng admin nếu chọn.
7. Bật sao lưu tự động.

Cả quy trình mất khoảng 1-3 phút. Bước nào lỗi thì đọc log trong cửa sổ, sửa nguyên nhân, rồi bấm **Chạy lại** riêng
bước đó trong danh sách "Từng bước".

## 3. Tên miền và HTTPS

1. Ở trang quản lý tên miền (nơi mua tên miền, hoặc Cloudflare), tạo **bản ghi A** trỏ về IP của VPS. Bảng điều khiển
   liệt kê sẵn các bản ghi cần tạo kèm IP của máy.
   - `game.tenmien.com` cho game (bắt buộc khi dùng proxy).
   - `admin.tenmien.com` cho trang admin (không bắt buộc).
   - `vps.tenmien.com` cho chính bảng điều khiển, để vào bằng HTTPS (không bắt buộc).
2. Vào **Tên miền & HTTPS**, chọn **Caddy** hoặc **Nginx**, nhập tên miền và email (không bắt buộc), bật HTTPS, rồi bấm
   **Lưu & áp dụng**.

| | Caddy | Nginx + Certbot |
| --- | --- | --- |
| Cài | Kho chính thức của Caddy; không lấy được thì dùng bản của hệ điều hành | `nginx`, `certbot` của hệ điều hành |
| Chứng chỉ | Caddy tự lấy và tự gia hạn; chưa lấy được thì tự thử lại vài phút một lần | `certbot certonly --webroot`; gia hạn bằng `certbot.timer`, gia hạn xong Nginx tự nạp lại |
| Khi chưa có chứng chỉ | Trang chưa vào được bằng HTTPS (đợi DNS, hoặc tắt HTTPS để chạy tạm bằng HTTP) | Tên miền đó tạm chạy HTTP; chạy lại bước "Tên miền" khi DNS đã trỏ đúng |
| Tệp cấu hình | `/etc/caddy/Caddyfile` | `/etc/nginx/sites-available/dvtt.conf` |

Cả hai đều chuyển tiếp WebSocket của game (đường `/ws`). Khi có tên miền:

- Game và trang admin chỉ nghe ở `127.0.0.1`, đi qua proxy.
- `TRUST_PROXY=1`, để giới hạn tần suất thấy IP thật của người chơi.
- Tường lửa mở 80/443 thay cho cổng game.

Thứ tự khi áp dụng:

- Cấu hình mới được kiểm tra trước (`caddy validate` / `nginx -t`). Sai thì proxy cũ giữ nguyên.
- Đổi giữa Caddy và Nginx thì cái cũ tự tắt.
- Chọn "Không dùng" thì cấu hình proxy của game bị gỡ, game nghe lại ở mọi địa chỉ.

Máy tắt IPv6 thì Nginx chỉ nghe IPv4.

**Cloudflare:** lần đầu lấy chứng chỉ thì để đám mây xám (DNS only). Có chứng chỉ rồi muốn bật đám mây cam thì đặt
SSL/TLS là *Full (strict)*.

## 4. Các mục khác của bảng điều khiển

| Mục | Làm được gì |
| --- | --- |
| Tổng quan | Game chạy hay không, số người online, địa chỉ vào game và admin, CPU / RAM / ổ đĩa, phiên bản các thành phần, chứng chỉ còn bao nhiêu ngày, sao lưu gần nhất, các tác vụ gần đây (bấm vào để xem lại log) |
| Game & Admin | Chạy / dừng / chạy lại game; đổi cổng game và admin; cách vào admin; đổi mật khẩu admin game |
| Tên miền & HTTPS | Phần 3 |
| Tường lửa | Bật/tắt ufw, đóng cổng bảng điều khiển (khi đã có tên miền cho nó), chỉ cho 1 IP/dải IP vào cổng admin; xem `ufw status` |
| Dịch vụ & Log | Chạy / dừng / chạy lại game, MariaDB, Caddy, Nginx; xem log của chúng (cả bảng điều khiển, sao lưu, certbot), theo dõi trực tiếp |
| Sao lưu | Sao lưu ngay; tải về máy; khôi phục (dữ liệu hiện tại được tự sao lưu trước, game tạm dừng); xoá; bật/tắt sao lưu mỗi ngày, số bản giữ lại |
| Cập nhật | Kiểm tra bản mới; cập nhật (sao lưu trước, tải mã mới, giữ `.env`, cài lại thư viện, chạy lại game, bảng điều khiển tự chạy lại); đổi kho git, nhánh |
| Tệp .env | Sửa cấu hình game. Mật khẩu database được che; dòng sai dạng bị từ chối |
| Bảng điều khiển | Đổi tên đăng nhập, mật khẩu; đổi cổng (tường lửa mở cổng mới, trang tự chuyển sang địa chỉ mới) |

## 5. Lệnh trên VPS

| Lệnh | Làm gì |
| --- | --- |
| `sudo dvtt-panel passwd` | **Quên mật khẩu**: đặt lại tên và mật khẩu đăng nhập bảng điều khiển |
| `sudo dvtt-panel port 28443` | Đổi cổng bảng điều khiển |
| `sudo dvtt-panel status` | In cấu hình và trạng thái các dịch vụ |
| `sudo dvtt-panel set khoá=giá-trị …` | Đổi cấu hình như trên trang, ví dụ `set gamePort=6000 proxy=caddy domain=game.vd.com` |
| `sudo dvtt-panel run <tác vụ>` | Chạy một tác vụ: `setup`, `deps`, `db`, `app`, `adminpw`, `proxy`, `firewall`, `apply`, `backup`, `update` |
| `journalctl -u dvtt -f` | Log game trực tiếp |
| `systemctl restart dvtt` | Chạy lại game |

### Cài tất cả bằng một lệnh, không mở trang

```bash
curl -fsSL https://raw.githubusercontent.com/longkiller20/pixelfx-fork/main/deploy/install.sh | sudo bash -s -- \
  --port 28443 --user admin --pass 'MatKhauBangDieuKhien' \
  --all --admin-pass 'MatKhauAdminGame' \
  --proxy caddy --domain game.tenmien.com --admin-domain admin.tenmien.com --email ban@gmail.com
```

Các tham số khác:

- `--game-port`, `--admin-port`, `--panel-domain`
- `--dir` (mặc định `/opt/pixelfx-fork`), `--repo`, `--branch`
- `-y`: không hỏi gì

Bỏ `--pass` thì mật khẩu bảng điều khiển được tạo ngẫu nhiên và in ra.

## 6. Thư mục và tệp

| Đường dẫn | Là gì |
| --- | --- |
| `/opt/pixelfx-fork` | Mã nguồn (git) |
| `/opt/pixelfx-fork/game/.env` | Cấu hình game, chỉ người dùng `dvtt` đọc được |
| `/etc/dvtt-panel/panel.json` | Cổng, tên đăng nhập, mật khẩu đã băm (scrypt) của bảng điều khiển |
| `/etc/dvtt-panel/state.json` | Cấu hình triển khai: cổng game/admin, tên miền, proxy… |
| `/var/log/dvtt-panel/` | Log từng tác vụ đã chạy |
| `/var/backups/dvtt/` | Bản sao lưu `dvtt-YYYYmmdd-HHMMSS.sql.gz`, cùng `env-latest` (bản sao `.env`) |
| `/etc/systemd/system/dvtt.service` | Dịch vụ game (chạy bằng người dùng `dvtt`) |
| `/etc/systemd/system/dvtt-panel.service` | Dịch vụ bảng điều khiển (root) |
| `/etc/systemd/system/dvtt-backup.timer` | Sao lưu mỗi ngày |

## 7. Bảo mật

- **Mật khẩu bảng điều khiển:**
  - Băm bằng scrypt.
  - Sai 6 lần thì IP đó bị khoá 10 phút.
  - Phiên đăng nhập là cookie `HttpOnly; SameSite=Strict` (có HTTPS thì thêm `Secure`), hết hạn sau 12 giờ không dùng.
  - Mọi thao tác phải kèm mã riêng của phiên (chống CSRF).
  - Trang có CSP chặt và không cho nhúng vào khung.
- **Bảng điều khiển chạy bằng root**, vì nó cài gói, sửa proxy, tường lửa, systemd. Nên:
  - đặt mật khẩu dài;
  - khi đã có tên miền cho bảng điều khiển, tắt "Mở cổng bảng điều khiển" để chỉ vào được qua HTTPS.
- **Dữ liệu nhập vào được kiểm tra trước khi chạy:**
  - cổng, tên miền, email, IP, tên nhánh đều qua kiểm tra chặt;
  - tác vụ nhận chúng qua biến môi trường, không ghép thành lệnh shell;
  - mật khẩu admin game không xuất hiện trên dòng lệnh.
- **Game chạy bằng người dùng riêng `dvtt`**, không phải root, với `NoNewPrivileges`, `ProtectSystem`. Database của game
  có tài khoản riêng, chỉ có quyền trên database `dvtt`.
- **Tường lửa luôn giữ cổng SSH đang dùng**, để bạn không tự khoá mình ở ngoài.

## 8. Gỡ rối

| Hiện tượng | Cách xử lý |
| --- | --- |
| Không mở được bảng điều khiển | Mở cổng ở tường lửa của nhà cung cấp VPS. Trên VPS: `systemctl status dvtt-panel`, `journalctl -u dvtt-panel -n 50` |
| Quên mật khẩu bảng điều khiển | `sudo dvtt-panel passwd` |
| Game không chạy | Dịch vụ & Log → Game. Hay gặp: sai mật khẩu database (chạy lại bước "Cơ sở dữ liệu"), cổng bị trùng |
| Không lấy được HTTPS | Tên miền chưa trỏ về VPS (`getent hosts game.tenmien.com` phải ra IP của VPS), cổng 80/443 bị chặn ở tường lửa nhà cung cấp, hoặc Cloudflare đang bật đám mây cam |
| `apt` báo bận | VPS mới thường tự cập nhật ở mấy phút đầu; script đợi tối đa 10 phút |
| VPS dạng container (OpenVZ/LXC) | ufw có thể không bật được: dùng tường lửa của nhà cung cấp. Script báo rõ và vẫn chạy tiếp |

## Cấu trúc mã

```
deploy/
  install.sh               cài bảng điều khiển lên máy trắng (và --all: cài luôn game)
  panel/server.mjs         máy chủ bảng điều khiển + lệnh dvtt-panel (Node thuần, không cần npm install)
  panel/public/            giao diện (HTML, CSS, JS thuần)
  tasks/lib.sh             hàm dùng chung, biến môi trường của tác vụ
  tasks/setup.sh           cài tất cả (gọi các tác vụ dưới theo thứ tự)
  tasks/deps.sh            Node.js, MariaDB, gói hệ thống, swap
  tasks/db.sh              database, tài khoản, DB_PASS
  tasks/app.sh             người dùng dvtt, npm ci, .env, systemd dvtt
  tasks/adminpw.sh         mật khẩu trang admin game (tasks/admin-password.mjs)
  tasks/proxy.sh           Caddy / Nginx + certbot / gỡ proxy
  tasks/firewall.sh        ufw
  tasks/apply.sh           áp dụng cấu hình đã lưu (.env + chạy lại, proxy, tường lửa)
  tasks/backup.sh          sao lưu, khôi phục, xoá, hẹn giờ
  tasks/update.sh          cập nhật từ git
```

Mỗi tác vụ là một script bash độc lập, chạy được lại nhiều lần (idempotent). Tác vụ nhận cấu hình qua biến môi trường
(xem đầu `tasks/lib.sh`), nên chạy được cả từ bảng điều khiển lẫn từ `dvtt-panel run`.

**Biến môi trường của tác vụ:** `DVTT_DIR`, `GAME_PORT`, `ADMIN_PORT`, `PANEL_PORT`, `PROXY`, `HTTPS`, `DOMAIN`,
`ADMIN_DOMAIN`, `PANEL_DOMAIN`, `EMAIL`, `ADMIN_ACCESS`, `ADMIN_IP`, `PANEL_OPEN`, `FIREWALL`, `BACKUP_DAILY`,
`BACKUP_KEEP`, `REPO`, `BRANCH`; riêng từng tác vụ: `ADMIN_USER`, `ADMIN_PASS`, `ACTION`, `BACKUP_FILE`, `APPLY`, `FORCE`.

### Đã thử

Đã thử trên Ubuntu 24.04 trắng có systemd (container Docker):

- **Cài bằng một lệnh:** `curl … | bash --all` cài từ máy trắng tới game chạy trong khoảng 45 giây.
- **Cài qua bảng điều khiển:** dùng trình duyệt điền form Cài đặt nhanh và cài tất cả.
- **Đăng nhập:** game trả lời, trang admin nhận mật khẩu mới và từ chối `admin123456`.
- **Tên miền:** Caddy và Nginx đổi qua lại được, WebSocket đi qua proxy. Lấy chứng chỉ thất bại (tên miền không có thật)
  thì báo rõ lý do, trang không bị sập.
- **Tường lửa:** ufw mở đúng các cổng.
- **Sao lưu:** sao lưu và khôi phục đúng dữ liệu.
- **Cập nhật:** cập nhật từ git, giữ nguyên `.env`.
- **Bảng điều khiển:** đổi cổng, `dvtt-panel passwd`, chạy lại `install.sh` trên máy đã cài.
- **Khởi động lại máy:** mọi dịch vụ tự chạy lại.
