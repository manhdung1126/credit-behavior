# CreditDesk — Python + FastAPI

Chạy server trên máy của bạn. Không cần Node.js, npm, build frontend hoặc nền tảng deploy. FastAPI phục vụ giao diện HTML/CSS/JavaScript, đọc trực tiếp dữ liệu gốc trong `data/` và lưu nhận xét vào SQLite.

## Chạy local trên macOS / Linux

Cần Python 3.11 trở lên; đã kiểm tra bằng Python 3.12.

```bash
cd CreditDesk
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

Mở `http://127.0.0.1:8000`. API tương tác: `http://127.0.0.1:8000/docs`.

- Đổi cổng: `python main.py --port 8080`
- Trong lúc sửa code: `python main.py --reload`
- Cho phép truy cập trong mạng LAN: `python main.py --host 0.0.0.0`

Chạy qua Uvicorn cũng được: `python -m uvicorn main:app --host 127.0.0.1 --port 8000`.

## Dùng với Cloudflare Tunnel của bạn

Giữ FastAPI chạy ở cổng 8000. Trong tunnel bạn đang quản lý, trỏ hostname của ứng dụng tới service:

```text
http://127.0.0.1:8000
```

Cùng một server phục vụ giao diện và các đường dẫn `/api/`, không cần tách hostname frontend/backend. Nếu dùng config ingress tự quản, giá trị tương ứng là `service: http://127.0.0.1:8000`. Không cần cấu hình CORS cho giao diện này.

Bản MVP chưa có đăng nhập; bạn có thể dùng Cloudflare Access để giới hạn người truy cập. `cloudflared` và FastAPI đều cần chạy khi muốn truy cập từ xa. Gói không chứa tunnel token hoặc thông tin tài khoản Cloudflare.

