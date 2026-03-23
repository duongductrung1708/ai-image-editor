import { useEffect, useMemo } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { OcrTable } from "@/lib/tiptapOcrTable";

marked.setOptions({ gfm: true, breaks: true });

const EDITOR_BODY_CLASS =
  "prose prose-sm max-w-none min-h-full text-foreground focus:outline-none font-body";

/**
 * TipTap + Turndown dùng chung cho OCR Markdown (1 ảnh & batch).
 */
export function useOcrMarkdownEditor(markdownText: string) {
  const turndown = useMemo(() => {
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    td.use(gfm);
    return td;
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      OcrTable.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: markdownText ? (marked.parse(markdownText) as string) : "",
    editorProps: {
      attributes: {
        class: EDITOR_BODY_CLASS,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextHtml = markdownText
      ? (marked.parse(markdownText) as string)
      : "";
    editor.commands.setContent(nextHtml || "");
  }, [editor, markdownText]);

  return { editor, turndown };
}
