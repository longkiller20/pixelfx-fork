# Đa Vũ Trụ Tu Tiên

Game web nhiều người chơi, nơi tu sĩ từ khắp các vũ trụ gặp nhau. Phần chữ trong game bằng
tiếng Việt, đồ họa pixel lấy từ thư viện pixelfx nằm ngay trong repo này. Chơi được trên máy tính lẫn điện thoại.

- **Máy chủ:** Node.js + Express, WebSocket (`ws`) cho thế giới chung, MariaDB lưu dữ liệu, mặc định chạy ở cổng **5886**. Trang admin ở cổng riêng **5885** (xem phần "Trang admin").
- **Vũ khí:** nhân vật cầm vũ khí trên tay; vũ khí vung theo đòn chém, và Phi Kiếm bay ra đúng vũ khí đang cầm. Ai cũng có
  sẵn Trường Kiếm (miễn phí), nam nữ dùng chung.
- **Y Các chỉ còn đồ miễn phí:** 5 tóc và 5 y phục cho mỗi giới tính, 1 vũ khí (Trường Kiếm), 1 phi kiếm (Thanh Vân Kiếm). Chưa có món nào bán, cũng chưa có bảo vật.
  - Đồ bán và bảo vật sẽ được thiết kế riêng từng món, rồi admin thêm lại ở trang admin.
  - **Bảo vật** là món không bán, chỉ được tặng (admin tặng ở trang người chơi; sau này từ hoạt động, sự kiện, đấu giá). Cột `cosmetics.special` đánh dấu món nào là bảo vật. Bảo vật chưa được tặng thì không hiện ở Y Các; mua hay mặc đều bị từ chối.
  - Hình của các món cũ đã bỏ hẳn. Game chỉ còn hình của đồ miễn phí, mỗi món một thư mục (xem "Hình ảnh: mỗi món một thư mục").
  - Database cũ được dọn một lần khi máy chủ khởi động (migration `retire_shop_2026_11`, rồi `retire_specials_2026_11`). Người đã mua được hoàn linh thạch. Ai đang mặc món bị xoá thì đổi sang món miễn phí.
- **Tạo nhân vật:** chọn giới tính, nhập đạo hiệu, chọn 1 trong 5 kiểu tóc và 1 trong 5 bộ y phục khởi đầu (giản dị nhất của
  mỗi giới), xem trước nhân vật đang đứng.
- **Cài đặt (nút ⚙, cuối thanh menu):**
  - **Nhạc nền:** công tắc bật/tắt, thanh kéo âm lượng 0-100%, tên bài và tên bản đồ đang ở.
    - **Mỗi bản đồ một bài riêng**, phát lặp lại khi còn ở đó; người chơi không đổi bài được. Qua bản đồ khác thì bài cũ nhỏ
      dần, bài mới to dần.
    - | Bản đồ | Bài |
      | --- | --- |
      | Tân Thủ Thôn | Liyan |
      | Bích Lạc Lâm | Asian String Suite |
      | Linh Thủy Đàm | Asian Duet |
      | Huyết Diễm Ma Uyên | Lava Area Theme |
      | U Minh Cổ Mộ | Forgotten Tomb Ambience |
    - Bài của bản đồ ghi ở `music` trong `shared/maps/<bản đồ>.js` (tên thư mục trong `public/nhac-nen/`). Đổi bài cho một bản
      đồ, hay cho bản đồ mới một bài: thêm thư mục nhạc, một dòng trong `public/nhac-nen/danh-sach.json`, rồi sửa `music`.
    - Trình duyệt chỉ cho phát tiếng sau lần chạm hoặc bấm phím đầu tiên, nên nhạc bắt đầu từ lúc đó.
    - Bật/tắt và âm lượng lưu trên thiết bị (localStorage), mở lại game vẫn giữ.
  - **Đăng xuất:** nút đăng xuất chuyển vào đây (bấm 2 lần để chắc chắn), không còn nằm trên thanh menu.
- **Nhân vật (nút 👤, phím C):** bên trái là nhân vật đang đứng trong bộ đồ đang mặc, 4 ô trang bị quanh nhân vật (tóc, y
  phục, vũ khí, phi kiếm), tên, cảnh giới và chỉ số (sinh lực, công, thủ, tốc độ, linh thạch, điểm đấu trường, hạ/bại).
  Bên phải là đồ của người chơi, chia tab **Tất cả**, **Trang bị**, **Vật phẩm**.
  - Đồ hiện thành lưới ô, 20 ô một trang; ô trống giữ hình túi đồ. Món đang mặc có viền vàng và dấu ✓; vật phẩm ghi số lượng.
  - Tab Trang bị có thêm nút lọc: Tóc, Y phục, Vũ khí, Phi kiếm. Bấm một ô trang bị quanh nhân vật thì mở thẳng loại đó.
  - Chọn một món thì thấy tên, loại, mô tả bên dưới, kèm nút: **Trang bị** (đồ đã có), **Dùng** (đan dược), hoặc mở bảng
    Công Pháp (bí kíp, nguyên liệu).
  - **Thay đồ chỉ làm ở đây.** Người khác thấy ngay.
  - Dùng khung, nút và icon của Xianxia Pixel Pack. Vừa một màn hình, không thanh cuộn: trên điện thoại nằm ngang, túi đồ
    thành 2 hàng 10 ô.
- **Y Các (nút 👘 trong game):** chỉ để mua tóc, y phục, vũ khí, phi kiếm. Không thay đồ ở đây nữa: món đã sở hữu sáng lên,
  có dấu ✓, chọn vào thì ghi "Đã sở hữu"; mua xong thì vào bảng Nhân vật để mặc.
  - Mỗi trang 10 món (5 × 2), có nút trang.
  - Thứ tự: đồ đang bán từ rẻ đến đắt, rồi món đã có.
  - Món chưa sở hữu hiện mờ và không ghi giá ở ngoài; chọn món đó thì thấy "Chưa sở hữu" và nút **Mua**.
  - Bấm Mua thì hiện hộp xác nhận: hình món, tên, giá, số linh thạch đang có và còn lại sau khi mua (không đủ thì báo thiếu bao nhiêu
    và nút Mua bị khoá). Bấm Huỷ, phím Esc hay bấm ra ngoài để thôi.
  - Xem trước nhân vật đang đứng mặc thử món đang chọn; ở tab phi kiếm thì nhân vật đứng trên thanh kiếm.
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
    trang người chơi có nút "Thả quái thử": thả một con cạnh người đang online; con đó chỉ đánh người đó, chết là mất,
    không hồi sinh, và biến mất khi người đó rời bản đồ.
- **Đánh thường:** Kiếm Khí Trảm, nút to ở góc (J), ai cũng có.
- **Công Pháp (nút 📜):** 6 công pháp, mỗi môn được thiết kế riêng trong code (xem "Công pháp: mỗi môn một lối đánh").
  Hai môn ai cũng biết sẵn: Phi Kiếm, Lôi Ấn Trận. Bốn môn phải có được: Địa Chấn Cước, Tam Tuyệt Kiếm, Lưu Tinh Hỏa Vũ,
  Diệt Thế Thần Bạo.
  - Mỗi môn có cách đánh, nhịp ra đòn và hình ảnh riêng, không còn dùng chung vài kiểu chiêu với số liệu trong database.
  - Công pháp không bán. Có được bằng hai cách: lĩnh ngộ bằng vật phẩm yêu cầu, hoặc (khi admin tắt học bằng bí kíp) chỉ
    nhận qua hoạt động, sự kiện. Admin bật/tắt môn, chọn một trong hai cách đó, và đổi vật phẩm cần để lĩnh ngộ. Số liệu chiến đấu nằm trong code.
  - **Lĩnh ngộ:** mặc định tiêu hao bí kíp riêng của môn, tinh thạch cùng hệ (6 cho bậc 2, 10 cho bậc 3) và Linh Tủy (1
    hoặc 3). Admin đổi được danh sách này cho từng môn.
  - **Rơi đồ:** tinh thạch 4%, Linh Tủy 1%, bí kíp 0,1-0,3% tùy bậc, khi hạ yêu thú. Bù nhìn rơm không rơi gì.
  - Database cũ: mọi môn khác được bỏ một lần khi máy chủ khởi động, cùng bí kíp (cả trong túi), chỗ rơi, và khỏi người đã
    học, khỏi thanh nút. Hai bảng `arts`, `art_reqs` cũ cũng bỏ; môn nào trước đó đang tắt hay chỉ nhận từ sự kiện thì giữ
    nguyên như vậy.
  - **Thanh 5 ô:** gán tối đa 5 môn, đổi lúc nào cũng được. Hồi chiêu đi theo môn, nên đổi ô không làm mới hồi chiêu.
    Phi Kiếm và Lôi Ấn Trận ai cũng biết sẵn và nằm ở 2 ô đầu của nhân vật mới.
  - Icon của mỗi môn vẽ từ một hiệu ứng của nó (`icon` trong `shared/cong-phap.js`).

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
| Enter | Trò chuyện ở kênh đang chọn; Tab đổi kênh (Thế Giới, Khu Vực, Tông Môn) |
| `/w`, `/k`, `/t` + lời | Nói ở kênh Thế Giới, Khu Vực, Tông Môn |
| `/ta Đạo Hiệu: lời` | Truyền Âm cho một Đạo Hữu |
| T | Tông Môn |
| H | Đạo Hữu và Truyền Âm |

