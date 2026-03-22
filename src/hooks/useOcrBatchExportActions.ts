import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import type TurndownService from "turndown";
import { downloadMarkdownAsDocx } from "@/lib/exportBatchDocx";
import { downloadTextFile } from "@/lib/downloadTextFile";
import { exportBatchPlainPdf } from "@/lib/exportBatchPlainPdf";
import type { OcrMarkdownJsonTab } from "@/lib/ocrResultContent";
import {
  getMarkdownForDocxExport,
  getOcrCopyText,
  getPlainTextForBatchPdf,
} from "@/lib/ocrResultContent";

export function useOcrBatchExportActions(params: {
  activeTab: OcrMarkdownJsonTab;
  editor: Editor | null;
  turndown: TurndownService;
  markdownText: string;
  jsonText: string;
}) {
  const { activeTab, editor, turndown, markdownText, jsonText } = params;
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(
      getOcrCopyText(activeTab, editor, turndown, markdownText, jsonText),
    );
    setCopied(true);
    toast.success("Đã sao chép!");
    setTimeout(() => setCopied(false), 2000);
  }, [activeTab, editor, jsonText, markdownText, turndown]);

  const downloadMarkdown = useCallback(() => {
    const content = getOcrCopyText(
      activeTab,
      editor,
      turndown,
      markdownText,
      jsonText,
    );
    downloadTextFile(content, "ocr-batch.md", "text/markdown;charset=utf-8");
    toast.success("Đã tải Markdown.");
  }, [activeTab, editor, jsonText, markdownText, turndown]);

  const downloadJson = useCallback(() => {
    downloadTextFile(
      jsonText,
      "ocr-batch.json",
      "application/json;charset=utf-8",
    );
    toast.success("Đã tải JSON.");
  }, [jsonText]);

  const downloadDocx = useCallback(async () => {
    const md = getMarkdownForDocxExport(
      activeTab,
      editor,
      turndown,
      markdownText,
      jsonText,
    );
    if (!md.trim()) {
      toast.error("Chưa có nội dung để xuất Word.");
      return;
    }
    try {
      await downloadMarkdownAsDocx(md, "ocr-batch.docx");
      toast.success("Đã tải Word (.docx).");
    } catch (err) {
      console.error(err);
      toast.error("Không thể tạo file Word.");
    }
  }, [activeTab, editor, jsonText, markdownText, turndown]);

  const exportPdf = useCallback(() => {
    const text = getPlainTextForBatchPdf(
      activeTab,
      editor,
      turndown,
      markdownText,
      jsonText,
    ).trim();
    if (!text) {
      toast.error("Chưa có nội dung để xuất PDF.");
      return;
    }
    exportBatchPlainPdf({
      text,
      headerTitle: "VietOCR · Hàng loạt",
      fileName: "ocr-batch.pdf",
    });
    toast.success("Đã xuất PDF.");
  }, [activeTab, editor, jsonText, markdownText, turndown]);

  return {
    copied,
    copy,
    downloadMarkdown,
    downloadJson,
    downloadDocx,
    exportPdf,
  };
}
