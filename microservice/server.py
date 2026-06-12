from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from paddleocr import PaddleOCR
import numpy as np
import base64
import io
import re
import uvicorn
import os

app = FastAPI(title="VetaOCR Microservice", version="1.0.0")

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


class OcrRequest(BaseModel):
    imageBase64: str


class OcrBlock(BaseModel):
    text: str
    kind: str = "text"
    x: float
    y: float
    width: float
    height: float


class OcrResponse(BaseModel):
    markdown: str
    full_text: str
    blocks: list[OcrBlock]
    warning: str | None = None


def strip_data_uri_prefix(b64: str) -> str:
    m = re.match(r"data:image/[^;]+;base64,(.+)", b64)
    if m:
        return m.group(1)
    return b64


@app.post("/api/ocr", response_model=OcrResponse)
async def ocr_endpoint(req: OcrRequest):
    try:
        raw_b64 = strip_data_uri_prefix(req.imageBase64)
        img_bytes = base64.b64decode(raw_b64)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception:
        return OcrResponse(
            markdown="",
            full_text="",
            blocks=[],
            warning="Invalid image data",
        )

    w, h = image.size
    arr = np.array(image)
    result = ocr_engine.ocr(arr, cls=True)

    blocks: list[OcrBlock] = []
    lines: list[str] = []

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
                x=(min_x / w) * 100.0,
                y=(min_y / h) * 100.0,
                width=((max_x - min_x) / w) * 100.0,
                height=((max_y - min_y) / h) * 100.0,
            ))
            lines.append(text)

    full_text = "\n".join(lines)
    markdown = full_text.replace("\n", "  \n")

    return OcrResponse(
        markdown=markdown,
        full_text=full_text,
        blocks=blocks,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
