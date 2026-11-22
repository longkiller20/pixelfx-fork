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

## 9. Trợ lý AI và MCP: để AI tạo quái, nhân vật, boss… rồi đưa vào game

Tab **Trợ lý AI** của bảng điều khiển cho AI làm việc với game thay quản trị:

- **Dữ liệu:** thêm yêu thú, vật phẩm, rơi đồ, chỉnh số liệu, đặt quái lên bản đồ.
- **Sự kiện:** gọi boss, tặng quà, thông báo.
- **Hình ảnh:** vẽ bằng thư viện **pixelfx** của repo (theo skill `skills/pixelfx`), hoặc biến **ảnh bạn tải lên** thành
  nhân vật hay boss có rig cử động, rồi đưa vào game.

MCP (Model Context Protocol) là chuẩn chung, nên **AI nào hỗ trợ MCP cũng dùng được**: Hermes Agent, Ekko Studio,
Claude, Codex, Gemini CLI, Cursor, VS Code, OpenCode, LM Studio, Cline… Có hai cách dùng:

| | Trợ lý trên VPS | AI trên máy bạn (hoặc máy khác), qua MCP |
| --- | --- | --- |
| Hợp với | VPS từ 2 GB RAM, 2 nhân | VPS nào cũng được |
| Agent | **Claude Code** hoặc **Hermes Agent** (chọn trong tab) | Bất kỳ ứng dụng nào hỗ trợ MCP |
| Cách dùng | Gõ việc cần làm vào ô "Giao việc cho AI", xem log trực tiếp | Kết nối tới `…/mcp`, rồi trò chuyện như bình thường |
| Cần | Claude Code: khoá Anthropic hoặc token gói Claude. Hermes: khoá của nơi cung cấp model bạn chọn, hoặc máy chủ model riêng | Một token MCP (tạo ở tab Trợ lý AI) |
| Sửa được code game | Có (sửa tệp, chạy công cụ pixelfx) | Qua các tool MCP; agent có quyền sửa tệp thì sửa thêm được nếu chạy trên chính VPS |

### Hermes Agent trên VPS

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research, mã nguồn mở) dùng được model của nhiều nơi:

| Nơi cung cấp | Ví dụ model | Ghi chú |
| --- | --- | --- |
| OpenRouter | `anthropic/claude-sonnet-4.6`, `openai/gpt-5`, `qwen/qwen3-coder` | Một khoá, gần như mọi model |
| Anthropic, OpenAI, Google AI Studio | `claude-sonnet-4-6`, `gpt-5`, `gemini-2.5-pro` | Khoá của từng hãng |
| DeepSeek, xAI, Z.AI, Moonshot, Qwen Cloud, Nous | `deepseek-chat`, `grok-4`, `glm-4.6`, `kimi-k2-turbo-preview`… | |
| Máy chủ riêng tương thích OpenAI | Ollama, vLLM, LM Studio, LiteLLM | Nhập địa chỉ, ví dụ `http://127.0.0.1:11434/v1`; khoá nếu máy chủ cần |

- Model phải biết **gọi công cụ** (tool calling). Model mạnh vẽ pixel art đẹp hơn hẳn.
- Bản cài khoảng 1,5 GB, nằm trong `/var/lib/dvtt-ai/.hermes`, chạy bằng người dùng `dvtt`.
- Mỗi lần chạy, bảng điều khiển viết lại `config.yaml` của Hermes:
  - model và nơi cung cấp;
  - MCP của game, với token để trong biến môi trường chứ không ghi vào tệp;
  - tắt bộ nhớ dài hạn, để việc trước không lẫn sang việc sau.
- Tiến trình nền của Hermes được dừng trước và sau mỗi việc, nên khoá API không nằm lại trong bộ nhớ.
- Công cụ Hermes được dùng: sửa tệp, terminal, MCP của game. Nếu bỏ chọn "Cho sửa tệp" thì chỉ còn MCP.

### Kết nối AI trên máy bạn

Tạo token ở thẻ MCP: bảng điều khiển hiện sẵn đoạn cấu hình cho từng ứng dụng, có nút **Chép**. Ví dụ:

- **Hermes Agent:** mở `~/.hermes/config.yaml`, thêm khối dưới đây, rồi gõ `/reload-mcp` trong Hermes. Hermes chạy qua
  Telegram hay Discord (gateway) cũng dùng được.

  ```yaml
  mcp_servers:
    dvtt:
      url: "https://panel.example.com/mcp"
      headers:
        Authorization: "Bearer dvtt_…"
      timeout: 600
  ```

