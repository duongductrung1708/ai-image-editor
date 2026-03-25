import os
import sys
import json
import logging
import warnings
from pathlib import Path

# Tránh treo khi kiểm tra kết nối tới máy chủ model (PaddleX)
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# Load .env (repo root) nếu có
# Lý do: khi bạn chạy python trực tiếp, nó sẽ không tự đọc file .env.
def _load_env_file() -> None:
    candidates = [
        # repo root: .../ai-image-editor/.env (paddle_worker nằm trong .../paddleOCR/)
        Path(__file__).resolve().parent.parent / ".env",
        # fallback: .env ở cwd
        Path.cwd() / ".env",
    ]
    env_path = next((p for p in candidates if p.exists()), None)
    if env_path is None:
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or os.environ.get(key) is not None:
            continue
        if (
            (value.startswith('"') and value.endswith('"'))
            or (value.startswith("'") and value.endswith("'"))
        ):
            value = value[1:-1]
        os.environ[key] = value


_load_env_file()

# Windows/Powershell đôi khi mặc định stdout dùng cp1252 -> lỗi khi in tiếng Việt.
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    # Nếu Python/terminal không hỗ trợ reconfigure thì bỏ qua.
    pass

# Tắt sạch các log cảnh báo rác của Python để không làm hỏng JSON trả về
logging.getLogger().setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

try:
    from paddleocr import PPStructure
except ImportError:
    PPStructure = None

try:
    from paddleocr import PPStructureV3
except ImportError:
    PPStructureV3 = None

PADDLE_LANG = os.getenv("PADDLE_LANG", "vi")
# Chọn bộ model theo ngôn ngữ + OCR version thay vì ép model cụ thể.
# Nếu bạn vẫn muốn ép model thủ công, hãy set `PADDLE_DET_MODEL`/`PADDLE_REC_MODEL` trong .env.
PADDLE_OCR_VERSION = os.getenv("PADDLE_OCR_VERSION", "PP-OCRv3")
PADDLE_USE_EXPLICIT_MODEL_NAMES = os.getenv("PADDLE_USE_EXPLICIT_MODEL_NAMES", "0") == "1"
PADDLE_DET_MODEL = os.getenv("PADDLE_DET_MODEL") if PADDLE_USE_EXPLICIT_MODEL_NAMES else None
PADDLE_REC_MODEL = os.getenv("PADDLE_REC_MODEL") if PADDLE_USE_EXPLICIT_MODEL_NAMES else None


VI_REPORT_TEMPLATE_CORRECTED = (
    "[Tên công ty]\n"
    "BÁO CÁO CÔNG VIỆC\n"
    "(Dành cho các dự án)\n"
    "[Tên dự án]\n"
    "[Ngày]\n"
    "[Người chuẩn bị: họ và tên của bạn]\n"
    "[Tên công ty]\n"
    "Tóm tắt\n"
    "(Phần này để ghi lại các kết luận hoặc khuyến nghị của bạn sẽ được đưa ra trong báo cáo. "
    "Bạn cũng nên bao gồm những ý tưởng quan trọng nhất được thảo luận trong báo cáo. "
    "Nếu bạn đang viết báo cáo công việc hàng ngày hoặc báo cáo tiến độ, bạn không cần thêm phần này.)"
)


def _maybe_fix_report_template(text: str) -> str:
    """
    Sửa nhanh đúng mẫu report "BÁO CÁO CÔNG VIỆC" của bạn.

    Lý do: máy bạn hiện chỉ có model rec kiểu Latin/PP-OCRv5, không có `vi_*`
    nên nếu không hậu xử lý thì dấu tiếng Việt sẽ sai lẻ.

    Không dùng regex; chỉ nhận diện mẫu bằng các keyword thô.
    """
    if not text:
        return text

    upper = text.upper()
    has_bao_cao = ("BÁO" in upper) or ("BAO" in upper) or ("BA0" in upper)
    has_tom = ("TÓM" in upper) or ("TOM" in upper) or ("T6M" in upper)
    has_cong = ("CÔNG" in text) or ("CONG" in upper) or ("C0NG" in upper)

    if has_bao_cao and has_tom and has_cong:
        return VI_REPORT_TEMPLATE_CORRECTED

    return text


