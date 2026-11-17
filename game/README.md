# Đa Vũ Trụ Tu Tiên

Game web nhiều người chơi, nơi tu sĩ từ khắp các vũ trụ gặp nhau. Phần chữ trong game bằng
tiếng Việt, đồ họa pixel lấy từ thư viện pixelfx nằm ngay trong repo này. Chơi được trên máy tính lẫn điện thoại.

- **Máy chủ:** Node.js + Express, WebSocket (`ws`) cho thế giới chung, MariaDB lưu dữ liệu, mặc định chạy ở cổng **5886**. Trang admin ở cổng riêng **5885** (xem phần "Trang admin").
- **Vũ khí:** nhân vật cầm vũ khí trên tay; vũ khí vung theo đòn chém, và Phi Kiếm bay ra đúng vũ khí đang cầm. Có 90 món
  của Xianxia Pixel Pack (5 miễn phí, còn lại bán ở Y Các), nam nữ dùng chung.
- **Bảo vật (vũ khí đặc biệt):** 8 vũ khí lấy từ pixelfx (Phá Quân Kiếm, Trảm Long Đại Kiếm, Ảnh Sát Chủy, Bá Vương Thương,
  Lôi Thần Chùy, U Minh Liêm, Huyết Lang Trảo, Lạc Nhật Cung). Bảo vật không bán và không miễn phí. Chưa được tặng thì
  không hiện ở Y Các, mua hay mặc đều bị từ chối. Hiện tại admin tặng riêng cho từng người ở trang người chơi; sau này sẽ
  có từ hoạt động, sự kiện hay đấu giá. Cột `cosmetics.special` đánh dấu bảo vật, nên admin có thể biến món khác thành
  bảo vật. Vẽ lại các vũ khí này bằng `node tools/xianxia/pixelfx-weapons.mjs`, rồi thêm vào atlas bằng
  `python3 tools/xianxia/build.py --pixelfx-only`.
- **Tạo nhân vật:** chọn giới tính, nhập đạo hiệu, chọn 1 trong 5 kiểu tóc và 1 trong 5 bộ y phục khởi đầu (giản dị nhất của
  mỗi giới), xem trước nhân vật cử động: đứng, đi, nhảy, xuất chiêu.
- **Y Các (nút 👘 trong game):** bán 35 kiểu tóc và 35 bộ y phục còn lại của mỗi giới, giá 150 / 300 / 500 linh thạch tùy độ cầu
  kỳ. Thử trước rồi mới mua; món đã mua mặc lại lúc nào cũng được, người khác thấy ngay.
  - Mọi nhân vật dựng từ cùng một thân gốc, nên tóc và áo nào cũng mặc vừa.
  - Có rig và hoạt ảnh: thân trên thở và nhún, tay áo xoay quanh vai, vạt áo và tóc bay theo bước chạy, hai chân bước.
- **Chiêu thức chung cho mọi người:** Kiếm Khí Trảm (cận chiến), Phi Kiếm (phóng kiếm), Lôi Ấn Trận (sét đánh xuống một
  vùng, làm chậm). Thắng thua nhờ cách chơi, không nhờ chọn phái.
- **Góc nhìn đi ngang** (side-scroller), khớp với cách pixelfx vẽ nhân vật và hiệu ứng: đi trái/phải, nhảy, đứng trên đài
  mây, rơi theo trọng lực.
- **Bản đồ hiện có: Tân Thủ Thôn,** thôn khởi đầu dài 128 ô (mỗi ô 32 px). Đi từ tây sang đông:
  - Vách núi có thác đổ xuống hồ, cầu gỗ bắc qua hồ.
  - Phố nhà mái cong.
  - Điện thờ trên sân đá cao 2 ô; trước điện là Thái Cực Đài, phía trên có đài mây lơ lửng.
  - Cổng chào, suối có cầu.
  - Vườn đào tiên: điểm xuất hiện, có bia Truyền Tống, cây đào tiên, hòn non bộ, khóm lan và linh chi.
  - Đồi có bảo tháp.
  - Bậc thang đá đi xuống lối ra.
