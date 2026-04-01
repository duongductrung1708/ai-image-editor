# AI Image Editor (OCR)

## OCR providers (Supabase Edge Function)

The app calls **`supabase/functions/v1/ocr-vietnamese`**. Supported providers:

- **`gemini`** — Google Generative Language API (`GEMINI_API_KEY`, `GEMINI_MODEL`, …)
- **`openai`** — OpenAI-compatible HTTP API (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, e.g. OpenRouter)

Set secrets on Supabase for the deployed function (or local env when using `supabase functions serve`).

**Env (typical)**:

- `OCR_PROVIDER` — `gemini` | `openai` (default in code: `gemini`)
- `OCR_MODE` — `both` | `json` | `markdown` (default: `both`)
- `OCR_MARKDOWN_STYLE` — `raw` | `clean`
- **Gemini**: `GEMINI_API_KEY`, `GEMINI_MODEL` (e.g. `gemini-2.5-flash`), optional `GEMINI_MODEL_FALLBACK`
- **OpenAI-compatible**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- **Batch OCR** (optional): `OCR_BATCH_CONCURRENCY` (default `2`, max `8`), `OCR_BATCH_MAX_IMAGES` (default `30`, max `100`)

### Run the frontend locally

```bash
npm run dev
```

### Model doesn’t return JSON (JSON tab empty)

Some models ignore “JSON only” instructions. The function can fall back to raw text and return a warning.

## Local OCR via DeepSeek-OCR 2 (GPU, Hugging Face)

Optional: run **DeepSeek-OCR 2** on an NVIDIA GPU via the bundled Python service (separate from the Edge Function providers above).

### Configure env (local)

```bash
OCR_PROVIDER="deepseek-ocr2"
DEEPSEEK_OCR2_URL="http://127.0.0.1:9000/v1/ocr"
DEEPSEEK_OCR2_TIMEOUT_MS="600000"
```

### Run locally

Terminal 1 (Python OCR service):

```bash
cd server/deepseek-ocr2-service
python -m venv .venv
.\.venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 9000
```

Terminal 2 (if your project still exposes `dev:ocr` for this path):

```bash
npm run dev:ocr
```

Terminal 3 (frontend):

```bash
npm run dev
```
