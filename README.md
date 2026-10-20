# bendingQRcode

Quét QR bằng camera và dựng bản vẽ đường tâm ống uốn. Hỗ trợ QR v1 (14 trường, tối đa N3) và QR v2 (25 trường, tối đa N6), kể cả QR v2 chỉ có một cung và các trường chưa dùng để trống.

## Một HTML có làm được không?

Có. Sau build, **`dist/index.html` là một file độc lập** chứa CSS, JavaScript và bộ giải mã QR. Camera chỉ hoạt động trong secure context: chạy ở `localhost` khi phát triển hoặc host ứng dụng bằng HTTPS; mở file trực tiếp bằng `file://` thường không có quyền camera. Không cần Python hay CDN lúc sử dụng, và hình ảnh camera được xử lý cục bộ.

- Bật camera, đưa mã QR vào khung quét rồi cấp quyền camera khi trình duyệt yêu cầu.
- Có thanh trượt zoom camera; dùng zoom quang học nếu thiết bị hỗ trợ, nếu không sẽ phóng to kỹ thuật số và quét vùng giữa khung hình.
- Ứng dụng chỉ đọc QR trực tiếp từ camera; chức năng tải PDF/ảnh và nhập chuỗi QR thủ công đã được bỏ.
- Đọc QR thật, **không OCR bảng** và không tự ghép thêm dữ liệu từ bảng in.
- View isometric làm hình chính khi các cung khác mặt phẳng; có thêm XY/XZ/YZ và đổi hướng nhìn.
- Ghi kích thước thật N1–N6, R và góc uốn theo dữ liệu QR; không đo góc/chiều dài bằng thước trên hình chiếu.
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

Canvas App có thể dùng control Barcode reader để quét QR trực tiếp bằng camera và vẽ lại đường tâm isometric bằng SVG. Bản vẽ có ghi chú trực tiếp chiều dài N1–N3, bán kính R và góc uốn B1–B2; màn hình YAML dùng cấu trúc control tree như mẫu: [power-apps/Bending-QR-Screen.yaml](./power-apps/Bending-QR-Screen.yaml). Luồng này không đọc QR từ PDF/ảnh; muốn hỗ trợ file cần thêm connector hoặc dịch vụ xử lý riêng. Barcode reader cần chạy trong Power Apps mobile hoặc Windows app có camera; không hỗ trợ quét trong trình duyệt.

## QR v1 — 14 trường

```text
93131310540501,DT11-111-7,STPG370,114.3,6.0,170,43.4,170,100.0,-83.14,112,304,213,0
```

| Trường | Ý nghĩa |
|---|---|
| 1–3 | O/#, 管番号, 材質 |
| 4–5 | OD, chiều dày t (mm) |
| 6–7 | R1, θ1 |
| 8–9 | R2, θ2 (có thể để trống nếu chỉ có một cung) |
| 10 | Góc xoay từ B1 sang B2; để trống khi chỉ có một cung |
| 11–13 | N1, N2, N3 — chiều dài đoạn thẳng (mm); dùng N1–N2 với một cung |
| 14 | Trường cuối, hiện giữ nguyên như dữ liệu gốc; **chưa gán ý nghĩa** |

Không tự thêm hậu tố `-E` vào `STPG370` lấy từ QR.

## QR v2 — 25 trường, tối đa N6

QR v2 theo bố cục được dùng trong `pdf-reader`. Các trường cặp R/θ phía sau B1 và các đoạn tiếp theo có thể để trống khi không sử dụng; các cung phải liền nhau từ B1 và mọi cung tiếp theo cần có góc xoay tương ứng.

```text
作業番号,管番号,材質,外径,肉厚,R1,θ1,N1,N2,R2,θ2,方向1,N3,R3,θ3,方向2,N4,R4,θ4,方向3,N5,R5,θ5,方向4,N6
```

`方向1`–`方向4` là góc xoay có dấu giữa các mặt phẳng uốn liên tiếp. Ví dụ QR PDF reader có một cung:

```text
6110001601,38-4-N2-411_1,SUS304TP-A,139.8,3.5,420,30.0,335,891,,,,,,,,,,,,,,,,
```

Chuỗi ví dụ trên được chấp nhận với một cung và hai đoạn thẳng N1/N2. Parser vẫn giữ QR v1 để tương thích mã cũ.

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
