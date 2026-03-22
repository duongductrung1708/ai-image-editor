import { useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Grid3x3,
  Heading2,
  Highlighter,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Underline,
  Bold,
  Italic,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoundingBox } from "@/components/ImageViewer";
import { findMatchingBoxIndices } from "@/lib/bboxTextMatch";

export type BatchMarkdownHighlight = {
  pageIndex: number;
  indices: number[];
};

interface MarkdownEditorProps {
  editor: Editor | null;
  isProcessing: boolean;
  boundingBoxes?: BoundingBox[];
  onMarkdownHighlightChange?: (indices: number[] | null) => void;
  /** OCR hàng loạt: bbox theo từng trang (trùng thứ tự section ## trong markdown gộp). */
  batchBoxPages?: BoundingBox[][];
  onBatchMarkdownHighlightChange?: (
    payload: BatchMarkdownHighlight | null,
  ) => void;
}

/** Nearest block node text at doc position (paragraph, heading, list item, cell…). */
function getBlockTextAtDocPos(editor: Editor, pos: number): string {
  const { doc } = editor.state;
  if (pos < 0 || pos > doc.content.size) return "";
  const $pos = doc.resolve(pos);
  for (let d = $pos.depth; d >= 1; d -= 1) {
    const node = $pos.node(d);
    if (node.isBlock) {
      const t = node.textContent.trim();
      if (t) return t;
    }
  }
  return "";
}

/** Trang batch ứng với cursor: đếm heading cấp 2 trước vị trí (theo merge markdown server). */
function getBatchMarkdownPageIndex(editor: Editor, pos: number): number {
  const { doc } = editor.state;
  const end = Math.min(pos, doc.content.size);
  let h2Before = 0;
  doc.nodesBetween(0, end, (node, pos2) => {
    if (node.type.name === "heading" && node.attrs.level === 2 && pos2 < pos) {
      h2Before += 1;
    }
    return true;
  });
  return Math.max(0, h2Before - 1);
}

const MarkdownEditor = ({
  editor,
  isProcessing,
  boundingBoxes = [],
  onMarkdownHighlightChange,
  batchBoxPages,
  onBatchMarkdownHighlightChange,
}: MarkdownEditorProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const clearHighlight = useCallback(() => {
    onMarkdownHighlightChange?.(null);
  }, [onMarkdownHighlightChange]);

  const clearBatchHighlight = useCallback(() => {
    onBatchMarkdownHighlightChange?.(null);
  }, [onBatchMarkdownHighlightChange]);

  const useBatchHover = Boolean(
    batchBoxPages && batchBoxPages.length > 0 && onBatchMarkdownHighlightChange,
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !editor || isProcessing) {
      clearHighlight();
      clearBatchHighlight();
      return;
    }

    if (useBatchHover) {
      clearHighlight();
    } else {
      clearBatchHighlight();
    }

    if (useBatchHover) {
      let raf = 0;

      const onMove = (e: MouseEvent) => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = 0;
          const view = editor.view;
          const coords = view.posAtCoords({
            left: e.clientX,
            top: e.clientY,
          });
          if (!coords) return;
          const pageIdx = getBatchMarkdownPageIndex(editor, coords.pos);
          const pageBoxes = batchBoxPages![pageIdx] ?? [];
          if (pageBoxes.length === 0) return;
          const blockText = getBlockTextAtDocPos(editor, coords.pos);
          if (!blockText) return;
          const indices = findMatchingBoxIndices(blockText, pageBoxes);
          if (indices.length === 0) return;
          onBatchMarkdownHighlightChange?.({ pageIndex: pageIdx, indices });
        });
      };

      const onLeave = () => clearBatchHighlight();

      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      return () => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
        if (raf) cancelAnimationFrame(raf);
        clearBatchHighlight();
      };
    }

    if (boundingBoxes.length === 0) {
      clearHighlight();
      return;
    }

    let raf = 0;

    const onMove = (e: MouseEvent) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const view = editor.view;
        const coords = view.posAtCoords({
          left: e.clientX,
          top: e.clientY,
        });
        if (!coords) return;
        const blockText = getBlockTextAtDocPos(editor, coords.pos);
        if (!blockText) return;
        const indices = findMatchingBoxIndices(blockText, boundingBoxes);
        if (indices.length === 0) return;
        onMarkdownHighlightChange?.(indices);
      });
    };

    const onLeave = () => clearHighlight();

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      clearHighlight();
    };
  }, [
    editor,
    isProcessing,
    boundingBoxes,
    onMarkdownHighlightChange,
    clearHighlight,
    useBatchHover,
    batchBoxPages,
    onBatchMarkdownHighlightChange,
    clearBatchHighlight,
  ]);
  if (isProcessing && !editor) {
    return (
      <div className="h-full w-full p-4 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-9/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="mr-1 text-[11px] font-medium">Định dạng nhanh:</span>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={isProcessing || !editor}
          aria-label="Đậm"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={isProcessing || !editor}
          aria-label="Nghiêng"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          disabled={isProcessing || !editor}
          aria-label="Tiêu đề"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={isProcessing || !editor}
          aria-label="Gạch chân"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
          disabled={isProcessing || !editor}
          aria-label="Highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={isProcessing || !editor}
          aria-label="Danh sách"
        >
          <List className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={isProcessing || !editor}
          aria-label="Danh sách đánh số"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={isProcessing || !editor}
          aria-label="Trích dẫn"
        >
          <Quote className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="ml-2 flex h-7 items-center justify-center rounded border border-transparent px-2 hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
          disabled={isProcessing || !editor}
          aria-label="Checklist"
        >
          <ListTodo className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn trái"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn giữa"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn phải"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn đều"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <button
          type="button"
          className="flex h-7 items-center justify-center rounded border border-transparent px-2 hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().mergeCells().run()}
          disabled={isProcessing || !editor}
          aria-label="Gộp ô bảng"
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          <span className="ml-1 text-[10px]">Merge</span>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto bg-card px-4 py-3">
        {editor ? (
          <EditorContent editor={editor} className="h-full" />
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </div>
        )}
      </div>
    </div>
  );
};

export default MarkdownEditor;
