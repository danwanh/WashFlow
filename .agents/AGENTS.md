# WashTrack — Product Requirements Document (PRD) & Design Brief

---

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

### 1.1 Tên sản phẩm
**WashTrack — Live Ops & Intelligent Work Queue System**

### 1.2 Bối cảnh & Vấn đề giải quyết
Các tiệm giặt ủi và chuỗi giặt sấy hiện nay thường đối mặt với các vấn đề:
- **Tắc nghẽn vận hành & Quên đồ trong lồng giặt/sấy:** Nhân viên không biết chính xác máy nào đã xong để giải phóng máy cho mẻ giặt tiếp theo.
- **Trễ lịch hẹn giao khách:** Xử lý đơn theo cảm tính thay vì tính toán thời gian thực dẫn đến trễ hẹn vào các khung giờ cao điểm.
- **Giao diện POS truyền thống quá rối rắm:** Các màn hình POS bán hàng thông thường chứa quá nhiều bảng biểu, KPI không cần thiết, làm nhân viên thao tác chậm và mất tập trung vào hành động vật lý tiếp theo.
- **Xử lý đơn phức tạp (Nhiều nhóm đồ trong một đơn):** Các đơn có cả đồ trắng, đồ màu hoặc chăn mền cần giặt riêng thường bị chia thành nhiều đơn lẻ gây khó kiểm soát, hoặc dễ dẫn tới việc báo khách lấy đồ khi đơn mới hoàn tất một nửa.

### 1.3 Mục tiêu cốt lõi (Core Goals)
Giao diện của WashTrack được thiết kế để nhân viên đứng quầy/vận hành xưởng **ngay lập tức trả lời được 3 câu hỏi chỉ trong vòng 1 giây quan sát:**
1. **Bây giờ tôi làm việc gì tiếp theo?** (`NEXT ACTION`)
2. **Thuộc đơn hàng của ai?** (`ORDER ID & CUSTOMER`)
3. **Thao tác ở máy/khu vực nào?** (`MACHINE & LOCATION`)

---

## 2. NGUYÊN TẮC THIẾT KẾ CỐT LÕI (DESIGN PRINCIPLES)

| Nguyên tắc | Diễn giải chi tiết |
| :--- | :--- |
| **Visual-First & Minimal Text** | Cực kỳ ít chữ, sử dụng khoảng trắng hào phóng (lots of clean space), sử dụng biểu tượng CSS/SVG thay vì ảnh chụp hay mô tả dài dòng. |
| **No POS Clutter** | Không hiển thị biểu đồ doanh thu, báo cáo kế toán hay bảng dữ liệu phức tạp trong màn hình thao tác giặt sấy. |
| **Action Over Identity** | `NEXT ACTION` (in hoa, đậm, to nhất) luôn là tâm điểm thị giác trước khi đọc đến tên khách hàng hay mã đơn. |
| **Vertical Priority Flow** | Luồng hàng đợi công việc chuẩn 1 cột dọc duy nhất (Top = Làm trước, Bottom = Làm sau). Tuyệt đối không dùng dạng bảng, lưới 2 cột hay Kanban board. |
| **IoT as Source of Truth** | Cảm biến IoT tự động ghi nhận đóng/mở cửa máy, bắt đầu giặt/sấy và hoàn tất. Giao diện chỉ yêu cầu nhân viên bấm xác nhận đối với các tác vụ thủ công thuần túy. |
| **Strict Notification Rule** | Chỉ gửi tin nhắn hoàn tất cho khách khi **tất cả** các nhóm đồ trong đơn đã xong 100%. |

---

## 3. CẤU TRÚC GIAO DIỆN & TỶ LỆ BỐ CỤC (PAGE ARCHITECTURE)

Thiết kế Desktop phân chia theo tỷ lệ chuẩn **80% - 20%**:

