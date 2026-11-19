# Đa Vũ Trụ Tu Tiên

Game web nhiều người chơi, nơi tu sĩ từ khắp các vũ trụ gặp nhau. Phần chữ trong game bằng
tiếng Việt, đồ họa pixel lấy từ thư viện pixelfx nằm ngay trong repo này. Chơi được trên máy tính lẫn điện thoại.

- **Máy chủ:** Node.js + Express, WebSocket (`ws`) cho thế giới chung, MariaDB lưu dữ liệu, mặc định chạy ở cổng **5886**. Trang admin ở cổng riêng **5885** (xem phần "Trang admin").
- **Vũ khí:** nhân vật cầm vũ khí trên tay; vũ khí vung theo đòn chém, và Phi Kiếm bay ra đúng vũ khí đang cầm. Ai cũng có
  sẵn Trường Kiếm (miễn phí), nam nữ dùng chung.
- **Y Các chỉ còn đồ miễn phí:** 5 tóc và 5 y phục cho mỗi giới tính, 1 vũ khí (Trường Kiếm), 1 phi kiếm (Thanh Vân Kiếm). Chưa có món nào bán, cũng chưa có bảo vật.
  - Đồ bán và bảo vật sẽ được thiết kế riêng từng món, rồi admin thêm lại ở trang admin.
  - **Bảo vật** là món không bán, chỉ được tặng (admin tặng ở trang người chơi; sau này từ hoạt động, sự kiện, đấu giá). Cột `cosmetics.special` đánh dấu món nào là bảo vật. Bảo vật chưa được tặng thì không hiện ở Y Các; mua hay mặc đều bị từ chối.
  - Ảnh của các món cũ vẫn nằm trong atlas, kể cả 11 vũ khí pixelfx (vẽ lại bằng `node tools/xianxia/pixelfx-weapons.mjs` và `python3 tools/xianxia/build.py --pixelfx-only`). Admin có thể thêm lại món nào đó theo số `idx`.
  - Database cũ được dọn một lần khi máy chủ khởi động (migration `retire_shop_2026_11`, rồi `retire_specials_2026_11`). Người đã mua được hoàn linh thạch. Ai đang mặc món bị xoá thì đổi sang món miễn phí.
- **Tạo nhân vật:** chọn giới tính, nhập đạo hiệu, chọn 1 trong 5 kiểu tóc và 1 trong 5 bộ y phục khởi đầu (giản dị nhất của
  mỗi giới), xem trước nhân vật đang đứng.
- **Y Các (nút 👘 trong game):** các tab tóc, y phục, vũ khí, phi kiếm. Hiện chỉ có đồ miễn phí. Khi admin thêm đồ bán, người chơi
  thử trước rồi mới mua; món đã mua mặc lại lúc nào cũng được, người khác thấy ngay.
  - Mỗi trang 10 món (5 × 2), có nút trang.
  - Thứ tự: món đang mặc trước, rồi món đã có, rồi đồ bán từ rẻ đến đắt.
  - Xem trước nhân vật đang đứng; ở tab phi kiếm thì nhân vật đứng trên thanh kiếm.
  - Cả bảng luôn vừa một màn hình, không có thanh cuộn: máy tính, điện thoại nằm ngang, điện thoại cầm dọc (giao diện tự xoay).
  - Mọi nhân vật dựng từ cùng một thân gốc, nên tóc và áo nào cũng mặc vừa.
  - Có rig và hoạt ảnh: thân trên thở và nhún, tay áo xoay quanh vai, vạt áo và tóc bay theo bước chạy, hai chân bước.