## Bảo mật và chống race condition

Máy chủ là nơi duy nhất quyết định mọi thứ. Client chỉ gửi "đang bấm hướng nào, ra chiêu nào, ngắm đâu". Vị trí, tốc độ, hồi
chiêu, tầm đánh, sát thương, phần thưởng đều do máy chủ tính, nên sửa client không gian lận được.

Với công pháp, mỗi lần client xin ra chiêu, máy chủ (`World.cast` trong `server/world.js`) kiểm tra:

- Ô chiêu phải là số nguyên từ 0 đến 5. Chuỗi, số lẻ, `null` đều bị bỏ qua.
- Môn trong ô phải là môn người chơi đã lĩnh ngộ (hoặc môn mặc định) và đang bật. Kể cả khi ai đó ghi thẳng môn chưa học
  vào thanh chiêu, máy chủ vẫn không cho ra.
- Còn sống, không đang dịch chuyển, không bị khoá vì đang ra chiêu khác, và đã hết hồi chiêu. Bấm 50 lần một lúc vẫn chỉ ra một chiêu.
- Hướng ngắm được chuẩn hoá, độ dốc bị giới hạn. Điểm kéo tới của chiêu vùng bị kéo về trong tầm của môn đó.
- Sát thương tính từ chỉ số của nhân vật trên máy chủ. Ai trúng, trúng lúc nào, bị đẩy bay hay bị giữ chân đều do
  `server/cong-phap.js` quyết định. Client chỉ vẽ hiệu ứng theo sự kiện máy chủ gửi về.
- Mỗi kết nối gửi tối đa khoảng 40 tin mỗi giây. Gửi quá nhiều thì bị ngắt.

Bài test `test/race.mjs` có một phần giả làm client gian lận, gửi tin giả thẳng qua WebSocket: ra môn chưa học, ô không
tồn tại, tự báo trúng đòn hay vị trí, bấm liên tục. Máy chủ không chấp nhận tin nào.

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

## Tông Môn (nút 🏯, phím T)

Người chơi lập hoặc gia nhập tông môn, cùng quyên góp để tông môn lên cấp, nhận phúc lợi chung và đổi đồ ở Bảo Khố.

### Lập và gia nhập

- **Khai lập:** cần đạt cấp `sect.create_level` (mặc định 6, Trúc Cơ tầng 1) và trả `sect.create_cost` linh thạch (mặc
  định 1.000). Chọn tên và 1 trong 16 huy hiệu (icon của Xianxia Pixel Pack). Người lập là Tông Chủ.
- **Tên tông môn:** 2-16 ký tự, chỉ chữ, số, khoảng trắng.
  - Không trùng tên đã có, kể cả khác hoa thường hay dấu ("Thiên Kiếm" và "thien kiem" coi là một).
  - Ký tự ẩn (zero-width, đảo chiều chữ `U+202E`...) bị bỏ đi.
  - Tên dễ nhầm với ban quản trị bị từ chối: "Admin", "Hệ Thống", "Quản Trị", "GM"...
    "GM", "Mod" chỉ bị chặn khi đứng riêng thành một từ, nên "Mộ Dung" vẫn đặt được.
- **Tìm tông môn:** danh sách xếp theo cấp, tìm theo tên. Mỗi tông môn ghi Tông Chủ, số người, cách gia nhập, cấp tối thiểu, thông báo.
- **Ba cách gia nhập** (Tông Chủ, Phó chọn):
  - **Tự do:** vào ngay nếu đủ cấp và còn chỗ.
  - **Xét duyệt đơn:** gửi đơn kèm lời nhắn, từ Trưởng Lão trở lên duyệt. Mỗi người tối đa `sect.apply_max` đơn chờ cùng
    lúc; đơn hết hạn sau `sect.apply_days` ngày. Vào được một tông môn thì mọi đơn khác tự huỷ.
  - **Đóng cửa:** không nhận người.
- **Mỗi người chỉ ở một tông môn.** Rời đi hoặc bị trục xuất thì `sect.rejoin_hours` giờ sau (mặc định 12) mới vào được
  tông môn khác, để không ai nhảy tông lấy thưởng điểm danh.
- **Số thành viên tối đa:** `sect.members_base` + `sect.members_per_level` × (cấp − 1). Mặc định 10 người ở cấp 1, mỗi cấp thêm 3.

### Chức vị và quyền

| Chức | Sửa quy định | Duyệt đơn | Trục xuất, phong chức | Đại trận | Truyền chức, giải tán |
| --- | --- | --- | --- | --- | --- |
| Tông Chủ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Phó Tông Chủ (tối đa `sect.vices`) | ✓ | ✓ | ✓ | ✓ | |
| Trưởng Lão (tối đa `sect.elders`) | | ✓ | ✓ | | |
| Nội Môn Đệ Tử | | | | | |
| Ngoại Môn Đệ Tử | | | | | |

- Chỉ tác động được người **thấp chức hơn mình**, và chỉ phong được **chức thấp hơn mình**. Ví dụ: Trưởng Lão phong được
  Nội Môn, Ngoại Môn, không phong được Trưởng Lão khác và không trục xuất được Phó.
- Ngoại Môn Đệ Tử tự lên Nội Môn khi tổng cống hiến đạt `sect.inner_contrib` (mặc định 300).
- **Tông Chủ** không rời được: phải truyền chức (gõ lại đạo hiệu người nhận để xác nhận) hoặc giải tán (gõ lại tên tông
  môn). Người nhận thành Tông Chủ, Tông Chủ cũ nhận chức cũ của người đó.
- **Giải tán:** mọi người rời tông, ngân khố mất, không ai phải chờ để vào tông môn khác.

### Cống hiến, cấp tông môn, phúc lợi

- **Điểm danh** mỗi ngày một lần (tính theo người, đổi tông cũng không điểm danh lại được): +`sect.checkin_contrib` cống
  hiến cho mình, +`sect.checkin_exp` kinh nghiệm cho tông môn.
- **Quyên góp linh thạch** vào ngân khố: mỗi linh thạch được `sect.contrib_per_stone` cống hiến và 1 kinh nghiệm tông môn.
  Mỗi lần ít nhất `sect.donate_min`; mỗi người mỗi ngày tối đa `sect.donate_daily`.
- **Cấp tông môn:** đủ kinh nghiệm thì tự lên, tối đa `sect.max_level`. Lên cấp L+1 cần tổng
  `sect.exp_base` × (1^1,5 + 2^1,5 + ... + L^1,5) kinh nghiệm. Cấp cao hơn thì nhận thêm người và mở thêm món ở Bảo Khố.
- **Phúc lợi:** mỗi cấp trên 1, mọi thành viên mạnh thêm `sect.bonus_per_level`% sinh lực, công, thủ ngoài thế giới.
  Không tính ở đấu trường, để PvP vẫn công bằng.
- **Hộ Sơn Đại Trận:** Tông Chủ hoặc Phó dùng `sect.array_cost` linh thạch ngân khố để cả tông +`sect.array_atk`% công trong
  `sect.array_minutes` phút (ngoài thế giới). Mở từ tông môn cấp `sect.array_level`. Đại trận đang chạy thì không mở chồng được.
- **Tông Môn Bảo Khố:** đổi điểm cống hiến lấy vật phẩm. Mỗi món mở theo cấp tông môn và có giới hạn số lần đổi mỗi ngày.
  Ban đầu có Hồi Xuân Đan, Tụ Khí Đan và bí kíp các công pháp (bí kíp mở ở cấp cao). Admin sửa ở tab Tông môn.

### Trong game

- Tên tông môn hiện màu vàng trên đầu mỗi thành viên, dạng `〔Tên〕`; Tông Chủ có thêm ★.
- **Kênh trò chuyện riêng:** tab Đàm Đạo trong bảng Tông Môn (dùng được cả trên điện thoại), hoặc gõ `/t lời nhắn` ở ô trò
  chuyện trên máy tính. Chỉ đồng môn đang online thấy.
