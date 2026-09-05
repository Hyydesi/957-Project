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

## Bốn tab

| Tab | Làm gì | Ghi vào file |
|---|---|---|
| **Nội dung** | Sửa chữ và ảnh của từng trang | `index.html`, `works.html`, `klever.html` |
| **Projects** | Thêm/sửa/xoá/đổi thứ tự project | `projects.js` + card trên `index.html` |
| **Ảnh** | Tải lên, thay thế, xoá ảnh | `assets/` |
| **Xuất bản** | Xem file đã đổi, commit và push | git |

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
  lib/files.js     đường dẫn an toàn, sao lưu, ghi file
  lib/html.js      quét và ghi các trường data-cms
  lib/content.js   danh sách trang được sửa
  lib/projects.js  đọc/ghi projects.js và đồng bộ card trang chủ
  lib/assets.js    thư viện ảnh: liệt kê, tải lên, thay thế, xoá
  public/          giao diện admin
  config.json      mật khẩu (tự sinh, không commit)
  .backups/        bản sao lưu tự động (không commit)
```


## Deploy lên Render

Kiến trúc: **admin trên Render** ghi vào bản clone của chính nó → push lên
**GitHub** (nhánh `main`) → **Vercel** thấy commit mới và deploy lại website.

### Bước 1 — Tạo GitHub token

GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token:

- Repository access: **Only select repositories** → `957-Project`
- Permissions → Repository permissions → **Contents: Read and write**
- Đặt hạn dùng (90 ngày chẳng hạn) và nhớ gia hạn trước khi hết.

Copy token, dán thẳng vào Render ở bước 3. Đừng commit nó vào repo, đừng gửi
qua chat.

### Bước 2 — Tạo service trên Render

Render → **New** → **Blueprint** → chọn repo `957-Project`. Render đọc
`render.yaml` ở gốc repo và dựng sẵn service `957-admin`.

### Bước 3 — Điền hai biến bí mật

Trong phần Environment của service, điền:

| Biến | Giá trị |
|---|---|
| `ADMIN_PASSWORD` | mật khẩu team dùng để vào admin (tối thiểu 8 ký tự) |
| `GITHUB_TOKEN` | token vừa tạo ở bước 1 |

`SESSION_SECRET` do Render tự sinh, các biến còn lại đã có sẵn trong
`render.yaml`. Deploy xong, admin nằm ở `https://<tên-service>.onrender.com/admin/`.

### Đổi mật khẩu sau này

Sửa `ADMIN_PASSWORD` trong Environment rồi deploy lại. Ở chế độ hosted, nút
"Đổi mật khẩu" trong giao diện bị ẩn và màn hình "tạo mật khẩu lần đầu" bị khoá
— nếu không, người lạ mò ra URL trước bạn là họ đặt được mật khẩu.

### Những điều cần biết khi chạy hosted

- **Bản free của Render ngủ sau 15 phút** không ai dùng. Lần vào đầu tiên sau
  khi ngủ mất khoảng 30–60 giây vì server phải clone lại repo (~64MB).
- **Ổ đĩa là tạm.** Thay đổi đã lưu nhưng chưa xuất bản có thể mất khi Render
  khởi động lại. Xuất bản ngay khi sửa xong.
- **Cả team dùng chung một mật khẩu**, không có tài khoản riêng nên không biết
  ai sửa gì. Lịch sử commit trên GitHub đều mang tên `957 Admin`.
- **Không có khoá ghi đồng thời.** Hai người cùng sửa một trang thì người lưu
  sau đè lên người trước.
- **Xung đột với GitHub** (có người sửa code cùng chỗ) được xử lý tự động: bản
  sửa của bạn được đẩy sang một nhánh `admin-conflict-<thời-gian>` và server
  quay về đồng bộ với GitHub. Không mất gì, nhưng cần một người merge nhánh đó.
- **Token nằm trong biến môi trường**, không bao giờ được ghi vào `.git/config`
  của bản clone, và bị che khỏi mọi thông báo lỗi.
- `.vercelignore` giữ cho thư mục `admin/` không bị Vercel phục vụ công khai
  trên tên miền chính.

### Chạy thử chế độ hosted trên máy

```bash
ADMIN_MODE=hosted PORT=4958 \
ADMIN_PASSWORD=mat-khau-thu SESSION_SECRET=$(openssl rand -hex 16) \
GITHUB_TOKEN=<token> GIT_BRANCH=main SITE_DIR=/tmp/957-site \
node admin/server.js
```
