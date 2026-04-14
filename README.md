# AI Image Editor (OCR)

## Setup project (Supabase + frontend)

### Prerequisites

- **Node.js** (recommend LTS) + **npm**
- **Supabase CLI** (for local dev & migrations)

### 1) Install dependencies

```bash
npm install
```

### 2) Start Supabase locally (recommended for dev)

```bash
supabase start
```

Apply DB schema (single baseline migration):

```bash
supabase db reset
```

Notes:
- This repo uses a **single consolidated migration**: `supabase/migrations/20260414000000_init.sql`.
- `supabase db reset` will recreate the local DB and apply migrations from scratch.

### 3) Configure frontend env

Create `.env` at project root (or copy from `.env.example` if you have one) and set:

```bash
VITE_SUPABASE_URL="http://127.0.0.1:54321"
VITE_SUPABASE_ANON_KEY="<local-anon-key>"
```

Get local keys:

```bash
supabase status
```

### 4) Run the app

```bash
npm run dev
```

### Optional: link to a remote Supabase project (staging/prod)

If you want to use a remote project instead of local:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Then update `.env` to your remote `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

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

### Run Edge Function locally (optional)

```bash
supabase functions serve ocr-vietnamese --no-verify-jwt
```

Set secrets for local function runtime (example):

```bash
supabase secrets set OCR_PROVIDER=gemini GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.5-flash
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