- Có người vào, rời, được phong chức, tông môn lên cấp, mở đại trận...: người liên quan nhận thông báo và bảng Tông Môn đang
  mở tự tải lại.
- **Thông báo tông môn là một nút chuông** (vẽ bằng SVG) cạnh tên tông môn.
  - Bấm chuông thì mở bảng thông báo đầy đủ, giữ nguyên xuống dòng; người sửa được (Tông Chủ, Phó) có thêm nút "Sửa thông báo".
  - Thông báo mới chưa xem trên máy này thì chuông lắc nhẹ và có chấm đỏ; trình duyệt nhớ đã xem bản nào cho từng tông môn.
  - Chưa có thông báo thì chuông mờ.
- Bảng Tông Môn: bên trái là huy hiệu, tên, chuông thông báo, cấp, thanh kinh nghiệm, ngân khố, phúc lợi, đại trận, chức và cống
  hiến của mình, nút điểm danh, ô quyên góp. Bên phải là các tab Thành viên (ai đang online, đổi chức, trục xuất), Đơn (từ
  Trưởng Lão trở lên), Bảo Khố, Đàm Đạo, Nhật Ký, Quản Lý (quy định, đại trận, truyền chức, giải tán; người thường thấy nút
  Rời tông).
- **Trên điện thoại** (nằm ngang, hoặc cầm dọc khi game tự xoay) bảng chuyển sang bố cục gọn, tính theo chiều cao thật của màn hình:
  - Chữ, nút, ô nhập nhỏ lại.
  - Cột trái luôn hiện đủ, không bị cắt: huy hiệu, chuông thông báo, cấp, kinh nghiệm, ngân khố, phúc lợi, đại trận, chức,
    cống hiến, điểm danh, quyên góp.
  - Cột phải cao đúng phần còn lại của màn hình, chỉ danh sách bên trong cuộn.
  - Màn hẹp (dưới 760px) thì:
    - nút đổi chức và trục xuất xuống dưới tên;
    - điểm danh và quyên góp xếp thành hai hàng;
    - số lớn viết gọn ("28,5 N").
  - Trang Khai lập chia hai cột cho vừa một màn hình.

### Bảo mật Tông Môn

Máy chủ (`server/tong-mon.js`) quyết định mọi thứ; trình duyệt chỉ hỏi. Các nút hiện theo chức, nhưng gửi yêu cầu không đủ
quyền thì vẫn bị từ chối.

- **Mỗi người một tông môn:** bảng `sect_members` lấy người chơi làm khoá chính. Hai yêu cầu gia nhập cùng lúc, dù vào một
  hay nhiều tông môn, chỉ một cái thành công.
- **Mỗi thay đổi một transaction, khoá dòng tông môn trước** (`SELECT ... FOR UPDATE`). Mọi việc trong cùng một tông môn chạy
  lần lượt, nên những cảnh sau đều ra kết quả đúng:
  - hai người duyệt đơn cho chỗ trống cuối cùng;
  - trục xuất trùng lúc người đó tự rời;
  - giải tán trùng lúc có người gia nhập;
  - ba người được phong Phó cùng lúc khi chỉ còn hai chỗ.

  Thứ tự khoá luôn là tông môn, rồi thành viên, rồi dữ liệu của chính người đó, nên hai transaction không khoá chéo nhau.
- **Chức vị đọc lại bên trong khoá.** Chức trình duyệt nghĩ mình có không được tính.
- **Tiền chỉ đổi bằng câu lệnh có điều kiện:**
  - `stones = stones - n WHERE stones >= n` cho linh thạch;
  - `contrib = contrib - n WHERE contrib >= n` cho cống hiến;
  - `treasury = treasury - n WHERE treasury >= n` cho ngân khố.

  Không có gì xuống dưới 0.
- **Việc theo ngày** (điểm danh, tổng quyên góp, số lần đổi mỗi món) nằm ở một dòng cho mỗi người mỗi ngày, và giới hạn được
  kiểm tra ngay trong câu `UPDATE`.
- **Quyên góp và đổi đồ có mã giao dịch** (bảng `sect_requests`): gửi lại cùng một mã thì chỉ tính một lần.
- **Trước khi trừ linh thạch** (khai lập, quyên góp), phần linh thạch kiếm được trong game mà chưa ghi xuống database được
  ghi trước. Nhờ vậy số trên màn hình đúng là số bị trừ.
- **Chữ người chơi nhập** (tên, thông báo, lời nhắn, kênh chat) bị bỏ ký tự điều khiển, ký tự ẩn, ký tự đảo chiều và `< >`,
  có giới hạn độ dài. Trình duyệt hiển thị bằng `textContent`, không bao giờ dùng `innerHTML`.
- **Nhật ký tông môn chỉ lưu loại việc và tên người.** Câu chữ được ghép lúc hiển thị, nên không ai chèn được nội dung vào nhật ký.
- **Mọi mã từ trình duyệt bị kiểm tra:** mã tông môn, người chơi, chức, số lượng phải là số nguyên trong khoảng cho phép; mã
  vật phẩm phải có trong game và trong Bảo Khố.
- **Giới hạn tần suất:** mỗi người tối đa 12 thao tác tông môn mỗi 10 giây (cộng giới hạn ghi chung 30 mỗi 10 giây), 25 lần
  xem mỗi 10 giây. Kênh chat tông môn dùng chung giới hạn 1 tin mỗi giây.
- **Phúc lợi tính trên máy chủ:** cấp tông môn và đại trận lấy từ database rồi cộng vào chỉ số trong `stats()`. Client
  không gửi được gì làm thay đổi chúng.
- **Admin:** mọi thao tác ghi vào `admin_log`.

Bài test `test/race.mjs` có một phần riêng cho Tông Môn, gửi yêu cầu thật qua API, nhiều cái cùng lúc:

- 5 lần khai lập cùng lúc chỉ ra 1 tông môn và chỉ trừ tiền 1 lần.
- Hai người khai lập cùng một tên mới cùng lúc: một người được, người kia không mất tiền.
- Tên trùng kiểu khác hoa thường hay dấu bị từ chối; tên giả ban quản trị bị chặn; ký tự đảo chiều bị bỏ.
- 6 người tranh 2 chỗ cuối: đúng 2 người vào. Một người vào 3 tông môn cùng lúc: chỉ ở 1.
- Ngoại Môn không trục xuất, phong chức hay sửa quy định được; Trưởng Lão không phong Trưởng Lão khác; Phó không phong Phó
  khác; không vượt số Phó tối đa.
- Trục xuất trùng lúc tự rời: chỉ tính một lần, người đó phải chờ mới vào tông khác.
- Cùng một lần quyên góp gửi 6 lần chỉ trừ 1 lần. 6 lần quyên góp mà chỉ đủ tiền cho 3: đúng 3 lần thành công, ngân khố
  khớp từng đồng. Số âm, số lẻ, số quá lớn, thiếu mã giao dịch đều bị từ chối.
- 10 lần điểm danh cùng lúc chỉ được 1. 10 lần đổi đồ mà chỉ đủ cống hiến cho 3: đúng 3 lần.
- Món chưa mở theo cấp tông môn, hoặc mã vật phẩm lạ: bị từ chối.
- Thế giới game nhận đúng tông môn và phúc lợi; kênh chat tông môn chỉ đồng môn nhận.
- Truyền chức cần gõ đúng tên. Giải tán trùng lúc có người gia nhập: không ai còn kẹt trong tông môn đã mất.

### Admin (tab Tông môn)

- **Danh sách tông môn,** tìm theo tên hoặc Tông Chủ. Bấm một dòng để mở modal gồm 3 tab:
  - **Thông tin:** sửa tên, cách gia nhập, cấp, kinh nghiệm, ngân khố, cấp tối thiểu, huy hiệu, thông báo. Có nút tắt đại trận
    và nút giải tán (phải gõ lại tên).
  - **Thành viên:** đổi chức bất kỳ ai, kể cả phong Tông Chủ mới (Tông Chủ cũ thành Phó). Đưa người ra mà họ không phải chờ.
  - **Nhật ký** của tông môn.
- **Tông Môn Bảo Khố:** thêm, sửa giá cống hiến, cấp mở, giới hạn mỗi ngày, bật/tắt từng món. Chỉ thêm được vật phẩm đã có
  trong game.
- **Mọi con số chung** (chi phí, giới hạn người, phần thưởng, đại trận...) nằm ở tab Cài đặt, nhóm Tông Môn (`sect.*`). Sửa
  xong có hiệu lực ngay.

## Gia Viên (nút 🏡)

