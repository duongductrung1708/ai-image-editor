import { downloadHtmlAsDocx } from "@/lib/htmlToDocx";

/**
 * Export batch OCR result as DOCX, preserving editor formatting.
 */
export async function downloadMarkdownAsDocx(
  htmlOrMarkdown: string,
  filename = "ocr-batch.docx",
  editorHtml?: string,
): Promise<void> {
  const html = editorHtml || htmlOrMarkdown;
  await downloadHtmlAsDocx(html, filename);
}
