# Đa Vũ Trụ Tu Tiên

Game web nhiều người chơi, nơi tu sĩ, long kỵ sĩ và thời không chúa tể từ khắp các vũ trụ gặp nhau. Phần chữ trong game bằng
tiếng Việt, đồ họa pixel lấy từ thư viện pixelfx nằm ngay trong repo này. Chơi được trên máy tính lẫn điện thoại.

- **Máy chủ:** Node.js + Express, WebSocket (`ws`) cho thế giới chung, MariaDB lưu dữ liệu, mặc định chạy ở cổng **5886**.
- **Ba môn phái:**
  - **Long Kỵ Sĩ:** cận chiến; biến thân khoác long giáp; Hỏa Long hiện sau lưng phun lửa.
  - **Thời Không Chúa Tể:** đánh xa; Thời Đình làm chậm kẻ địch; biến thân thành Thời Vương.
  - **Khôi Thi Sư:** triệu hồi khôi thi, Thôn Phệ hút máu.
- **Ba khu vực:**
  - **Vạn Giới Quảng Trường:** an toàn; đứng yên trong Linh Mạch để tu luyện.
  - **Luyện Võ Trường:** đánh bù nhìn rơm và âm hồn.
  - **Đấu Trường Đa Vũ Trụ:** PvP có cân bằng chỉ số.
- **Tiến trình:** 9 cảnh giới × 5 tầng (Luyện Khí → Độ Kiếp), linh thạch, Đan Các (cửa hàng), quà mỗi ngày, Bảng Phong Thần.

## Cài lên VPS (Ubuntu/Debian)

Nếu VPS chưa có các gói cần thiết, cài trước:

```bash
# Node 18 trở lên và MariaDB
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs mariadb-server git
```

Sau đó cài game:

1. Lấy mã nguồn, cài thư viện:

   ```bash
   sudo git clone <repo của bạn> /opt/pixelfx-fork
   cd /opt/pixelfx-fork/game
   npm ci --omit=dev
   ```

2. Tạo cơ sở dữ liệu. Mở `setup-db.sql`, đổi mật khẩu, rồi chạy:

   ```bash
   sudo mariadb < setup-db.sql
   ```

   Các bảng được tự tạo khi máy chủ khởi động lần đầu.

3. Cấu hình:

   ```bash
   cp .env.example .env
   nano .env   # điền DB_PASS giống mật khẩu ở bước 2
   ```

4. Chạy thử: `npm start`, rồi mở `http://IP-VPS:5886`.

5. Mở cổng tường lửa nếu có: `sudo ufw allow 5886/tcp`.

6. Chạy nền, tự khởi động lại. Chọn **một** trong hai cách:

   - **pm2:**

     ```bash
     sudo npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
     ```

   - **systemd:** sửa `User` và `WorkingDirectory` trong `dvtt.service`, rồi chạy:

     ```bash
     sudo cp dvtt.service /etc/systemd/system/ && sudo systemctl enable --now dvtt
     ```

Khi tắt (Ctrl+C, `pm2 stop`, `systemctl stop`), máy chủ lưu hết dữ liệu của người đang chơi rồi mới thoát.

### Tên miền và HTTPS (khuyên dùng)

Đặt nginx phía trước rồi trỏ về cổng 5886. Nhớ chuyển tiếp WebSocket và đặt `TRUST_PROXY=1` trong `.env`:

```nginx
location / {
    proxy_pass http://127.0.0.1:5886;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Có HTTPS thì game tự dùng `wss://`.

## Điện thoại

- Khi bấm **Đăng nhập** hoặc **Đăng ký**, game xin chế độ toàn màn hình và khoá màn hình nằm ngang. Android Chrome hỗ trợ việc này.
- iPhone Safari không cho web khoá hướng màn hình. Vì vậy, nếu máy đang cầm dọc, cả giao diện tự xoay ngang 90° để vẫn chơi được.
- Nút ⛶ trên thanh menu để vào lại toàn màn hình. Trình duyệt chỉ cho phép việc đó sau một lần chạm, nên khi mở lại game bằng phiên đã lưu, bạn cần bấm nút này.
- Điều khiển: kéo ngón tay ở nửa trái màn hình để đi. Các nút bên phải là chiêu thức và đan dược. Trên điện thoại, chiêu tự nhắm kẻ địch gần nhất.

## Máy tính

| Phím | Tác dụng |
|---|---|
| WASD / mũi tên | Di chuyển |
| Chuột | Ngắm |
| J K L, 1 2 3, chuột trái/phải | Chiêu 1, 2, 3 |
| 4 | Hồi Xuân Đan |
| 5 | Tụ Khí Đan |
| Enter | Trò chuyện |

## Bảo mật và chống race condition

Máy chủ là nơi duy nhất quyết định mọi thứ. Client chỉ gửi "đang bấm hướng nào, ra chiêu nào, ngắm đâu". Vị trí, tốc độ, hồi
chiêu, tầm đánh, sát thương, phần thưởng đều do máy chủ tính, nên sửa client không gian lận được.

Chống tranh chấp khi nhiều yêu cầu đến cùng lúc (`server/store.js`):

- **Tiền và vật phẩm chỉ đổi bằng câu lệnh có điều kiện:** `stones = stones - 40 WHERE stones >= 40`, `qty = qty - 1 WHERE qty > 0`.
  Hai lần mua cùng lúc không thể tiêu chung một khoản linh thạch, và số dư không bao giờ âm.
