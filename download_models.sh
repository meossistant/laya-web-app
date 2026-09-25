#!/usr/bin/env bash
# ==============================================================================
# Script tải toàn bộ model Laya về local phục vụ triển khai offline / air-gapped
# Hỗ trợ cả `huggingface-cli`, `python` và `git lfs`
# ==============================================================================

set -e

DEST_DIR="${1:-./models/laya}"
REPO_ID="convaiinnovations/laya"

echo "=========================================================="
echo "🚀 LAYA OFFLINE DOWNLOADER (BASH)"
echo "   Model Repository: $REPO_ID"
echo "   Thư mục đích:     $DEST_DIR"
echo "=========================================================="

mkdir -p "$DEST_DIR"

if command -v python3 &>/dev/null && python3 -c "import huggingface_hub" &>/dev/null; then
    echo "⚡ Sử dụng script Python với huggingface_hub (Tự động tải & kiểm tra)..."
    python3 download_models.py --output-dir "$DEST_DIR" --checkpoint all
    exit 0
fi

if command -v huggingface-cli &>/dev/null; then
    echo "⚡ Sử dụng huggingface-cli để tải toàn bộ repo..."
    huggingface-cli download "$REPO_ID" \
        --local-dir "$DEST_DIR" \
        --local-dir-use-symlinks False
    echo "✅ Hoàn tất tải bằng huggingface-cli!"
    exit 0
fi

echo "⚠️ Không tìm thấy python với huggingface_hub hoặc huggingface-cli."
echo "💡 Bạn có thể cài đặt công cụ cần thiết:"
echo "   pip install huggingface_hub"
echo "Hoặc tải thủ công bằng git lfs:"
echo "   git lfs install"
echo "   git clone https://huggingface.co/convaiinnovations/laya $DEST_DIR"
exit 1
