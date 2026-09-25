"""
Inference and Model Management Engine for Laya (System 1 Decision Engine).
Supports:
  1. PyTorch Runtime (Standard, GPU/CPU)
  2. OpenVINO Runtime (Intel AMX / VNNI hardware-accelerated INT8/FP16/FP32)
  3. Online Hugging Face Hub loading & 100% Offline Local Path deployment
"""

import os
import sys
import time
import json
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("laya_engine")
logging.basicConfig(level=logging.INFO)

# Default Hugging Face repo
DEFAULT_HUB_REPO = "convaiinnovations/laya"

# Default local models directory to scan
DEFAULT_LOCAL_DIR = os.getenv("LAYA_MODEL_PATH", os.path.abspath("./models/laya"))
OPENVINO_LOCAL_DIR = os.getenv("LAYA_OPENVINO_PATH", os.path.abspath("./openvino_models"))

CHECKPOINT_FILES = [
    "rl_agent_config.json",
    "model.safetensors",
]


class OpenVINOAgent:
    """High-performance OpenVINO inference runtime for Laya decision models."""

    def __init__(self, model_dir: str, precision: str = "int8", device: str = "CPU"):
        try:
            import openvino as ov
        except ImportError:
            raise RuntimeError(
                "Thư viện 'openvino' chưa được cài đặt trong môi trường này. "
                "Cài đặt bằng lệnh: pip install openvino nncf"
            )
        from transformers import AutoTokenizer
        from laya.common import QTYPES

        self.model_dir = model_dir
        self.precision = precision.lower()
        self.device = device
        self.core = ov.Core()

        # Locate OpenVINO .xml model
        cand_names = [
            f"laya_model_{self.precision}.xml",
            f"openvino_model_{self.precision}.xml",
            f"model_{self.precision}.xml",
            f"laya_english_{self.precision}.xml",
            f"laya_multilingual_{self.precision}.xml",
            f"laya_typed-decisions_{self.precision}.xml",
        ]
        xml_path = None
        for name in cand_names:
            p = os.path.join(model_dir, name)
            if os.path.exists(p):
                xml_path = p
                break

        if not xml_path:
            # Fallback search for any .xml in directory matching precision
            for f in os.listdir(model_dir):
                if f.endswith(".xml") and self.precision in f.lower():
                    xml_path = os.path.join(model_dir, f)
                    break

        if not xml_path or not os.path.exists(xml_path):
            raise FileNotFoundError(
                f"Không tìm thấy tệp OpenVINO IR ({self.precision}) trong thư mục: '{model_dir}'. "
                f"Hãy chạy script export OpenVINO trên máy Intel CPU trước."
            )

        self.xml_path = xml_path
        logger.info(f"Loading OpenVINO model from: {self.xml_path} on {self.device}")
        self.ov_model = self.core.read_model(self.xml_path)
        self.compiled_model = self.core.compile_model(self.ov_model, self.device)
        self.infer_request = self.compiled_model.create_infer_request()

        # Load Config & Tokenizer
        cfg_path = os.path.join(model_dir, "rl_agent_config.json")
        if not os.path.exists(cfg_path):
            # check parent
            parent_cfg = os.path.join(os.path.dirname(model_dir), "rl_agent_config.json")
            cfg_path = parent_cfg if os.path.exists(parent_cfg) else cfg_path

        if os.path.exists(cfg_path):
            with open(cfg_path) as f:
                self.cfg = json.load(f)
        else:
            self.cfg = {"max_len": 512, "head_max_len": 192}

        tok_dir = os.path.join(model_dir, "tokenizer")
        self.tok = AutoTokenizer.from_pretrained(tok_dir if os.path.exists(tok_dir) else self.cfg.get("encoder", "bert-base-uncased"))

        # Agent helper reference for encoding / decoding
        from laya.agent import Agent
        self._decode_answers = Agent._decode_answers
        self._encode_state = Agent._encode_state
        self._to_internal = Agent._to_internal

        self.temperature = {QTYPES[k]: v for k, v in self.cfg.get("temperature", {"choice": 1.0, "score": 1.0, "noul": 1.0}).items()}
        self.temperature_by_options = self.cfg.get("temperature_by_options", {})
        self.lang_temperatures = self.cfg.get("lang_temperatures", {})

    def system_one(self, state: Union[str, dict, list], questions: Dict[str, Any], max_len: Optional[int] = None) -> Dict[str, Any]:
        from laya.common import collate_items
        ids = list(questions.keys())
        internal = {qid: self._to_internal(qdef) for qid, qdef in questions.items()}
        encoded = self._encode_state(self, state, ids, internal, max_len=max_len)
        b = collate_items([encoded], self.tok.pad_token_id)

        ov_inputs = {
            "input_ids": b["input_ids"].numpy(),
            "attention_mask": b["attention_mask"].numpy(),
            "marker_pos": b["marker_pos"].numpy(),
            "marker_mask": b["marker_mask"].numpy(),
            "qtype": b["qtype"].numpy()
        }

        outs = self.infer_request.infer(ov_inputs)
        logits = outs[0]
        act = outs[1]

        answers = self._decode_answers(self, logits, act, encoded, ids, internal, 0)
        return {
            "model": f"laya-openvino-{self.precision}",
            "answers": answers,
            "usage": {"input_tokens": int(b["attention_mask"].sum()), "output_tokens": 0},
            "backend": "openvino",
            "precision": self.precision
        }