Mỗi người chơi có một Gia Viên riêng, mở khoá bằng `home.unlock_cost` linh thạch (mặc định 50.000, trả một lần). Bấm
🏡 rồi **Vào Gia Viên** để tới bản đồ riêng của mình. Đây là một bản sao của bản đồ chỉ chủ nhân vào được, người khác không
thấy và không vào được. Khi ra (cổng bên phải, hoặc nút 🚪 Rời), người chơi về đúng chỗ vừa đứng trước khi vào. Đăng xuất
lúc đang ở trong Gia Viên thì lần sau vào game ở chỗ cũ bên ngoài.

Từ trái sang phải, bản đồ có ba khu: **Nhà Ở**, **Nông Trại** và **Vườn Dược**, mỗi khu có biển gỗ ghi tên. Khi đang ở
trong Gia Viên của mình, dưới bảng nhân vật có thêm bốn nút: 🔨 Xây, 🐔 Nông Trại, 🌿 Vườn và 🚪 Rời. Trên điện thoại,
bốn nút này là nút tròn nằm dưới menu.

### Nhà Ở: xây từng ô như game đi ngang

- **Mua vật liệu bằng linh thạch** rồi đặt từng ô 32 px, như Terraria. Mỗi lần mua được 1 đến `home.buy_max` cái. Đặt
  xuống thì trừ 1 trong kho; phá đi thì cái đó về lại kho.
- **Bốn nhóm vật liệu:**

| Nhóm | Gồm | Tác dụng |
| --- | --- | --- |
| Khối | Ván Gỗ, Thùng Gỗ, Gỗ Tròn, Khối Tre, Đá Xám, Đá Cát, Đá Xanh, Đất Nung; Sàn Gỗ, Vân Đài | Khối đặc chắn đường và đứng lên được. Sàn đứng được, nhảy xuyên từ dưới lên, ↓ + nhảy để rơi xuống. |
| Mái | Ngói Xám, Lam, Đỏ, Ngọc (khối đặc); Hiên Ngói 4 màu (sàn có mép vảy cá) | Lợp mái nhà |
| Vách | Vách Giấy, Vách Gỗ, Vách Đá Xanh, Vách Đất Nung | Tường phía sau, tối hơn một chút, không chắn đường |
| Nội thất | Cửa Gỗ, Cửa Sổ Song, Bàn Trà, Ghế Tựa, Giường, Kệ Sách, Bình Hoa, Tranh Thủy Mặc, Đèn Lồng, Lò Luyện Đan, Rương, Thùng Rượu | Trang trí; đèn lồng đung đưa, lò đan cháy và bốc khói |

- **Luật đặt** (máy chủ kiểm tra; trình duyệt dùng cùng luật để hiện ô xanh/đỏ trước khi bấm):
  - Chỉ đặt được trong khu Nhà Ở, và cách nhân vật không quá `home.reach` ô.
  - Khối phải tựa vào mặt đất, khối khác hoặc vách. Vách phải nối với mặt đất, khối hoặc vách khác.
  - Không đặt khối đặc lên chỗ có người đang đứng.
  - Đồ đạc cần chỗ dựa: đồ thường cần sàn bên dưới, cửa sổ và tranh cần vách phía sau, đèn lồng cần khối phía trên.
    Đồ to chiếm nhiều ô: cửa và kệ sách cao 2 ô, giường rộng 2 ô, lò đan cao 2 ô.
  - Không phá được khối đang đỡ đồ đạc: phải dỡ đồ trước.
  - Mỗi Gia Viên có tối đa `home.max_blocks` món đã đặt.
- **Cách xây:** bấm 🔨 Xây để mở thanh vật liệu ở dưới màn hình. Thanh có các tab nhóm, nút ✋ Đặt và ⛏ Phá, mỗi món kèm
  số còn trong kho; bấm vào món đã hết để mua thêm. Ô dưới chuột hiện hình mờ của món định đặt, viền xanh nếu đặt được, đỏ
  nếu không.
  - **Máy tính:** chuột trái đặt (giữ và kéo để đặt liền nhiều ô), chuột phải phá.
  - **Điện thoại:** chạm vào ô để đặt hoặc phá. Khi đang xây, các nút chiêu và khung chat tạm ẩn cho đỡ chật.
- **Khối đặt xuống chắn đường thật:** máy chủ và trình duyệt cùng tính va chạm với các khối đã đặt.

### Nông Trại: nuôi gà, vịt, lợn, bò

| Con | Giá | Cho ăn | Sau | Cho ra |
| --- | --- | --- | --- | --- |
| Gà | 800 | 10 | 30 phút | Trứng Gà |
| Vịt | 1.200 | 12 | 45 phút | Trứng Vịt |
| Lợn | 3.000 | 30 | 2 giờ | Mỡ Lợn |
| Bò | 6.000 | 50 | 3 giờ | Sữa Bò |

- **Vòng nuôi:** cho ăn (tốn linh thạch) → đợi đủ thời gian → thu sản phẩm vào túi đồ → con vật lại đói, cho ăn tiếp.
  Thời gian tính theo đồng hồ máy chủ, nên vẫn chạy khi người chơi offline.
- **Số con tối đa:** `home.max_animals` (mặc định 12). Thả một con đi thì không được trả lại tiền.
- **Trên bản đồ:** vật nuôi tự đi lại trong chuồng (đứng mổ thóc, ủi đất, gặm cỏ, rồi đi vài bước). Trên đầu con có sản
  phẩm hiện 🥚 Thu (hoặc 🥛, 🍖); con đang đói hiện "Đói". Bấm vào con vật để mở bảng Nông Trại.
- **Bảng Nông Trại:** từng con với trạng thái, thanh tiến trình, các nút Cho ăn / Thu / Thả; nút "Thu tất cả" và "Cho ăn
  tất cả" (kèm tổng tiền); mua thêm con mới.

### Vườn Dược: trồng dược thảo

| Cây | Hạt giống | Lớn trong | Thu được |
| --- | --- | --- | --- |
| Linh Thảo | 30 | 20 phút | 2-4 |
| Kim Ngân Hoa | 60 | 40 phút | 2-3 |
| Nhân Sâm | 150 | 2 giờ | 1-2 |
| Linh Chi | 300 | 4 giờ | 1-2 |

- **8 luống.** Gieo thì trả tiền hạt giống. Cây lớn qua 4 giai đoạn: mới gieo, cây non, trưởng thành, chín. Cây chín thì
  lấp lánh: Linh Thảo có đầu lá phát sáng, Nhân Sâm có chùm quả đỏ, Linh Chi toả ánh tím, Kim Ngân Hoa nở hoa vàng.
- **Thu hoạch:** số lượng thu được do máy chủ quyết. Có thể nhổ bỏ cây bất cứ lúc nào nhưng không được trả lại tiền.
- **Trên bản đồ:** dưới mỗi luống ghi tên cây và thời gian còn lại, hoặc "Chín". Bấm vào luống để mở bảng Vườn Dược.

**Sản phẩm** (Trứng Gà, Trứng Vịt, Mỡ Lợn, Sữa Bò, Linh Thảo, Kim Ngân Hoa, Nhân Sâm, Linh Chi) nằm trong túi đồ, loại
"Nguyên liệu", không bán được. Chúng dành cho tính năng luyện đan và chế tác sẽ làm sau.

### Đồ hoạ

- **Vẽ bằng pixelfx** (`../src/fx/farm/`, `../src/fx/home/`, đều qua `tools/check.mjs`):
  - **Bốn con vật:** gà, vịt, lợn, bò. Mỗi con có dáng đứng (mổ, rỉa lông, ủi đất, gặm cỏ, chớp mắt, vẫy đuôi) và dáng đi
    (`walk: 1`).
  - **Bốn cây dược thảo**, mỗi cây 4 giai đoạn (`stage` 0-3).
  - **Đồ nông trại:** luống đất khô/ướt, hàng rào, máng ăn, chuồng gà, đống rơm, biển gỗ.
  - **Nội thất:** cửa, cửa sổ, bàn, ghế, giường, kệ, bình hoa, tranh, vách giấy, vách gỗ, khối tre, sàn gỗ; đèn lồng và lò
    luyện đan có chuyển động.
- **Lấy từ asset có sẵn (CC0):** các khối Ván Gỗ, Thùng Gỗ, Gỗ Tròn, Đá Xám, Đá Cát, Rương, Thùng Rượu (Frogatto), Đá
  Xanh, Đất Nung, Vân Đài và hai loại vách đá (Xianxia Pixel Pack), Ngói và Hiên bốn màu (Oriental Roof Tiles).
  `tools/gia-vien-khoi.py` cắt chúng vào `public/gia-vien/khoi.png`; nguồn ghi ở `public/gia-vien/CREDITS.md`.

