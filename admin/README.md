# Trang quản trị 957

Một admin server nhỏ dùng để sửa nội dung và ảnh của website mà không cần mở
code. Không cài thêm thư viện nào — chỉ cần Node 18 trở lên.

Chạy được ở hai chế độ:

- **local** — mặc định. Sửa thẳng repo trên máy bạn.
- **hosted** — chạy trên Render cho cả team dùng. Server tự giữ một bản clone
  của website; bấm "Xuất bản" là commit + push lên GitHub, và Vercel deploy lại
  site thật. Xem phần [Deploy lên Render](#deploy-lên-render) bên dưới.

## Chạy trên máy (chế độ local)

```bash
npm start
```

- Trang quản trị: <http://127.0.0.1:4957/admin/>
- Xem thử website: <http://127.0.0.1:4957/>

Lần đầu vào `/admin/`, bạn sẽ được yêu cầu **tạo mật khẩu** (tối thiểu 8 ký tự).
Mật khẩu được băm bằng scrypt và lưu trong `admin/config.json` — file này nằm
trong `.gitignore` nên không bao giờ lên GitHub. Muốn đặt lại mật khẩu khi quên:
xoá `admin/config.json` rồi mở lại trang admin.

Server chỉ lắng nghe trên `127.0.0.1`, tức là chỉ máy bạn truy cập được.
Sai mật khẩu 5 lần sẽ bị khoá 5 phút. Phiên đăng nhập kéo dài 8 tiếng.

## Các tab

| Tab | Làm gì | Ghi vào file |
|---|---|---|
| **Nội dung** | Sửa chữ và ảnh của từng trang | `index.html`, `works.html`, `klever.html` |
| **Projects** | Thêm/sửa/xoá/đổi thứ tự project | `projects.js` + card trên `index.html` |
| **Ảnh** | Tải lên, thay thế, xoá ảnh | `assets/` |
| **Xuất bản** | Xem file đã đổi, commit và push | git |
| **Thành viên** | Cấp/thu quyền theo gmail — chỉ owner thấy tab này | `members.json` ở repo private |

Trước mỗi lần ghi đè, file cũ được sao lưu vào `admin/.backups/<thời-gian>/`
(giữ 30 bản gần nhất). Cần khôi phục thì chép ngược file từ đó ra.

## Thêm một ô nội dung mới

Panel không có danh sách trường cố định — nó **quét file HTML** và biến mọi thẻ
có đánh dấu `data-cms` thành một ô sửa được. Muốn thêm ô mới, chỉ cần đánh dấu
thẻ đó trong HTML:

```html
<!-- sửa chữ bên trong thẻ -->
<p data-cms="hero.line1" data-cms-label="Dòng 1" data-cms-group="Hero">BASED IN VIETNAM</p>

<!-- sửa ảnh (hiện ô chọn ảnh từ thư viện) -->
<img data-cms-src="about.shot1" data-cms-label="Ảnh dịch vụ 1" src="assets/services/a.png">

<!-- sửa link -->
<a data-cms-href="footer.ig.url" href="#"><span data-cms="footer.ig.name">Instagram</span></a>
```

- `data-cms-label` — tên hiển thị trong admin (bỏ qua thì lấy theo key).
- `data-cms-group` — tên nhóm trong admin (bỏ qua thì lấy phần đầu của key).
- `data-cms-type="html"` — cho phép sửa cả thẻ HTML bên trong.
- `data-cms-type="text"` — ép về chữ thuần; thẻ trang trí đứng trước chữ
  (ví dụ `<span>[01]</span>`) được giữ nguyên, chỉ phần chữ phía sau sửa được.

Nếu bên trong thẻ có sẵn HTML mà không khai báo gì, ô đó tự chuyển sang chế độ
HTML để không làm mất thẻ con.

## Lưu ý về Projects

`projects.js` là nguồn dữ liệu chính (trang Works đọc từ đây). Trên trang chủ,
4 card gốc có lớp hiệu ứng vẽ tay riêng từ Figma, nên admin **chỉ cập nhật từng
trường** của card đó (mã, ảnh, tags, năm, link) chứ không dựng lại. Project mới
thêm sẽ nhận một card dạng cơ bản, không có lớp hiệu ứng — muốn có hiệu ứng thì
thêm markup `.fx-card` bằng tay trong `index.html`.

## Cấu trúc

```
admin/
  server.js        HTTP server: static + API, không phụ thuộc thư viện ngoài
  lib/auth.js      mật khẩu (scrypt) + phiên đăng nhập (cookie ký HMAC)
  lib/env.js       cấu hình theo biến môi trường, chặn boot nếu thiếu
  lib/files.js     đường dẫn an toàn, sao lưu, ghi file
  lib/html.js      quét và ghi các trường data-cms
  lib/content.js   danh sách trang được sửa
  lib/google.js    đăng nhập bằng Google (OAuth 2.0)
  lib/members.js   danh sách thành viên trong repo private
  lib/projects.js  đọc/ghi projects.js và đồng bộ card trang chủ
  lib/assets.js    thư viện ảnh: liệt kê, tải lên, thay thế, xoá
  public/          giao diện admin
  config.json      mật khẩu (tự sinh, không commit)
  .backups/        bản sao lưu tự động (không commit)
```


## Deploy lên Render

Kiến trúc: **admin trên Render** ghi vào bản clone của chính nó → push lên
**GitHub** (nhánh `main`) → **Vercel** thấy commit mới và deploy lại website.

Đăng nhập bằng **tài khoản Google**. Ai được vào là do danh sách thành viên
quyết định; danh sách đó nằm trong một **repo private riêng** vì repo website
là public, không thể để email của team ở đó.

### Bước 1 — Tạo repo private chứa danh sách thành viên

Tạo repo mới trên GitHub, **để private**, tên gợi ý `957-admin-config`, tick
"Add a README" để repo có sẵn một commit. Không cần thêm gì nữa — admin sẽ tự
tạo `members.json` trong đó ở lần chạy đầu.

### Bước 2 — Tạo GitHub token

GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token:

- Repository access: **Only select repositories** → chọn **cả hai** repo:
  `957-Project` và `957-admin-config`
- Permissions → Repository permissions → **Contents: Read and write**
- Đặt hạn dùng và nhớ gia hạn trước khi hết.

### Bước 3 — Tạo service trên Render

Render → **New** → **Blueprint** → chọn repo `957-Project`. Render đọc
`render.yaml` và dựng sẵn service `957-admin`.

Điền các biến sau trong phần Environment:

| Biến | Giá trị |
|---|---|
| `OWNER_EMAIL` | gmail của bạn — luôn là owner, không ai xoá được |
| `GITHUB_TOKEN` | token ở bước 2 |
| `CONFIG_REPO` | `https://github.com/<bạn>/957-admin-config.git` |
| `GOOGLE_CLIENT_ID` | điền ở bước 4 |
| `GOOGLE_CLIENT_SECRET` | điền ở bước 4 |

Deploy lần đầu sẽ **báo lỗi thiếu biến Google** và dừng lại — đúng như thiết kế,
vì admin không bao giờ tự chạy khi chưa đủ điều kiện bảo vệ. Nhưng nó cho bạn
địa chỉ service (`https://<tên>.onrender.com`), là thứ cần cho bước tiếp theo.

### Bước 4 — Tạo OAuth client trong Google Cloud

<https://console.cloud.google.com> → tạo project mới → **APIs & Services**:

1. **OAuth consent screen**: chọn **External**, điền tên app và email hỗ trợ.
   Để ở chế độ **Testing** là đủ (tối đa 100 người); không cần Google duyệt vì
   chỉ xin `email` và `profile`. Ở chế độ Testing, **mỗi gmail của team phải
   được thêm vào mục "Test users"** thì mới đăng nhập được.
2. **Credentials** → Create credentials → **OAuth client ID** → Web application:
   - Authorized JavaScript origins: `https://<tên>.onrender.com`
   - Authorized redirect URIs: `https://<tên>.onrender.com/api/auth/callback`
     — phải khớp từng ký tự, sai một dấu `/` là Google từ chối.
3. Copy Client ID và Client secret vào hai biến ở bước 3, rồi deploy lại.

### Quản lý thành viên

Vào tab **Thành viên** (chỉ owner thấy). Thêm người bằng gmail, chọn vai trò:

| Vai trò | Làm được gì |
|---|---|
| **Owner** | Mọi thứ, kể cả thêm/xoá/đổi vai trò thành viên |
| **Editor** | Sửa nội dung, ảnh, projects và xuất bản — không đụng được danh sách |

Mỗi lần thêm/xoá/đổi vai trò được ghi thành một commit trong repo private, nên
luôn truy được ai đã cấp quyền cho ai. Xoá một người là họ mất quyền ngay ở lần
đăng nhập kế tiếp — danh sách được đọc lại mỗi lần có người đăng nhập.

Email của bạn (`OWNER_EMAIL`) nằm ngoài danh sách nên không thể bị xoá nhầm.
Muốn đổi owner thì sửa biến môi trường đó trên Render.

### Những điều cần biết khi chạy hosted

- **Bản free của Render ngủ sau 15 phút** không ai dùng. Lần vào đầu tiên sau
  khi ngủ mất khoảng 30–60 giây vì server phải clone lại repo (~64MB).
- **Ổ đĩa là tạm.** Thay đổi đã lưu nhưng chưa xuất bản có thể mất khi Render
  khởi động lại. Xuất bản ngay khi sửa xong.
- **Không có khoá ghi đồng thời.** Hai người cùng sửa một trang thì người lưu
  sau đè lên người trước.
- **Commit ghi đúng tên người sửa** — tên và email lấy từ tài khoản Google đăng
  nhập, nên lịch sử trên GitHub truy được ai đổi gì.
- **Xung đột với GitHub** (có người sửa code cùng chỗ) được xử lý tự động: bản
  sửa được đẩy sang nhánh `admin-conflict-<thời-gian>` và server quay về đồng bộ
  với GitHub. Không mất gì, nhưng cần một người merge nhánh đó.
- **Token nằm trong biến môi trường**, không bao giờ được ghi vào `.git/config`
  của bản clone, và bị che khỏi mọi thông báo lỗi.
- **Màn hình "tạo mật khẩu lần đầu" bị khoá** ở chế độ hosted, và đăng nhập bằng
  mật khẩu cũng bị từ chối — nếu không, người lạ mò ra URL trước bạn là chiếm
  được panel.
- `.vercelignore` giữ cho thư mục `admin/` không bị Vercel phục vụ công khai.

### Chạy thử chế độ hosted trên máy

```bash
ADMIN_MODE=hosted PORT=4958 \
OWNER_EMAIL=ban@gmail.com SESSION_SECRET=$(openssl rand -hex 16) \
GOOGLE_CLIENT_ID=<id> GOOGLE_CLIENT_SECRET=<secret> \
PUBLIC_URL=http://127.0.0.1:4958 \
GITHUB_TOKEN=<token> GIT_BRANCH=main SITE_DIR=/tmp/957-site \
CONFIG_REPO=https://github.com/<ban>/957-admin-config.git \
CONFIG_DIR=/tmp/957-admin-config \
node admin/server.js
```

Nhớ thêm `http://127.0.0.1:4958/api/auth/callback` vào Authorized redirect URIs
của OAuth client thì bản local mới đăng nhập được.
