#!/usr/bin/env python3
"""
Script to download Laya model checkpoints to a local directory for offline / air-gapped deployment.

Checkpoints supported:
  1. english (root repo): ModernBERT-large (421M params), context 512
  2. multilingual: mmBERT-base (322M params), context 1024-8192, 100+ languages
  3. typed-decisions: ModernBERT-large (421M params), tuned on benchmark workflows
"""

import argparse
import os
import sys
import shutil
from typing import List, Optional
from huggingface_hub import snapshot_download, hf_hub_download

REPO_ID = "convaiinnovations/laya"

# Files necessary for each checkpoint
REQUIRED_CHECKPOINT_FILES = [
    "rl_agent_config.json",
    "model.safetensors",
    "tokenizer/tokenizer.json",
    "tokenizer/tokenizer_config.json",
    "encoder/config.json",
]

def verify_checkpoint(ckpt_dir: str, name: str) -> bool:
    """Verifies that all required files for a checkpoint exist on disk."""
    print(f"\n Đang kiểm tra checkpoint [{name}] tại: {ckpt_dir}")
    missing = []
    total_size = 0

    for rel_path in REQUIRED_CHECKPOINT_FILES:
        full_path = os.path.join(ckpt_dir, rel_path)
        if not os.path.exists(full_path):
            missing.append(rel_path)
        else:
            total_size += os.path.getsize(full_path)

    if missing:
        print(f" Checkpoint [{name}] thiếu {len(missing)} tệp quan trọng:")
        for m in missing:
            print("- {m}")
        return False
    else:
        mb = total_size / (1024 * 1024)
        print(f" Checkpoint [{name}] hợp lệ! Tổng dung lượng: {mb:.1f} MB ({len(REQUIRED_CHECKPOINT_FILES)} tệp đầy đủ)")
        return True

def download_checkpoint(
    checkpoint_name: str,
    target_dir: str,
    token: Optional[str] = None
) -> str:
    """
    Downloads a specific checkpoint from HF Hub into target directory.
    - english: downloads root files
    - multilingual: downloads subfolder 'multilingual'
    - typed-decisions: downloads subfolder 'typed-decisions'
    """
    print(f"\n==================================================")
    print(f" Bắt đầu tải checkpoint: {checkpoint_name.upper()}")
    print("Repo: {REPO_ID}")
    print("Thư mục đích: {target_dir}")
    print(f"==================================================")

    os.makedirs(target_dir, exist_ok=True)

    if checkpoint_name == "english":
        subfolder = None
        patterns = [
            "rl_agent_config.json",
            "model.safetensors",
            "tokenizer/*",
            "encoder/*",
            "README.md",
        ]
        dest_dir = target_dir
    elif checkpoint_name in ("multilingual", "typed-decisions"):
        subfolder = checkpoint_name
        patterns = [
            f"{subfolder}/rl_agent_config.json",
            f"{subfolder}/model.safetensors",
            f"{subfolder}/tokenizer/*",
            f"{subfolder}/encoder/*",
        ]
        dest_dir = os.path.join(target_dir, subfolder)
    else:
        raise ValueError(f"Không nhận diện được checkpoint: {checkpoint_name}")

    print(f" Đang tải các tệp theo pattern: {patterns}...")

    # We download directly using snapshot_download with allow_patterns
    downloaded_cache = snapshot_download(
        repo_id=REPO_ID,
        allow_patterns=patterns,
        local_dir=target_dir,
        token=token or os.environ.get("HF_TOKEN"),
        local_dir_use_symlinks=False,  # Create real files so they can be copied to offline machines
    )

    print(f" Hoàn tất tải checkpoint: {checkpoint_name}")
    verify_checkpoint(dest_dir, checkpoint_name)
    return dest_dir

def main():
    parser = argparse.ArgumentParser(description="Tải model Laya về local phục vụ môi trường offline / air-gapped.")
    parser.add_argument(
        "--output-dir",
        "-o",
        default="./models/laya",
        help="Thư mục lưu trữ model tại máy local (Mặc định: ./models/laya)",
    )
    parser.add_argument(
        "--checkpoint",
        "-c",
        choices=["all", "english", "multilingual", "typed-decisions"],
        default="all",
        help="Chọn checkpoint cần tải: 'all' (tất cả 3 model), 'english', 'multilingual', hoặc 'typed-decisions'",
    )
    parser.add_argument(
        "--token",
        "-t",
        default=None,
        help="Hugging Face User Access Token (tùy chọn, nếu cần)",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Chỉ kiểm tra các tệp hiện có trong thư mục mà không tải mới",
    )

    args = parser.parse_args()
    target_base = os.path.abspath(args.output_dir)

    print(f" LAYA OFFLINE MODEL MANAGER")
    print(f" Thư mục mục tiêu: {target_base}")

    checkpoints_to_process = (
        ["english", "multilingual", "typed-decisions"]
        if args.checkpoint == "all"
        else [args.checkpoint]
    )

    if args.verify_only:
        print("\n CHẾ ĐỘ KIỂM TRA TỆP LOCAL (VERIFY ONLY):")
        all_ok = True
        for ckpt in checkpoints_to_process:
            check_path = target_base if ckpt == "english" else os.path.join(target_base, ckpt)
            ok = verify_checkpoint(check_path, ckpt)
            if not ok:
                all_ok = False
        if all_ok:
            print("\n TẤT CẢ CHECKPOINT ĐÃ SẴN SÀNG CHO MÔI TRƯỜNG OFFLINE!")
            sys.exit(0)
        else:
            print("\n️ Một số checkpoint bị thiếu tệp. Hãy chạy lệnh tải không có cờ --verify-only.")
            sys.exit(1)

    print(f"\n Danh sách checkpoint cần tải: {checkpoints_to_process}")
    for ckpt in checkpoints_to_process:
        download_checkpoint(ckpt, target_base, token=args.token)

    print("\n" + "=" * 60)
    print(" HOÀN TẤT TẢI TOÀN BỘ CHECKPOINT VỀ LOCAL!")
    print("=" * 60)
    print(f" Đường dẫn lưu trữ: {target_base}")
    print("\n HƯỚNG DẪN ĐÓNG GÓI VÀ CHUYỂN TỚI MÁY OFFLINE:")
    print(f"1. Nén thư mục model trên máy có internet:")
    print("tar -czvf laya_models_offline.tar.gz -C {os.path.dirname(target_base)} {os.path.basename(target_base)}")
    print(f"\n2. Chép file `laya_models_offline.tar.gz` sang máy offline (qua USB/SCP/NFS)")
    print(f"\n3. Giải nén trên máy offline:")
    print("mkdir -p ./models && tar -xzvf laya_models_offline.tar.gz -C ./models/")
    print(f"\n4. Thiết lập biến môi trường và chạy web app không cần mạng:")
    print("export HF_HUB_OFFLINE=1")
    print("export TRANSFORMERS_OFFLINE=1")
    print("export LAYA_MODEL_PATH={target_base}")
    print("python -m app.main")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
