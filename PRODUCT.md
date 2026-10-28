# Product
<!-- impeccable:product-schema 1 -->
## Platform
web
## Users
Nhân viên ngân hàng tra cứu và thẩm định hồ sơ tín dụng (yêu cầu người dùng ngày 28/10/2026).
## Product Purpose
Tra cứu mọi hồ sơ của bộ dữ liệu đang chọn, đối chiếu điểm và căn cứ, ghi nhận hướng xử lý.
## Operating Context
FastAPI hiện có, giao diện HTML/CSS/JavaScript; nguồn Home Credit và nguồn CSV do người dùng nhập; nhận xét tách theo nguồn.
## Capabilities and Constraints
Giữ tra cứu, phân trang, nhập/chuyển nguồn, xem hồ sơ, lưu và xuất nhận xét. Dữ liệu hiện có là đầu ra mô hình; không thêm khả năng chấm hồ sơ thô hoặc quyết định phê duyệt tự động. Không đưa chi tiết repo, lưu trữ hay phương pháp nghiên cứu lên luồng nghiệp vụ.
## Brand Commitments
CreditDesk. Tiếng Việt ngắn gọn, chuyên nghiệp. Người dùng yêu cầu thay giao diện xanh cũ, gợi ý đen và vàng phù hợp tài chính. Chỉ cần xác định bộ dữ liệu đang dùng.
## Product Principles
- Ưu tiên tra cứu và ghi nhận thẩm định.
- Tên bộ dữ liệu luôn rõ ràng.
- Không hiển thị chi tiết triển khai cho nhân viên.
- Điểm, dữ liệu thiếu và chỉ số mô phỏng giữ đúng ý nghĩa.
