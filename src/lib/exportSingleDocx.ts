import { downloadHtmlAsDocx } from "@/lib/htmlToDocx";

/**
 * Export single-image OCR result as DOCX, preserving editor formatting.
 */
export async function downloadSingleMarkdownAsDocx(
  htmlOrMarkdown: string,
  filename = "ocr-result.docx",
  editorHtml?: string,
): Promise<void> {
  // Prefer editor HTML (rich formatting) over plain markdown
  const html = editorHtml || htmlOrMarkdown;
  await downloadHtmlAsDocx(html, filename);
}