- **Ekko Studio:** vào MCP, thêm máy chủ, rồi dán JSON `{"mcpServers": {"dvtt": {"url": …, "headers": {"Authorization": "Bearer …"}}}}`.
  Ekko đưa nó vào runtime Hermes. Claude Code hay Codex chạy trong Ekko thì dùng đoạn cấu hình riêng của chúng.
- **Codex CLI:** `~/.codex/config.toml` → `[mcp_servers.dvtt]` với `url` và `http_headers`.
- **Gemini CLI:** `~/.gemini/settings.json` → `httpUrl` và `headers`.
- **Cursor, Cline, Roo Code, LM Studio, Windsurf, VS Code, OpenCode:** mỗi ứng dụng có một đoạn riêng trong tab.
- **claude.ai, Claude Desktop:** dán địa chỉ có token trong đường dẫn (`…/mcp/<token>`). Chỉ dùng cách này qua HTTPS.

Máy chủ hỗ trợ các kiểu kết nối sau:

| Kiểu | Địa chỉ | Dùng cho |
| --- | --- | --- |
| Streamable HTTP | `…/mcp` (token trong header) hoặc `…/mcp/<token>` | Hầu hết ứng dụng mới |
| HTTP+SSE kiểu cũ | `…/mcp/sse` hoặc `…/mcp/<token>/sse` | Ứng dụng chưa hỗ trợ Streamable HTTP (n8n, Dify, Cherry Studio bản cũ…) |
| stdio | `npx -y mcp-remote …` | Ứng dụng chỉ chạy được MCP dạng lệnh |

Đã thử với bộ thư viện MCP chính thức cho Python (bộ mà Hermes dùng) ở cả ba cách nối. Phiên bản giao thức: từ
`2024-11-05` tới `2025-11-25`.

### Bật lên

1. **Bật MCP** (thẻ MCP).
   - Bảng điều khiển tạo cho AI một tài khoản admin game riêng, `ai-mcp`. Mọi thao tác của AI đều nằm trong Nhật ký của
     trang admin dưới tên đó.
   - Nếu muốn AI viết code hiệu ứng pixelfx hoặc biến ảnh thành hình, bật thêm **Cho phép viết code pixelfx**. Code này
     chạy bằng người dùng của game, không phải root.
2. **Trợ lý trên VPS:**
   - chọn **Claude Code** hoặc **Hermes Agent**, rồi bấm **Cài**;
   - nhập khoá (Hermes: chọn thêm nơi cung cấp model và tên model);
   - gõ việc, ví dụ: *"Biến ảnh hoa-yeu.png thành nhân vật nữ Hoa Yêu Tiên Tử, bán 800 linh thạch"*.
3. **AI trên máy bạn:** bấm **Tạo token**. Bảng điều khiển hiện sẵn đoạn cấu hình cho từng ứng dụng (xem phần
   "Kết nối AI trên máy bạn" ở trên). Nên đặt tên miền và bật HTTPS cho bảng điều khiển trước, để token không bị gửi
   qua mạng ở dạng chưa mã hoá.
4. **Ảnh:** thẻ **Ảnh cho AI** nhận PNG nền trong suốt, tối đa 15 MB. Nhắc tên ảnh khi giao việc.

### Các công cụ MCP

Có 35 công cụ, mô tả chi tiết nằm ngay trong MCP.

| Nhóm | Công cụ |
| --- | --- |
| Xem | `game_overview`, `get_schema`, `list_rows`, `list_maps`, `boss_status`, `find_players`, `player_detail`, `admin_log`, `game_logs`, `list_added`, `list_uploads` |
| Số liệu | `create_row`, `update_row`, `delete_row` (yêu thú, vật phẩm, rơi đồ, cảnh giới, cài đặt, Y Các…: được kiểm tra như trang admin, áp dụng ngay) |
| Yêu thú | `create_monster` (hình + số liệu + rơi đồ + đặt lên bản đồ, một lần), `place_monster`, `update_spawn`, `remove_spawn` |
| Vẽ (pixelfx) | `pixelfx_guide`, `search_effects`, `read_effect_source`, `render_effect` (trả về ảnh để AI tự nhìn), `write_effect`, `image_to_figure`, `add_effect_to_game` |
| Đưa vào game | `register_character` (bán trong Y Các), `register_boss`, `unregister`, `restart_game` |
| Sự kiện | `spawn_boss`, `despawn_boss`, `announce`, `give_item`, `adjust_player`, `give_cosmetic` |