- **Yêu thú:** cả 12 critters của pixelfx đều đã có chỉ số trong database, nhưng chưa đặt lên bản đồ nào; sẽ có khi có
  map mới.
  - Đánh gần, lao tới cắn: Huyết Bức (dơi), Linh Điểu (chim), Ngư Yêu Quần (đàn cá), Âm Hồn, Độc Thiềm (ếch),
    Nhuyễn Yêu (slime), Thanh Xà (rắn).
  - Đánh xa, giữ khoảng cách và bắn; bị áp sát thì lùi: Huyễn Điệp (bướm, cầu huyền quang), Ma Nhãn (tia laser),
    Phi Đầu Lâu (cầu lửa), Thủy Mẫu Tinh (cầu nước), Quỷ Hỏa (u linh hỏa).
  - Con bay thì lơ lửng và bay thẳng tới. Con đi bộ thì chạy trên mặt đất theo trọng lực giống người chơi, gặp tường thì
    nhảy.
  - Thấy người chơi trong tầm phát hiện thì tự đuổi; ra quá xa chỗ của nó thì bỏ.
  - Rơi đồ: mỗi lần hạ, tung "tỉ lệ rơi đồ" của con đó. Trúng thì rơi đúng 1 món trong danh sách admin cài cho con đó,
    chọn theo trọng số. Danh sách có sẵn: tinh thạch cùng hệ, Linh Tủy, Hồi Xuân Đan và bí kíp công pháp cùng hệ.
  - Admin thêm, sửa, xóa yêu thú (hình, kiểu đánh, bay, chỉ số, tầm bắn, đạn, tỉ lệ rơi). Để thử khi chưa có map, ở
    trang người chơi có nút "Thả quái thử": thả một con cạnh người đang online; con đó chết là mất, không hồi sinh.
- **Đánh thường:** Kiếm Khí Trảm, nút to ở góc (J), ai cũng có.
- **Công Pháp (nút 📜):** 215 công pháp, mỗi hiệu ứng có thể làm chiêu của pixelfx là một môn (chỉ bỏ ui, chuyển cảnh và
  vật phẩm nhặt). Có 7 kiểu: cận chiến, phóng xa, vùng phía trước, vùng quanh thân, lướt tới, hồi sinh lực, tăng chỉ số
  tạm thời. Mỗi môn có hệ (Kim, Hỏa, Thủy, Băng, Lôi, Mộc, Thổ, Quang, Ám, Huyền, Phong, Dị Giới, Bạo, Ngự Thú) và bậc 1-3.
  - **Lĩnh ngộ:** tiêu hao bí kíp riêng của môn đó, cộng 3/6/10 tinh thạch của hệ theo bậc, và 1/3 Linh Tủy cho bậc 2/3.
    Có sẵn 213 bí kíp, 14 loại tinh thạch và Linh Tủy.
  - **Rơi đồ:** mọi vật phẩm trên rơi ngẫu nhiên khi hạ yêu thú (tinh thạch 4%, Linh Tủy 1%, bí kíp 0,1-0,6% tùy bậc).
    Bù nhìn rơm không rơi gì. Yêu thú để săn sẽ có sau.
  - **Thanh 5 ô:** gán tối đa 5 môn, đổi lúc nào cũng được. Hồi chiêu đi theo môn, nên đổi ô không làm mới hồi chiêu.
    Phi Kiếm và Lôi Ấn Trận ai cũng biết sẵn và nằm ở 2 ô đầu của nhân vật mới.
  - Icon của mỗi môn vẽ từ chính hiệu ứng pixelfx của nó.
  - Hiệu ứng được phóng to cho khớp nhân vật. pixelfx vẽ cho nhân vật mẫu cao 38 px, nhân vật game cao 63 px, nên hiệu
    ứng trên người hoặc trước mặt to gấp 1,65: khiên, hào quang và vòng bảo vệ bao trọn nhân vật. Hiệu ứng cỡ cảnh vật
    (thiên thạch, bão) phóng 1,2-1,4, đạn bay 1,3. Admin chỉnh riêng từng môn bằng `fx_scale`.
  - Hào quang tăng chỉ số kéo dài đúng bằng thời gian buff. Lửa trại, suối hay thời tiết đứng yên ở chỗ gọi ra, không
    đi theo người.
  - Admin sửa được công pháp, vật phẩm yêu cầu, vật phẩm và tỉ lệ rơi; truyền hoặc lấy lại công pháp của từng người.
  - **Công pháp sự kiện:** ở tab Công pháp, admin đổi "Cách có được" của một môn thành "Chỉ qua hoạt động / sự kiện /
    đấu giá" và ghi "Nhận ở đâu" (vd "Sự kiện Trung Thu"). Môn đó không lĩnh ngộ được kể cả khi đủ vật phẩm. Người chơi
    thấy dấu ★ Sự kiện và dòng "Chỉ nhận được qua ...". Admin phát môn đó cho mọi nhân vật, mọi người đang online, hoặc
    theo danh sách đạo hiệu. Ai có rồi thì giữ nguyên; ai đang online thì dùng được ngay.
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
  - Mũi tên vàng dưới chân bậc thang đá cuối thôn là lối ra, sang Bích Lạc Lâm.