### Bảo mật

- **Mỗi thao tác chạy trong một transaction** và khoá dòng Gia Viên của người đó trước (`SELECT ... FOR UPDATE`). Cộng
  thêm khoá theo tài khoản, các thao tác của cùng một người luôn chạy lần lượt.
- **Tiền và kho chỉ đổi bằng câu lệnh có điều kiện:** `stones - n WHERE stones >= n`, `qty - 1 WHERE qty > 0`.
- **Không làm hai lần:**
  - Mở khoá chỉ một lần (khoá chính theo người).
  - Mỗi ô của mỗi lớp chỉ có một món (khoá chính theo ô).
  - Mỗi luống chỉ một cây.
  - Mua vật liệu và mua vật nuôi có mã giao dịch, gửi lại nhiều lần cũng chỉ tính một lần.
- **Xây dựng đi qua WebSocket:**
  - Chỉ chủ Gia Viên, và chỉ khi đang ở trong đó.
  - Kiểm tra tầm với và luật đặt.
  - Các thao tác của một Gia Viên xếp hàng chạy lần lượt.
  - Trừ kho trong database xong thì thế giới game mới đổi.
  - Mỗi người tối đa khoảng 12 thao tác xây mỗi giây.
- **Thời gian là của database** (`NOW()`): khi nào con vật có sản phẩm, khi nào cây chín, máy chủ tự xét; trình duyệt không
  báo thay được.
- **Giới hạn tần suất:** mỗi người tối đa 20 thao tác Gia Viên mỗi 10 giây.

Bài test `test/race.mjs` có phần "Gia Viên":

- **Mở khoá:** không đủ tiền thì không mở được và không mất gì; chưa mở thì không vào được; mở 5 lần cùng lúc chỉ ra 1 và trừ
  tiền 1 lần.
- **Mua vật liệu:** cùng một lần mua gửi 5 lần chỉ trừ 1 lần; số lượng sai hoặc món lạ bị từ chối.
- **Xây dựng:**
  - Ở ngoài Gia Viên thì tin nhắn xây không có tác dụng.
  - Cùng một ô gửi 2 lệnh cùng lúc: chỉ 1 khối, chỉ trừ 1.
  - Bị từ chối khi: ngoài khu Nhà Ở, lơ lửng giữa trời, đè lên người, ngoài tầm với, hết hàng.
  - Giường đặt lên hai khối; phá khối dưới giường bị chặn; dỡ giường rồi phá khối thì cả hai về kho.
  - Lệnh giả mạo không đổi được gì.
- **Nông Trại:** mua 15 con cùng lúc thì chuồng chỉ nhận đúng 12; cho ăn 2 lần cùng lúc chỉ tính 1 lần và chỉ trừ tiền 1 lần;
  chưa đến giờ thì không thu được; thu 2 lần cùng lúc chỉ được 1 lần, mỗi con 1 quả trứng.
- **Vườn Dược:** gieo một luống 5 lần cùng lúc chỉ gieo 1; chưa chín thì không thu được; thu 2 lần cùng lúc chỉ được 1 lần.
- **Ra khỏi Gia Viên:** về lại bản đồ cũ.

### Admin

Tab Cài đặt có nhóm Gia Viên (`home.*`): giá mở khoá, số vật nuôi tối đa, số khối tối đa, tầm với khi xây, số lượng tối
đa mỗi lần mua. Các sản phẩm của Gia Viên nằm trong tab Vật phẩm, sửa tên và mô tả như mọi món khác.

## Trò chuyện, Đạo Hữu và Truyền Âm

### Ba kênh trò chuyện

| Kênh | Ai thấy | Chờ giữa hai lần nói |
| --- | --- | --- |
| **Thế Giới** | mọi người trên mọi bản đồ | `chat.world_cooldown` giây (mặc định 4) |
| **Khu Vực** | người đang ở cùng bản đồ | 1 giây |
| **Tông Môn** | đồng môn, ở bất kỳ đâu | 1 giây |

- **Trên máy tính:** ô trò chuyện có nút chọn kênh bên trái. Bấm vào nút hoặc nhấn Tab khi đang gõ để đổi kênh.
  - Gõ nhanh: `/w`, `/k`, `/t` + lời để nói ở Thế Giới, Khu Vực, Tông Môn.
  - `/ta Đạo Hiệu: lời` để Truyền Âm.
- **Bảng Đàm Đạo (nút 💬, dùng được trên điện thoại):** 4 tab Thế Giới, Khu Vực, Tông Môn, Truyền Âm.
  - Mỗi kênh hiện 40 câu gần nhất (máy chủ giữ trong bộ nhớ), kèm giờ, đạo hiệu và cảnh giới người nói.
  - **Bấm tên người nói** để mở menu nhỏ: Truyền Âm (nếu là Đạo Hữu), Kết Đạo Hữu, hoặc Chặn.
- Mỗi dòng trong khung chat góc màn hình có nhãn kênh màu riêng: Thế Giới xanh dương, Khu Vực xanh lá, Tông Môn vàng, Truyền Âm tím.

### Đạo Hữu (nút 🤝, phím H)

- **Kết giao:** tìm theo đạo hiệu ở tab Tìm, hoặc bấm tên người đó trong kênh chat, rồi gửi lời mời. Người kia nhận lời
  hoặc từ chối ở tab Lời mời; người mời có thể rút lời mời.
  - Hai người mời nhau cùng lúc thì thành Đạo Hữu luôn.
- **Giới hạn:** tối đa `social.friends_max` Đạo Hữu (mặc định 100), `social.requests_max` lời mời đang chờ (mặc định 20).
  Mỗi người nhận tối đa 100 lời mời chờ.
- **Danh sách Đạo Hữu** xếp người đang trực tuyến lên trước. Mỗi người hiện:
  - chấm xanh nếu đang trực tuyến;
  - cảnh giới, bản đồ đang ở và tông môn;
  - câu Truyền Âm gần nhất và số tin chưa đọc.
- **Báo khi Đạo Hữu vào hoặc rời game** (dòng trong khung chat). Khi có lời mời mới hay ai đó nhận lời, người kia nhận
  thông báo ngay.
- **Huỷ kết giao** (bấm 2 lần để chắc chắn): cả hai không còn là Đạo Hữu.
- **Chặn** (tối đa `social.blocks_max` người):
  - Kết giao giữa hai người kết thúc, lời mời hai chiều bị xoá.
  - Người bị chặn không mời và không Truyền Âm được nữa.
  - Lời họ nói ở các kênh không hiện với người chặn.
  - Họ không được báo là bị chặn: lời mời chỉ bị từ chối với câu chung chung.
  - Bỏ chặn ở tab Chặn.

### Truyền Âm

- **Chỉ giữa hai Đạo Hữu**, tối đa 200 ký tự một câu, lưu `pm.keep_days` ngày (mặc định 30) rồi tự xoá.
- **Hai màn riêng trong bảng Đạo Hữu:**
  - **Màn danh sách:** các tab Đạo Hữu, Lời mời, Tìm, Chặn. Mỗi Đạo Hữu một dòng, có mũi tên ›.
  - **Màn Truyền Âm:** bấm một người thì màn chat của riêng người đó chiếm cả bảng. Nút **‹ Đạo Hữu** ở góc trái để quay
    lại danh sách.
- **Đầu màn Truyền Âm:**
  - Avatar (chấm xanh nếu đang trực tuyến), đạo hiệu, "Đang trực tuyến · bản đồ" hoặc "Ngoại tuyến".
  - Một hàng nhãn: cảnh giới, tông môn, kết giao từ ngày nào.
  - Nút **⋯** mở menu Huỷ kết giao và Chặn người này (bấm 2 lần để chắc).
- **Tin nhắn dạng bong bóng:** của mình màu vàng bên phải, của người kia màu tím bên trái.
  - Có vạch ngăn theo ngày.
  - Tin liên tiếp của một người trong vòng 3 phút dính liền thành một cụm; giờ gửi chỉ ghi dưới tin cuối của cụm.
  - Dưới tin cuối của mình mà người kia đã đọc có chữ "Đã xem".
  - Nút "Xem tin cũ hơn" tải thêm 40 tin.
  - Chưa nói gì với nhau thì hiện avatar lớn và lời mời gửi tin đầu tiên.
- **Ô soạn tin:**
  - Bo tròn, có nút gửi tròn hình mũi tên giấy; nút mờ khi ô còn trống. Enter cũng gửi.
  - Đếm ký tự khi gần tới 200.
  - Chữ đang gõ dở được giữ: có tin mới tới, danh sách cập nhật hay quay lại danh sách rồi vào lại thì vẫn còn.
  - Tin vừa gửi ghi "Đang gửi..." cho đến khi máy chủ xác nhận; gửi không được thì đỏ lên.