### An toàn và hoàn tác

- **Token và quyền chạy:**
  - token MCP chỉ lưu dạng băm, thu hồi được từng cái;
  - sai token 10 lần trong 10 phút thì IP đó bị chặn;
  - trợ lý trên VPS chạy bằng người dùng `dvtt`, không phải root, và mỗi lần chạy có một token MCP riêng;
  - Claude Code chỉ được dùng các công cụ cho phép: sửa tệp, `node`, xem git, MCP của game;
  - Hermes có terminal đầy đủ, nhưng vẫn chạy bằng `dvtt`. Bỏ chọn "Cho sửa tệp" thì Hermes chỉ còn MCP.
- **Hoàn tác thay đổi:**
  - mọi tệp AI đổi đều được commit vào git trên VPS (tác giả `AI (MCP)` hoặc `AI (agent)`). Thẻ **Thay đổi của AI**
    hoàn tác từng cái rồi chạy lại game; cái đã hoàn tác được đánh dấu và không hoàn tác lần hai;
  - AI sửa code game mà sai cú pháp, hoặc game không chạy lại được, thì bảng điều khiển tự hoàn tác và chạy lại bản cũ.
- **Database không có nút hoàn tác:** số liệu AI đổi trong database xem ở Nhật ký trang admin, và có sao lưu mỗi ngày.
- **Cập nhật game giữ thay đổi của AI:** thay đổi trên máy được lưu thành bản vá trong `/var/backups/dvtt`, rồi áp lại
  sau khi tải mã mới. Nếu bản mới sửa đúng chỗ đó thì bản vá nằm lại để áp bằng tay.

### Ảnh thành hình pixel (`tools/from-image.mjs`)

Ảnh PNG nền trong suốt sẽ thành:

- **nhân vật** cao 84 px: tóc, vạt áo, tay, chân cử động;
- **boss** cao 148 px: thở, vồ, gầm, ngã, các đầu rắn hay xúc tu vươn ra cắn;
- **yêu thú**: thở, nhún, chồm.

Công cụ ghi ra:

- `records/<id>/contact*.png`: hình đang chuyển động;
- `records/<id>/parts.png`: bản đồ bộ phận để chỉnh.

AI tự xem các ảnh này rồi sửa cách chia bộ phận bằng `parts` cho tới khi chuyển động đẹp. Quy ước đầy đủ cho từng loại
nằm ở `deploy/mcp/GAME-ART.md`.

Chạy tay:

```bash
cd /opt/pixelfx-fork
sudo -u dvtt node tools/from-image.mjs anh.png --kind nhanvat --id nhanvat/hoa-yeu --name "Hoa Yêu Tiên Tử"
sudo -u dvtt node game/tools/them.mjs skin add nhanvat/hoa-yeu --name "Hoa Yêu Tiên Tử" --g f --price 800
sudo systemctl restart dvtt
```

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
  tasks/update.sh          cập nhật từ git (giữ thay đổi của AI)
  tasks/agent.sh           cài trợ lý AI (Claude Code)
  tasks/ai-run.sh          trợ lý làm một việc (commit, kiểm tra, chạy lại game, tự hoàn tác khi lỗi)
  panel/ai.mjs             tab Trợ lý AI: MCP, token, ảnh, khoá, hoàn tác
  mcp/tools.mjs            35 công cụ MCP của game        mcp/http.mjs  giao thức MCP qua HTTP
  mcp/stdio.mjs            cầu nối cho app chỉ chạy MCP dạng lệnh
  mcp/GAME-ART.md          game cần gì ở một yêu thú, nhân vật, boss (AI đọc)
  agent/AGENT.md           luật làm việc của trợ lý trên VPS    agent/format.mjs  log dễ đọc
```

Phía game: `game/server/spawns.js` (quái đặt từ database, bảng `map_spawns`), `game/shared/them.js` (nhân vật, boss
thêm ngoài code), `game/tools/them.mjs` (đưa vào / gỡ ra), API admin mới `/api/schema`, `/api/maps`, `/api/spawns`,
`/api/fx`, `/api/announce`, `/api/them`. Phía pixelfx: `tools/from-image.mjs`, `tools/lib/png.mjs` (đọc PNG),
`src/fx/critters/_picture.js`.

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