- **Bốn bản đồ luyện cấp nối tiếp về phía đông.** Mỗi map có cổng ở hai đầu; qua cổng là sang map kế, đứng ngay cạnh cổng
  quay về. Thoát game rồi vào lại thì xuất hiện ở map đang đứng.
  - Hiệu ứng dịch chuyển (pixelfx): người chơi tan thành ánh sáng vàng tại cổng (`arcane/blink-out`), màn hình của họ khép
    lại bằng ngôi sao vàng xoay (`transitions/star-iris`) và giữ kín trong lúc tải map mới, rồi mở ra. Ở map bên kia, một
    cột sáng giáng xuống đưa họ tới (`spawn/respawn-beam`). Người xung quanh ở cả hai map đều thấy. Trong 0,9 giây dịch
    chuyển không đi được, không ra chiêu được.

  | Bản đồ | Cảnh | Yêu thú |
  | --- | --- | --- |
  | **Bích Lạc Lâm** (rừng xanh) | Đồi cỏ, hồ sen có cầu ván, rừng tùng và trúc với lối đi trên cành, đồng hoa có đình nghỉ, dốc đá lên cổng chào | Độc Thiềm (ếch) quanh hồ, Thanh Xà (rắn) dưới tán rừng, Linh Điểu (chim) trên các lối đi trên cành, Huyễn Điệp (bướm) ở đồng hoa |
  | **Linh Thủy Đàm** (hồ linh thủy) | Cầu ván nối các đảo, đảo nhỏ có chậu sen và đài phun nước, đảo lớn có đình và tùng, cầu ngọc, đầm lau, thác đổ từ vách núi | Ngư Yêu Quần (đàn cá) vọt trên mặt hồ, Thủy Mẫu Tinh (sứa) lơ lửng trên hồ, Nhuyễn Yêu (slime) trong đầm lau |
  | **U Minh Cổ Mộ** (nghĩa địa cổ, đêm trăng tròn) | Mộ đất, bia đá, mộ nghiêng; quỷ hỏa trên mộ; lăng đá có sư tử đá, cổng trăng, cột rồng đen, tế đàn đầu lâu xanh; rừng cây chết; tháp canh | Âm Hồn giữa mộ, Quỷ Hỏa quanh lăng và rừng, Huyết Bức (dơi) trong rừng chết |
  | **Huyết Diễm Ma Uyên** (vực lửa, huyết nguyệt) | Hang đất đỏ có thạch nhũ, ba dòng nham thạch qua bằng gờ đá, thác nham thạch, trụ lửa, lốc lửa, tế đàn phù văn có hư không cầu, cổng hắc diệu thạch | Phi Đầu Lâu và Ma Nhãn bắn từ xa |

  - Mỗi map có trời, núi xa, màu đất và các hạt bay riêng: lá rơi trong rừng, bào tử trên hồ, hồn quang ở nghĩa địa, tàn
    lửa ở vực.
  - Cảnh vật dùng ảnh của Xianxia Pixel Pack (CC0), cộng hiệu ứng pixelfx chạy liên tục làm cảnh sống: gợn nước, đài
    phun, quỷ hỏa, lửa ám, đầu lâu quanh lửa xanh, lò lửa, trụ lửa, lốc lửa, cổng và vòng phù văn.
  - Chạm vào nham thạch ở Huyết Diễm Ma Uyên bị bỏng mất 20% sinh lực và bị hất về chỗ đất vừa đứng (không ai lội
    dưới đáy dung nham).
  - Cổng cuối Ma Uyên còn phong ấn, cho vùng đất sau này.