- **Thôn an toàn, không có yêu thú.** Dưới gốc đào tiên (gần điểm xuất hiện) có 2 bù nhìn rơm để thử sát thương: không đánh trả, tự hồi
  máu khi để yên, bị hạ thì 5 giây sau dựng lại; chỉ thưởng 2 tu vi, không có linh thạch, để không ai cày được.
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

5. Mở cổng tường lửa nếu có: `sudo ufw allow 5886/tcp`. Cổng admin 5885 chỉ nên mở cho IP của bạn: `sudo ufw allow from IP-CUA-BAN to any port 5885 proto tcp` (xem phần "Trang admin").

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
- Điều khiển: kéo ngón tay sang trái/phải ở nửa trái màn hình để đi (joystick chỉ trái/phải); nút Nhảy để nhảy, giữ nút Nhảy rồi vuốt xuống để rơi xuyên ván gỗ và đài mây.
  Bên phải có nút Nhảy, các nút chiêu và đan dược. Trên điện thoại, chiêu tự nhắm kẻ địch gần nhất.

- **Cụm nút kiểu MOBA** ở góc phải dưới, trong tầm ngón cái phải:
  - Nút to ở góc: Kiếm Khí Trảm (J).
  - Vòng trong: Phi Kiếm (K) bên trái, Lôi Ấn Trận (L) chéo trên, Nhảy ngay phía trên.
  - Vòng ngoài: 2 nút đan dược nhỏ.
  - Icon chiêu lấy từ hiệu ứng của Xianxia Pixel Pack (CC0): trăng khuyết, vòng phi kiếm, sét thiên kiếp, hạc bay.
  - Khung tròn của các nút (vàng gắn ngọc bích cho nút đánh, vàng gắn lam/tím ngọc cho 2 chiêu, bạc cho nhảy, ngọc bích cho đan dược) là pixel art vẽ theo phong cách của pack bằng `tools/xianxia/rings.py`.
  - Hai nút đan dược là nút phụ: nhỏ, xếp ngang hàng ở dưới, bên trái cụm chiêu.
- Màn tạo nhân vật luôn vừa một màn hình, không có thanh cuộn: trên điện thoại cầm ngang dùng bố cục gọn, cầm dọc thì trang tự xoay ngang như trong game, và nếu màn quá nhỏ thì cả khung được thu lại cho vừa.
  - Màn hình thấp (điện thoại ngang) thì cả cụm thu nhỏ đều lại, không đè lên nhau.

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

Mọi con số nằm trong database (xem phần "Số liệu game" bên dưới). `shared/balance.js` chỉ giữ bộ số khởi đầu và cách tính, máy chủ và trình duyệt dùng chung.

- **Mọi người cùng chỉ số và chiêu thức:** ngoại hình không ảnh hưởng sức mạnh. Ở cùng cảnh giới, hạ một đối thủ (khi trúng
  hết đòn) mất khoảng 10–15 giây.
  - Cận chiến gây sát thương mỗi giây cao hơn vì phải áp sát.
  - Phi Kiếm có lợi thế tầm.
  - Lôi Ấn Trận làm chậm để đuổi hoặc thoát.
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
  - `pine`: cây tùng (`{ v: 0..2 }` chọn 1 trong 3 dáng).
  - `bamboo`: khóm trúc.
  - `taiji`: Thái Cực Đài.
  - `well`: giếng.
  - `xx`: một món cảnh của Xianxia Pixel Pack (`{"n": tên ảnh trong public/xianxia/bg/, "s": thu nhỏ 1/s}`), đứng trên mặt đất.
  - `stall`: sạp hàng chợ (không còn dùng ở Tân Thủ Thôn).
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
- **Xianxia Pixel Pack v2.1** (giấy phép **CC0**), chép phần dùng tới vào `public/xianxia/` bằng `tools/xianxia/build.py`:
  - **Địa hình:** đá xanh (sân điện, bậc thang, tường) và mây (đài mây). Tile 32 px, khớp đúng ô bản đồ. Mặt đất vẽ bằng code
    với tông màu trầm (cỏ rêu, đất nâu sẫm tối dần theo độ sâu) để hợp với đá xanh và mây.
  - **Công trình:** cung điện vàng trên sân điện, bảo tháp 7 tầng trên đồi.
  - **Phía xa:** cung điện, cổng trời, tháp trắng và đảo bay trên mây.
  - **Vũ khí:** 90 món (kiếm, đao, thương, kích, phất trần, thiền trượng, pháp bảo…), thu nhỏ còn 45% cho vừa nhân vật.
  - **Giao diện:** khung mực có góc mây vàng, nút lụa đỏ và ngọc bích, thanh sinh lực và tu vi, icon vật phẩm và trạng thái, con
    trỏ hình kiếm.