class LayaEngine:
    def __init__(self, default_model_path: Optional[str] = None, device: Optional[str] = None):
        self.default_model_path = default_model_path or DEFAULT_LOCAL_DIR
        self.device = device or ("cuda" if self._is_cuda_available() else "cpu")
        self._router = None
        self._agents: Dict[str, Any] = {}
        self._ov_agents: Dict[str, Any] = {}
        self._current_path: Optional[str] = None
        self._is_offline = os.getenv("HF_HUB_OFFLINE", "0") == "1"

        logger.info(f"Initialized LayaEngine on device: {self.device}")
        logger.info(f"Default local model path: {self.default_model_path}")

    @staticmethod
    def _is_cuda_available() -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    @staticmethod
    def _is_openvino_available() -> bool:
        try:
            import openvino
            return True
        except ImportError:
            return False

    def get_hardware_info(self) -> Dict[str, Any]:
        """Returns details about hardware, PyTorch, OpenVINO and CPU optimization capabilities."""
        info = {
            "device": self.device,
            "cuda_available": False,
            "device_name": "CPU",
            "torch_version": "N/A",
            "openvino_available": False,
            "openvino_version": "N/A",
            "cpu_capabilities": [],
            "offline_mode_env": os.getenv("HF_HUB_OFFLINE", "0") == "1"
        }
        try:
            import torch
            info["torch_version"] = torch.__version__
            info["cuda_available"] = torch.cuda.is_available()
            if torch.cuda.is_available():
                info["device_name"] = torch.cuda.get_device_name(0)
        except ImportError:
            pass

        try:
            import openvino as ov
            info["openvino_available"] = True
            info["openvino_version"] = ov.__version__
            core = ov.Core()
            if "CPU" in core.available_devices:
                info["device_name"] = core.get_property("CPU", "FULL_DEVICE_NAME")
                info["cpu_capabilities"] = core.get_property("CPU", "OPTIMIZATION_CAPABILITIES")
        except Exception:
            pass

        return info

    def inspect_local_path(self, path: Optional[str] = None) -> Dict[str, Any]:
        """Inspects a local path to see which PyTorch & OpenVINO checkpoints are present."""
        target = os.path.abspath(path or self.default_model_path)
        exists = os.path.exists(target) and os.path.isdir(target)

        status = {
            "path": target,
            "exists": exists,
            "checkpoints": {
                "english": False,
                "multilingual": False,
                "typed-decisions": False
            },
            "openvino_models": {
                "english": [],
                "multilingual": [],
                "typed-decisions": []
            },
            "missing_files": {},
            "total_size_mb": 0.0
        }

        if not exists:
            return status

        # Check English
        eng_missing = [f for f in CHECKPOINT_FILES if not os.path.exists(os.path.join(target, f))]
        status["checkpoints"]["english"] = len(eng_missing) == 0

        # Check Multilingual
        multi_dir = os.path.join(target, "multilingual")
        if os.path.exists(multi_dir):
            multi_missing = [f for f in CHECKPOINT_FILES if not os.path.exists(os.path.join(multi_dir, f))]
            status["checkpoints"]["multilingual"] = len(multi_missing) == 0

        # Check Typed-Decisions
        typed_dir = os.path.join(target, "typed-decisions")
        if os.path.exists(typed_dir):
            typed_missing = [f for f in CHECKPOINT_FILES if not os.path.exists(os.path.join(typed_dir, f))]
            status["checkpoints"]["typed-decisions"] = len(typed_missing) == 0

        # Check for OpenVINO IR models (.xml / .bin)
        def _scan_ov(scan_path: str):
            if os.path.exists(scan_path):
                for root, _, files in os.walk(scan_path):
                    for f in files:
                        if f.endswith(".xml"):
                            low = f.lower()
                            m_key = "english" if "english" in root or "english" in low else ("multilingual" if "multi" in root or "multi" in low else "typed-decisions")
                            if f not in status["openvino_models"][m_key]:
                                status["openvino_models"][m_key].append(f)

        _scan_ov(target)
        ov_dir = os.path.abspath(OPENVINO_LOCAL_DIR)
        if os.path.realpath(ov_dir) != os.path.realpath(target):
            _scan_ov(ov_dir)

        total_bytes = 0
        for root, _, files in os.walk(target):
            for f in files:
                fp = os.path.join(root, f)
                if not os.path.islink(fp):
                    total_bytes += os.path.getsize(fp)
        status["total_size_mb"] = round(total_bytes / (1024 * 1024), 2)

        return status

    def _get_router(self, local_path: Optional[str] = None, force_offline: bool = False):
        from laya import Router, DEFAULT_MODELS

        path = local_path or self.default_model_path
        inspection = self.inspect_local_path(path)

        use_local = inspection["exists"] and (
            inspection["checkpoints"]["english"] or inspection["checkpoints"]["multilingual"]
        )

        if force_offline and not use_local:
            raise FileNotFoundError(
                f"Chế độ offline yêu cầu thư mục model local hợp lệ, nhưng không tìm thấy tại: '{path}'. "
                f"Hãy chạy script 'python download_models.py --output-dir {path}' trước."
            )

        if use_local:
            logger.info(f"Configuring Laya Router using LOCAL weights at: {path}")
            model_specs = {
                "english": (path, None),
                "multilingual": (path, "multilingual"),
                "typed-decisions": (path, "typed-decisions"),
            }
        else:
            logger.info(f"Configuring Laya Router using Hugging Face Hub: {DEFAULT_HUB_REPO}")
            model_specs = DEFAULT_MODELS

        router = Router(
            models=model_specs,
            device=self.device,
            max_loaded=2,
            default="english"
        )
        return router, use_local, path

    def _get_openvino_agent(self, model_name: str, precision: str = "int8", local_path: Optional[str] = None):
        """Constructs or returns an OpenVINOAgent instance for high-speed Intel CPU inference."""
        cache_key = f"{model_name}_{precision}"
        if cache_key in self._ov_agents:
            return self._ov_agents[cache_key]

        # Look in candidate directories
        base_candidates = [
            local_path,
            self.default_model_path,
            OPENVINO_LOCAL_DIR,
            os.path.join(OPENVINO_LOCAL_DIR, model_name),
            os.path.join(self.default_model_path, model_name),
        ]
        chosen_dir = None
        for cand in base_candidates:
            if cand and os.path.exists(cand):
                # check if contains xml with precision
                for f in os.listdir(cand):
                    if f.endswith(".xml") and precision.lower() in f.lower():
                        chosen_dir = cand
                        break
            if chosen_dir:
                break

        if not chosen_dir:
            raise FileNotFoundError(
                f"Không tìm thấy model OpenVINO ({precision.upper()}) cho checkpoint '{model_name}'. "
                f"Hãy đảm bảo bạn đã export model sang OpenVINO vào thư mục '{OPENVINO_LOCAL_DIR}/{model_name}'."
            )

        agent = OpenVINOAgent(chosen_dir, precision=precision, device="CPU")
        self._ov_agents[cache_key] = agent
        return agent

    def predict(
        self,
        state: Union[str, Dict[str, Any], List[Any]],
        questions: Dict[str, Any],
        model_mode: str = "auto",  # 'auto', 'english', 'multilingual', 'typed-decisions'
        backend: str = "pytorch",   # 'pytorch' or 'openvino'
        precision: str = "int8",    # 'fp32', 'fp16', 'int8' (for OpenVINO)
        local_path: Optional[str] = None,
        force_offline: bool = False,
        max_len: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Executes non-autoregressive decision making with calibrated probabilities."""
        start_time = time.perf_counter()

        if force_offline:
            os.environ["HF_HUB_OFFLINE"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"

        is_local = False
        loaded_source = ""
        routing_info = {}

        if backend == "openvino":
            # Target specific OpenVINO model
            actual_model = "english" if model_mode == "auto" else model_mode
            ov_agent = self._get_openvino_agent(actual_model, precision=precision, local_path=local_path)
            raw_result = ov_agent.system_one(state, questions, max_len=max_len)
            answers = raw_result.get("answers", {})
            model_used = f"{actual_model} (OpenVINO {precision.upper()})"
            routing_info = {
                "model": actual_model,
                "backend": "openvino",
                "precision": precision,
                "xml_path": ov_agent.xml_path,
                "reason": f"Accelerated via Intel OpenVINO ({precision.upper()})"
            }
            usage = raw_result.get("usage", {})
            is_local = True
            loaded_source = ov_agent.xml_path
        else:
            # PyTorch Backend
            if model_mode == "auto":
                router, is_local, loaded_source = self._get_router(local_path, force_offline)
                kwargs = {}
                if max_len:
                    kwargs["max_len"] = max_len
                raw_result = router.predict(state, questions, **kwargs)
                answers = raw_result.get("answers", {})
                routing_info = raw_result.get("routing", {})
                model_used = routing_info.get("model", "auto")
                usage = raw_result.get("usage", {})
            else:
                from laya import Agent
                path = local_path or self.default_model_path
                inspection = self.inspect_local_path(path)
                use_local = inspection["exists"] and inspection["checkpoints"].get(model_mode, False)
                sub = None if model_mode == "english" else model_mode
                source = path if use_local else DEFAULT_HUB_REPO
                agent = Agent(source, subfolder=sub, device=self.device)
                kwargs = {}
                if max_len:
                    kwargs["max_len"] = max_len
                raw_result = agent.system_one(state, questions, **kwargs)
                answers = raw_result.get("answers", {})
                model_used = model_mode
                routing_info = {"model": model_mode, "reason": f"Explicit PyTorch checkpoint: {model_mode}", "repo": source}
                usage = raw_result.get("usage", {})
                is_local = use_local
                loaded_source = source

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        return {
            "status": "success",
            "elapsed_ms": round(elapsed_ms, 2),
            "device": "CPU (Intel AMX)" if backend == "openvino" else self.device,
            "backend": backend,
            "precision": precision if backend == "openvino" else "fp32",
            "model_mode": model_mode,
            "model_used": model_used,
            "is_local_weights": is_local,
            "weights_source": loaded_source,
            "routing": routing_info,
            "answers": answers,
            "usage": usage,
            "questions_count": len(questions),
            "state_type": "json" if isinstance(state, (dict, list)) else "text"
        }

engine = LayaEngine()