```
┌─────────────────────────────────────────────────────────────┬──────────────┐
│ WashTrack Header: Điều hướng, Bộ chọn kịch bản, IoT status, Ca làm việc     │
├─────────────────────────────────────────────────────────────┼──────────────┤
│ 80% WORK QUEUE (HÀNG ĐỢI CÔNG VIỆC)                         │ 20% MACHINES │
│ ─────────────────────────────────────────────────────────── │ (TRẠNG THÁI) │
│ [ + Tạo đơn ]  [ Thử cảnh báo ]                             │              │
│                                                             │ MÁY GIẶT     │
│ ★ 1. LẤY ĐỒ RA · MÁY 02              [Tự động IoT]          │  [Máy 01]    │
│      Nguyễn Văn A · #123 (Đồ trắng)                         │   Trống      │
│                                                             │  [Máy 02]    │
│   2. VÀO MÁY GIẶT 01    (→ Kéo túi)  [Đôn đơn] [Tự động]    │   Xong       │
│      Trần Minh Anh · #128                                   │  [Máy 03]    │
│                                                             │   18 phút    │
│   3. VÀO MÁY GIẶT 01                 [Tự động IoT]          │              │
│      Nguyễn Văn A · #123 (Đồ màu)                           │ MÁY SẤY      │
│                                                             │  [Sấy 01]    │
│   4. PHÂN LOẠI                       [ ✓ Xong ]             │   Trống      │
│      Lê Thị Mai · #131                                      │  [Sấy 02]    │
│                                                             │   8 phút     │
│ SẮP TỚI (Upcoming Tasks - ngoài hàng đợi ưu tiên):          │              │
│ 17:55  PHÂN LOẠI · #140 Nguyễn An                           │              │
│ 18:10  PHÂN LOẠI · #145 Trần Mai                            │              │
└─────────────────────────────────────────────────────────────┴──────────────┘
```

---

## 4. CHI TIẾT TÍNH NĂNG VẬN HÀNH (DETAILED FUNCTIONAL REQUIREMENTS)

### 4.1 Hàng đợi công việc (Vertical Priority Work Queue)
- **Cấu trúc hàng việc (Queue Item):**
  - Vị trí ưu tiên cao nhất được đánh dấu ngôi sao vàng `★ 1` và viền màu chủ đạo nhẹ nhàng.
  - **Thứ tự phân cấp thông tin:**
    1. **Cấp 1 (Lớn nhất, Đậm nhất):** `HÀNH ĐỘNG TIẾP THEO` (Ví dụ: `LẤY ĐỒ RA · MÁY 02`, `VÀO MÁY GIẶT 01`, `PHÂN LOẠI`, `XẾP ĐỒ`).
    2. **Cấp 2:** Khách hàng, Mã đơn, Nhóm xử lý (Ví dụ: `Nguyễn Văn A · #123 · Đồ trắng`).
    3. **Cấp 3:** Chi tiết loại đồ & Giờ hẹn (Ví dụ: `Áo sơ mi · Hẹn 16:00`).
- **Phân loại tác vụ Manual vs. IoT:**
  - **Tác vụ IoT:** Không có nút bấm thủ công. Khi nhân viên mở nắp máy và lấy đồ ra, hoặc đóng nắp bật máy, IoT tự động nhận diện và hoàn tất tác vụ.
  - **Tác vụ thủ công (Manual):** Chỉ `PHÂN LOẠI` và `XẾP ĐỒ` có nút bấm `[✓ Xong]`.
- **Tương tác kéo túi giặt vào máy (Drag & Drop Laundry Bag to Machine):**
  - Đối với tác vụ `VÀO MÁY GIẶT / SẤY`, biểu tượng túi giặt đóng vai trò là tay nắm kéo.
  - Khi kéo túi: Máy tương thích (đang trống) phát sáng viền và hiển thị nhãn `THẢ VÀO ĐÂY`. Các máy không tương thích hoặc đang bận sẽ mờ nhẹ (`opacity: 0.4`).
  - Sau khi thả túi, hệ thống chuyển sang trạng thái chờ cảm biến IoT xác nhận cửa đóng để kích hoạt chu trình.

---

