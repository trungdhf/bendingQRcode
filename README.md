# bendingQRcode

Quét QR bằng camera và dựng bản vẽ đường tâm ống uốn. **Bản hiện tại hỗ trợ QR đến N3**, đúng với định dạng đang sử dụng; không coi việc chưa có N4/N5 trong QR là lỗi.

## Một HTML có làm được không?

Có. Sau build, **`dist/index.html` là một file độc lập** chứa CSS, JavaScript và bộ giải mã QR. Camera chỉ hoạt động trong secure context: chạy ở `localhost` khi phát triển hoặc host ứng dụng bằng HTTPS; mở file trực tiếp bằng `file://` thường không có quyền camera. Không cần Python hay CDN lúc sử dụng, và hình ảnh camera được xử lý cục bộ.

- Bật camera, đưa mã QR vào khung quét rồi cấp quyền camera khi trình duyệt yêu cầu.
- Ứng dụng chỉ đọc QR trực tiếp từ camera; chức năng tải PDF/ảnh và nhập chuỗi QR thủ công đã được bỏ.
- Đọc QR thật, **không OCR bảng** và không tự ghép thêm dữ liệu từ bảng in.
- View isometric làm hình chính khi các cung khác mặt phẳng; có thêm XY/XZ/YZ và đổi hướng nhìn.
- Ghi kích thước thật N1/N2/N3, R và góc uốn; không đo góc/chiều dài bằng thước trên hình chiếu.
- Tải SVG/PNG hoặc dùng **In / Lưu PDF** của trình duyệt.
- Có nút dữ liệu mẫu. QR sai định dạng không thay thế bản vẽ cũ, kèm thông báo rõ.
- Camera tự dừng sau khi quét thành công, khi nhấn Dừng hoặc khi rời tab.

## Chạy / build trên Windows cmd

Yêu cầu Node.js 22.

```cmd
git clone https://github.com/trungdhf/bendingQRcode.git
cd bendingQRcode
npm ci
npm run dev
```

Tạo HTML một file:

```cmd
npm run build
start dist\index.html
```

Không cần cài Node trên máy chỉ sử dụng HTML đã build. Các kiểm thử chạy bằng lệnh bên dưới; chưa cài GitHub Actions vì quyền kết nối hiện tại không bao gồm `workflow`.

## Chuyển sang Power Apps

Canvas App có thể dùng control Barcode reader để quét QR trực tiếp bằng camera và vẽ lại đường tâm isometric bằng SVG. Màn hình YAML dùng cấu trúc control tree như mẫu: [power-apps/Bending-QR-Screen.yaml](./power-apps/Bending-QR-Screen.yaml). Luồng này không đọc QR từ PDF/ảnh; muốn hỗ trợ file cần thêm connector hoặc dịch vụ xử lý riêng. Barcode reader cần chạy trong Power Apps mobile hoặc Windows app có camera; không hỗ trợ quét trong trình duyệt.

## QR v1 — 14 trường, hiện chỉ đến N3

```text
93131310540501,DT11-111-7,STPG370,114.3,6.0,170,43.4,170,100.0,-83.14,112,304,213,0
```

| Vị trí | Ý nghĩa |
|---|---|
| 1–3 | O/#, 管番号, 材質 |
| 4–5 | OD, chiều dày t (mm) |
| 6–7 | R1, θ1 (mm, độ) |
| 8–9 | R2, θ2 (mm, độ) |
| 10 | ネレ1 / góc xoay từ mặt phẳng B1 sang B2 (độ) |
| 11–13 | N1, N2, N3 — chiều dài đoạn thẳng, không gồm cung (mm) |
| 14 | Trường cuối, hiện giữ nguyên như dữ liệu gốc; **chưa gán ý nghĩa** |

Không tự thêm hậu tố `-E` vào `STPG370` lấy từ QR. Parser từ chối định dạng khác 14 trường để không diễn giải nhầm dữ liệu mở rộng sau này. Core hình học đã nhận danh sách nhiều N/cung/roll; khi có quy cách QR mới, bổ sung parser tương ứng.

## Cách dựng hình đúng tiếp tuyến

Đầu vào mỗi cung:

- `P`: điểm bắt đầu cung (PC), sau khi đi hết đoạn thẳng N.
- `d`: vector đơn vị theo hướng đi tới.
- `b`: vector đơn vị vuông góc `d`, hướng từ PC đến tâm cung.
- `R`: bán kính đường tâm; `θ`: góc uốn, đổi sang radian.

Với `0 ≤ φ ≤ θ`:

```text
P(φ) = P + R · [sin(φ)·d + (1 − cos(φ))·b]
T(φ) = cos(φ)·d + sin(φ)·b
```

Tại đầu cung `T(0)=d`, nên không bị quay ngược và không gãy tại đoạn thẳng. Tại cuối cung, dùng `T(θ)` làm hướng đoạn thẳng tiếp theo.

```text
d_next = cos(θ)·d + sin(θ)·b
b_next = −sin(θ)·d + cos(θ)·b
```

Trước cung sau, quay `b_next` quanh `d_next` bằng góc ネレ, theo Rodrigues. **Không coi góc xoay là góc uốn.** Tổng chiều dài triển khai bằng tổng N cộng tổng `R·θ`; chiều dài khớp **không chứng minh hướng 3D đúng**.

### Quy ước chiều xoay

Mặc định sử dụng quy tắc tay phải quanh N2 theo chiều đi từ S đến N3. View ban đầu đặt N1 theo +X và B1 trong XY. Dấu +/− của máy thực tế chưa được xác nhận; có ô đảo dấu để đối chiếu, không thay đổi chuỗi QR. Chưa dùng làm lệnh chế tạo.

## Mã Python tạo lại bản vẽ đã duyệt

Hai script trong `python/` tái tạo chi tiết N1–N2 và isometric N1–N3 bằng matplotlib. Đây là mẫu thông số cố định đã dùng trong trao đổi, không phải chương trình OCR bảng.

```cmd
py -m pip install -r python\requirements.txt
py python\n1_n2.py
py python\n1_n3.py
```

Kết quả PDF/PNG/validation nằm trong `output/` (không commit vào git). Các script tự chạy 5 và 8 kiểm thử hình học trước khi xuất. Không đưa PDF gốc hoặc ảnh phiếu vào repository.

## Kiểm thử

```cmd
npm run lint
npm test
npm run build
```

Kiểm tra liên tục vị trí và tiếp tuyến tại cả bốn đầu cung, bán kính/góc/chiều dài thật, góc xoay có dấu, trường hợp 0/180°, chiếu isometric bằng trục, escape nội dung QR trong SVG, mã QR bình thường và mã chạm đường kẻ phiếu.

HTML dùng PDF.js 4.10.38 với `isEvalSupported: false`, jsQR 1.4.0; worker được nhúng trong file, không gọi CDN.