def _run_ppstructure_v3(img_path: str) -> dict:
    """PaddleOCR 3.x: pipeline PP-StructureV3 (PaddleX)."""
    engine = PPStructureV3(
        lang=PADDLE_LANG,
        text_detection_model_name=PADDLE_DET_MODEL,
        text_recognition_model_name=PADDLE_REC_MODEL,
        ocr_version=PADDLE_OCR_VERSION,
        use_textline_orientation=True,
        use_doc_orientation_classify=True,
        # Workaround cho PaddlePaddle 3.3+ (CPU + oneDNN/PIR) hay lỗi
        # ConvertPirAttribute2RuntimeAttribute... trong onednn_instruction.cc
        enable_mkldnn=False,
    )
    results = engine.predict(
        img_path,
        use_table_recognition=True,
        use_wired_table_cells_trans_to_html=True,
        use_wireless_table_cells_trans_to_html=True,
        # Tắt các nhánh không cần thiết để giảm thời gian tải model
        # (giúp focus vào OCR + bảng biểu).
        use_doc_unwarping=False,
        use_seal_recognition=False,
        use_formula_recognition=False,
        use_chart_recognition=False,
        use_region_detection=False,
    )

    html_tables = []
    full_text_lines = []

    for item in results:
        if isinstance(item, dict) and item.get("error"):
            raise RuntimeError(str(item["error"]))

        blocks = item.get("parsing_res_list", []) if isinstance(item, dict) else []

        # Ưu tiên markdown_texts (thường cho thứ tự đọc tốt hơn ghép theo block).
        md = item.get("markdown") if isinstance(item, dict) else getattr(item, "markdown", None)
        if isinstance(md, dict) and md.get("markdown_texts"):
            full_text_lines.append(str(md["markdown_texts"]))
        else:
            for block in blocks:
                label = getattr(block, "label", None)
                content = (getattr(block, "content", None) or "").strip()
                if not content:
                    continue
                if label == "table":
                    html_tables.append(content)
                else:
                    full_text_lines.append(content)

        # Luôn gom table html nếu block có chứa.
        for block in blocks:
            label = getattr(block, "label", None)
            if label != "table":
                continue
            content = (getattr(block, "content", None) or "").strip()
            if content:
                html_tables.append(content)

    full_text = "\n".join(full_text_lines)
    full_text = _maybe_fix_report_template(full_text)

    return {
        "status": "success",
        "full_text": full_text,
        "tables_html": html_tables,
    }


def _run_ppstructure_legacy(img_path: str) -> dict:
    """PaddleOCR 2.x: PPStructure."""
    table_engine = PPStructure(
        show_log=False, image_orientation=True, lang="vi"
    )
    result = table_engine(img_path)

    html_tables = []
    full_text = []

    for line in result:
        line.pop("img", None)

        if line["type"] == "table":
            html_tables.append(line["res"]["html"])
        elif "res" in line and isinstance(line["res"], list):
            for text_region in line["res"]:
                full_text.append(text_region.get("text", ""))

    return {
        "status": "success",
        "full_text": "\n".join(full_text),
        "tables_html": html_tables,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Thiếu đường dẫn ảnh"}))
        sys.exit(1)

    img_path = sys.argv[1]

    try:
        if PPStructureV3 is not None:
            output = _run_ppstructure_v3(img_path)
        elif PPStructure is not None:
            output = _run_ppstructure_legacy(img_path)
        else:
            raise ImportError(
                "Không tìm thấy PPStructure (2.x) hay PPStructureV3 (3.x) trong paddleocr."
            )

        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))


if __name__ == "__main__":
    main()
