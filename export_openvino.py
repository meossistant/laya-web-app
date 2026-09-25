#!/usr/bin/env python3
"""
OpenVINO Export & Quantization Script for Laya System 1 Decision Models.
Exports all 3 checkpoints to OpenVINO IR:
  - FP32: Standard uncompressed model
  - FP16: Half-precision (~50% size reduction, identical accuracy)
  - INT8: Weight compression via NNCF (Intel AMX / VNNI accelerated, ~75% size reduction)
"""

import os
import sys
import time
import json
import argparse
import torch
import numpy as np
import openvino as ov
import nncf
from laya import Agent

MODELS = [
    ("english", "convaiinnovations/laya", None),
    ("multilingual", "convaiinnovations/laya", "multilingual"),
    ("typed-decisions", "convaiinnovations/laya", "typed-decisions")
]

def export_model_to_openvino(name: str, repo_or_path: str, subfolder: str = None, output_base: str = "./openvino_models"):
    print(f"\n============================================================")
    print(f" BẮT ĐẦU EXPORT CHECKPOINT: [{name.upper()}] SANG OPENVINO")
    print(f"============================================================")

    core = ov.Core()
    ckpt_dir = os.path.join(output_base, name)
    os.makedirs(ckpt_dir, exist_ok=True)

    # 1. Load PyTorch model
    print(f" Đang nạp PyTorch Agent ({repo_or_path})...")
    agent = Agent(repo_or_path, subfolder=subfolder, device="cpu")
    agent.model.eval()

    # 2. Export to ONNX intermediate
    dummy_input_ids = torch.randint(0, 100, (1, 32), dtype=torch.long)
    dummy_attention_mask = torch.ones((1, 32), dtype=torch.long)
    dummy_marker_pos = torch.tensor([[1, 5, 8, 12]], dtype=torch.long)
    dummy_marker_mask = torch.tensor([[True, True, True, True]], dtype=torch.bool)
    dummy_qtype = torch.tensor([0], dtype=torch.long)
    inputs = (dummy_input_ids, dummy_attention_mask, dummy_marker_pos, dummy_marker_mask, dummy_qtype)

    onnx_path = os.path.join(ckpt_dir, "model.onnx")
    print(f" Đang xuất đồ thị PyTorch sang ONNX...")
    torch.onnx.export(
        agent.model,
        inputs,
        onnx_path,
        export_params=True,
        opset_version=18,
        do_constant_folding=True,
        input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"],
        output_names=["logits", "act_logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "seq_len"},
            "attention_mask": {0: "batch_size", 1: "seq_len"},
            "marker_pos": {0: "batch_size", 1: "num_markers"},
            "marker_mask": {0: "batch_size", 1: "num_markers"},
            "qtype": {0: "batch_size"},
            "logits": {0: "batch_size", 1: "num_markers"},
            "act_logits": {0: "batch_size"}
        }
    )
    print(f" Hoàn tất xuất ONNX.")

    # 3. Save OpenVINO FP32
    print(f" Đang lưu OpenVINO FP32...")
    ov_fp32 = core.read_model(onnx_path)
    fp32_xml = os.path.join(ckpt_dir, f"laya_{name}_fp32.xml")
    ov.save_model(ov_fp32, fp32_xml, compress_to_fp16=False)
    fp32_mb = (os.path.getsize(fp32_xml) + os.path.getsize(fp32_xml.replace('.xml', '.bin'))) / (1024 * 1024)
    print(f" OpenVINO FP32: {fp32_mb:.1f} MB")

    # 4. Save OpenVINO FP16
    print(f" Đang nén OpenVINO FP16 (Half Precision)...")
    ov_fp16 = core.read_model(onnx_path)
    fp16_xml = os.path.join(ckpt_dir, f"laya_{name}_fp16.xml")
    ov.save_model(ov_fp16, fp16_xml, compress_to_fp16=True)
    fp16_mb = (os.path.getsize(fp16_xml) + os.path.getsize(fp16_xml.replace('.xml', '.bin'))) / (1024 * 1024)
    print(f" OpenVINO FP16: {fp16_mb:.1f} MB (Giảm {(1 - fp16_mb/fp32_mb)*100:.1f}%)")

    # 5. Quantize OpenVINO INT8 (NNCF AMX/VNNI)
    print(f" Đang lượng tử hóa OpenVINO INT8 qua NNCF...")
    ov_int8 = core.read_model(onnx_path)
    compressed_int8 = nncf.compress_weights(ov_int8, mode=nncf.CompressWeightsMode.INT8_SYM)
    int8_xml = os.path.join(ckpt_dir, f"laya_{name}_int8.xml")
    ov.save_model(compressed_int8, int8_xml)
    int8_mb = (os.path.getsize(int8_xml) + os.path.getsize(int8_xml.replace('.xml', '.bin'))) / (1024 * 1024)
    print(f" OpenVINO INT8: {int8_mb:.1f} MB (Giảm {(1 - int8_mb/fp32_mb)*100:.1f}%)")

    # Save tokenizer and config
    tok_dir = os.path.join(ckpt_dir, "tokenizer")
    os.makedirs(tok_dir, exist_ok=True)
    agent.tok.save_pretrained(tok_dir)
    with open(os.path.join(ckpt_dir, "rl_agent_config.json"), "w") as f:
        json.dump(agent.cfg, f, indent=2)

    print(f" Hoàn tất xuất checkpoint [{name}] sang OpenVINO tại: {ckpt_dir}")

def main():
    parser = argparse.ArgumentParser(description="Export Laya models to OpenVINO (FP32, FP16, INT8)")
    parser.add_argument("--model", choices=["all", "english", "multilingual", "typed-decisions"], default="all")
    parser.add_argument("--output-dir", default="./openvino_models")
    args = parser.parse_args()

    targets = MODELS if args.model == "all" else [m for m in MODELS if m[0] == args.model]
    for name, repo_id, subfolder in targets:
        export_model_to_openvino(name, repo_id, subfolder, args.output_dir)

if __name__ == "__main__":
    main()
