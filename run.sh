#!/usr/bin/env bash
# ==============================================================================
# Script khởi chạy Laya Decision Web App
# ==============================================================================

set -e

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
VENV_DIR=".venv"

echo "=========================================================="
echo "⚡ KHỞI ĐỘNG LAYA SYSTEM 1 DECISION WEB APP"
echo "   Host: http://$HOST:$PORT"
echo "=========================================================="

# Kích hoạt venv nếu tồn tại
if [ -d "$VENV_DIR" ]; then
    echo "📦 Kích hoạt virtual environment: $VENV_DIR"
    source "$VENV_DIR/bin/activate"
fi

# Kiểm tra cờ offline
if [ "$HF_HUB_OFFLINE" = "1" ]; then
    echo "🔒 Đang chạy ở chế độ OFFLINE (HF_HUB_OFFLINE=1)"
    export TRANSFORMERS_OFFLINE=1
fi

# Chạy FastAPI uvicorn
exec python3 -m uvicorn app.main:app --host "$HOST" --port "$PORT"
