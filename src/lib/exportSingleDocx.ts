import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

/**
 * Lightweight Markdown → DOCX for single-image OCR result.
 */
export async function downloadSingleMarkdownAsDocx(
  markdown: string,
  filename = "ocr-result.docx",
): Promise<void> {
  const paragraphs: Paragraph[] = [];
  const chunks = markdown.split(/\n\n+/);

  for (const raw of chunks) {
    const block = raw.trim();
    if (!block) continue;

    if (block.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, text: block.slice(4).trim() }),
      );
    } else if (block.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: block.slice(3).trim() }),
      );
    } else if (block.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, text: block.slice(2).trim() }),
      );
    } else {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: block })] }),
      );
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