- **Nhiều bản đồ cùng chạy:** mỗi map một thế giới riêng (người chơi, yêu thú, đạn), cùng một nhịp 20 lần/giây, nên hồi
  chiêu, buff và thời gian bảo vệ vẫn đúng khi đổi map. Trò chuyện thì mọi map đều thấy.
  - Thêm map: viết file trong `shared/maps/` (dựng lưới bằng `shared/maps/build.js`), khai báo trong
    `shared/maps/index.js`, nối cổng `to` hai chiều.
- **Sắp có:** đấu trường PvP. Mã đã có sẵn, chỉ cần khai báo bản đồ.
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
- Điều khiển: đặt ngón tay ở nửa trái màn hình là hiện cần analog tròn: gạt trái/phải để đi, gạt lên để nhảy (giữ lên thì nhảy liên tục), gạt xuống để rơi xuyên ván gỗ và đài mây.
  Bên phải có các nút chiêu và đan dược. Trên điện thoại, chiêu tự nhắm kẻ địch gần nhất.
- Từ cảnh giới admin đặt (mặc định Trúc Cơ), nút phi kiếm hiện trên 2 nút đan dược. Chạm vào để ngự kiếm; khi bay, cần analog lái theo mọi hướng. Chạm lần nữa để hạ kiếm.

- **Cụm nút kiểu MOBA** ở góc phải dưới, trong tầm ngón cái phải:
  - Nút to ở góc: Kiếm Khí Trảm (J).
  - Vòng trong: Phi Kiếm (K) bên trái, Lôi Ấn Trận (L) chéo trên. Nhảy bằng cách gạt cần analog lên.
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
| F | Ngự kiếm phi hành: lên/xuống phi kiếm (khi bay: W/S hoặc ↑/↓ để lên xuống) |
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
  - Mỗi công pháp chỉ lĩnh ngộ một lần (khoá tài khoản + môn). Mọi vật phẩm yêu cầu bị trừ trong cùng một transaction,
    mỗi món một câu `qty = qty - n WHERE qty >= n`. Thiếu một món thì không món nào bị trừ, và hai lần học cùng lúc không
    tiêu chung một viên tinh thạch.
  - Đồ rơi được cộng thẳng vào túi (`qty = qty + n`), nên không bị mất khi trùng lúc với việc học hay admin sửa túi.
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
  public/nhan-vat/       thân gốc của nhân vật (than-goc.png)
  public/toc-nam/ toc-nu/ y-phuc-nam/ y-phuc-nu/ vu-khi/ phi-kiem/ cong-phap/
                         mỗi món, mỗi công pháp một thư mục (xem "Hình ảnh: mỗi món một thư mục")
  server/assets.js       liệt kê các thư mục hình đó, phục vụ ở /assets.json
  tools/assets/          atlas gốc và split.py cắt atlas thành từng thư mục
  tools/avatar/          ảnh gốc của họa sĩ và script cắt, thu nhỏ, canh tóc và áo vào thân
  tools/cosmetics.mjs    công cụ admin cho tóc và y phục (giá, tên, bán, tặng, thêm mới)
  tools/admin.mjs        công cụ admin dòng lệnh cho cảnh giới, đan dược, yêu thú, chiêu thức, cài đặt
  server/admin.js        máy chủ trang admin (cổng 5885): tài khoản admin, API, nhật ký
  admin/                 giao diện trang admin (HTML, CSS, JS)
  server/gameconfig.js   đọc số liệu game từ database, kiểm tra, tự cập nhật khi admin sửa
  server/cosmetics-seed.js  danh sách tóc và y phục ban đầu, nạp vào bảng cosmetics lần đầu chạy
  test/race.mjs          kiểm tra tranh chấp, tường và lối ra
