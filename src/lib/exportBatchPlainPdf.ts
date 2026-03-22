import jsPDF from "jspdf";

export interface ExportBatchPlainPdfOptions {
  /** Nội dung đã chuẩn hóa (markdown hoặc JSON string). */
  text: string;
  /** Dòng tiêu đề phụ (vd. "VietOCR · Hàng loạt"). */
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
  const lines = doc.splitTextToSize(text.trim(), 210 - marginX * 2);
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