### 4.2 Đơn hàng nhiều nhóm xử lý độc lập (Multiple Processing Groups in One Order)
- **Mô hình dữ liệu:** `1 Khách hàng / 1 Mã đơn` ➔ `Nhiều nhóm xử lý (Groups)` (Đồ trắng, Đồ màu, Chăn mền, Đồ cần giặt riêng).
- **Hàng đợi độc lập:** Các nhóm đồ của cùng một đơn hàng có thể xuất hiện độc lập ở nhiều vị trí khác nhau trong hàng đợi (ví dụ: Đồ trắng đang ở Máy 02 cần lấy ra, trong khi Đồ màu chuẩn bị vào Máy 01).
- **Nhận diện liên kết:** Sử dụng chung mã đơn `#123` và tag nhóm `Cùng đơn Nguyễn Văn A` để nhân viên dễ dàng nhận biết.
- **Tiến trình nhóm trong Modal Chi tiết:**
  - Hiển thị song song các luồng với chỉ báo trực quan: `✓ Hoàn thành`, `● Đang xử lý`, `○ Sắp tới`.
  - Giờ hoàn thành dự kiến của toàn đơn hàng được tính theo **nhóm kết thúc muộn nhất**.

---

### 4.3 Quản lý tạo đơn & Tính giá dịch vụ (Create Order Modal)
- **Giao diện tinh gọn dạng chip bấm chọn:**
  - Chọn nhanh các mặt hàng phổ biến: `Áo quần` (15.000đ/kg), `Chăn` (40.000đ/cái), `Gấu bông` (35.000đ/con), `Rèm` (20.000đ/kg), `Giày` (45.000đ/đôi).
  - Tự động tính tổng tiền theo số lượng / trọng lượng thực tế.
  - Nút `[ Chia nhóm xử lý ]` cho phép chia đồ vào Nhóm 1 (Đồ trắng), Nhóm 2 (Đồ màu)... mà không làm phức tạp các đơn thông thường.
- **Cơ chế Kiểm tra giờ hẹn (Appointment Feasibility Check):**
  - Áp dụng nguyên tắc: `TIME → RESULT → ACTION`.
  - **Khả thi:** `✓ 15:30 Khả thi | 77.500đ` ➔ Nút `[ Tạo đơn ]`.
  - **Không khả thi:** `✕ 15:30 | Sớm nhất 16:00` ➔ Nút `[ Chọn 16:00 ]`.

---

### 4.4 Chỉnh giờ hẹn & Đôn đơn hàng (Expedite & Appointment Adjustment)
- **Đổi giờ muộn hơn:** Xác nhận đơn giản `15:00 → 15:30`, hệ thống tính toán lại và đẩy thứ tự tác vụ xuống dưới hàng đợi.
- **Đôn đơn lấy sớm (Expedite Flow):**
  1. **Khả thi:** `✓ CÓ THỂ ĐÔN` (Các đơn khác vẫn đúng giờ) ➔ Nút `[ Xác nhận ]`.
  2. **Ảnh hưởng đơn khác:** `⚠ ẢNH HƯỞNG ĐƠN KHÁC` (Hiển thị ngắn gọn `#128 ⚠ +10 phút`) ➔ Nút `[ Hủy ]` hoặc `[ Vẫn đôn ]` (nhân viên giữ quyền quyết định cuối cùng).
  3. **Không thể đôn:** `✕ KHÔNG THỂ 14:30` (Nổi bật giờ sớm nhất có thể `14:50`) ➔ Nút `[ Chọn 14:50 ]`.
- **Cảnh báo nguy cơ trễ hẹn:** Popup cảnh báo tinh gọn khi phát hiện đơn có nguy cơ trễ kèm giờ đề xuất.

---

### 4.5 Hệ thống thông báo vận hành góc phải (Top-Right Operational Alerts)
- **3 Cấp độ thông báo gọn gàng:**
  1. **NORMAL (Xong máy):** `✓ Máy 02 đã xong` · `#123 · LẤY ĐỒ RA` (Màu xanh ngọc).
  2. **REMINDER (Quên đồ trong máy):** `⚠ Đồ còn trong Máy 02` · `#123 · 5 phút` (Màu vàng hổ phách).
  3. **URGENT (Nguy cơ trễ):** `⚠ #123 có nguy cơ trễ` · `Hẹn 16:00` (Màu đỏ san hô).
