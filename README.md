# AI Image Editor (OCR)

## Local OCR via Ollama

This project uses a small local API server that calls **Ollama OpenAI-compatible API**.

- **Provider**: Ollama (local)
- **Provider (selectable)**: Ollama (local) or Gemini (cloud)
- **Env required**:
  - `OCR_PROVIDER` (`ollama` | `gemini`, default: `ollama`)
  - `OLLAMA_MODEL` (e.g. `deepseek-ocr2` if you have it pulled)
  - `OLLAMA_BASE_URL` (optional; default: `http://localhost:11434`)
  - `OCR_API_PORT` (optional; default: `8787`)
  - `OLLAMA_TIMEOUT_MS` (optional; default: `600000`)
  - `OCR_MODE` (optional; `both` | `json` | `markdown`, default: `both`)
  - `OLLAMA_API` (optional; `native` | `openai`, default: `native`)
  - `GEMINI_API_KEY` (required when `OCR_PROVIDER=gemini`)
  - `GEMINI_MODEL` (optional; default: `gemini-2.5-flash`)
  - `GEMINI_TIMEOUT_MS` (optional; default: `60000`, increase for large images)
  - **Batch OCR** (optional):
    - `OCR_BATCH_CONCURRENCY` (default: `2`, max `8`) — parallel pages per batch request
    - `OCR_BATCH_MAX_IMAGES` (default: `30`, max `100`) — max images per `/api/ocr/batch` body
  - Batch requests accept up to **120MB** JSON body (many base64 images); reduce image size if you hit limits.

### Configure env (local)

Put these variables in your root `.env`:

```bash
OLLAMA_MODEL="deepseek-ocr2"
OLLAMA_BASE_URL="http://localhost:11434"
```

### Run locally

Terminal 1:

```bash
npm run dev:ocr
```

Terminal 2:

```bash
npm run dev
```

## Troubleshooting

### `model requires more system memory ...`

You are out of RAM for the selected model. Use a smaller model tag (e.g. `qwen2.5vl:3b`) or close heavy apps.

### `fetch failed` / timeouts in `dev:ocr`

- Ensure Ollama is running:

```bash
ollama serve
```

- On Windows, prefer:
  - `OLLAMA_BASE_URL="http://127.0.0.1:11434"` over `localhost`
- Increase timeout:
  - `OLLAMA_TIMEOUT_MS=900000`

### Model doesn’t return JSON (JSON tab empty)

Some models ignore “JSON only” instructions. This app will fall back to using the raw model output as Markdown/plain text and return a warning.

## Local OCR via DeepSeek-OCR 2 (GPU, Hugging Face)

If you want to run **DeepSeek-OCR 2** directly on your NVIDIA GPU (instead of Ollama), run the bundled Python service and point `dev:ocr` to it.

### Configure env (local)

Put these variables in your root `.env`:

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

Terminal 2 (local OCR API used by the frontend):

```bash
npm run dev:ocr
```

Terminal 3 (frontend):

```bash
npm run dev
```
