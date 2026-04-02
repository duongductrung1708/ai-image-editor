import { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
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
import { FontSize } from "@/lib/tiptapFontSize";
import { BboxParagraph } from "@/lib/tiptapBboxParagraph";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

const EDITOR_BODY_CLASS =
  "prose prose-sm max-w-none min-h-full text-foreground focus:outline-none font-body";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toEditorHtml(markdownText: string): string {
  const trimmed = markdownText.trim();
  if (!trimmed) return "";

  // Some OCR providers return literal "\n" instead of real newlines.
  const normalized = trimmed.includes("\\n")
    ? trimmed.replace(/\\n/g, "\n")
    : trimmed;

  if (normalized.startsWith("<")) {
    // OCR/providers may return HTML like `<p>line1\nline2</p>`.
    // HTML collapses newlines inside <p>, so convert '\n' -> '<br/>'.
    const htmlWithBreaks = normalized.replace(/\r?\n/g, "<br/>");

    // Some providers may put Markdown markers inside HTML paragraphs
    // (e.g. `<p>**bold**</p>`). TipTap won't interpret `**` unless we
    // convert it to real HTML tags first.
    const htmlWithInlineMarkdown = htmlWithBreaks
      .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([\s\S]+?)\*/g, "<em>$1</em>")
      .replace(/__([\s\S]+?)__/g, "<u>$1</u>");

    // Support mixed HTML + markdown blocks like:
    // `<p>...</p>\n\n### Heading`
    // Since we are in the HTML branch, Markdown parser won't run, so we convert headings manually.
    const htmlWithHeadings = htmlWithInlineMarkdown.replace(
      /^\s*(#{1,6})\s+(.+?)\s*$/gm,
      (_m, hashes: string, title: string) => {
        const level = Math.min(6, Math.max(1, hashes.length));
        return `<h${level}>${escapeHtml(title)}</h${level}>`;
      },
    );

    // Support legacy HTML color tags too: `<font color="red">...</font>` -> `<span style="color:red">...</span>`
    const htmlWithFontColors = htmlWithHeadings.replace(
      /<font\s+color=["']?([^"'>\s]+)["']?\s*>([\s\S]*?)<\/font>/gi,
      (_m, color: string, inner: string) =>
        `<span style="color:${color}">${inner}</span>`,
    );

    return DOMPurify.sanitize(htmlWithFontColors, {
      ADD_ATTR: [
        "data-bbox-id",
        "data-bbox-kind",
        "class",
        "src",
        "alt",
        "style",
      ],
      ADD_TAGS: [
        "img",
        "p",
        "br",
        "span",
        "font",
        "figure",
        "strong",
        "em",
        "u",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ],
    });
  }

  try {
    const html = marked.parse(normalized);
    if (typeof html === "string" && html.trim().length > 0) {
      return html;
    }
  } catch {
    // Fallback below
  }

  // Guaranteed renderable fallback: keep text exactly as plain content.
  return `<p>${escapeHtml(normalized).replace(/\n/g, "<br/>")}</p>`;
}

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
        paragraph: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      BboxParagraph,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: { class: "max-w-full rounded-md" },
      }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
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
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: EDITOR_BODY_CLASS,
      },
    },
  });

  // Track the last markdown we pushed into the editor to avoid redundant updates
  const lastSetRef = useRef("");

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const trimmed = markdownText.trim();

    // Skip if content hasn't actually changed
    if (trimmed === lastSetRef.current) return;
    lastSetRef.current = trimmed;

    const nextHtml = toEditorHtml(trimmed);

    // Use queueMicrotask to ensure editor is fully ready
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      editor.commands.setContent(nextHtml || "");
    });
  }, [editor, markdownText]);

  return { editor, turndown };
}
