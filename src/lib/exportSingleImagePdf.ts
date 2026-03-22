import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { Editor } from "@tiptap/react";
import type TurndownService from "turndown";

export interface ExportSingleImagePdfParams {
  editor: Editor | null;
  turndown: TurndownService;
  activeTab: "markdown" | "json" | "tables";
  jsonText: string;
  markdownText: string;
  imageUrl: string;
  /** Tên file gốc (không extension) cho tiêu đề PDF. */
  sourceImageName?: string;
}

/**
 * PDF kết quả 1 ảnh: chụp ProseMirror nếu có, ảnh data URL, fallback text.
 */
export async function exportSingleImageOcrPdf({
  editor,
  turndown,
  activeTab,
  jsonText,
  markdownText,
  imageUrl,
  sourceImageName,
}: ExportSingleImagePdfParams): Promise<void> {
  const currentMarkdown =
    activeTab === "json"
      ? jsonText
      : editor
        ? turndown.turndown(editor.getHTML())
        : markdownText;
  const text = currentMarkdown.trim();

  const title = sourceImageName
    ? `VietOCR — ${sourceImageName}`
    : "VietOCR";

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    putOnlyUsedFonts: true,
  });

  const marginX = 15;
  let cursorY = 20;

  doc.setFontSize(14);
  doc.setTextColor(137, 25, 28);
  doc.text("VietOCR", marginX, cursorY);

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(new Date().toLocaleString("vi-VN"), 210 - marginX, cursorY, {
    align: "right",
  });

  cursorY += 8;

  let capturedEditor = false;
  const captureEditorPromise =
    editor && document.querySelector<HTMLElement>(".ProseMirror")
      ? (() => {
          const el = document.querySelector(".ProseMirror") as HTMLElement;
          const h = Math.max(el.scrollHeight, el.clientHeight);
          return html2canvas(el, {
            scale: window.devicePixelRatio || 2,
            backgroundColor: "#ffffff",
            height: h,
            windowHeight: h,
            scrollY: -window.scrollY,
            useCORS: true,
          }).then((canvas) => {
            const imgData = canvas.toDataURL("image/png");
            const pageWidth = 210 - marginX * 2;
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            if (cursorY + imgHeight > 287) {
              doc.addPage();
              cursorY = 20;
            }

            doc.addImage(
              imgData,
              "PNG",
              marginX,
              cursorY,
              imgWidth,
              imgHeight,
            );
            cursorY += imgHeight + 4;
            capturedEditor = true;
          });
        })()
      : Promise.resolve();

  const addImagePromise =
    imageUrl && imageUrl.startsWith("data:")
      ? new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const maxWidth = 210 - marginX * 2;
            const maxHeight = 80;
            let w = img.width;
            let h = img.height;
            const ratio = Math.min(maxWidth / w, maxHeight / h);
            w *= ratio;
            h *= ratio;
            if (cursorY + h > 287) {
              doc.addPage();
              cursorY = 20;
            }
            doc.addImage(img, "PNG", marginX, cursorY, w, h);
            cursorY += h + 6;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = imageUrl;
        })
      : Promise.resolve();

  await Promise.all([captureEditorPromise, addImagePromise]);

  if (!capturedEditor) {
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(text || "", 210 - marginX * 2);

    for (const line of lines) {
      if (cursorY > 287) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(line as string, marginX, cursorY);
      cursorY += 5;
    }
  }

  const safeName = (title || "vietocr").replace(/[/\\?%*:|"<>]/g, "-");
  doc.save(`${safeName}.pdf`);
}