- **Việc chỉ được làm một lần thì có khoá duy nhất trong database:**
  - Mỗi lần mua có một mã giao dịch: bấm hai lần hoặc mạng gửi lại vẫn chỉ trừ tiền một lần.
  - Quà mỗi ngày có khoá (tài khoản, ngày).
  - Tên đăng nhập và đạo hiệu là duy nhất.
- **Các bước liên quan chạy trong một transaction,** và mỗi tài khoản xử lý tuần tự từng việc một (`server/lock.js`).
- **Thế giới chỉ cộng phần mới kiếm được** (`exp = exp + 35`), không ghi đè con số nó nhớ. Một lần mua xen giữa hai lần lưu
  không bao giờ bị mất.
- **Giới hạn tu luyện mỗi ngày** được kiểm tra ngay trong câu lệnh cộng tu vi.
- **Một tài khoản chỉ ở trong thế giới một lần:** vào từ máy thứ hai thì máy thứ nhất bị đẩy ra, và phần của máy cũ được lưu
  xong trước khi máy mới vào.
- **Đan dược** có hồi chiêu đặt trước khi chạm database: bấm 10 lần chỉ tốn một viên.

Các lớp bảo vệ khác:

- **Mật khẩu:** băm bằng scrypt với salt riêng.
- **Token đăng nhập:** chỉ lưu bản băm SHA-256 trong database.
- **Giới hạn tần suất:** đăng nhập/đăng ký, các thao tác ghi, và tin nhắn WebSocket (quá nhiều thì bị ngắt kết nối).
- **WebSocket:** chỉ nhận kết nối từ chính trang game (kiểm tra Origin), gói tin tối đa 2 KB.
- **Header bảo mật:** có Content-Security-Policy, chống nhúng trang vào iframe, `nosniff`.
- **Chat:** dọn ký tự lạ, giới hạn độ dài, hiển thị dạng chữ thuần (không chèn được HTML).

Kiểm tra: khi máy chủ đang chạy, `npm run test:race` bắn hàng loạt yêu cầu đồng thời. Nó kiểm tra quà ngày, mua đồ quá tiền,
mua trùng mã, đăng nhập hai nơi, spam đan dược và một trận đấu trường, rồi đối chiếu số liệu trong database. Nên chạy trên máy
chủ thử, vì nó tạo vài tài khoản `t_...`.

## Cân bằng

Mọi con số nằm trong `shared/balance.js`; máy chủ và trình duyệt dùng chung file này.

- **Cùng ngân sách chỉ số:** ba môn phái đánh đổi sinh lực, công, thủ, tốc với nhau. Ở cùng cảnh giới, thời gian hạ một đối
  thủ (khi trúng hết đòn) nằm trong khoảng 10–13 giây.
  - Cận chiến nhỉnh hơn một chút vì phải áp sát.
  - Đánh xa có lợi thế tầm.
  - Khôi Thi Sư hút máu bù lại.
- **Đấu trường nén chênh lệch cảnh giới:** ngoài thế giới, cảnh giới cao nhất mạnh gấp khoảng 2 lần người mới. Trong đấu
  trường, chênh lệch chỉ còn tối đa 10%, và không được dùng đan hồi phục.
- **Chống "nuôi điểm":**
  - Hạ cùng một người trong vòng 2 phút không được thưởng.
  - Vừa hồi sinh được miễn sát thương 2 giây.
  - Tu luyện có trần mỗi ngày.
- **Không có nạp tiền:** linh thạch chỉ kiếm được trong game.

Muốn chỉnh cân bằng, sửa `shared/balance.js` rồi khởi động lại máy chủ.

## Cấu trúc

```text
game/
  server/index.js    Express, file tĩnh, WebSocket, tắt máy an toàn
  server/api.js      REST: đăng ký, đăng nhập, nhân vật, Đan Các, quà ngày, bảng xếp hạng
  server/world.js    thế giới chung: di chuyển, chiêu thức, quái, đấu trường, phần thưởng, 20 lần/giây
  server/store.js    mọi thay đổi dữ liệu nhân vật, an toàn khi tranh chấp
  server/db.js       MariaDB: pool, transaction, tạo bảng
  server/auth.js     mật khẩu, phiên đăng nhập, giới hạn tần suất
  shared/balance.js  chỉ số, chiêu thức, cảnh giới, vật phẩm
  public/            trang game: canvas, giao diện, điều khiển
  test/race.mjs      kiểm tra tranh chấp và PvP
```

Hình ảnh nhân vật, rồng, khôi thi và mọi hiệu ứng đến từ `../src` (pixelfx): máy chủ phục vụ thư mục đó ở đường dẫn
`/pixelfx`, nên phải giữ nguyên game trong repo này.

## Mở rộng

Thế giới chạy trong bộ nhớ của một tiến trình Node, nên hãy chạy **một** tiến trình (pm2 `instances: 1`). Một tiến trình chịu
được vài trăm người cùng lúc. Muốn lớn hơn nữa thì cần tách thành nhiều "kênh", mỗi kênh một tiến trình. Các ràng buộc trong
database vẫn giữ an toàn kể cả khi có nhiều tiến trình.