- **Cây hoa cao, biển chỉ đường:** *old frogatto tile art* (OpenGameArt), giấy phép **CC0**.
- **Mái ngói cong:** *Oriental Roof Tiles* (OpenGameArt), giấy phép **CC0**. Mình cắt thành đầu mái và đoạn giữa lặp lại, phối 4
  màu (xám, lam, đỏ gạch, ngọc).
- **Núi sương và rừng thông phía xa:** *Asian Mountain Forest BG* của **Crisisworks** (OpenGameArt), giấy phép **CC-BY 4.0**.
  Mình phối lại sang tông lam ngọc, phần trời để trong suốt.
- **Cây tùng lớn:** *Asian Mountain Trees* của **Crisisworks** (OpenGameArt), giấy phép **CC-BY 4.0**. Đã thu nhỏ một nửa nhưng
  vẫn cao khoảng 4 lần nhân vật.
- **Nơi lấy:** ngói và đất lấy qua kho CC0 https://github.com/Tiddybub/2d-assets. Núi và cây tùng tải thẳng từ OpenGameArt.
- **Lưu ý giấy phép CC-BY:** dùng tự do kể cả thương mại, nhưng **phải ghi tên tác giả**. Giữ nguyên phần ghi công này và file
  `public/maps/tiles/CREDITS.md`; nếu game có màn hình giới thiệu (credits), nên ghi thêm "Crisisworks (OpenGameArt)".
- **Ghi công đầy đủ:** `public/maps/tiles/CREDITS.md`.
- **Vẽ bằng code** trong `public/js/scenery.js`: nhà, cổng chào, đèn đá, cây anh đào, trúc, cầu, nước, thác, bầu trời.

## Cấu trúc

```text
game/
  server/index.js        Express, file tĩnh, WebSocket, tắt máy an toàn
  server/api.js          REST: đăng ký, đăng nhập, nhân vật, Đan Các, quà ngày, bảng xếp hạng
  server/world.js        thế giới chung: di chuyển (va chạm theo bản đồ), chiêu thức, lối ra, phần thưởng, 20 lần/giây
  server/store.js        mọi thay đổi dữ liệu nhân vật (cả mua và mặc đồ ở Y Các), an toàn khi tranh chấp
  server/db.js           MariaDB: pool, transaction, tạo bảng
  server/auth.js         mật khẩu, phiên đăng nhập, giới hạn tần suất
  shared/balance.js      chỉ số, chiêu thức, cảnh giới, vật phẩm
  shared/maps/           bản đồ: lưới ô, công trình, điểm xuất hiện, lối ra
  shared/physics.js      vật lý đi ngang dùng chung cho máy chủ và trình duyệt
  public/                trang game: canvas, giao diện, điều khiển; public/js/scenery.js vẽ bản đồ; public/maps/tiles/ tileset
  public/js/avatar.js    rig và hoạt ảnh nhân vật (thân gốc + tóc + y phục)
  public/avatar/         atlas thân gốc, 80 kiểu tóc, 80 bộ y phục (tạo bằng tools/avatar/build.py)
  tools/avatar/          ảnh gốc của họa sĩ và script cắt, thu nhỏ, canh tóc và áo vào thân
  tools/cosmetics.mjs    công cụ admin cho tóc và y phục (giá, tên, bán, tặng, thêm mới)
  tools/admin.mjs        công cụ admin dòng lệnh cho cảnh giới, đan dược, yêu thú, chiêu thức, cài đặt
  server/admin.js        máy chủ trang admin (cổng 5885): tài khoản admin, API, nhật ký
  admin/                 giao diện trang admin (HTML, CSS, JS)
  server/gameconfig.js   đọc số liệu game từ database, kiểm tra, tự cập nhật khi admin sửa
  server/cosmetics-seed.js  danh sách tóc và y phục ban đầu, nạp vào bảng cosmetics lần đầu chạy
  test/race.mjs          kiểm tra tranh chấp, tường và lối ra
```

