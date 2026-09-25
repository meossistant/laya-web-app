#!/usr/bin/env python3
"""
Test script to verify that Laya works 100% offline with local paths and HF_HUB_OFFLINE=1.
"""

import os
import sys
import json
import time

def test_offline_inference(local_model_path: str = "./models/laya"):
    abs_path = os.path.abspath(local_model_path)
    print("=" * 60)
    print("🧪 KIỂM TRA CHẾ ĐỘ OFFLINE AIR-GAPPED CỦA LAYA")
    print(f"📁 Đường dẫn kiểm tra: {abs_path}")
    print("=" * 60)

    # 1. Bật cờ ngắt internet hoàn toàn
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    print("🔒 Đã thiết lập: HF_HUB_OFFLINE=1 & TRANSFORMERS_OFFLINE=1")

    # 2. Kiểm tra thư viện laya
    try:
        from laya import Router, Agent
        print("✅ Đã nạp thành công thư viện 'laya'")
    except ImportError as e:
        print(f"❌ Không tìm thấy thư viện 'laya': {e}")
        return False

    # 3. Kiểm tra tệp model local
    req_files = ["rl_agent_config.json", "model.safetensors"]
    missing = [f for f in req_files if not os.path.exists(os.path.join(abs_path, f))]
    if missing:
        print(f"❌ Thư mục {abs_path} thiếu tệp: {missing}")
        print(f"💡 Hãy tải model trước bằng lệnh:")
        print(f"   python download_models.py --output-dir '{abs_path}'")
        return False
    else:
        print(f"✅ Đã tìm thấy đầy đủ tệp checkpoint Laya tại {abs_path}")

    # 4. Khởi tạo Router với local path
    print("\n⏳ Đang khởi tạo Router với đường dẫn local...")
    t0 = time.perf_counter()
    router = Router(
        models={
            "english": (abs_path, None),
            "multilingual": (abs_path, "multilingual"),
            "typed-decisions": (abs_path, "typed-decisions"),
        },
        default="english"
    )
    print(f"✅ Router khởi tạo thành công ({round((time.perf_counter() - t0)*1000, 1)} ms)")

    # 5. Chạy suy luận thử nghiệm
    state = "Xin chào, dịch vụ của bạn bị trừ tiền 2 lần vào hóa đơn hôm qua. Vui lòng hoàn lại tiền."
    questions = {
        "department": {
            "type": "choice",
            "instructions": "Bộ phận nào cần tiếp nhận xử lý yêu cầu này?",
            "criteria": {
                "billing": "hóa đơn, hoàn tiền, cước phí",
                "technical": "lỗi kỹ thuật, sự cố",
                "other": "khác"
            }
        },
        "urgency": {
            "type": "score",
            "instructions": "Mức độ khẩn cấp?",
            "criteria": ["thấp", "trung bình", "cao"]
        },
        "is_refund_request": {
            "type": "noul",
            "instructions": "Khách hàng có yêu cầu hoàn tiền không?"
        }
    }

    print("\n⚡ Đang thực thi suy luận System 1 (1 forward pass)...")
    t_inf = time.perf_counter()
    res = router.predict(state, questions)
    latency_ms = round((time.perf_counter() - t_inf) * 1000, 2)

    print(f"🎉 SUY LUẬN OFFLINE THÀNH CÔNG trong {latency_ms} ms!")
    print(f"Model đã định tuyến: {res.get('routing', {}).get('model')}")
    print("\nKết quả trả về:")
    print(json.dumps(res.get("answers", {}), indent=2, ensure_ascii=False))

    # 6. Kiểm tra OpenVINO nếu có
    ov_path = os.path.abspath("./models/openvino/multilingual")
    if os.path.exists(os.path.join(ov_path, "laya_multilingual_int8.xml")):
        print("\n" + "=" * 60)
        print("⚡ KIỂM TRA BỔ SUNG: OPENVINO INT8 BACKEND")
        print(f"📁 Thư mục OpenVINO: {ov_path}")
        try:
            from app.engine import OpenVINOAgent
            ov_agent = OpenVINOAgent(ov_path, precision="int8")
            t_ov = time.perf_counter()
            ov_res = ov_agent.system_one(state, questions)
            t_ov_ms = round((time.perf_counter() - t_ov) * 1000, 2)
            print(f"✅ OpenVINO INT8 suy luận thành công trong {t_ov_ms} ms!")
            print(json.dumps(ov_res, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"ℹ️ OpenVINO runtime test bỏ qua: {e}")

    return True

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "./models/laya"
    ok = test_offline_inference(path)
    sys.exit(0 if ok else 1)
