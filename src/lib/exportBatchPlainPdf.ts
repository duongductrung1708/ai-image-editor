import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface ExportBatchPlainPdfOptions {
  /** Nội dung đã chuẩn hóa (markdown hoặc JSON string). */
  text: string;
  /** Dòng tiêu đề phụ (vd. "VietOCR · Hàng loạt"). */
  headerTitle: string;
  fileName: string;
}

export interface ExportBatchRichPdfOptions {
  headerTitle: string;
  fileName: string;
}

/** PDF chỉ chữ — dùng cho OCR batch. */
export function exportBatchPlainPdf({
  text,
  headerTitle,
  fileName,
}: ExportBatchPlainPdfOptions): void {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    putOnlyUsedFonts: true,
  });
  const marginX = 15;
  let cursorY = 20;
  const pageW = 210 - marginX * 2;

  doc.setFontSize(14);
  doc.setTextColor(137, 25, 28);
  doc.text(headerTitle, marginX, cursorY);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(new Date().toLocaleString("vi-VN"), 210 - marginX, cursorY, {
    align: "right",
  });
  cursorY += 10;
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
  doc.save(fileName);
}

/**
 * Rich PDF from editor: captures ProseMirror via html2canvas.
 * Falls back to plain text if capture fails.
 */
export async function exportBatchRichPdf({
  headerTitle,
  fileName,
}: ExportBatchRichPdfOptions): Promise<boolean> {
  const proseMirrorEl = document.querySelector<HTMLElement>(".ProseMirror");
  if (!proseMirrorEl) return false;

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

    const doc = new jsPDF({ unit: "mm", format: "a4", putOnlyUsedFonts: true });
    const marginX = 15;
    let cursorY = 20;
    const pageW = 210 - marginX * 2;

    doc.setFontSize(14);
    doc.setTextColor(137, 25, 28);
    doc.text(headerTitle, marginX, cursorY);
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(new Date().toLocaleString("vi-VN"), 210 - marginX, cursorY, {
      align: "right",
    });
    cursorY += 10;

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = pageW;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    doc.addImage(imgData, "PNG", marginX, cursorY, imgWidth, imgHeight);
    doc.save(fileName);
    return true;
  } catch (e) {
    console.warn("html2canvas batch PDF failed:", e);
    return false;
  }
}