Hình nhân vật nằm ở `public/avatar/`. Bù nhìn và mọi hiệu ứng đến từ `../src` (pixelfx): máy chủ phục vụ thư mục đó ở đường dẫn
`/pixelfx`, nên phải giữ nguyên game trong repo này.

## Trang admin (cổng 5885)

Mở `http://IP-VPS:5885`. Trang admin chạy cùng tiến trình với game nhưng trên một cổng riêng, nên chặn hoặc mở cổng này riêng được.

**Đăng nhập lần đầu:**
- Tài khoản `admin`, mật khẩu `admin123456`. Máy chủ tự tạo tài khoản này trong database khi chưa có admin nào.
- Ngay sau khi đăng nhập, trang bắt đổi mật khẩu mới (8-72 ký tự). Chưa đổi thì không dùng được gì khác.
- Muốn đổi lại sau này: nút "Đổi mật khẩu" ở góc trên.

**Các tab:**

| Tab | Làm được gì |
| --- | --- |
| Tổng quan | Người đang online, số tài khoản, đăng ký và nhận quà hôm nay, linh thạch đang lưu hành và đã tiêu, top tu vi, thao tác admin gần đây |
| Người chơi | Tìm theo tên; lọc người đang online hoặc bị khóa. Xem chi tiết từng người (bảng bên dưới) |
| Cảnh giới | Thêm, đổi tên, số tầng, đổi thứ tự (↑ ↓), xóa; hiện khoảng cấp của từng cảnh giới |
| Đan dược | Thêm, sửa giá, công dụng (hồi máu, tu vi), thời gian hồi, mô tả, bật/tắt bán, xóa |
| Yêu thú | Mọi chỉ số và phần thưởng của bù nhìn và âm hồn |
| Chiêu thức | Tên, loại, thời gian hồi, sát thương và thông số riêng của 3 chiêu |
| Cài đặt | 25 con số còn lại, chia nhóm, mỗi số có giải thích |
| Tóc & Y phục | Lọc theo loại, giới, trạng thái; ảnh xem trước; sửa tên, giá, miễn phí, đang bán; thêm món ở ô atlas còn trống; xóa |
| Admin | Thêm admin (người mới phải đổi mật khẩu lần đầu), xóa admin, đổi mật khẩu của mình |
| Nhật ký | Mọi thao tác của admin: ai, làm gì, lúc nào, giá trị trước và sau |

Trên điện thoại cầm dọc, các tab thành một hàng kéo ngang và mỗi món hiện thành một thẻ.

**Chi tiết một người chơi:**

