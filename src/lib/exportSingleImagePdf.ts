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
  sourceImageName?: string;
}

/**
 * PDF kết quả 1 ảnh: chụp ProseMirror editor content nếu có,
 * kèm ảnh gốc, fallback text thuần.
 */
export async function exportSingleImageOcrPdf({
  editor,
  activeTab,
  jsonText,
  markdownText,
  imageUrl,
  sourceImageName,
}: ExportSingleImagePdfParams): Promise<void> {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    putOnlyUsedFonts: true,
  });

  const marginX = 15;
  let cursorY = 20;
  const pageW = 210 - marginX * 2;

  // Header
  doc.setFontSize(14);
  doc.setTextColor(137, 25, 28);
  doc.text("MonkeyOCR", marginX, cursorY);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(new Date().toLocaleString("vi-VN"), 210 - marginX, cursorY, {
    align: "right",
  });
  cursorY += 8;

  // Try to capture the original image
  if (imageUrl && imageUrl.startsWith("data:")) {
    try {
      const img = await loadImage(imageUrl);
      const maxHeight = 80;
      let w = img.width;
      let h = img.height;
      const ratio = Math.min(pageW / w, maxHeight / h);
      w *= ratio;
      h *= ratio;
      if (cursorY + h > 287) {
        doc.addPage();
        cursorY = 20;
      }
      doc.addImage(img, "PNG", marginX, cursorY, w, h);
      cursorY += h + 6;
    } catch {
      // skip image if fails
    }
  }

  // Capture editor content via html2canvas
  let capturedEditor = false;
  const proseMirrorEl = document.querySelector<HTMLElement>(".ProseMirror");
  if (editor && proseMirrorEl && activeTab !== "json") {
    try {
      const h = Math.max(proseMirrorEl.scrollHeight, proseMirrorEl.clientHeight);
      const canvas = await html2canvas(proseMirrorEl, {
        scale: 2,
        backgroundColor: "#ffffff",
        height: h,
        windowHeight: h,
        scrollY: -window.scrollY,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = pageW;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // May need multiple pages
      let remaining = imgHeight;
      let srcY = 0;
      while (remaining > 0) {
        const available = 287 - cursorY;
        const sliceH = Math.min(remaining, available);
        
        if (sliceH < 10 && remaining > 10) {
          doc.addPage();
          cursorY = 20;
          continue;
        }

        doc.addImage(
          imgData,
          "PNG",
          marginX,
          cursorY,
          imgWidth,
          imgHeight,
          undefined,
          undefined,
        );
        cursorY += sliceH + 4;
        remaining -= sliceH;
        srcY += sliceH;
        
        if (remaining > 0) {
          doc.addPage();
          cursorY = 20;
        }
      }
      capturedEditor = true;
    } catch (e) {
      console.warn("html2canvas failed, falling back to text:", e);
    }
  }

  // Fallback: plain text
  if (!capturedEditor) {
    const text =
      activeTab === "json"
        ? jsonText
        : markdownText;
    if (text.trim()) {
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      const lines = doc.splitTextToSize(text.trim(), pageW);
      for (const line of lines) {
        if (cursorY > 287) {
          doc.addPage();
          cursorY = 20;
        }
        doc.text(line as string, marginX, cursorY);
        cursorY += 5;
      }
    }
  }

  const safeName = (sourceImageName || "monkeyocr").replace(/[/\\?%*:|"<>]/g, "-");
  doc.save(`${safeName}.pdf`);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
