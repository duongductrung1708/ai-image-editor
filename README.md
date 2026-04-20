# MonkeyOCR

## Tổng quan / Overview

- **VI**: Ứng dụng OCR tiếng Việt (1 ảnh + hàng loạt) với lịch sử, credits và thanh toán VNPAY (hiện repo cấu hình theo môi trường test).
- **EN**: Vietnamese OCR app (single + batch) with history, credits, and VNPAY payments (this repo is currently set up for test environment).

## Cài đặt dự án / Setup project (Supabase + frontend)

### Yêu cầu / Prerequisites

- **Node.js** (khuyến nghị LTS / recommend LTS) + **npm**
- **Supabase CLI** (dev local, migrations / local dev & migrations)

### 1) Cài dependencies / Install dependencies

```bash
npm install
```

### 2) Chạy Supabase local (khuyến nghị cho dev) / Start Supabase locally (recommended for dev)

```bash
supabase start
```

Áp migrations (repo có baseline migration) / Apply DB schema (baseline migration):

```bash
supabase db reset
```

Notes:
- This repo uses a **single consolidated migration**: `supabase/migrations/20260414000000_init.sql`.
- `supabase db reset` will recreate the local DB and apply migrations from scratch.

### 3) Cấu hình env frontend / Configure frontend env

Create `.env` at project root (or copy from `.env.example` if you have one) and set:

```bash
VITE_SUPABASE_URL="http://127.0.0.1:54321"
VITE_SUPABASE_ANON_KEY="<local-anon-key>"
```

Lấy local keys / Get local keys:

```bash
supabase status
```

### 4) Chạy app / Run the app

```bash
npm run dev
```

### Tuỳ chọn: link Supabase remote (staging/prod) / Optional: link to a remote Supabase project (staging/prod)

If you want to use a remote project instead of local:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Then update `.env` to your remote `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Nhà cung cấp OCR / OCR providers (Supabase Edge Function)

The app calls **`supabase/functions/v1/ocr-vietnamese`**. Supported providers:

- **`gemini`** — Google Generative Language API (`GEMINI_API_KEY`, `GEMINI_MODEL`, …)
- **`openai`** — OpenAI-compatible HTTP API (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, e.g. OpenRouter)

Set secrets on Supabase for the deployed function (or local env when using `supabase functions serve`).

**Env (typical)**:

- `OCR_PROVIDER` — `gemini` | `openai` (default in code: `gemini`)
- `OCR_MODE` — `both` | `json` | `markdown` (default: `both`)
- `OCR_MARKDOWN_STYLE` — `raw` | `clean`
- `OCR_MAX_IMAGE_BYTES` — max size per image (decoded bytes) (default: `4000000`)
- `OCR_BATCH_MAX_TOTAL_BYTES` — max total bytes per batch request (default: `20000000`)
- `OCR_CREDITS_PER_IMAGE` — credits charged per image (default: `1`)
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist for production (empty = allow all, dev-only)
- `REQUIRE_ALLOWED_ORIGINS` — set `1` to block requests when allowlist is empty (recommended in prod)
- `RATE_LIMIT_WINDOW_SECONDS` — rate limit window size in seconds (default: `60`)
- `RATE_LIMIT_OCR_PER_WINDOW` — max OCR requests per window (default: `20`)
- `RATE_LIMIT_BILLING_PER_WINDOW` — max billing requests per window (default: `10`)
- `IDEMPOTENCY_TTL_SECONDS` — idempotency key TTL in seconds (default: `600`)
- **Gemini**: `GEMINI_API_KEY`, `GEMINI_MODEL` (e.g. `gemini-2.5-flash`), optional `GEMINI_MODEL_FALLBACK`
- **OpenAI-compatible**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- `OPENAI_TIMEOUT_MS` — timeout for OpenAI-compatible provider calls (default: `60000`)
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

## Bàn giao dự án / Handover

- Xem tài liệu bàn giao (song ngữ): `docs/HANDOVER.md`
