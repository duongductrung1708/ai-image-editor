from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image, ImageOps, ImageEnhance
from paddleocr import PaddleOCR
from typing import Union, List, Optional
import numpy as np
import base64
import io
import re
import uvicorn
import os

app = FastAPI(title="VetaOCR Microservice", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ocr_engine = PaddleOCR(
    use_angle_cls=True,
    lang="vi",
    show_log=False,
)

MAX_SIDE = 1600


class OcrRequest(BaseModel):
    imageBase64: Union[str, List[str]] = Field(
        ..., description="Single base64 image or list of base64 images"
    )


class OcrBlock(BaseModel):
    text: str
    kind: str = "text"
    x: float
    y: float
    width: float
    height: float
    confidence: float


class OcrResponse(BaseModel):
    markdown: str
    full_text: str
    blocks: List[OcrBlock]
    warning: Optional[str] = None


class OcrBatchPageResult(BaseModel):
    index: int
    ok: bool
    markdown: str
    full_text: str
    blocks: List[OcrBlock]
    warning: Optional[str] = None
    error: Optional[str] = None


class OcrBatchResponse(BaseModel):
    markdown: str
    full_text: str
    pages: List[OcrBatchPageResult]
    pageCount: int


def strip_data_uri_prefix(b64: str) -> str:
    m = re.match(r"data:image/[^;]+;base64,(.+)", b64)
    if m:
        return m.group(1)
    return b64


def preprocess_image(image: Image.Image) -> Image.Image:
    """Resize, grayscale, enhance contrast for stable OCR."""
    w, h = image.size
    longest = max(w, h)
    if longest > MAX_SIDE:
        scale = MAX_SIDE / longest
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        image = image.resize(new_size, Image.LANCZOS)

    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    gray = ImageEnhance.Contrast(gray).enhance(1.4)
    gray = ImageEnhance.Sharpness(gray).enhance(1.3)
    return gray.convert("RGB")


def sort_blocks_reading_order(blocks: List[OcrBlock]) -> List[OcrBlock]:
    """Sort top-to-bottom, left-to-right. Group rows by y proximity."""
    if not blocks:
        return blocks
    avg_h = sum(b.height for b in blocks) / len(blocks)
    row_tol = max(avg_h * 0.6, 1.0)
    sorted_by_y = sorted(blocks, key=lambda b: b.y)
    rows: List[List[OcrBlock]] = []
    for b in sorted_by_y:
        placed = False
        for row in rows:
            if abs(row[0].y - b.y) <= row_tol:
                row.append(b)
                placed = True
                break
        if not placed:
            rows.append([b])
    rows.sort(key=lambda r: min(x.y for x in r))
    ordered: List[OcrBlock] = []
    for row in rows:
        row.sort(key=lambda b: b.x)
        ordered.extend(row)
    return ordered


def run_ocr_on_base64(b64: str) -> OcrResponse:
    try:
        raw_b64 = strip_data_uri_prefix(b64)
        img_bytes = base64.b64decode(raw_b64)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception:
        return OcrResponse(
            markdown="", full_text="", blocks=[], warning="Invalid image data"
        )

    orig_w, orig_h = image.size
    processed = preprocess_image(image)
    pw, ph = processed.size
    arr = np.array(processed)

    try:
        result = ocr_engine.ocr(arr, cls=True)
    except Exception as e:
        return OcrResponse(
            markdown="", full_text="", blocks=[], warning=f"OCR failed: {e}"
        )

    blocks: List[OcrBlock] = []
    if result and result[0]:
        for line in result[0]:
            if not line:
                continue
            box = line[0]
            text, conf = line[1]
            xs = [pt[0] for pt in box]
            ys = [pt[1] for pt in box]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            blocks.append(OcrBlock(
                text=text,
                kind="text",
                x=(min_x / pw) * 100.0,
                y=(min_y / ph) * 100.0,
                width=((max_x - min_x) / pw) * 100.0,
                height=((max_y - min_y) / ph) * 100.0,
                confidence=float(conf),
            ))

    blocks = sort_blocks_reading_order(blocks)
    full_text = "\n".join(b.text for b in blocks)
    markdown = full_text.replace("\n", "  \n")

    return OcrResponse(markdown=markdown, full_text=full_text, blocks=blocks)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "VetaOCR Microservice",
        "version": app.version,
        "engine": "PaddleOCR",
        "lang": "vi",
    }


@app.post("/api/ocr")
async def ocr_endpoint(req: OcrRequest):
    if isinstance(req.imageBase64, list):
        pages: List[OcrBatchPageResult] = []
        all_text: List[str] = []
        for i, b64 in enumerate(req.imageBase64):
            res = run_ocr_on_base64(b64)
            ok = res.warning is None
            pages.append(OcrBatchPageResult(
                index=i,
                ok=ok,
                markdown=res.markdown,
                full_text=res.full_text,
                blocks=res.blocks,
                warning=res.warning if ok else None,
                error=res.warning if not ok else None,
            ))
            if res.full_text:
                all_text.append(res.full_text)
        joined = "\n\n".join(all_text)
        return OcrBatchResponse(
            markdown=joined.replace("\n", "  \n"),
            full_text=joined,
            pages=pages,
            pageCount=len(pages),
        )

    return run_ocr_on_base64(req.imageBase64)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
