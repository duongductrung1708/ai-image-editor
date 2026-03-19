export type OcrBlock = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