| Phần | Làm được gì |
| --- | --- |
| Trực tiếp (khi đang online) | Bản đồ, vị trí, sinh lực, công/thủ/tốc đang có (đã tính buff), phần tiến trình chưa lưu và đang ghi; tự làm mới 4 giây một lần. Nút: hồi đầy máu, hồi sinh ngay, về điểm xuất hiện, làm mới hồi chiêu, mời ra khỏi game |
| Tài nguyên & chỉ số | Linh thạch, tu vi, điểm đấu trường, hạ, bại: mỗi thứ riêng một hàng, nút **Cộng / Trừ / Đặt**; trừ không bao giờ xuống dưới 0. Đặt thẳng cảnh giới (tu vi về đầu cấp đó). Làm mới lượt tu luyện hôm nay |
| Buff riêng | Tăng (hoặc giảm) theo % từng chỉ số: sinh lực, công, thủ, tốc độ, tu vi nhận được, linh thạch nhận được, tốc độ tu luyện. Có hạn theo giờ hoặc vĩnh viễn, kèm ghi chú; nhiều buff cùng chỉ số thì cộng dồn; gỡ bất cứ lúc nào. Người chơi thấy buff và thời gian còn lại trên màn hình |
| Túi đồ | Từng loại đan: Cộng / Trừ / Đặt |
| Tên & ngoại hình | Đổi đạo hiệu, giới tính, chọn tóc và áo bằng ảnh; mọi người thấy ngay, không cần vào lại |
| Tóc & y phục đã mua | Xem, tặng thêm, lấy lại |
| Tài khoản | Khóa/mở khóa kèm lý do, đặt lại mật khẩu, xóa tài khoản |
| Lịch sử | Các lần admin đã chỉnh người này, PvP gần đây, mua ở Đan Các |

Buff công/thủ/sinh lực/tốc độ không áp dụng ở bản đồ đấu trường PvP, để đấu trường luôn công bằng. Buff tu vi, linh thạch, tu luyện áp dụng mọi nơi.

**Chống race condition khi người chơi đang online:**
- Mọi thay đổi của admin lên một người chơi đi qua cùng một khóa theo tài khoản với việc game lưu tiến trình, mua đồ, dùng đan, nhận quà ngày. Vì vậy chúng chạy lần lượt, không bao giờ chen nhau.
- Thay đổi được ghi bằng phép cộng nguyên tử trong SQL (`stones = stones + ?`), không phải đọc-sửa-ghi, nên không ghi đè phần người chơi vừa kiếm được.
- Game tách bạch ba phần: con số đã lưu, phần đang ghi xuống database, và phần chưa ghi. Admin sửa đúng lúc game đang lưu thì con số trên màn hình người chơi vẫn đúng, không nhảy lùi.
- Hồi máu, hồi sinh, dịch chuyển, làm mới hồi chiêu chạy ngay trong vòng lặp của game, giữa hai nhịp, nên không có gì chen vào.

**Sửa là có hiệu lực ngay:**
- Số liệu được kiểm tra trước khi lưu. Số sai (cảnh giới 0 tầng, sinh lực âm, ô tóc/áo không có trong atlas…) bị từ chối, kèm lý do.
- Khi lưu, game áp dụng tức thì và người chơi đang online thấy luôn.
- Sửa linh thạch, tu vi hay túi đồ của người đang online: game nhận số mới ngay. Đổi tên, giới tính, tóc hay áo: người đó được mời vào lại game để ai cũng thấy.
- Khóa tài khoản: người chơi bị đẩy ra ngay, không đăng nhập lại được, và thấy lý do bị khóa.

**Bảo mật:**
- Tài khoản và phiên admin tách khỏi tài khoản người chơi. Mật khẩu admin được băm bằng scrypt.
- Phiên admin hết hạn sau 12 giờ; đổi mật khẩu thì các phiên khác của admin đó bị đăng xuất.
- Đăng nhập sai quá 8 lần mỗi phút bị chặn tạm.
- Nên chỉ mở cổng 5885 cho IP của bạn (ufw như ở bước 5).
- Kín nhất: đặt `ADMIN_HOST=127.0.0.1` trong `.env`, rồi vào bằng đường hầm SSH `ssh -L 5885:127.0.0.1:5885 user@IP-VPS` và mở `http://localhost:5885`.
- Nếu đặt sau nginx, hãy dùng HTTPS cho trang admin.

**Quên mật khẩu admin:** chạy `mysql dvtt -e "DELETE FROM admins"` rồi khởi động lại game. Tài khoản `admin` / `admin123456` được tạo lại và phải đổi mật khẩu ở lần đăng nhập đầu.

