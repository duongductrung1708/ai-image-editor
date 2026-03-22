import type { Editor } from "@tiptap/react";
import type TurndownService from "turndown";

/** Markdown từ TipTap hoặc fallback chuỗi đã lưu. */
export function getMarkdownFromEditorOrFallback(
  editor: Editor | null,
  turndown: TurndownService,
  markdownFallback: string,
): string {
  return editor ? turndown.turndown(editor.getHTML()) : markdownFallback;
}

/** Tab Markdown/JSON (batch hoặc kết quả 1 ảnh). */
export type OcrMarkdownJsonTab = "markdown" | "json";

/**
 * Nội dung để sao chép: JSON tab = raw JSON; Markdown tab = markdown hiện tại.
 */
export function getOcrCopyText(
  activeTab: OcrMarkdownJsonTab,
  editor: Editor | null,
  turndown: TurndownService,
  markdownText: string,
  jsonText: string,
): string {
  if (activeTab === "json") return jsonText;
  return getMarkdownFromEditorOrFallback(editor, turndown, markdownText);
}

/** Copy 1 ảnh khi có tab "tables" (không copy). */
export function getSingleImageCopyText(
  activeTab: OcrMarkdownJsonTab | "tables",
  editor: Editor | null,
  turndown: TurndownService,
  markdownText: string,
  jsonText: string,
): string {
  if (activeTab === "json") return jsonText;
  if (activeTab === "markdown") {
    return getMarkdownFromEditorOrFallback(editor, turndown, markdownText);
  }
  return "";
}

/**
 * Markdown cho xuất Word: JSON tab thử trường `markdown` trong JSON.
 */
export function getMarkdownForDocxExport(
  activeTab: OcrMarkdownJsonTab,
  editor: Editor | null,
  turndown: TurndownService,
  markdownText: string,
  jsonText: string,
): string {
  if (activeTab !== "json") {
    return getMarkdownFromEditorOrFallback(editor, turndown, markdownText);
  }
  try {
    const p = JSON.parse(jsonText) as { markdown?: string };
    return typeof p.markdown === "string" ? p.markdown : markdownText;
  } catch {
    return markdownText;
  }
}

/** Chuỗi text thô cho PDF batch (JSON tab = toàn bộ JSON). */
export function getPlainTextForBatchPdf(
  activeTab: OcrMarkdownJsonTab,
  editor: Editor | null,
  turndown: TurndownService,
  markdownText: string,
  jsonText: string,
): string {
  if (activeTab === "json") return jsonText;
  return getMarkdownFromEditorOrFallback(editor, turndown, markdownText);
}

/** Chuỗi cho PDF 1 ảnh (markdown/json tab). */
export function getPlainTextForSinglePdf(
  activeTab: OcrMarkdownJsonTab | "tables",
  editor: Editor | null,
  turndown: TurndownService,
  markdownText: string,
  jsonText: string,
): string {
  if (activeTab === "json") return jsonText;
  if (activeTab === "markdown") {
    return getMarkdownFromEditorOrFallback(editor, turndown, markdownText);
  }
  return "";
}