- **Gửi cho người đang ngoại tuyến** vẫn được: họ thấy khi vào game.
- **Đánh dấu đã đọc:** mở cuộc trò chuyện là các tin đã được đọc. Nút 🤝 có huy hiệu đỏ đếm tin chưa đọc cộng lời mời đang chờ.
- **Trên điện thoại:**
  - Hai màn như trên, cao vừa màn hình, chữ và nút nhỏ lại.
  - Hàng nhãn ở đầu màn Truyền Âm ẩn bớt để dành chỗ cho tin nhắn.

### Bảo mật

- **Máy chủ quyết định ai nói với ai.** Kênh Khu Vực chỉ gửi cho người cùng bản đồ, kênh Tông Môn chỉ cho đồng môn.
  Truyền Âm chỉ đi khi hai người là Đạo Hữu; điều này được kiểm tra hai lần: trong bộ nhớ của thế giới game, rồi trong
  database lúc lưu tin.
- **Mọi câu chat đều được làm sạch:**
  - bỏ ký tự điều khiển, ký tự ẩn, ký tự đảo chiều chữ và `< >`;
  - gộp thành một dòng, có giới hạn độ dài;
  - hiển thị bằng `textContent`.
- **Chống spam:**
  - mỗi kênh 1 câu/giây, Thế Giới chờ lâu hơn;
  - cùng một câu lặp lại trong 10 giây bị bỏ;
  - Truyền Âm tối đa 2 tin/giây; tin bị chặn vì gửi quá nhanh thì người gửi được báo, không mất trong im lặng;
  - mỗi kết nối tối đa khoảng 40 tin/giây;
  - các thao tác Đạo Hữu tối đa 12 lần mỗi 10 giây.
- **Kết giao an toàn khi nhiều yêu cầu đến cùng lúc:**
  - mỗi việc giữa hai người chạy trong một transaction, khoá cả hai tài khoản theo thứ tự id nên không deadlock;
  - mỗi lời mời là một dòng duy nhất cho một cặp và một chiều;
  - kết giao ghi hai dòng (mỗi bên một) cùng lúc, huỷ thì xoá cả hai;
  - giới hạn số Đạo Hữu được đếm bên trong khoá.
- **Lịch sử Truyền Âm chỉ hai người trong cuộc xem được, và chỉ khi còn là Đạo Hữu.**
- **Admin cấm chat** (trang người chơi, mục Trò chuyện): 10 phút đến 30 ngày, có hiệu lực ngay. Bị cấm thì không nói được ở
  kênh nào và không Truyền Âm được. Ghi vào nhật ký admin.

### Kiểm tra

Bài test `test/race.mjs` có phần "chat and Đạo Hữu":

- Hai người mời nhau cùng lúc: thành một cặp Đạo Hữu, không còn lời mời thừa.
- Mời 8 lần cùng lúc chỉ ra 1 lời mời; nhận lời 2 lần cùng lúc chỉ tính 1.
- Thế Giới tới bản đồ khác; Khu Vực chỉ cùng bản đồ; Thế Giới phải chờ hồi; không có tông môn thì kênh Tông Môn không gửi đi đâu.
- Câu chat được làm sạch; người mở kênh nhận được các câu gần nhất.
- Không Truyền Âm được cho người lạ (theo id lẫn theo tên).
- Đạo Hữu nhận được tin đã làm sạch; người thứ ba không đọc được lịch sử; mở là đánh dấu đã đọc; lịch sử tải 40 tin một lần.
- Gửi 10 Truyền Âm dồn dập: tin nào cũng hoặc được gửi, hoặc báo "chậm lại".
- Chặn: kết giao kết thúc, chat và Truyền Âm không lọt qua, mời lại bị từ chối mà không lộ lý do, lịch sử bị đóng.
- Bị admin cấm chat thì không nói được.

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
  - **Vũ khí:** Trường Kiếm (thanh kiếm ai cũng cầm), thu nhỏ còn 45% cho vừa nhân vật.
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
- **Nhạc nền** (trong `public/nhac-nen/`, mỗi bài một thư mục `<số>-<tên>/` có `nhac.mp3` và `thong-tin.json`), tải từ
  OpenGameArt. Bài CC-BY phải ghi tên tác giả (đã ghi ở cuối bảng Cài đặt trong game):
  - *Liyan* và *Asian Duet* của **elerya** (Audibert jd), **CC-BY 3.0**: https://opengameart.org/content/liyan,
    https://opengameart.org/content/asian-duet
  - *Asian String Suite* của **bosslevelvgm**, **CC-BY 3.0**: https://opengameart.org/content/asian-string-suite
  - *Lava Area Theme* của **Wolfgang**, **CC-BY 4.0**: https://opengameart.org/content/lava-area-theme
  - *Forgotten Tomb Ambience* của **kindland**, **CC0**: https://opengameart.org/content/forgoten-tomb-ambience
  - Đã chỉnh âm lượng cho các bài đều nhau và đổi sang mp3 (ghi trong `thong-tin.json` của từng bài).

## Cấu trúc

```text
game/
  server/index.js        Express, file tĩnh, WebSocket, tắt máy an toàn
  server/api.js          REST: đăng ký, đăng nhập, nhân vật, Đan Các, quà ngày, bảng xếp hạng
  server/world.js        thế giới chung: di chuyển (va chạm theo bản đồ), chiêu thức, lối ra, phần thưởng, 20 lần/giây
  server/tong-mon.js     Tông Môn: mọi luật (lập, gia nhập, chức vị, quyên góp, Bảo Khố, đại trận), an toàn khi tranh chấp
  shared/tong-mon.js     chức vị và quyền, huy hiệu, quy tắc đặt tên, cấp tông môn (dùng chung máy chủ và trình duyệt)
  public/js/tong-mon.js  bảng Tông Môn trong game
  server/gia-vien.js     Gia Viên: mở khoá, kho vật liệu, xây, vật nuôi, luống thuốc, an toàn khi tranh chấp
  shared/gia-vien.js     danh mục khối, vật nuôi, cây; bố cục khu đất; luật đặt khối (HomeGrid) dùng chung
  shared/maps/giavien.js bản đồ Gia Viên (mỗi người một bản sao trên máy chủ)
  public/js/gia-vien.js  vẽ Gia Viên (khối, vật nuôi, cây), chế độ xây, bảng Nông Trại, Vườn Dược
  tools/gia-vien-khoi.py cắt các khối xây từ tileset vào public/gia-vien/khoi.png
  server/dao-huu.js      Đạo Hữu (kết giao, lời mời, chặn) và Truyền Âm, an toàn khi tranh chấp
  public/js/dao-huu.js   bảng Đàm Đạo (các kênh chat) và bảng Đạo Hữu (danh sách, lời mời, Truyền Âm)
  server/store.js        mọi thay đổi dữ liệu nhân vật (cả mua và mặc đồ ở Y Các), an toàn khi tranh chấp
  server/db.js           MariaDB: pool, transaction, tạo bảng
  server/auth.js         mật khẩu, phiên đăng nhập, giới hạn tần suất
  shared/balance.js      chỉ số, chiêu thức, cảnh giới, vật phẩm
  shared/maps/           bản đồ: lưới ô, công trình, điểm xuất hiện, lối ra
  shared/physics.js      vật lý đi ngang dùng chung cho máy chủ và trình duyệt
  public/                trang game: canvas, giao diện, điều khiển; public/js/scenery.js vẽ bản đồ; public/maps/tiles/ tileset
  public/js/avatar.js    rig và hoạt ảnh nhân vật (thân gốc + tóc + y phục)
  public/nhan-vat/       thân gốc của nhân vật (than-goc.png)
  public/hieu-ung/       các hiệu ứng game dùng, chép từ pixelfx (tools/hieu-ung.mjs)
  public/toc-nam/ toc-nu/ y-phuc-nam/ y-phuc-nu/ vu-khi/ phi-kiem/ cong-phap/
                         mỗi món, mỗi công pháp một thư mục (xem "Hình ảnh: mỗi món một thư mục")
  server/assets.js       liệt kê các thư mục hình đó, phục vụ ở /assets.json
  tools/cosmetics.mjs    công cụ admin cho tóc và y phục (giá, tên, bán, tặng, thêm mới)
  tools/admin.mjs        công cụ admin dòng lệnh cho cảnh giới, đan dược, yêu thú, chiêu thức, cài đặt
  server/admin.js        máy chủ trang admin (cổng 5885): tài khoản admin, API, nhật ký
  admin/                 giao diện trang admin (HTML, CSS, JS)
  server/gameconfig.js   đọc số liệu game từ database, kiểm tra, tự cập nhật khi admin sửa
  server/cosmetics-seed.js  danh sách tóc và y phục ban đầu, nạp vào bảng cosmetics lần đầu chạy
  test/race.mjs          kiểm tra tranh chấp, tường và lối ra
```