Tài liệu chính thức: [FastAPI/Uvicorn](https://fastapi.tiangolo.com/deployment/manually/) · [Cloudflare ingress](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/).

## Thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `main.py` | FastAPI, API routes, chạy Uvicorn |
| `app/data_service.py` | Đọc CSV/parquet gốc, ghép hồ sơ, kiểm tra điểm và SHAP |
| `app/behavior.py` | Lý do hành vi từ đặc trưng hoặc đóng góp SHAP có căn cứ |
| `app/sources.py` | Kiểm tra, lưu và chọn nguồn CSV riêng |
| `app/reviews.py` | Lưu/đọc đề xuất bằng SQLite |
| `static/index.html`, `static/assets/` | Giao diện hiện tại; không cần bước build |
| `data/` | 34 file nguyên bản từ repo, giữ cấu trúc `eval_results/` |
| `data/SOURCE.json` | Commit, kích thước và Git blob SHA để đối chiếu từng file |
| `scripts/fetch_data.py` | Tải lại đúng các file dữ liệu và kiểm tra hash |
| `tests/test_app.py` | Kiểm tra API và dữ liệu thực |
| `requirements*.txt` | Thư viện Python chạy app/kiểm tra |

Khi chạy, server tự tạo `runtime/creditdesk.sqlite3` để lưu đề xuất. Đây là dữ liệu tác nghiệp riêng; server không sửa các file nghiên cứu trong `data/`. MVP giữ đề xuất gần nhất cho mỗi hồ sơ trên mỗi bộ dữ liệu.

## Tra cứu và chọn nguồn ngay trên giao diện

Mở ứng dụng sẽ vào **Danh sách hồ sơ**:

1. Chọn nguồn đang dùng. Nguồn Home Credit sẵn có gồm toàn bộ **307.511 hồ sơ**.
2. Nhập toàn bộ hoặc một phần mã, lọc nhóm, dùng **Trang trước / Trang sau** (25 hồ sơ/trang). Bỏ trống mã để duyệt toàn bộ nguồn.
3. Bấm **Mở hồ sơ** để xem điểm, căn cứ và ghi nhận đề xuất. Bộ đếm trong bàn thẩm định chỉ là các hồ sơ đã tải vào bàn, không phải giới hạn của nguồn.
4. Mở **Nhập bộ dữ liệu**, chọn tệp và bấm **Nhập và sử dụng**. Có nút tải CSV mẫu ngay trong ứng dụng; các dòng mẫu chỉ minh họa định dạng.

CSV UTF-8, phân cách dấu phẩy, tối đa 10 MB. Ba cột bắt buộc:

```csv
SK_ID_CURR,pred_risk_model_a,pred_risk_model_b
900001,0.08,0.06
```

Mã là số nguyên dương tối đa 15 chữ số, không trùng; xác suất nằm trong (0, 1). Đây là **đầu ra mô hình đã chấm**, không phải thông tin vay thô. Điểm/hạng được tính theo `scoring_params.json` hiện tại. Nếu tệp kèm `score_a`, `score_b`, `grade_a`, `grade_b`, chúng phải khớp thang điểm này.

Có thể bổ sung `cohort_t2_N12` và các cột chỉ tiêu trong `app/behavior.py` (danh sách cũng có trên giao diện). Nhóm chưa biết và chỉ tiêu thiếu để trống. Tỷ lệ trả chậm/trả thiếu trong 0–1; các chỉ tiêu không âm. Nguồn CSV không tự có SHAP hay kết quả kiểm chứng AUC/chính sách của Home Credit.

Nguồn nhập được lưu trong bảng `sources` của SQLite, còn sau khi khởi động lại. Tệp gốc trong `data/` không bị sửa. Nhập cùng nội dung dùng lại nguồn cũ; nội dung thay đổi tạo nguồn mới. Nhận xét được tách theo nguồn và thang điểm, kể cả khi trùng mã hồ sơ. Đổi nguồn trên một trình duyệt không đổi nguồn của người đang dùng trình duyệt khác. Bản ứng dụng hiện vẫn dùng chung dữ liệu trên server và chưa có đăng nhập/phân quyền người dùng.

## Dữ liệu gốc trong gói

34 file, khoảng 62,8 MB, tải nguyên byte từ [repo nghiên cứu](https://github.com/hien13042006-lab/Ch-m-i-m-t-n-d-ng), commit `d9f69ab0f8cf7feac887fb4d8d518b0cc6637569`:

- `oof_predictions.csv`, `scored_customers.csv`, `frozen_cohort_labels_N12.csv`, `folds.csv`
- `shap_points_by_group.parquet`, `scoring_params.json`, `config_shared.json`
- `feature_group_mapping.csv`, `feature_list_a.txt`, `feature_list_b.txt`, `monotone_constraints.csv`, `fold_seed_auc_report.csv`
- `calibration_deciles_ab.csv`, `data_set/link.txt`
- Toàn bộ CSV/JSON kết quả trong `eval_results/` ở commit trên.

Ứng dụng dùng hồ sơ thật trong 307.511 bản ghi, không còn các hồ sơ `DEMO-*` hoặc JSON dữ liệu giả. File `demo_customer_scorecards.json` vẫn được giữ nguyên vì có trong repo, nhưng app không lấy điểm từ file minh họa cũ này: điểm/xác suất/hạng được ghép trực tiếp từ CSV hiện tại.

Nếu cần tải lại file bị thiếu hoặc sai:

```bash
python scripts/fetch_data.py
```

Script xác minh Git blob SHA và giữ nguyên byte dữ liệu gốc.

## Giới hạn dữ liệu có thật trong repo

Các file gốc ở đây là **các đầu ra hiện có trong repo**. Repo không chứa dữ liệu Home Credit thô, `features_model_a.parquet`, `features_model_b.parquet` hoặc mô hình đã huấn luyện. Đường dẫn tới nguồn dữ liệu thô được repo ghi trong `data/data_set/link.txt`; gói này không tự tải thêm dữ liệu ngoài repo.

Do đó, hiện app giải thích hồ sơ bằng **SHAP theo nhóm thông tin** đã đối chiếu với điểm thật, chẳng hạn “nhóm trả góp đóng góp +19,88 điểm vào điểm B”. App không bịa tỷ lệ trả chậm hoặc gán đóng góp đó cho một hành vi con chưa có dữ liệu. SHAP B không giải thích toàn bộ chênh lệch B−A.

Khi nhóm đã tạo `features_model_b.parquet` từ Part 1, đặt file đó vào `data/` rồi khởi động lại server. App sẽ đọc các chỉ tiêu trả chậm, trả thiếu, hạn mức, POS nếu có và nêu lý do cụ thể kèm giá trị/cửa sổ/nguồn. Thiếu dữ liệu không được coi là giá trị 0.

## API chính

| API | Chức năng |
| --- | --- |
| `GET /api/health` | Trạng thái, số hồ sơ, commit dữ liệu |
| `GET /api/sources` | Danh sách nguồn có sẵn và CSV đã nhập |
| `POST /api/sources?name=output.csv` | Nhập nội dung CSV, Content-Type: text/csv |
| `GET /api/dataset` | Thông tin nguồn, các hồ sơ khởi tạo và kết quả nghiên cứu nếu có |
| `GET /api/profiles?q=247791` | Tìm mã trong toàn bộ hồ sơ; có `cohort`, `limit`, `offset` |
| `GET /api/profiles/247791` | Chi tiết một hồ sơ thật |
| `GET /api/reviews` | Các đề xuất đã lưu trên server |
| `PUT /api/profiles/247791/review` | Lưu hướng xử lý và lý do |
| `GET /api/source/scored_customers.csv` | Tải lại tệp nguồn được cho phép |

Các API dataset/profiles/reviews nhận `?source=original` (mặc định) hoặc ID nguồn trả về khi nhập CSV.

Nghiên cứu và mô phỏng dùng CSV gốc; đây là kết quả lịch sử, không phải kết quả triển khai tại ngân hàng. App chưa chấm hồ sơ vay mới.

## Kiểm tra

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Biến môi trường tùy chọn: `CREDITDESK_DATA_DIR` (thư mục gồm các file dữ liệu và `SOURCE.json`), `CREDITDESK_DB_PATH` (đường dẫn SQLite). Khởi động lại server sau khi thay file nghiên cứu.

## Khôi phục bàn thẩm định

Danh sách hồ sơ đã mở, hồ sơ đang chọn, bộ dữ liệu và màn hình đang dùng được lưu vào SQLite (`workspace_desks`, `workspace_views`). Khi tải lại trang hoặc khởi động lại server, cùng trình duyệt sẽ khôi phục bàn làm việc. Trình duyệt chỉ giữ một mã nhận diện ngẫu nhiên trong localStorage; nội dung bàn và các nhận xét đã lưu nằm trong cơ sở dữ liệu. Các bộ dữ liệu có bàn riêng; thao tác mở đồng thời được hợp nhất trong giao dịch SQLite. Đây là phân tách trạng thái giao diện, không phải cơ chế đăng nhập/phân quyền.

Các hồ sơ có nhận xét đã lưu được bổ sung vào bàn khởi tạo. Nhận xét đang nhập vẫn cần bấm **Lưu đề xuất** để lưu chính thức; việc mở hồ sơ tự lưu danh sách và lựa chọn, không tự gửi đề xuất.

## Chính sách tự thiết lập

Trong **Mô phỏng chính sách → Tự thiết lập**, chọn điểm tín dụng tối thiểu (1–1.001) hoặc rủi ro dự đoán tối đa (0–100%), chọn nhóm khách hàng và bấm **Chạy mô phỏng**. Cùng ngưỡng được áp dụng cho mô hình A và B trên toàn bộ phạm vi đang chọn, kể cả nguồn CSV riêng. Điểm dùng điều kiện `>=`, rủi ro dùng `<=`.

Kết quả gồm số/tỷ lệ hồ sơ đáp ứng, số không đáp ứng, rủi ro **dự đoán** bình quân trong nhóm đáp ứng và chênh lệch A/B. Nhóm rỗng trả về giá trị rủi ro trống. Đây là mô phỏng theo ngưỡng, không phải tỷ lệ nợ xấu quan sát hoặc quyết định cấp tín dụng. Thay điều kiện sẽ ẩn kết quả cũ cho tới khi chạy lại. Các tham số tùy chỉnh chưa được lưu thành chính sách lâu dài.

API bổ sung:

- `GET/PUT /api/workspace?client=<UUID>`: đọc/lưu bộ dữ liệu và màn hình của trình duyệt.
- `GET /api/workspace/desk?client=<UUID>&source=<id>`: khôi phục hồ sơ trong bàn.
- `PUT /api/workspace/desk/<profile_id>?client=<UUID>&source=<id>`: ghi nhận hồ sơ đã mở và đang chọn.
- `POST /api/policy/simulate?source=<id>`: JSON `{"rule":"score","threshold":700,"cohort":"all"}` hoặc `{"rule":"risk","threshold":0.05,"cohort":"rehabilitated"}`. Ngưỡng rủi ro API dùng 0–1, giao diện dùng phần trăm.


### Tỷ lệ duyệt mục tiêu

Chính sách tự thiết lập hỗ trợ thêm `rule: "approval"`, `threshold` là tỷ lệ 0–1 qua API, hoặc 0–100% trên giao diện. Trong phạm vi khách hàng đã chọn, mỗi mô hình chọn `floor(N × tỷ lệ)` hồ sơ có rủi ro dự đoán thấp nhất; đồng mức được xếp theo mã tăng dần. Số lượng A/B bằng nhau để so sánh rủi ro dự đoán bình quân và mốc chọn. Mốc hiển thị là giá trị tại ranh giới của nhóm đã chọn; khi có đồng mức, chỉ áp dụng riêng mốc rủi ro sẽ không tái tạo được toàn bộ danh sách nếu bỏ qua quy tắc mã.

Giao diện có tab **Trong bàn thẩm định** để lọc nhanh các hồ sơ đã mở và danh sách mã để chuyển trực tiếp khi thẩm định. Bàn vẫn dùng phần lưu SQLite hiện có.
