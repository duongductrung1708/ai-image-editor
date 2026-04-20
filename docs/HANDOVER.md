# Bàn giao dự án / Project Handover (VI/EN)

Tài liệu này dành cho trường hợp **nhượng lại toàn bộ**: source code + hạ tầng chạy (Vercel + Supabase) + domain (nếu có).

This document is for **full transfer**: source code + running infrastructure (Vercel + Supabase) + domain (if any).

---

## 1) Phạm vi bàn giao / What’s included

### Bàn giao / Included

- **Repo**: toàn bộ source code + lịch sử commit / full repo + commit history
- **Vercel project**: project settings + env vars / project settings + env vars
- **Supabase project**:
  - Database schema + migrations
  - Edge Functions (đặc biệt `ocr-vietnamese`, `create-vnpay-payment`, `vnpay-verify`)
  - Storage buckets + policies (nếu dùng)
  - Auth settings + redirect URLs
- **Domain + DNS** (nếu có) / (if any)

### Không cam kết chuyển nhượng / Not always transferable

- **VNPAY merchant thật**: thường gắn với pháp nhân/hợp đồng. Repo hiện dùng **test** → người mua sẽ cấu hình merchant production của họ.

---

## 2) Chuẩn bị trước khi chuyển / Pre-transfer checklist

### Bảo mật / Security

- **VI**: kiểm tra repo không chứa secrets (API key, service role key, v.v.).
- **EN**: ensure no secrets are committed to git (API keys, service role keys, etc.).

### Rotate keys (khuyến nghị) / Rotate keys (recommended)

- **Supabase**: rotate keys nếu dự án từng public hoặc có người ngoài truy cập.
- **OCR provider**: đổi `GEMINI_API_KEY` / `OPENAI_API_KEY` trước/sau khi bàn giao theo thoả thuận.

### Kiểm tra RLS / RLS check

- **VI**: xác nhận RLS policies đúng cho các bảng người dùng:
  - `ocr_history`, `ocr_batch_sessions`, `ocr_batch_pages`
  - `credit_transactions`, `daily_free_uses`
- **EN**: verify RLS policies are correct for user-owned tables listed above.

---

## 3) Quy trình chuyển giao khuyến nghị / Recommended transfer flow

### A) Chuyển repo / Transfer repository

- **VI**: transfer ownership repo (GitHub/GitLab) hoặc thêm người mua làm Owner.
- **EN**: transfer repo ownership or grant buyer Owner/Admin access.

### B) Chuyển Vercel / Transfer Vercel

1. **VI**: Vercel → Project → Settings → Transfer Project (hoặc Add Team Member).
2. **EN**: Vercel → Project → Settings → Transfer Project (or add to team).
3. **VI/EN**: xác nhận env vars đã có đủ (tham khảo `.env.example`).

### C) Chuyển Supabase / Transfer Supabase

Bạn có 2 cách / Two options:

#### Option 1: Transfer nguyên project (nếu được) / Transfer the whole project (if supported)

- **VI**: Supabase → Project settings → Transfer project (nếu plan cho phép).
- **EN**: Supabase project settings → transfer (plan-dependent).

#### Option 2: Buyer tạo project mới và import / Buyer creates a new project and imports

1. **VI**: dùng migrations trong `supabase/migrations/` để tạo schema.
2. **EN**: apply migrations from `supabase/migrations/`.
3. **VI**: deploy Edge Functions sang project mới.
4. **EN**: deploy Edge Functions to the new project.
5. **VI/EN**: set secrets/env cho functions (OCR provider, limits, rate limit...).

### D) Cắt domain / Domain cutover (nếu có)

- **VI**: đổi DNS record sang Vercel project mới. Ước tính downtime 5–30 phút.
- **EN**: update DNS records to point to the new Vercel project. Downtime usually 5–30 minutes.

### E) Payment (VNPAY) / Payments

- **VI**: repo hiện dùng test. Người mua cần:
  - tạo merchant production của họ
  - set env/secrets cho functions `create-vnpay-payment` + `vnpay-verify`
  - cấu hình return URL theo domain mới
- **EN**: repo uses test config. Buyer must configure their own production merchant + secrets + return URL.

---

## 4) Kiểm thử sau bàn giao / Post-transfer verification

### Smoke tests (10–20 phút)

- **Auth**: đăng nhập/đăng xuất OK / sign-in/out works
- **OCR 1 ảnh**: upload → edit → OCR → result OK
- **Batch OCR**: upload nhiều ảnh → ready → start → result OK
- **History**: mở lịch sử, “nhận diện lại”, xóa 1 mục, xóa toàn bộ OK
- **Credits UI**: hiển thị balance OK
- **Free uses**: tab “Lượt miễn phí” hiển thị `daily_free_uses` OK

---

## 5) Danh sách ENV (tóm tắt) / ENV quick list

### Frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (hoặc key tương đương trong project bạn)

### Supabase Edge Functions (secrets)

- `OCR_PROVIDER`, `GEMINI_API_KEY` / `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`
- Limits / rate limits / idempotency (xem `.env.example`)
- CORS allowlist: `ALLOWED_ORIGINS`, `REQUIRE_ALLOWED_ORIGINS`
