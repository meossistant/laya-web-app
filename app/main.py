"""
FastAPI Application for Laya - Jev-style Non-Autoregressive Decision Engine.
"""

import os
import sys
import json
import time
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.engine import engine, LayaEngine, DEFAULT_HUB_REPO, DEFAULT_LOCAL_DIR
from app.presets import PRESETS

app = FastAPI(
    title="Laya - System 1 Decision Engine",
    description="Web application for Laya (Non-autoregressive decision model) with Jev-style UI and full offline support",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static and templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Request Models
class InspectPathRequest(BaseModel):
    path: str = Field(..., description="Đường dẫn thư mục model local cần kiểm tra")

class PredictRequest(BaseModel):
    state: Union[str, Dict[str, Any], List[Any]] = Field(..., description="State đầu vào (văn bản hoặc JSON)")
    questions: Dict[str, Any] = Field(..., description="Tập hợp câu hỏi theo schema Laya")
    model_mode: str = Field("auto", description="Mô hình: 'auto', 'english', 'multilingual', 'typed-decisions'")
    backend: str = Field("pytorch", description="Inference Backend: 'pytorch' hoặc 'openvino'")
    precision: str = Field("int8", description="Mức lượng tử hóa OpenVINO: 'int8', 'fp16', 'fp32'")
    local_path: Optional[str] = Field(None, description="Đường dẫn local model tùy chọn")
    force_offline: bool = Field(False, description="Bắt buộc chạy hoàn toàn offline không gọi internet")
    max_len: Optional[int] = Field(None, description="Giới hạn độ dài tokens (lên tới 8192)")

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    """Renders the main single-page interface."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/status")
async def get_system_status():
    """Returns runtime status, hardware, and offline model detection."""
    hw = engine.get_hardware_info()
    local_inspect = engine.inspect_local_path()
    return {
        "status": "online",
        "hardware": hw,
        "default_local_path": engine.default_model_path,
        "local_model_status": local_inspect,
        "default_hub_repo": DEFAULT_HUB_REPO,
        "presets_count": len(PRESETS)
    }

@app.post("/api/inspect-path")
async def inspect_path(req: InspectPathRequest):
    """Inspects a user-supplied directory to verify whether Laya model checkpoints exist."""
    result = engine.inspect_local_path(req.path)
    return result

@app.get("/api/presets")
async def get_presets():
    """Returns available task presets."""
    return PRESETS

@app.post("/api/predict")
async def run_prediction(req: PredictRequest):
    """Executes single forward pass decision making."""
    if not req.questions:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp ít nhất 1 câu hỏi (questions).")

    # Validate state if passed as JSON string
    state_parsed = req.state
    if isinstance(state_parsed, str):
        stripped = state_parsed.strip()
        if (stripped.startswith("{") and stripped.endswith("}")) or (stripped.startswith("[") and stripped.endswith("]")):
            try:
                state_parsed = json.loads(stripped)
            except Exception:
                # Keep as raw text if not valid JSON
                pass

    try:
        result = engine.predict(
            state=state_parsed,
            questions=req.questions,
            model_mode=req.model_mode,
            backend=req.backend,
            precision=req.precision,
            local_path=req.local_path,
            force_offline=req.force_offline,
            max_len=req.max_len
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi thực thi mô hình Laya: {str(e)}"
        )

@app.post("/api/code-snippet")
async def generate_code_snippet(req: PredictRequest):
    """Generates copy-pasteable Python SDK and cURL snippets matching current UI state."""
    state_repr = json.dumps(req.state, indent=4, ensure_ascii=False)
    questions_repr = json.dumps(req.questions, indent=4, ensure_ascii=False)

    local_path_code = f'"{req.local_path}"' if req.local_path else '"./models/laya"'

    python_sdk = f"""# === Sử dụng thư viện Python Laya ===
from laya import Router, Agent

# Khởi tạo Router (tự động điều phối theo ngôn ngữ / tác vụ)
# Hỗ trợ đường dẫn local offline hoặc Hugging Face Hub
router = Router(
    models={{
        "english": ({local_path_code}, None),
        "multilingual": ({local_path_code}, "multilingual"),
        "typed-decisions": ({local_path_code}, "typed-decisions"),
    }}
)

state = {state_repr}
questions = {questions_repr}

# Thực thi suy luận trong 1 forward pass duy nhất (~33ms)
result = router.predict(state, questions{f', model="{req.model_mode}"' if req.model_mode != "auto" else ""})

print("Model sử dụng:", result["routing"]["model"])
print("Kết quả quyết định:", result["answers"])
"""

    curl_snippet = f"""curl -X POST "http://localhost:8000/api/predict" \\
  -H "Content-Type: application/json" \\
  -d '{json.dumps({
      "state": req.state,
      "questions": req.questions,
      "model_mode": req.model_mode,
      "local_path": req.local_path,
      "force_offline": req.force_offline
  }, ensure_ascii=False)}'
"""

    return {
        "python_sdk": python_sdk,
        "curl": curl_snippet
    }

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    print(f"🚀 Starting Laya Decision Web App on http://{host}:{port}")
    uvicorn.run("app.main:app", host=host, port=port, reload=True)