```

Hình nhân vật nằm trong các thư mục ở `public/` (bên dưới). Bù nhìn và mọi hiệu ứng đến từ `../src` (pixelfx): máy chủ phục vụ thư mục đó ở đường dẫn
`/pixelfx`, nên phải giữ nguyên game trong repo này.

## Hình ảnh: mỗi món một thư mục

Mỗi loại đồ và công pháp có một thư mục trong `game/public/`. Bên trong, mỗi món là một thư mục con tên `<số>-<tênviếtliềnkhôngdấu>`:

| Thư mục | Chứa | Ví dụ |
| --- | --- | --- |
| `toc-nam/`, `toc-nu/` | kiểu tóc nam, nữ | `toc-nam/8-huyenvanphat/` |
| `y-phuc-nam/`, `y-phuc-nu/` | y phục nam, nữ | `y-phuc-nu/21-.../` |
| `vu-khi/` | vũ khí cầm tay | `vu-khi/60-truongkiem/` |
| `phi-kiem/` | phi kiếm để bay | `phi-kiem/0-thanhvankiem/` |
| `cong-phap/` | icon công pháp | `cong-phap/1-phikiem/` |
| `nhan-vat/` | thân gốc của mọi nhân vật | `nhan-vat/than-goc.png` |

**Món đồ** (tóc, áo, vũ khí, phi kiếm) có hai file:

- `hinh.png`: hình của món, nền trong suốt.
- `thong-tin.json`: tên và cách đặt hình.
  - Tóc và áo: `dx`, `dy` là vị trí đặt lên thân gốc (lưới 29 × 63, chân ở giữa đáy).
  - Vũ khí: `gx`, `gy` là chỗ tay cầm. `dai: true` thì cầm dựng đứng khi đứng yên (thương, trượng).
  - Phi kiếm: `by` là hàng điểm ảnh của lưỡi kiếm, nơi chân đứng.

**Số** ở đầu tên thư mục là số database dùng cho món đó (`cosmetics.idx`, `characters.hair`…). Phần tên sau dấu gạch chỉ để dễ đọc.

**Công pháp** có `icon.png` và `thong-tin.json` chứa `key` (mã công pháp). Game tìm icon theo `key`, nên đổi tên hay đánh số lại thư mục không ảnh hưởng.

**Thêm món mới:**

1. Tạo thư mục con mới, đặt số chưa dùng, bỏ `hinh.png` và `thong-tin.json` vào.
2. Máy chủ tự thấy thư mục trong vài giây (`server/assets.js`, phục vụ danh sách ở `/assets.json`), không cần chạy công cụ hay khởi động lại.
3. Vào trang admin, tab Tóc/áo/vũ khí/phi kiếm, thêm món với số đó, đặt giá hoặc đánh dấu miễn phí / bảo vật.

Trình duyệt chỉ tải hình của món khi có người đang mặc hoặc khi mở Y Các, không tải tất cả lúc vào game.

**Công cụ:**

- `python3 tools/assets/split.py`: cắt các atlas cũ trong `tools/assets/atlases/` thành các thư mục trên. Chỉ cần chạy lại sau khi dựng lại atlas bằng `tools/avatar/build.py`, `tools/xianxia/build.py` hoặc `tools/swords/build.py`.
- `node tools/arts/icons.mjs`: vẽ lại icon mọi công pháp vào `public/cong-phap/` từ hiệu ứng pixelfx. Cần máy chủ đang chạy. Công pháp chưa có thư mục thì trình duyệt tự vẽ icon.

## Trang admin (cổng 5885)

Mọi danh sách đều hiện mỗi món một dòng: tên, vài chữ tóm tắt, các nhãn. Áp dụng cho cảnh giới, vật phẩm, công pháp, rơi đồ, yêu thú, đánh thường, cài đặt, tóc/áo/vũ khí/phi kiếm.

- Mỗi trang 10 mục. Bên dưới có nút ‹ 1 2 3 … › và tổng số mục.
  - Trang đang xem được nhớ theo tab và bộ lọc: lưu một món ở trang 4 thì vẫn ở trang 4. Tìm kiếm mới thì quay về trang 1.
- Tab nào cũng có ô tìm kiếm (tìm theo tên, mã, hiệu ứng, ý nghĩa…). Cài đặt lọc được theo nhóm, Yêu thú lọc được theo kiểu đánh. Nhật ký tìm trong các dòng đã tải, nút "Tải thêm" lấy các dòng cũ hơn.
- Danh sách người chơi lấy tối đa 500 người mỗi lần tìm. Muốn ra người cụ thể thì gõ tên.
- Bấm vào dòng thì bảng chỉnh sửa mở trong một modal. Đóng bằng ✕, phím Esc, hoặc bấm ra ngoài. Trên điện thoại modal chiếm cả màn hình.
- Trang một người chơi cũng vậy: phần đầu (đang ở đâu, sinh lực, các nút thao tác trực tiếp) luôn hiện. Các phần còn lại mỗi phần một dòng, có tóm tắt sẵn:
  - Tài nguyên, Buff riêng, Túi đồ, Công pháp, Tên & ngoại hình, Đồ đang có, Tài khoản, Lịch sử.
  - Thêm buff, cộng linh thạch hay tặng đồ thì modal vẫn mở với số liệu mới, để chỉnh tiếp.

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
| Vật phẩm | Đan dược, bí kíp, nguyên liệu: lọc theo loại, tìm; thêm, sửa giá, công dụng, thời gian hồi, mô tả, bật/tắt bán, xóa |
| Công pháp | 215 môn: lọc theo loại, hệ, tìm; sửa tên, hệ, bậc, loại chiêu, hồi chiêu, sát thương, thông số, hiệu ứng pixelfx và chỗ vẽ, bật/tắt; sửa từng vật phẩm yêu cầu và số lượng, thêm, bỏ; thêm môn mới, xóa |
| Rơi đồ | Danh sách rơi của từng yêu thú (hoặc `*` mọi yêu thú): vật phẩm, trọng số (kèm % mỗi lần rơi), số lượng ít nhất và nhiều nhất |
| Yêu thú | Thêm, sửa, xóa yêu thú: hình, kiểu đánh (gần, xa, đứng yên), bay, chỉ số, tầm bắn và đạn, phần thưởng, tỉ lệ rơi đồ; số món trong danh sách rơi |
| Đánh thường | Tên, thời gian hồi, sát thương và tầm của Kiếm Khí Trảm |
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

## Chiêu vùng kéo chọn vị trí

Admin bật hoặc tắt việc kéo chọn vị trí cho **từng chiêu**, ở tab Công pháp của trang admin:

- **"Kéo chọn vị trí":** công tắc bật/tắt. Chỉ dùng được cho chiêu loại vùng; bật cho loại khác thì bị từ chối.
- **"Tầm kéo tối đa":** đơn vị px, tính từ nhân vật.
- Các chiêu đang bật có nhãn 🎯 kèm tầm kéo.
- Bộ lọc "Kéo / không kéo" giúp tìm nhanh chiêu nào đang bật, chiêu vùng nào đang tắt.
- Dữ liệu nằm ở cột `arts.aimable` và `arts.aim_range`. Sửa xong là có hiệu lực ngay trong game.
- Mặc định: bật cho 86 chiêu vùng nổ tại chỗ (`fx_at` = `target`), tầm 280 px. Tắt cho 7 chiêu kiểu thế võ.
- Chiêu đã tắt thì luôn nổ cách nhân vật `dist` px phía trước, như trước đây.

Khi chiêu đang bật:

- **Điện thoại:** giữ nút chiêu rồi kéo theo hướng muốn ném.
  - Kéo 90 px là tới hết tầm.
  - Vòng xanh quanh nhân vật là tầm tối đa. Vòng vàng là chỗ chiêu sẽ nổ, đúng bán kính `r`, có đường chấm nối từ nhân vật tới.
  - Thả tay để tung chiêu.
  - Chạm nhanh, không kéo, thì chiêu tự rơi vào kẻ địch gần nhất trong tầm; không có kẻ địch thì nổ ở chỗ cũ phía trước.
- **Máy tính:** chiêu nổ ở chỗ con trỏ chuột, bị kéo về trong tầm nếu chuột ở quá xa.
- **Server kiểm tra lại mọi thứ:** điểm ở ngoài tầm thì bị kéo vào trong tầm. Điểm ngắm vào trong đất thì được đẩy lên mặt đất. Có mặt đất hay ván gỗ trong vòng 3 ô bên dưới thì chiêu rơi xuống đó, không thì nổ giữa không trung.
  - Màn hình người chơi dùng đúng cách tính này (`zoneLanding` trong `shared/physics.js`), nên vòng vàng hiện đúng chỗ chiêu sẽ nổ.

## Icon công pháp

Icon của mỗi công pháp được vẽ sẵn vào thư mục riêng: `public/cong-phap/<số>-<tên>/icon.png`. Nhờ vậy bảng Công Pháp và thanh chiêu hiện icon ngay, không phải vẽ hơn 200 hiệu ứng trên điện thoại. Muốn đổi icon một môn, chỉ cần thay file `icon.png` trong thư mục của môn đó.

- Icon lấy khoảnh khắc hiệu ứng rực nhất, giữ cả lớp ánh sáng (lửa, tia sáng).
- Tia lửa văng xa bị bỏ khi cắt khung, để hình chính không bị nhỏ.
- Mũi tên và tia dài được xếp chéo cho đầy ô.

Thêm công pháp mới hoặc đổi hiệu ứng của một môn thì chạy lại lệnh dưới khi server đang chạy:

```bash
node tools/arts/icons.mjs
```

Công pháp chưa có thư mục vẫn được vẽ icon ngay trên trình duyệt, nên không thanh nào bị trống.

## Ngự Kiếm Phi Hành

Tới cảnh giới mở khoá, người chơi đứng lên phi kiếm và bay. Khi bay:

- Không còn trọng lực. Cần analog (hoặc W/A/S/D, mũi tên) lái theo mọi hướng, kiếm tăng tốc và giảm tốc mượt.
- Tường và trần vẫn chặn. Ván gỗ và đài mây thì bay xuyên qua. Hạ xuống gần mặt đất thì kiếm dừng lơ lửng cách đất một chút.
- Vẫn ra chiêu được. Tắt bay giữa không trung thì rơi xuống.
- Chết, qua cổng sang map khác, hoặc tụt dưới cảnh giới mở khoá thì tự hạ kiếm.
- Mọi người cùng map thấy phi kiếm dưới chân, kiếm lắc lư nhẹ và để lại vệt linh khí khi bay. Lúc lên và xuống kiếm có hiệu ứng pixelfx.

**Admin chỉnh ở Cài đặt, nhóm "Ngự Kiếm Phi Hành":**

| Thiết lập | Ý nghĩa |
| --- | --- |
| `fly.realm` | Cảnh giới mở khoá, chọn theo tên. Tới tầng 1 của cảnh giới đó là bay được. Có lựa chọn "Khoá" để tạm khoá với mọi người. |
| `fly.speed` | Tốc độ bay bằng tốc độ đi nhân hệ số này. Mặc định 1,35. |
| `fly.arena` | 1 thì được bay trong đấu trường, 0 thì không. Mặc định là 0. |

Khi người chơi vừa đột phá tới cảnh giới đó, game báo đã mở khoá.

**Phi kiếm** là loại `sword` trong bảng `cosmetics` (tab "Tóc, áo, vũ khí & phi kiếm" của admin, chọn "Phi kiếm (bay)"):

- Atlas có 30 thanh, đang dùng 1 thanh. Các thanh được cắt từ ảnh `tools/swords/source.png` bằng `python3 tools/swords/build.py`, ra file `public/xianxia/swords.png` và `.json`.
- **Thanh Vân Kiếm** là kiếm cơ bản (`starter`): ai mở khoá bay cũng có ngay, không phải mua.
- Hiện không bán thanh nào. Phi kiếm bán sẽ thiết kế riêng sau. Khi admin thêm phi kiếm để bán, người chơi chỉ mua được sau khi đã mở khoá bay.
- Hiện cũng không có phi kiếm bảo vật nào. Admin có thể đánh dấu một phi kiếm là bảo vật (`special`) để chỉ tặng, không bán.
- Admin đổi giá, tên, bật/tắt bán, chuyển thành bảo vật cho từng thanh. Trang người chơi đổi được phi kiếm đang dùng và tặng hoặc lấy lại phi kiếm.
- Nhân vật lưu phi kiếm đang dùng ở cột `characters.sword`.

## Tóc và y phục: quản lý trong database

Danh sách tóc và y phục nằm trong bảng `cosmetics`. Mỗi dòng là một món:

| Cột | Ý nghĩa |
| --- | --- |
| `kind` | `hair` (tóc) hoặc `robe` (y phục) |
| `gender` | `m` (nam) hoặc `f` (nữ) |
| `idx` | số của thư mục hình, vd `public/toc-nam/<idx>-<tên>/` (xem "Hình ảnh: mỗi món một thư mục") |
| `name`, `price` | tên và giá (linh thạch) |
| `starter` | 1 = miễn phí, được chọn lúc tạo nhân vật |
| `on_sale` | 0 = ngừng bán; người đã mua vẫn giữ |

Đồ người chơi đã mua nằm trong bảng `owned_cosmetics`. Khóa chính là (tài khoản, món), nên dù bấm mua dồn dập cũng chỉ bị trừ
tiền một lần.

Lần đầu chạy, máy chủ tự điền đồ miễn phí từ `server/cosmetics-seed.js` (hiện chưa có món nào bán và chưa có bảo vật). Những lần sau, máy chủ không ghi đè: tên, giá hay trạng
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
| `items` (tiếp) | Cột `kind`: `pill` (đan dược, dùng được), `book` (bí kíp), `material` (nguyên liệu). |
| `skills` | Đánh thường (J): tên, thời gian hồi, hệ số sát thương, tầm (`params`). |
| `arts` | Công pháp: `source` (`learn`: lĩnh ngộ bằng vật phẩm; `event`: chỉ admin phát, cho hoạt động, sự kiện, đấu giá) và `source_note` (nhận ở đâu); tên, hệ, bậc, loại (`melee`, `bolt`, `zone`, `nova`, `dash`, `heal`, `buff`), hồi chiêu, hệ số, `params` (JSON, theo loại), hiệu ứng pixelfx (`fx`) và chỗ vẽ (`fx_at`: `front`, `self`, `target`, `bolt`), `starter` (ai cũng biết), `enabled`. Danh sách đầu nằm ở `shared/arts-seed.js`. |
| `art_reqs` | Mỗi dòng là một vật phẩm (và số lượng) cần để lĩnh ngộ một công pháp. |
| `monster_drops` | Rơi đồ: `monster` (hoặc `*` cho mọi yêu thú có `common_drops`), vật phẩm, `chance` (trọng số: mỗi lần rơi chọn 1 món theo tỉ lệ `chance` / tổng), `min_qty`, `max_qty`. |
| `monsters` (tiếp) | `fx` (hình pixelfx, vd `critters/bat`), `style` (`melee`, `ranged`, `none`), `fly`, `shot_range`, `shot_speed`, `shot_fx` (đạn của con đánh xa), `drop_rate` (tỉ lệ một lần hạ có rơi đồ). |
| `learned_arts`, `characters.art_slots` | Công pháp người chơi đã lĩnh ngộ, và 5 ô trên thanh (JSON). |
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