Hình nhân vật nằm trong các thư mục ở `public/` (bên dưới). Hiệu ứng nằm trong `public/hieu-ung/` (xem "Hiệu ứng: chỉ những gì game dùng").

## Hiệu ứng: chỉ những gì game dùng

Game không tải cả thư viện pixelfx (`../src`, hơn 250 hiệu ứng). `tools/hieu-ung.mjs` chép vào `public/hieu-ung/` đúng những
hiệu ứng game dùng (48 cái):
- các hiệu ứng mà công pháp dùng (`fx` và `icon` trong `shared/cong-phap.js`);
- mọi hiệu ứng có tên trong code và dữ liệu game: hình yêu thú và đạn của chúng, cảnh vật trên bản đồ, cổng dịch chuyển,
  lên cấp, cột sáng rơi đồ…;
- những hiệu ứng đã có sẵn trong thư mục (một hiệu ứng admin đã chọn cho môn mới không bị mất).

| Trong `public/hieu-ung/` | Là gì |
| --- | --- |
| `core/` | bộ máy vẽ của pixelfx (khung hình, cọ vẽ, màu…) |
| `fx/<loại>/<tên>.js` | từng hiệu ứng, cùng các file phụ nó cần (`_lib.js`) |
| `fx/index.js` | danh sách hiệu ứng theo mã (`fire/fireball`), do công cụ tạo |
| `danh-sach.json` | cùng danh sách đó, để máy chủ kiểm tra |

Lệnh (chạy trong `game/`, cần thư mục `src/` của pixelfx ở cạnh):
- `node tools/hieu-ung.mjs`: cập nhật thư mục.
- `node tools/hieu-ung.mjs fire/candle shadow/curse`: thêm hiệu ứng này (để dùng cho công pháp hay yêu thú mới).
- `node tools/hieu-ung.mjs --lam-moi`: chỉ giữ những gì game đang dùng, bỏ phần còn lại.

Trang admin chỉ cho đặt hiệu ứng có trong `public/hieu-ung/` (cho hình và đạn của yêu thú). Hiệu ứng chưa có thì
báo lệnh cần chạy để chép nó vào. Vì game đã có bản chép riêng, máy chủ chạy được mà không cần `../src`.

## Hình ảnh: mỗi món một thư mục

Mỗi loại đồ và công pháp có một thư mục trong `game/public/`. Bên trong, mỗi món là một thư mục con tên `<số>-<tênviếtliềnkhôngdấu>`:

| Thư mục | Chứa | Ví dụ |
| --- | --- | --- |
| `toc-nam/`, `toc-nu/` | 5 kiểu tóc nam, 5 kiểu tóc nữ | `toc-nam/8-huyenvanphat/` |
| `y-phuc-nam/`, `y-phuc-nu/` | 5 bộ y phục nam, 5 bộ nữ | `y-phuc-nu/21-xichsay/` |
| `vu-khi/` | vũ khí cầm tay (Trường Kiếm) | `vu-khi/60-truongkiem/` |
| `phi-kiem/` | phi kiếm để bay (Thanh Vân Kiếm) | `phi-kiem/0-thanhvankiem/` |
| `cong-phap/` | icon công pháp (6 môn) | `cong-phap/1-phikiem/` |
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

- `node tools/arts/icons.mjs`: vẽ lại icon mọi công pháp vào `public/cong-phap/` từ hiệu ứng pixelfx. Cần máy chủ đang chạy. Công pháp chưa có thư mục thì trình duyệt tự vẽ icon.

## Trang admin (cổng 5885)

Mọi danh sách đều hiện mỗi món một dòng: tên, vài chữ tóm tắt, các nhãn. Áp dụng cho cảnh giới, vật phẩm, công pháp, rơi đồ, yêu thú, đánh thường, cài đặt, tóc/áo/vũ khí/phi kiếm.

- Mỗi trang 10 mục. Bên dưới có nút ‹ 1 2 3 … › và tổng số mục.
  - Trang đang xem được nhớ theo tab và bộ lọc: lưu một món ở trang 4 thì vẫn ở trang 4. Tìm kiếm mới thì quay về trang 1.
- Tab nào cũng có ô tìm kiếm (tìm theo tên, mã, hiệu ứng, ý nghĩa…). Cài đặt lọc được theo nhóm, Yêu thú lọc được theo kiểu đánh. Nhật ký tìm trong các dòng đã tải, nút "Tải thêm" lấy các dòng cũ hơn.
- Danh sách người chơi lấy tối đa 500 người mỗi lần tìm. Muốn ra người cụ thể thì gõ tên.
- Giao diện: trên máy tính có thanh bên trái (các mục chia nhóm Tổng quát, Nội dung game, Hệ thống, kèm biểu tượng; dưới
  cùng là tài khoản, đổi mật khẩu, thoát). Trên điện thoại và máy tính bảng là thanh trên cùng, các mục thành hàng nút cuộn
  ngang. Mỗi tab có tiêu đề, khung giải thích, thanh lọc/tìm kiếm, danh sách dạng dòng, phân trang.
- Bấm vào dòng thì bảng chỉnh sửa mở trong một modal. Đóng bằng ✕, phím Esc, hoặc bấm ra ngoài.
  - Máy tính: hộp ở giữa màn hình, thanh tiêu đề và nút Lưu/Xóa luôn hiện, các ô nhập cuộn ở giữa, xếp 2 cột.
  - Điện thoại: tấm trượt lên từ đáy (gần cả màn hình), các ô nhập 1 cột, nút Lưu luôn ở dưới tầm ngón tay.
  - Ô có/không là công tắc gạt. Lưu một phần nhỏ bên trong (vd vật phẩm lĩnh ngộ) thì modal vẫn mở lại đúng chỗ.
  - Công pháp: danh sách chỉ có tên, icon và trạng thái. Bấm vào một môn, modal có 2 tab: **Chỉnh sửa** (công tắc,
    vật phẩm lĩnh ngộ, phát cho người chơi) và **Xem trước** (từng hiệu ứng của môn chạy lặp lại). Hiệu ứng chỉ chạy khi mở
    tab Xem trước.
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
| Công pháp | 6 môn thiết kế trong code: xem hiệu ứng; công tắc bật/tắt, học được bằng bí kíp hay chỉ nhận từ sự kiện; sửa vật phẩm cần để lĩnh ngộ; phát cho người chơi |
| Rơi đồ | Danh sách rơi của từng yêu thú (hoặc `*` mọi yêu thú): vật phẩm, trọng số (kèm % mỗi lần rơi), số lượng ít nhất và nhiều nhất |
| Yêu thú | Thêm, sửa, xóa yêu thú: hình, kiểu đánh (gần, xa, đứng yên), bay, chỉ số, tầm bắn và đạn, phần thưởng, tỉ lệ rơi đồ; số món trong danh sách rơi |
| Đánh thường | Tên, thời gian hồi, sát thương và tầm của Kiếm Khí Trảm |
| Cài đặt | 25 con số còn lại, chia nhóm, mỗi số có giải thích |
| Tóc & Y phục | Lọc theo loại, giới, trạng thái; ảnh xem trước; sửa tên, giá, miễn phí, đang bán; thêm món theo số thư mục hình có sẵn; xóa |
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
- Số liệu được kiểm tra trước khi lưu. Số sai (cảnh giới 0 tầng, sinh lực âm, số tóc/áo không có thư mục hình…) bị từ chối, kèm lý do.
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

## Chiêu kéo chọn vị trí

Hai môn đặt được chỗ nổ bằng cách kéo: **Lôi Ấn Trận** (tầm 280 px) và **Lưu Tinh Hỏa Vũ** (tầm 320 px). Môn nào kéo được
và tầm bao xa là một phần thiết kế của môn đó (`aim`, `aimR`, `aimDist` trong `shared/cong-phap.js`), không chỉnh ở admin.

Với hai môn này:

- **Điện thoại:** giữ nút chiêu rồi kéo theo hướng muốn ném.
  - Kéo 90 px là tới hết tầm.
  - Vòng xanh quanh nhân vật là tầm tối đa. Vòng vàng là vùng chiêu sẽ rơi xuống, có đường chấm nối từ nhân vật tới.
  - Thả tay để tung chiêu.
  - Chạm nhanh, không kéo, thì chiêu tự rơi vào kẻ địch gần nhất trong tầm; không có kẻ địch thì nổ ở chỗ cũ phía trước.
