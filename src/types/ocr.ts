export type OcrBlock = {
  id?: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "text" | "figure" | "stamp" | "signature";
  /** Ước lượng từ chiều cao bbox theo px của ảnh nguồn (best-effort). */
  fontSizePx?: number;
};

export type OcrSuccessResponse = {
  markdown: string;
  full_text: string;
  blocks: OcrBlock[];
  warning?: string;
};

export type OcrErrorResponse = {
  error: string;
  details?: string;
};

export type OcrApiResponse = OcrSuccessResponse | OcrErrorResponse;

export function isOcrErrorResponse(v: unknown): v is OcrErrorResponse {
  return (
    typeof v === "object" &&
    v !== null &&
    "error" in v &&
    typeof (v as { error?: unknown }).error === "string"
  );
}

export function isOcrSuccessResponse(v: unknown): v is OcrSuccessResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Partial<OcrSuccessResponse>;
  return (
    typeof o.markdown === "string" &&
    typeof o.full_text === "string" &&
    Array.isArray(o.blocks)
  );
}

export type OcrBatchPageResult = {
  index: number;
  name: string;
  ok: boolean;
  markdown: string;
  full_text: string;
  blocks: OcrBlock[];
  error?: string;
  warning?: string;
};

export type OcrBatchSuccessResponse = {
  markdown: string;
  full_text: string;
  pages: OcrBatchPageResult[];
  pageCount: number;
  concurrency: number;
};

export function isOcrBatchSuccessResponse(
  v: unknown,
): v is OcrBatchSuccessResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Partial<OcrBatchSuccessResponse>;
  return (
    typeof o.markdown === "string" &&
    typeof o.full_text === "string" &&
    Array.isArray(o.pages) &&
    typeof o.pageCount === "number"
  );
}