Các lệnh `npm run admin` và `npm run cosmetics` vẫn dùng được song song với trang web.

## Tóc và y phục: quản lý trong database

Danh sách tóc và y phục nằm trong bảng `cosmetics`. Mỗi dòng là một món:

| Cột | Ý nghĩa |
| --- | --- |
| `kind` | `hair` (tóc) hoặc `robe` (y phục) |
| `gender` | `m` (nam) hoặc `f` (nữ) |
| `idx` | vị trí của món trong atlas `public/avatar/<kind>_<gender>.png`, đếm từng hàng từ 0 |
| `name`, `price` | tên và giá (linh thạch) |
| `starter` | 1 = miễn phí, được chọn lúc tạo nhân vật |
| `on_sale` | 0 = ngừng bán; người đã mua vẫn giữ |

Đồ người chơi đã mua nằm trong bảng `owned_cosmetics`. Khóa chính là (tài khoản, món), nên dù bấm mua dồn dập cũng chỉ bị trừ
tiền một lần.

Lần đầu chạy, máy chủ tự điền 160 món từ `server/cosmetics-seed.js`. Những lần sau, máy chủ không ghi đè: tên, giá hay trạng
thái admin đã sửa đều được giữ. Game đọc bảng trực tiếp ở mỗi lần xem hoặc mua, nên sửa xong là có hiệu lực ngay, không cần
khởi động lại. Tên món được đặt tự động theo màu; đổi tên tùy ý.

Công cụ cho admin (dùng `.env` của máy chủ):

```bash
npm run cosmetics -- list robe f                       # xem y phục nữ: id, giá, số người đã mua
npm run cosmetics -- price 57 800                      # đổi giá
npm run cosmetics -- rename 57 "Phượng Hoàng Y"
npm run cosmetics -- sale 57 off                       # ngừng bán
npm run cosmetics -- starter 57 on                     # cho chọn miễn phí lúc tạo nhân vật
npm run cosmetics -- give tenDangNhap 57               # tặng một món (giải thưởng sự kiện, đền bù)
npm run cosmetics -- add hair f 40 400 "Tuyết Liên Kế" # thêm món mới
```

Hoặc dùng SQL trực tiếp, ví dụ `UPDATE cosmetics SET price = 800 WHERE id = 57;`.

**Thêm kiểu mới:**
1. Vẽ vào sheet trong `tools/avatar/src/`. Có thể nối thêm hàng mới, mỗi hàng 8 món.
2. Chạy `python3 tools/avatar/build.py` (cần Pillow và numpy). Script tự cắt từng món, thu nhỏ về cỡ nhân vật, rồi canh vào thân:
   - Tóc phủ kín da đầu mà không che mắt.
   - Áo có cổ nằm dưới cằm và gấu áo chạm chân.
3. Thêm một dòng vào bảng bằng lệnh `add` ở trên, với `idx` là vị trí mới.

Nhân vật tạo trước bản cập nhật này vẫn giữ tên, tu vi và bộ đang mặc (được ghi là đã sở hữu).

## Số liệu game: cảnh giới, đan dược, yêu thú, chiêu thức, cài đặt

Các bảng trong database:

| Bảng | Nội dung |
| --- | --- |
| `realms` | Cảnh giới theo thứ tự (`sort`), mỗi cảnh giới có `stages` tầng. Tổng số tầng là cấp tối đa. |
| `items` | Đan dược bán ở Đan Các: giá, `heal` (phần sinh lực hồi, 0.4 = 40%), tu vi (`exp_base` + `exp_per_level` × cấp), thời gian hồi, còn bán hay không. |
| `monsters` | Chỉ số yêu thú `dummy` (bù nhìn) và `ghost` (âm hồn): sinh lực, công, thủ, tốc, thưởng, tầm đánh… |
| `skills` | 3 chiêu J/K/L: tên, thời gian hồi, hệ số sát thương, và số riêng của từng loại chiêu (`params`). |
| `settings` | Các con số còn lại, mỗi dòng có ghi chú ý nghĩa: chỉ số gốc nhân vật, đường tu vi, quà mỗi ngày, quà tân thủ, tu luyện, thưởng PvP, thời gian hồi sinh… |

