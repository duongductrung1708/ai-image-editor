import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import type TurndownService from "turndown";
import { downloadTextFile } from "@/lib/downloadTextFile";
import { exportSingleImageOcrPdf } from "@/lib/exportSingleImagePdf";
import { downloadSingleMarkdownAsDocx } from "@/lib/exportSingleDocx";
import {
  getMarkdownFromEditorOrFallback,
  getMarkdownForDocxExport,
  getPlainTextForSinglePdf,
  getSingleImageCopyText,
} from "@/lib/ocrResultContent";

export function useSingleImageExportActions(params: {
  activeTab: "markdown" | "json" | "tables";
  editor: Editor | null;
  turndown: TurndownService;
  markdownText: string;
  jsonText: string;
  imageUrl: string;
  sourceImageName?: string;
}) {
  const {
    activeTab,
    editor,
    turndown,
    markdownText,
    jsonText,
    imageUrl,
    sourceImageName,
  } = params;
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    const toCopy = getSingleImageCopyText(
      activeTab,
      editor,
      turndown,
      markdownText,
      jsonText,
    );
    navigator.clipboard.writeText(toCopy);
    setCopied(true);
    toast.success("Đã sao chép văn bản!");
    setTimeout(() => setCopied(false), 2000);
  }, [activeTab, editor, jsonText, markdownText, turndown]);

  const download = useCallback(
    (format: "markdown" | "json") => {
      const isJson = format === "json";
      const content = isJson
        ? jsonText
        : getMarkdownFromEditorOrFallback(editor, turndown, markdownText);
      downloadTextFile(
        content,
        isJson ? "ocr-result.json" : "ocr-result.md",
        isJson
          ? "application/json;charset=utf-8"
          : "text/markdown;charset=utf-8",
      );
      toast.success("Đã tải xuống file văn bản!");
    },
    [editor, jsonText, markdownText, turndown],
  );

  const exportPdf = useCallback(() => {
    const text = getPlainTextForSinglePdf(
      activeTab,
      editor,
      turndown,
      markdownText,
      jsonText,
    ).trim();
    if (!text && !imageUrl) {
      toast.error("Chưa có nội dung để xuất PDF.");
      return;
    }
    void exportSingleImageOcrPdf({
      editor,
      turndown,
      activeTab,
      jsonText,
      markdownText,
      imageUrl,
      sourceImageName,
    })
      .then(() => toast.success("Đã xuất PDF và tải về máy."))
      .catch((err) => {
        console.error(err);
        toast.error("Không thể xuất PDF.");
      });
  }, [
    activeTab,
    editor,
    imageUrl,
    jsonText,
    markdownText,
    sourceImageName,
    turndown,
  ]);

  const downloadDocx = useCallback(async () => {
    const md = getMarkdownForDocxExport(
      activeTab === "tables" ? "markdown" : activeTab,
      editor,
      turndown,
      markdownText,
      jsonText,
    );
    if (!md.trim() && !editor) {
      toast.error("Chưa có nội dung để xuất Word.");
      return;
    }
    try {
      const editorHtml = editor ? editor.getHTML() : undefined;
      await downloadSingleMarkdownAsDocx(md, "ocr-result.docx", editorHtml);
      toast.success("Đã tải Word (.docx).");
    } catch (err) {
      console.error(err);
      toast.error("Không thể tạo file Word.");
    }
  }, [activeTab, editor, jsonText, markdownText, turndown]);

  return { copied, copy, download, exportPdf, downloadDocx };
}