- **Hành vi tương tác:** Bấm vào popup sẽ tự động cuộn và tạo hiệu ứng viền sáng (highlight focus) vào đúng tác vụ tương ứng trong hàng đợi.

---

### 4.6 Quy tắc hoàn tất đơn & Gửi thông báo cho khách hàng
- **Quy tắc nghiêm ngặt:** Tuyệt đối không gửi tin khi đơn mới hoàn tất một phần (ví dụ Đồ trắng xong nhưng Đồ màu đang sấy).
- **Thông báo đa kênh:** Khi toàn bộ các nhóm hoàn tất 100%, xuất hiện thẻ `✓ HOÀN THÀNH (Sẵn sàng trả khách)` kèm nút `[ Gửi tin khách ]`.
- **Nội dung soạn sẵn có thể chỉnh sửa:** Cung cấp mẫu tin nhắn lịch sự: *"Đơn #123 đã hoàn thành. Quý khách có thể đến nhận đồ..."*. Sau khi gửi, nút chuyển sang `✓ Đã thông báo`.

---

### 4.7 Tab Tổng quan Dashboard (Operational Analytics)
- Tách biệt hoàn toàn khỏi màn hình Hàng đợi công việc nhằm bảo toàn sự tập trung.
- **Bộ lọc chu kỳ:** `[ Ngày ]` · `[ Tháng ]` · `[ Năm ]`.
- **4 Chỉ số chính:** Doanh thu, Số đơn hàng, Tỷ lệ đúng hẹn, Số đơn trễ hẹn.
- **Hệ thống 4 biểu đồ vector:** Biểu đồ xu hướng Doanh thu, Biểu đồ Donut Tình trạng hẹn, Biểu đồ phân bố Giờ khách hẹn lấy đồ (nhận diện khung giờ cao điểm), Biểu đồ Số lượng đơn hàng.

---

## 5. THÔNG SỐ KỸ THUẬT & THIẾT KẾ (TECHNICAL & UI SPECIFICATIONS)

| Yếu tố | Quy chuẩn |
| :--- | :--- |
| **Typography** | Font chữ: `Montserrat`, sans-serif. Trọng số từ `400` (Regular), `500` (Medium) đến `600/700` (SemiBold/Bold). |
| **Color Palette** | **Primary:** Xanh dương hiện đại (`#0284c7`, `#0369a1`).<br>**Background:** Xám nhạt dịu mắt (`#f8fafc`, `#f1f5f9`).<br>**Surface Cards:** Trắng tinh khiết (`#ffffff`) với viền mỏng (`#e2e8f0`).<br>**Success/IoT:** Xanh ngọc lục bảo (`#059669`, `#10b981`).<br>**Warning:** Vàng cam hổ phách (`#d97706`).<br>**Urgent/Alert:** Đỏ san hô (`#dc2626`). |
| **Icons & Visual Assets** | 100% vector SVG & CSS inline, biểu tượng túi giặt mini hoạt họa, bản vẽ máy giặt/sấy cửa trước trực quan, không dùng ảnh raster. |
| **Device Target** | Desktop web app (tối ưu cho màn hình cảm ứng POS và màn hình máy tính bàn từ 1280px đến 1920px+). |

---

## 6. KẾ HOẠCH PHÁT TRIỂN & CÁC BƯỚC TIẾP THEO (ROADMAP)
1. **P1 (Core Live Ops):** Đồng bộ webhook 2 chiều với phần cứng IoT máy giặt/sấy công nghiệp.
2. **P2 (Smart Routing):** Thuật toán tối ưu hóa sắp xếp lồng giặt theo tải trọng thực tế (kg) và phân bổ chu trình sấy tự động.
3. **P3 (Customer App/Zalo OA):** Tự động đẩy thông báo qua Zalo ZNS / SMS Brandname khi nhân viên bấm gửi tin hoàn tất.
