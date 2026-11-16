# Đa Vũ Trụ Tu Tiên

Game web nhiều người chơi, nơi tu sĩ, long kỵ sĩ và thời không chúa tể từ khắp các vũ trụ gặp nhau. Phần chữ trong game bằng
tiếng Việt, đồ họa pixel lấy từ thư viện pixelfx nằm ngay trong repo này. Chơi được trên máy tính lẫn điện thoại.

- **Máy chủ:** Node.js + Express, WebSocket (`ws`) cho thế giới chung, MariaDB lưu dữ liệu, mặc định chạy ở cổng **5886**.
- **Ba môn phái:**
  - **Long Kỵ Sĩ:** cận chiến; biến thân khoác long giáp; Hỏa Long hiện sau lưng phun lửa.
  - **Thời Không Chúa Tể:** đánh xa; Thời Đình làm chậm kẻ địch; biến thân thành Thời Vương.
  - **Khôi Thi Sư:** triệu hồi khôi thi, Thôn Phệ hút máu.
- **Góc nhìn đi ngang** (side-scroller), khớp với cách pixelfx vẽ nhân vật và hiệu ứng: đi trái/phải, nhảy, đứng trên đài
  mây, rơi theo trọng lực.
- **Bản đồ hiện có: Tân Thủ Thôn,** thôn khởi đầu dài 128 ô (mỗi ô 32 px). Đi từ tây sang đông:
  - Vách núi có thác đổ xuống hồ, cầu gỗ bắc qua hồ.
  - Phố nhà mái cong.
  - Điện thờ trên sân đá cao 2 ô; trước điện là Thái Cực Đài, phía trên có đài mây lơ lửng.
  - Cổng chào, suối có cầu.
  - Khu chợ: điểm xuất hiện, có bia Truyền Tống.
  - Đồi có bảo tháp.
  - Bậc thang đá đi xuống lối ra.
- **Thôn an toàn, không có yêu thú.**
  - Nước và thác có hoạt ảnh, đèn đá lập lòe, hoa anh đào bay.
  - Phía sau là núi, đảo bay và mây, mỗi lớp trượt chậm hơn tiền cảnh (parallax).
  - Ngồi thiền trên Thái Cực Đài để tu luyện; đĩa âm dương phía trên quay nhanh hơn khi có người tu luyện.
  - Mũi tên vàng dưới chân bậc thang đá cuối thôn là lối ra. Hiện chưa mở; đi hoặc nhảy qua sẽ hiện "bản đồ sẽ mở rộng sau,
    xin đạo hữu thông cảm".
- **Sắp có:** bản đồ luyện cấp đánh yêu thú, và đấu trường PvP. Mã đã có sẵn, chỉ cần khai báo bản đồ.
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
- Điều khiển: kéo ngón tay sang trái/phải ở nửa trái màn hình để đi; kéo lên để nhảy, kéo xuống rồi nhảy để rơi xuyên đài mây.
  Bên phải có nút Nhảy, các nút chiêu và đan dược. Trên điện thoại, chiêu tự nhắm kẻ địch gần nhất.

## Máy tính

| Phím | Tác dụng |
|---|---|
| A/D hoặc ←/→ | Đi trái/phải |
| W, ↑, Space | Nhảy |
| S + nhảy | Rơi xuyên đài mây |
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
mua trùng mã, đăng nhập hai nơi và spam đan dược, rồi đối chiếu số liệu trong database. Nó cũng kiểm tra tường chặn, cú nhảy lên
sân điện và lối ra của Tân Thủ Thôn. Nên chạy trên máy
chủ thử, vì nó tạo vài tài khoản `t_...`.

## Cân bằng

Mọi con số nằm trong `shared/balance.js`; máy chủ và trình duyệt dùng chung file này.

- **Cùng ngân sách chỉ số:** ba môn phái đánh đổi sinh lực, công, thủ, tốc với nhau. Ở cùng cảnh giới, thời gian hạ một đối
  thủ (khi trúng hết đòn) nằm trong khoảng 10–13 giây.
  - Cận chiến nhỉnh hơn một chút vì phải áp sát.
  - Đánh xa có lợi thế tầm.
  - Khôi Thi Sư hút máu bù lại.
- **Bản đồ PvP nén chênh lệch cảnh giới** (khi mở): ngoài thế giới, cảnh giới cao nhất mạnh gấp khoảng 2 lần người mới. Trên
  bản đồ PvP, chênh lệch chỉ còn tối đa 10%, và không được dùng đan hồi phục.
- **Chống "nuôi điểm":**
  - Hạ cùng một người trong vòng 2 phút không được thưởng.
  - Vừa hồi sinh được miễn sát thương 2 giây.
  - Tu luyện có trần mỗi ngày.
- **Không có nạp tiền:** linh thạch chỉ kiếm được trong game.

Muốn chỉnh cân bằng, sửa `shared/balance.js` rồi khởi động lại máy chủ.

## Bản đồ

Mỗi bản đồ là một file trong `shared/maps/`. Bản đồ dựng từ lưới ô 32 px; mỗi ô gồm 4 ô 16 px của tileset, vẽ đúng cỡ gốc.