Lần đầu chạy, máy chủ tự tạo bảng và điền số liệu hiện tại. Những lần sau không ghi đè chỉnh sửa của admin.

**Sửa là có hiệu lực ngay, không cần khởi động lại:**
- Máy chủ kiểm tra database khoảng 10 giây một lần.
- Thấy số liệu mới thì áp dụng ngay và báo mọi người chơi đang online. Trình duyệt tự tải số liệu mới: tên cảnh giới, Đan Các, tên chiêu.
- Nếu số liệu sai (sinh lực âm, cảnh giới 0 tầng, chiêu thiếu thông số…), máy chủ giữ nguyên bộ cũ và ghi lỗi vào log. Game không bao giờ sập vì một lần sửa nhầm.

Công cụ cho admin. Lệnh nào cũng kiểm tra trước khi lưu, sai thì không lưu:

```bash
npm run admin -- show realms                          # cảnh giới, kèm khoảng cấp của từng cái
npm run admin -- realm add "Tiên Nhân" 5              # thêm cảnh giới 5 tầng ở cuối
npm run admin -- realm add "Bán Bộ Kim Đan" 2 --after 2   # chèn sau cảnh giới id 2
npm run admin -- realm rename 3 "Kết Đan"
npm run admin -- realm stages 9 9                     # Độ Kiếp có 9 tầng
npm run admin -- realm move 5 --after 7               # đổi thứ tự (--first: lên đầu)
npm run admin -- realm del 10

npm run admin -- show settings                        # mọi cài đặt kèm ý nghĩa
npm run admin -- set daily.stones 50                  # quà mỗi ngày 50 linh thạch
npm run admin -- set exp.base 80                      # lên cấp khó hơn

npm run admin -- item add longhuyet "Long Huyết Đan" 80
npm run admin -- item set longhuyet heal 0.8
npm run admin -- item set longhuyet desc "Hồi 80% sinh lực"
npm run admin -- item set tukhi on_sale 0             # ngừng bán (người đã có vẫn dùng được)

npm run admin -- monster set ghost hp 600
npm run admin -- skill set 1 name "Vạn Kiếm Quy Tông"
npm run admin -- skill set 1 speed 420                # tốc độ bay của Phi Kiếm
```

Dùng SQL trực tiếp cũng được, ví dụ `UPDATE settings SET v = 50 WHERE k = 'daily.stones';`. Máy chủ vẫn kiểm tra và áp dụng như trên.

**Lưu ý:**
- Đan mới hiện ở Đan Các, có nút "Dùng" ngay trong Đan Các. Hai nút dùng nhanh trên màn hình chơi vẫn dành cho Hồi Xuân Đan và Tụ Khí Đan.
- Muốn bỏ một loại đan, hãy tắt bán (`on_sale 0`) thay vì xóa, để người chơi đã mua vẫn dùng được.
- Thêm hoặc bớt cảnh giới sẽ đổi cấp tối đa. Tu vi của người chơi giữ nguyên; cấp và tên cảnh giới tự tính lại theo danh sách mới.
- Loại yêu thú và loại chiêu (`melee`, `bolt`, `zone`) gắn với hình vẽ và cơ chế trong code. Admin đổi được mọi con số và tên, còn thêm loại mới thì cần sửa code.

## Mở rộng

Thế giới chạy trong bộ nhớ của một tiến trình Node, nên hãy chạy **một** tiến trình (pm2 `instances: 1`). Một tiến trình chịu
được vài trăm người cùng lúc. Muốn lớn hơn nữa thì cần tách thành nhiều "kênh", mỗi kênh một tiến trình. Các ràng buộc trong
database vẫn giữ an toàn kể cả khi có nhiều tiến trình.
