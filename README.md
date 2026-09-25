# ⚡ Laya Decision Engine — Web App (Jev-Style)

Giao diện Web tương tác cao cấp dành cho mô hình **Laya** ([convaiinnovations/laya](https://huggingface.co/convaiinnovations/laya)) — họ mô hình quyết định phi tự hồi quy (**Non-Autoregressive System 1 Decision Model**), được thiết kế theo phong cách giao diện của **Jev (TypeSafe AI)** và hỗ trợ triển khai **100% Offline / Air-Gapped** không cần kết nối Internet.

---

## 🌟 Đặc điểm nổi bật

- 🎯 **Decisions, Not Text (Ra quyết định, không sinh văn bản)**: Mô hình không sinh text từng token một như LLM truyền thống, mà nhận vào một **State** (JSON, email, tài liệu, logs) và đưa ra các quyết định có cấu trúc theo 3 kiểu chuẩn:
  - **`Choice`**: Chọn nhãn phân loại tối ưu kèm phân bố xác suất giữa các lựa chọn.
  - **`Score`**: Chấm điểm kỳ vọng trên thước đo thứ bậc định trước (rubric).
  - **`Noul`**: Đánh giá xác suất mệnh đề là Đúng hay Sai ($P(\text{True}) \in [0.0, 1.0]$).
- ⚡ **Siêu tốc (~33ms)**: Toàn bộ các câu hỏi được tính toán song song trong một forward pass duy nhất, nhanh gấp 6–8 lần so với Jev API đóng.
- 📐 **Xác suất chuẩn hóa toán học (Calibrated Probabilities)**: Huấn luyện bằng thuật toán RLCD (Reinforcement Learning for Calibrated Decisions) dựa trên quy tắc tính điểm strictly proper scoring rule, độ tin cậy thống kê thực tế đạt ECE cực thấp.
- 🎨 **Giao diện Jev-Style hiện đại**:
  - Đo độ trễ chính xác theo từng lượt chạy (Single Pass Latency Badge).
  - Biểu đồ phân bố xác suất (Probability Meters) trực quan cho từng lựa chọn.
  - Bộ tạo câu hỏi tương tác (Visual Builder) & Trình soạn thảo JSON Schema.
  - Tự động sinh mã nguồn nhúng (Python SDK, cURL, REST API) theo đúng dữ liệu đang nhập trên giao diện.
- 🔒 **Độc lập và bảo mật tuyệt đối (100% Air-Gapped Ready)**:
  - Tích hợp sẵn công cụ tải toàn bộ model về local.
  - Tự động nhận diện đường dẫn local, hỗ trợ cờ `HF_HUB_OFFLINE=1` và `TRANSFORMERS_OFFLINE=1`.
  - Giao diện web được đóng gói độc lập, **không phụ thuộc bất kỳ CDN ngoài nào**, hiển thị hoàn hảo trong mạng nội bộ không có Internet.

---

## 📦 Các Checkpoint trong họ mô hình Laya

Kho lưu trữ `convaiinnovations/laya` chứa 3 checkpoint chính:

| Checkpoint | Kiến trúc Encoder | Tham số | Context tối đa | Tác vụ tối ưu |
|---|---|---|---|---|
| **`Root (English)`** | ModernBERT-large | 421M | 512 tokens | Tiếng Anh, phân loại email, lọc prompt guardrails |
| **`multilingual`** | mmBERT-base | 322M | 1,024 – 8,192 tokens | Hơn 100 ngôn ngữ (bao gồm **Tiếng Việt**), tốc độ nhanh hơn ~2.2x |
| **`typed-decisions`** | ModernBERT-large | 421M | 1,024 tokens | Tinh chỉnh chuyên sâu cho 4 quy trình quyết định chuẩn (Độ chính xác 0.766) |

---

## 🛠️ Hướng dẫn tải toàn bộ Model về Local (Máy có Internet)

Để triển khai được trong môi trường không có internet, bạn cần tải model trước trên một máy có kết nối mạng. Dự án cung cấp sẵn các script tự động:

### Cách 1: Sử dụng script `download_models.py` (Khuyên dùng)

Script này sử dụng thư viện `huggingface_hub` để tải chính xác các tệp cần thiết, tự động kiểm tra tính toàn vẹn (integrity) và không tải các tệp dư thừa:

```bash
# 1. Kích hoạt môi trường ảo hoặc cài huggingface_hub
pip install huggingface_hub

# 2. Tải toàn bộ 3 checkpoint về thư mục ./models/laya
python download_models.py --output-dir ./models/laya --checkpoint all

# Hoặc chỉ tải checkpoint đa ngôn ngữ (nếu chỉ xử lý Tiếng Việt):
python download_models.py --output-dir ./models/laya --checkpoint multilingual
```

### Cách 2: Sử dụng Bash script

```bash
chmod +x download_models.sh
./download_models.sh ./models/laya
```

### Cách 3: Sử dụng công cụ `huggingface-cli`

```bash
pip install -U "huggingface_hub[cli]"

# Tải toàn bộ kho lưu trữ không dùng symlink để dễ chép file
huggingface-cli download convaiinnovations/laya \
  --local-dir ./models/laya \
  --local-dir-use-symlinks False
```

### Cách 4: Tải nhanh OpenVINO models từ Google Cloud Storage Bucket

Các model OpenVINO đã export (FP32, FP16, INT8) và các file `.tar.gz` nén sẵn đã được lưu trữ tập trung tại bucket `gs://meolab-laya-models/`:

```bash
# Tải trọn bộ các gói nén INT8 siêu nhẹ:
gcloud storage cp "gs://meolab-laya-models/*int8.tar.gz" ./models/openvino/

# Hoặc tải gói Multilingual INT8 (300 MB):
gcloud storage cp gs://meolab-laya-models/multilingual_int8.tar.gz ./models/openvino/
cd ./models/openvino && tar -xzvf multilingual_int8.tar.gz

# Hoặc tải toàn bộ thư mục OpenVINO (cả FP32, FP16, INT8):
gcloud storage cp -r "gs://meolab-laya-models/*" ./models/openvino/
```

### Cấu trúc thư mục sau khi tải về thành công:

Thư mục `./models/laya` sẽ có cấu trúc như sau:

```text
models/laya/
├── model.safetensors                  # Checkpoint Tiếng Anh (Root)
├── rl_agent_config.json
├── encoder/
│   └── config.json
├── tokenizer/
│   ├── tokenizer.json
│   └── tokenizer_config.json
├── multilingual/                      # Checkpoint Đa ngôn ngữ (Tiếng Việt)
│   ├── model.safetensors
│   ├── rl_agent_config.json
│   ├── encoder/
│   │   └── config.json
│   └── tokenizer/
│       ├── tokenizer.json
│       └── tokenizer_config.json
└── typed-decisions/                   # Checkpoint Typed-Decisions
    ├── model.safetensors
    ├── rl_agent_config.json
    ├── encoder/
    │   └── config.json
    └── tokenizer/
        ├── tokenizer.json
        └── tokenizer_config.json
```

Bạn có thể kiểm tra xem các tệp đã đầy đủ hay chưa bằng lệnh:
```bash
python download_models.py --output-dir ./models/laya --verify-only
```

---

## 🚚 Đóng gói & Chuyển sang máy Offline (Air-Gapped)

Sau khi đã tải xong trên máy có mạng:

### 1. Đóng gói thư mục model và mã nguồn:

```bash
# Nén thư mục model
tar -czvf laya_models.tar.gz ./models/laya

# Đóng gói toàn bộ source code web app
tar -czvf laya_webapp.tar.gz --exclude='.venv' --exclude='__pycache__' ./
```

### 2. Đóng gói các thư viện Python (Offline Wheels):
Trên máy có mạng, tải sẵn các wheel file của Python:
```bash
pip download -r requirements.txt -d ./offline_wheels
tar -czvf python_wheels.tar.gz ./offline_wheels
```

### 3. Chuyển sang máy offline:
Chép các tệp `laya_models.tar.gz`, `laya_webapp.tar.gz`, và `python_wheels.tar.gz` sang máy đích qua USB, ổ cứng di động hoặc mạng nội bộ SCP.

---

## 🚀 Triển khai & Khởi chạy trong Môi trường Offline

Trên máy chủ hoặc máy tính không có Internet:

### Bước 1: Giải nén mã nguồn và model
```bash
mkdir -p /opt/laya-web-app
cd /opt/laya-web-app

# Giải nén web app
tar -xzvf /path/to/laya_webapp.tar.gz -C ./

# Giải nén model vào ./models/laya
mkdir -p ./models
tar -xzvf /path/to/laya_models.tar.gz -C ./models/
```

### Bước 2: Cài đặt thư viện từ offline wheels
```bash
python3 -m venv .venv
source .venv/bin/activate

# Cài đặt từ thư mục wheels nội bộ (không cần internet)
tar -xzvf /path/to/python_wheels.tar.gz
pip install --no-index --find-links=./offline_wheels -r requirements.txt
```

### Bước 3: Cấu hình biến môi trường Offline
Tạo hoặc chỉnh sửa tệp `.env`:
```bash
cp .env.example .env
```
Nội dung `.env`:
```ini
HOST=0.0.0.0
PORT=8000

# Đường dẫn thư mục chứa model vừa giải nén
LAYA_MODEL_PATH=./models/laya

# BẬT CHẾ ĐỘ OFFLINE HOÀN TOÀN (Ngắt kết nối mạng)
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
```

### Bước 4: Kiểm tra nhanh khả năng suy luận Offline
Chạy script kiểm tra độc lập:
```bash
python test_offline.py ./models/laya
```
Khi thấy thông báo:
```text
✅ Đã nạp thành công thư viện 'laya'
✅ Đã tìm thấy đầy đủ tệp checkpoint Laya tại ...
🎉 SUY LUẬN OFFLINE THÀNH CÔNG trong 32.4 ms!
```
nghĩa là model đã nạp trực tiếp từ ổ cứng và không gửi bất kỳ yêu cầu mạng nào.

### Bước 5: Khởi chạy Web App
```bash
# Khởi chạy bằng script
./run.sh

# Hoặc khởi chạy trực tiếp với uvicorn:
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Mở trình duyệt truy cập: **`http://localhost:8000`** (hoặc địa chỉ IP máy chủ của bạn).

---

## ⚡ Tối ưu hóa Intel OpenVINO & Lượng tử hóa FP16 / INT8

Để khai thác tối đa sức mạnh của các dòng CPU Intel thế hệ mới (Intel 4th/5th Gen Xeon Scalable Sapphire Rapids / Emerald Rapids với tập lệnh **Intel AMX - Advanced Matrix Extensions** và **VNNI**), toàn bộ 3 checkpoint Laya đã được export và benchmark sang định dạng **OpenVINO Intermediate Representation (IR)**.

### 📊 Bảng so sánh Benchmark trên Intel Xeon Platinum 8481C (GCP C3 Instance)

Thử nghiệm đo đạc thực tế trên VM GCP `c3-standard-4` (Intel Xeon Sapphire Rapids 4 vCPUs, 16GB RAM):

| Model Checkpoint | Định dạng / Precision | Kích thước trên đĩa | Tỷ lệ nén | Độ trễ P50 (Latency) | Tăng tốc (Speedup) | Độ chính xác (Agreement) |
|---|---|---|---|---|---|---|
| **`laya` (English)** | PyTorch FP32 (Base) | 1,608.7 MB | 1.0x | 884.7 ms | 1.00x | Gốc |
| | **OpenVINO FP32** | 1,608.7 MB | 1.0x | **165.8 ms** | **5.33x** | 100% Khớp |
| | **OpenVINO FP16** | **805.3 MB** | **2.0x (Giảm 50%)** | **166.7 ms** | **5.31x** | 100% Khớp |
| | **OpenVINO INT8 (NNCF)** | **404.5 MB** | **4.0x (Giảm 75%)** | **240.0 ms** | **3.69x** | 100% Quyết định |
| **`multilingual`** | PyTorch FP32 (Base) | 1,229.3 MB | 1.0x | 310.6 ms | 1.00x | Gốc |
| | **OpenVINO FP32** | 1,229.3 MB | 1.0x | **66.0 ms** | **4.70x** | 100% Khớp |
| | **OpenVINO FP16** | **615.4 MB** | **2.0x (Giảm 50%)** | **65.2 ms** | **4.76x** | 100% Khớp |
| | **OpenVINO INT8 (NNCF)** | **309.4 MB** | **4.0x (Giảm 75%)** | **97.6 ms** | **3.18x** | 100% Quyết định |
| **`typed-decisions`** | PyTorch FP32 (Base) | 1,608.7 MB | 1.0x | 893.9 ms | 1.00x | Gốc |
| | **OpenVINO FP32** | 1,608.7 MB | 1.0x | **166.3 ms** | **5.37x** | 100% Khớp |
| | **OpenVINO FP16** | **805.3 MB** | **2.0x (Giảm 50%)** | **165.2 ms** | **5.41x** | 100% Khớp |
| | **OpenVINO INT8 (NNCF)** | **404.5 MB** | **4.0x (Giảm 75%)** | **238.7 ms** | **3.74x** | 100% Quyết định |

> 💡 **Nhận xét hiệu năng:**
> - **OpenVINO FP16** mang lại tỷ số hiệu năng / độ chính xác tốt nhất: Giảm **50% dung lượng RAM/ổ cứng**, tăng tốc độ suy luận **gấp 4.7x - 5.4x** so với PyTorch mặc định trên cùng một CPU, đồng thời giữ nguyên vẹn 100% độ chính xác đầu ra.
> - **OpenVINO INT8** giảm dung lượng mô hình tới **4 lần (chỉ còn ~309MB - 404MB)**, giúp tiết kiệm bộ nhớ tối đa và kích hoạt phần cứng Intel AMX/VNNI.

### 🛠️ Cách tự Export OpenVINO trên máy Intel CPU

Để tự động xuất cả 3 model sang OpenVINO với các mức FP32, FP16, INT8:
```bash
# Cài đặt OpenVINO và NNCF
pip install openvino nncf onnx

# Chạy script export tự động
python export_openvino.py --model all --output-dir ./openvino_models
```

---

## 💻 Sử dụng Local Path trong Code Python & API

### 1. Dùng Python SDK (Thư viện `laya`) với Local Path

```python
import os
from laya import Router, Agent

# Bước quan trọng: Ép cờ ngắt kết nối internet
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

LOCAL_PATH = "/opt/laya-web-app/models/laya"

# Khởi tạo Router trỏ tới thư mục local:
router = Router(
    models={
        "english": (LOCAL_PATH, None),
        "multilingual": (LOCAL_PATH, "multilingual"),
        "typed-decisions": (LOCAL_PATH, "typed-decisions"),
    },
    default="multilingual" # Mặc định tiếng Việt dùng multilingual
)

state = "Khách hàng thông báo bị trừ tiền 2 lần vào thẻ Visa ngày 24/09, yêu cầu hoàn tiền khẩn cấp."

questions = {
    "department": {
        "type": "choice",
        "instructions": "Bộ phận nào cần xử lý?",
        "criteria": {
            "billing": "hóa đơn, hoàn tiền, cước phí",
            "tech": "lỗi kỹ thuật hệ thống",
            "other": "khác"
        }
    },
    "is_urgent": {
        "type": "noul",
        "instructions": "Khách hàng có yêu cầu gấp hoặc đe dọa không?"
    }
}

# Thực thi suy luận (1 forward pass duy nhất)
result = router.predict(state, questions)

print("Quyết định bộ phận:", result["answers"]["department"]["choice"])
print("Xác suất khẩn cấp:", result["answers"]["is_urgent"]["noul"])
print("Độ tin cậy chuẩn hóa:", result["answers"]["department"]["answer_confidence"])
```

### 2. Gọi qua REST API của Web App

```bash
curl -X POST "http://localhost:8000/api/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "Giao dịch #1029 bị lỗi timeout nhưng tài khoản vẫn bị trừ tiền.",
    "questions": {
      "dept": {
        "type": "choice",
        "instructions": "Bộ phận phụ trách?",
        "criteria": {
          "payment": "thanh toán",
          "support": "hỗ trợ chung"
        }
      }
    },
    "model_mode": "auto",
    "local_path": "./models/laya",
    "force_offline": true
  }'
```

---

## 📁 Cấu trúc Thư mục Dự án

```text
laya-web-app/
├── app/
│   ├── __init__.py
│   ├── main.py              # Máy chủ FastAPI & REST API
│   ├── engine.py            # Quản lý tải model, kiểm tra offline & suy luận
│   ├── presets.py           # 5 bộ mẫu tác vụ chuẩn (Support, Guardrails, Moderation, RAG, Routing)
│   ├── templates/
│   │   └── index.html       # Giao diện SPA Jev-style (Không CDN ngoài, thuần Offline)
│   └── static/
│       ├── css/
│       │   └── style.css    # Giao diện hiện đại Dark/Light, hiệu ứng glow & progress bar
│       └── js/
│           └── app.js       # Logic giao diện, Visual Question Builder, biểu đồ xác suất
├── download_models.py       # Script tải và kiểm tra tính toàn vẹn của model
├── download_models.sh       # Script bash tải model thay thế
├── test_offline.py          # Script kiểm thử suy luận offline độc lập
├── run.sh                   # Script khởi động nhanh web app
├── requirements.txt         # Danh mục thư viện Python
├── .env.example             # Mẫu cấu hình môi trường
└── README.md                # Tài liệu hướng dẫn chi tiết
```

---

## 📜 Giấy phép & Bản quyền

- Mô hình **Laya** phát hành bởi **Convai Innovations** dưới giấy phép mã nguồn mở **Apache 2.0**.
- Dự án Web App được xây dựng theo chuẩn công nghệ hiện đại, tự do sử dụng trong môi trường nghiên cứu và thương mại nội bộ.