- **Máy tính:** chiêu nổ ở chỗ con trỏ chuột, bị kéo về trong tầm nếu chuột ở quá xa.
- **Server kiểm tra lại mọi thứ:** điểm ở ngoài tầm thì bị kéo vào trong tầm. Điểm ngắm vào trong đất thì được đẩy lên mặt đất. Có mặt đất hay ván gỗ trong vòng 3 ô bên dưới thì chiêu rơi xuống đó, không thì nổ giữa không trung.
  - Màn hình người chơi dùng đúng cách tính này (`zoneLanding` trong `shared/physics.js`), nên vòng vàng hiện đúng chỗ chiêu sẽ nổ.

## Công pháp: mỗi môn một lối đánh

Mỗi môn được viết riêng, ở ba chỗ:
- `shared/cong-phap.js`: tên, hệ, bậc, hồi chiêu, mô tả, vật phẩm lĩnh ngộ ban đầu, các hiệu ứng nó dùng.
- `server/cong-phap.js`: cách đánh (máy chủ quyết định trúng ai, lúc nào, mạnh bao nhiêu).
- `public/js/cong-phap.js`: hình ảnh từng giai đoạn và rung màn hình.

| Môn | Hệ, bậc | Lối đánh |
| --- | --- | --- |
| Phi Kiếm | Kim 1, ai cũng biết | Ném vũ khí đang cầm bay thẳng, xuyên tới 3 kẻ địch (mỗi lần xuyên yếu đi), hết tầm hay chạm tường thì bay ngược về tay và chém thêm lần nữa trên đường về. Hồi 2,5s. |
| Lôi Ấn Trận | Lôi 1, ai cũng biết | Kéo chọn chỗ (280 px). Khắc lôi ấn xuống đất, ấn tụ điện rồi giáng 3 đạo sét liên tiếp; đạo cuối làm chậm 2,5s. Hồi 9s. |
| Địa Chấn Cước | Thổ 2 | Dậm chân, chấn lực chạy dọc mặt đất: 5 cột đá nối nhau trồi lên phía trước, mỗi cột cách 46 px, theo độ dốc của đất, gặp tường hay vực thì dừng. Kẻ đứng trên đất bị hất tung và làm chậm; kẻ đang bay không bị gì. Mỗi kẻ trúng một lần. Hồi 10s. |
| Tam Tuyệt Kiếm | Kim 2 | Ba thức liền, mỗi thức tiến một bước: chém, chém chéo đôi (2 nhát), hai tay bổ xuống đất (mạnh nhất, đánh bật lùi). Đứng tấn 1,5s, không di chuyển được. Hồi 7s. |
| Lưu Tinh Hỏa Vũ | Hỏa 3 | Kéo chọn chỗ (320 px). 6 thiên thạch rơi rải rác quanh vùng trong 2 giây, mỗi viên nổ một vùng nhỏ; chỗ rơi còn cháy, đốt thêm 3 lần. Hồi 16s. |
| Diệt Thế Thần Bạo | Bạo 3 | Đứng yên tụ lực 1,6s, hút kẻ địch xung quanh lại gần; rồi đại bạo trước mặt: giữa vụ nổ cực mạnh, ra rìa yếu dần, hất văng và làm chậm. Gục trước khi nổ thì xịt. Hồi 45s. |

Bù nhìn rơm cắm cố định: trúng đòn được nhưng không bị đẩy hay hất đi.

**Admin (tab Công pháp)**, đổi là có hiệu lực ngay (bảng `cong_phap` và `cong_phap_reqs`):
- **Bật / Tắt:** tắt thì không ai dùng, học hay mua được (đang gán trên thanh thì bấm không ra gì).
- **Học được bằng bí kíp / Chỉ nhận từ sự kiện, hoạt động:** tắt học thì môn đó chỉ có khi admin phát.
- **Vật phẩm cần để lĩnh ngộ:** mỗi dòng một vật phẩm và số lượng; sửa, bỏ, thêm. Môn ai cũng biết thì không có. Vật phẩm
  đang được môn nào cần thì không xóa được ở tab Vật phẩm.
- **Phát:** cho mọi nhân vật, mọi người đang online, hoặc theo đạo hiệu.
- Tab Xem trước trong modal của mỗi môn chạy thử các hiệu ứng của nó. Số liệu chiến đấu (sát thương, hồi chiêu, tầm…) không chỉnh ở đây: muốn
  đổi thì sửa code.

**Thêm môn mới** là việc của code: thêm một mục trong `shared/cong-phap.js`, viết cách đánh trong `server/cong-phap.js` và
hình ảnh trong `public/js/cong-phap.js`. Sau đó chạy `node tools/hieu-ung.mjs` (chép hiệu ứng nó dùng) và
`node tools/arts/icons.mjs` (vẽ icon). Máy chủ khởi động lại sẽ tự thêm dòng công tắc, bí kíp và vật phẩm lĩnh ngộ ban đầu của môn đó.

## Icon công pháp

Icon của mỗi công pháp được vẽ sẵn vào thư mục riêng: `public/cong-phap/<số>-<tên>/icon.png`. Nhờ vậy bảng Công Pháp và thanh chiêu hiện icon ngay, không phải vẽ trên điện thoại. Muốn đổi icon một môn, chỉ cần thay file `icon.png` trong thư mục của môn đó.

- Icon lấy khoảnh khắc hiệu ứng rực nhất, giữ cả lớp ánh sáng (lửa, tia sáng).
- Tia lửa văng xa bị bỏ khi cắt khung, để hình chính không bị nhỏ.
- Mũi tên và tia dài được xếp chéo cho đầy ô.

Thêm công pháp mới hoặc đổi `icon` của một môn thì chạy lại lệnh dưới khi server đang chạy:

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

- Hiện có 1 thanh: `public/phi-kiem/0-thanhvankiem/`. Phi kiếm mới là một thư mục mới ở đó (hình nằm ngang, mũi kiếm bên phải; `by` trong `thong-tin.json` là hàng điểm ảnh chân đứng).
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
1. Vẽ món mới cỡ nhân vật (thân gốc `public/nhan-vat/than-goc.png`, lưới 29 × 63, chân ở giữa đáy), nền trong suốt.
2. Tạo thư mục `public/toc-nam/<số>-<tên>/` (hoặc `toc-nu`, `y-phuc-nam`, `y-phuc-nu`) chứa `hinh.png` và `thong-tin.json`:
   - `ten`: tên món.
   - `dx`, `dy`: vị trí góc trên trái của hình trên thân gốc.
   - Tóc phải phủ kín da đầu mà không che mắt. Áo có cổ nằm dưới cằm và gấu áo chạm chân.
3. Thêm một dòng vào bảng bằng lệnh `add` ở trên (hoặc ở trang admin), với `idx` là số của thư mục.

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
| `cong_phap_reqs` | Vật phẩm (và số lượng) cần để lĩnh ngộ từng công pháp, mỗi dòng một món; admin sửa ở tab Công pháp. |
| `cong_phap` | Công tắc của admin cho từng công pháp: `enabled`, `learnable` (học bằng vật phẩm yêu cầu; tắt = chỉ nhận qua hoạt động, sự kiện). Công pháp không bán. Bản thân công pháp nằm trong code (`shared/cong-phap.js`). |
| `monster_drops` | Rơi đồ: `monster` (hoặc `*` cho mọi yêu thú có `common_drops`), vật phẩm, `chance` (trọng số: mỗi lần rơi chọn 1 món theo tỉ lệ `chance` / tổng), `min_qty`, `max_qty`. |
| `monsters` (tiếp) | `fx` (hình, một hiệu ứng trong `public/hieu-ung/`, vd `critters/bat`), `style` (`melee`, `ranged`, `none`), `fly`, `shot_range`, `shot_speed`, `shot_fx` (đạn của con đánh xa), `drop_rate` (tỉ lệ một lần hạ có rơi đồ). |
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
- Loại yêu thú và loại đánh thường (`melee`, `bolt`, `zone`) gắn với hình vẽ và cơ chế trong code. Công pháp thì nằm hẳn trong code. Admin đổi được mọi con số và tên, còn thêm loại mới thì cần sửa code.

## Mở rộng

Thế giới chạy trong bộ nhớ của một tiến trình Node, nên hãy chạy **một** tiến trình (pm2 `instances: 1`). Một tiến trình chịu
được vài trăm người cùng lúc. Muốn lớn hơn nữa thì cần tách thành nhiều "kênh", mỗi kênh một tiến trình. Các ràng buộc trong
database vẫn giữ an toàn kể cả khi có nhiều tiến trình.