- `grid`: mỗi ký tự là một ô, **sửa tay được** bằng bất kỳ trình soạn thảo nào.

  | Ký tự | Ý nghĩa |
  |---|---|
  | `.` | không khí |
  | `#` | đất; có cỏ ở mặt trên nếu phía trên trống |
  | `s` | đá xây (sân điện, bậc thang) |
  | `=` | đài mây: đứng được từ trên xuống, nhảy xuyên từ dưới lên, bấm xuống + nhảy để rơi xuyên qua |
  | `b` | cầu: giống đài mây, có nước bên dưới |
  | `w` | nước (chỉ để trang trí) |
  | <code>&#124;</code> | thác (chỉ để trang trí) |

- `props`: các công trình vẽ bằng code theo phong cách tiên hiệp, viết dạng `[loại, x, hàng nền, tuỳ chọn]`. Các loại hiện có:
  - `house`: nhà mái cong, có 3 kiểu mái.
  - `temple`: điện thờ.
  - `pagoda`: bảo tháp.
  - `gate`: cổng chào.
  - `lantern`: đèn đá.
  - `cherry`: cây anh đào.
  - `bamboo`: khóm trúc.
  - `taiji`: Thái Cực Đài.
  - `well`: giếng.
  - `stall`: sạp hàng chợ.
  - `spawnstone`: bia Truyền Tống.
  - `sign`: biển gỗ.
- `deco`: cây hoa lấy từ tileset đất, viết dạng `[cột trong tấm, hàng trong tấm, x, hàng nền]`.
- `spawn`: điểm xuất hiện, luôn đứng trên nền.
- `spring`: đoạn tu luyện trên Thái Cực Đài.
- `portals`: lối ra. Có `to` thì chuyển sang bản đồ đó; để `null` thì hiện thông báo `msg`.
- `mobs`: yêu thú.
- `pvp`: đặt `true` để cho phép tỷ thí.

Vật lý đi ngang nằm trong `shared/physics.js` (trọng lực, nhảy, va chạm ô, rơi xuyên đài mây). Máy chủ dùng nó để di chuyển mọi
người, và trình duyệt chạy đúng các bước đó để nhân vật của bạn phản hồi ngay khi bấm. Khi hai bên lệch nhau, nhân vật được kéo
về vị trí của máy chủ.

### Tileset và ghi công

Mọi thứ được vẽ ở **cùng cỡ pixel với nhân vật** (1 pixel ảnh = 1 pixel thế giới). Nhờ vậy nhà cửa, cây cối có kích thước như
thật bên cạnh người:
- Cửa cao hơn người.
- Nhà cao khoảng 3 lần nhân vật.
- Điện thờ 2 tầng mái và bảo tháp cao vượt cả phố.
- Cây anh đào và khóm trúc cao hơn mái nhà.

Nguồn tài nguyên:
- **Đất, cỏ, đá xây, cây hoa:** *old frogatto tile art* (OpenGameArt), giấy phép **CC0**. Mình đã bỏ nền và đổi màu đất sang nâu.
- **Mái ngói cong:** *Oriental Roof Tiles* (OpenGameArt), giấy phép **CC0**. Mình cắt thành đầu mái và đoạn giữa lặp lại, phối 4
  màu (xám, lam, đỏ gạch, ngọc).
- **Nơi lấy:** cả hai lấy từ kho CC0 https://github.com/Tiddybub/2d-assets, vì môi trường dựng game không truy cập được
  OpenGameArt và itch.io.
- **Ghi công đầy đủ:** `public/maps/tiles/CREDITS.md`.
- **Vẽ bằng code** trong `public/js/scenery.js`: tường, cửa, cửa sổ song gỗ, cột đỏ, điện thờ, cổng, bảo tháp, đèn đá, cây anh đào,
  trúc, đài mây, cầu, nước, thác, bầu trời và núi.

## Cấu trúc

```text
game/
  server/index.js        Express, file tĩnh, WebSocket, tắt máy an toàn
  server/api.js          REST: đăng ký, đăng nhập, nhân vật, Đan Các, quà ngày, bảng xếp hạng
  server/world.js        thế giới chung: di chuyển (va chạm theo bản đồ), chiêu thức, lối ra, phần thưởng, 20 lần/giây
  server/store.js        mọi thay đổi dữ liệu nhân vật, an toàn khi tranh chấp
  server/db.js           MariaDB: pool, transaction, tạo bảng
  server/auth.js         mật khẩu, phiên đăng nhập, giới hạn tần suất
  shared/balance.js      chỉ số, chiêu thức, cảnh giới, vật phẩm
  shared/maps/           bản đồ: lưới ô, công trình, điểm xuất hiện, lối ra
  shared/physics.js      vật lý đi ngang dùng chung cho máy chủ và trình duyệt
  public/                trang game: canvas, giao diện, điều khiển; public/js/scenery.js vẽ bản đồ; public/maps/tiles/ tileset
  test/race.mjs          kiểm tra tranh chấp, tường và lối ra
```

Hình ảnh nhân vật, rồng, khôi thi và mọi hiệu ứng đến từ `../src` (pixelfx): máy chủ phục vụ thư mục đó ở đường dẫn
`/pixelfx`, nên phải giữ nguyên game trong repo này.

## Mở rộng

Thế giới chạy trong bộ nhớ của một tiến trình Node, nên hãy chạy **một** tiến trình (pm2 `instances: 1`). Một tiến trình chịu
được vài trăm người cùng lúc. Muốn lớn hơn nữa thì cần tách thành nhiều "kênh", mỗi kênh một tiến trình. Các ràng buộc trong
database vẫn giữ an toàn kể cả khi có nhiều tiến trình.
