import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import {
  AlignCenter,
  AlignHorizontalSpaceBetween,
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
  Type,
  Eraser,
  CaseLower,
  CaseUpper,
  ChevronDown,
  Table2,
  TableColumnsSplit,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BoundingBox } from "@/components/ImageViewer";
import { findMatchingBoxIndices } from "@/lib/bboxTextMatch";
import {
  findFirstDocPosForBatchBox,
  findFirstDocPosForBoxIndex,
} from "@/lib/ocrEditorScrollToBox";

export type JumpToBoxRequest =
  | { kind: "single"; boxIndex: number; nonce: number }
  | { kind: "batch"; pageIndex: number; boxIndex: number; nonce: number };

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
  /** Bấm bbox trên ảnh → cuộn tới đoạn tương ứng trong editor. */
  jumpToBox?: JumpToBoxRequest | null;
  onJumpToBoxHandled?: () => void;
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

const TABLE_DIM_MIN = 1;
const TABLE_DIM_MAX = 20;

function clampTableDimension(n: number): number {
  if (!Number.isFinite(n)) return TABLE_DIM_MIN;
  return Math.min(TABLE_DIM_MAX, Math.max(TABLE_DIM_MIN, Math.round(n)));
}

const MarkdownEditor = ({
  editor,
  isProcessing,
  boundingBoxes = [],
  onMarkdownHighlightChange,
  batchBoxPages,
  onBatchMarkdownHighlightChange,
  jumpToBox = null,
  onJumpToBoxHandled,
}: MarkdownEditorProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fontColor, setFontColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#fff59d");
  const [fontSize, setFontSize] = useState("16px");
  const [fontFamily, setFontFamily] = useState("default");
  const [canMergeCells, setCanMergeCells] = useState(false);
  const [canSplitCell, setCanSplitCell] = useState(false);
  const [tableInsertOpen, setTableInsertOpen] = useState(false);
  const [insertTableRows, setInsertTableRows] = useState(3);
  const [insertTableCols, setInsertTableCols] = useState(3);
  const [insertTableHeaderRow, setInsertTableHeaderRow] = useState(true);
  const [toolbarTick, setToolbarTick] = useState(0);

  const toolbarButtonClass = (active: boolean, wide = false) => {
    const base = wide
      ? "flex h-7 items-center justify-center rounded border px-2 text-[11px]"
      : "flex h-7 w-7 items-center justify-center rounded border";
    return active
      ? `${base} border-primary/35 bg-primary/10 text-foreground`
      : `${base} border-transparent hover:border-border hover:bg-muted/60`;
  };

  const insertTableWithOptions = useCallback(() => {
    if (!editor) return;
    const rows = clampTableDimension(insertTableRows);
    const cols = clampTableDimension(insertTableCols);
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: insertTableHeaderRow })
      .run();
    setTableInsertOpen(false);
  }, [editor, insertTableRows, insertTableCols, insertTableHeaderRow]);

  useEffect(() => {
    if (!editor) {
      setCanMergeCells(false);
      setCanSplitCell(false);
      return;
    }
    const sync = () => {
      setCanMergeCells(editor.can().mergeCells());
      setCanSplitCell(editor.can().splitCell());
      setToolbarTick((t) => (t + 1) % 1000000);
    };
    sync();
    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("transaction", sync);
    };
  }, [editor]);

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

    // Batch mode: debounce update to avoid highlight flicker when pageIndex changes
    // due to tiny mouse-position jitter near section boundaries.
    // Keep it small so the highlight still appears immediately when hovering.
    const HIGHLIGHT_UPDATE_DEBOUNCE_MS = 70;

    if (useBatchHover) {
      let raf = 0;
      let highlightUpdateTimer: ReturnType<typeof setTimeout> | null = null;

      const scheduleBatchHighlightUpdate = (
        payload: BatchMarkdownHighlight,
      ) => {
        if (highlightUpdateTimer) clearTimeout(highlightUpdateTimer);
        highlightUpdateTimer = setTimeout(() => {
          highlightUpdateTimer = null;
          onBatchMarkdownHighlightChange?.(payload);
        }, HIGHLIGHT_UPDATE_DEBOUNCE_MS);
      };

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
          scheduleBatchHighlightUpdate({ pageIndex: pageIdx, indices });
        });
      };

      const onLeave = () => {
        if (highlightUpdateTimer) clearTimeout(highlightUpdateTimer);
        highlightUpdateTimer = null;
        clearBatchHighlight();
      };

      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      return () => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
        if (raf) cancelAnimationFrame(raf);
        if (highlightUpdateTimer) clearTimeout(highlightUpdateTimer);
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

  useEffect(() => {
    if (!editor || !jumpToBox || isProcessing) return;

    let pos: number | null = null;
    if (jumpToBox.kind === "single") {
      if (boundingBoxes.length === 0) {
        onJumpToBoxHandled?.();
        return;
      }
      pos = findFirstDocPosForBoxIndex(
        editor,
        jumpToBox.boxIndex,
        boundingBoxes,
      );
    } else {
      if (!batchBoxPages?.length) {
        onJumpToBoxHandled?.();
        return;
      }
      pos = findFirstDocPosForBatchBox(
        editor,
        jumpToBox.pageIndex,
        jumpToBox.boxIndex,
        batchBoxPages,
      );
    }

    if (pos == null) {
      onJumpToBoxHandled?.();
      return;
    }

    editor.chain().focus().setTextSelection(pos).run();

    requestAnimationFrame(() => {
      const container = scrollRef.current;
      const view = editor.view;
      const dom = view.domAtPos(pos);
      const el =
        dom.node.nodeType === Node.ELEMENT_NODE
          ? (dom.node as HTMLElement)
          : (dom.node.parentElement as HTMLElement | null);

      // IMPORTANT: Do not use `el.scrollIntoView()` here.
      // It may scroll the whole window instead of the editor container.
      if (container && el) {
        const contRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const currentTop = container.scrollTop;
        const delta = elRect.top - contRect.top;
        const targetTop =
          currentTop + delta - contRect.height / 2 + elRect.height / 2;
        container.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
      }
      onJumpToBoxHandled?.();
    });
  }, [
    jumpToBox,
    editor,
    isProcessing,
    boundingBoxes,
    batchBoxPages,
    onJumpToBoxHandled,
  ]);

  useEffect(() => {
    if (!editor) return;

    const normalizeHex = (input?: string | null): string | null => {
      if (!input) return null;
      const value = input.trim().toLowerCase();
      const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
      if (shortHex) {
        const [r, g, b] = shortHex[1].split("");
        return `#${r}${r}${g}${g}${b}${b}`;
      }
      const fullHex = /^#([0-9a-f]{6})$/i.exec(value);
      if (fullHex) return `#${fullHex[1]}`;
      const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(value);
      if (rgb) {
        const toHex = (v: string) =>
          Math.max(0, Math.min(255, Number(v)))
            .toString(16)
            .padStart(2, "0");
        return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
      }
      return null;
    };

    const syncFormatState = () => {
      const attrs = editor.getAttributes("textStyle");
      const markAttrs = editor.getAttributes("highlight") as {
        color?: string;
      };

      const nextFontColor = normalizeHex(attrs.color);
      if (nextFontColor) setFontColor(nextFontColor);
      else setFontColor("#000000");

      const nextHighlightColor = normalizeHex(markAttrs.color);
      if (nextHighlightColor) setHighlightColor(nextHighlightColor);
      else setHighlightColor("#fff59d");

      if (typeof attrs.fontSize === "string" && attrs.fontSize) {
        setFontSize(attrs.fontSize);
      } else {
        setFontSize("16px");
      }

      const ff =
        typeof attrs.fontFamily === "string" && attrs.fontFamily
          ? attrs.fontFamily
          : null;
      if (ff) setFontFamily(ff);
      else setFontFamily("default");
    };

    syncFormatState();
    editor.on("selectionUpdate", syncFormatState);
    editor.on("transaction", syncFormatState);
    return () => {
      editor.off("selectionUpdate", syncFormatState);
      editor.off("transaction", syncFormatState);
    };
  }, [editor]);

  const applyFontSize = useCallback(
    (size: string) => {
      if (!editor) return;
      setFontSize(size);
      if (size === "16px") {
        editor.chain().focus().setMark("textStyle", { fontSize: null }).run();
        return;
      }
      editor.chain().focus().setMark("textStyle", { fontSize: size }).run();
    },
    [editor],
  );

  const applyFontFamily = useCallback(
    (family: string) => {
      if (!editor) return;
      setFontFamily(family);
      if (!family || family === "default") {
        editor.chain().focus().setFontFamily(null).run();
        return;
      }
      editor.chain().focus().setFontFamily(family).run();
    },
    [editor],
  );

  const applyFontColor = useCallback(
    (color: string) => {
      if (!editor) return;
      setFontColor(color);
      editor.chain().focus().setColor(color).run();
    },
    [editor],
  );

  const applyHighlightColor = useCallback(
    (color: string) => {
      if (!editor) return;
      setHighlightColor(color);
      editor.chain().focus().setHighlight({ color }).run();
    },
    [editor],
  );

  const clearQuickFormatting = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .setMark("textStyle", { color: null, fontSize: null, fontFamily: null })
      .setFontFamily(null)
      .unsetHighlight()
      .run();
    setFontSize("16px");
    setFontFamily("default");
    setFontColor("#000000");
    setHighlightColor("#fff59d");
  }, [editor]);

  const transformSelectedTextCase = useCallback(
    (mode: "upper" | "lower") => {
      if (!editor) return;
      const { state } = editor;
      const { from, to, empty } = state.selection;
      if (empty) return;

      const segments: Array<{
        from: number;
        to: number;
        text: string;
        marks: Parameters<typeof state.schema.text>[1];
      }> = [];

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText || !node.text) return;
        const start = Math.max(from, pos);
        const end = Math.min(to, pos + node.nodeSize);
        if (end <= start) return;
        const sliceFrom = start - pos;
        const sliceTo = end - pos;
        const original = node.text.slice(sliceFrom, sliceTo);
        if (!original) return;
        const transformed =
          mode === "upper"
            ? original.toLocaleUpperCase()
            : original.toLocaleLowerCase();
        if (transformed === original) return;
        segments.push({
          from: start,
          to: end,
          text: transformed,
          marks: node.marks,
        });
      });

      if (segments.length === 0) return;

      const tr = state.tr;
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        const seg = segments[i];
        tr.replaceWith(
          seg.from,
          seg.to,
          state.schema.text(seg.text, seg.marks),
        );
      }
      editor.view.dispatch(tr);
      editor.view.focus();
    },
    [editor],
  );

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
          className={toolbarButtonClass(Boolean(editor?.isActive("bold")))}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={isProcessing || !editor}
          aria-label="Đậm"
          title="Đậm"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive("italic")))}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={isProcessing || !editor}
          aria-label="Nghiêng"
          title="Nghiêng"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive("heading", { level: 2 })))}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          disabled={isProcessing || !editor}
          aria-label="Tiêu đề"
          title="Tiêu đề"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive("underline")))}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={isProcessing || !editor}
          aria-label="Gạch chân"
          title="Gạch chân"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive("highlight")))}
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
          disabled={isProcessing || !editor}
          aria-label="Highlight"
          title="Tô nền"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive("bulletList")))}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={isProcessing || !editor}
          aria-label="Danh sách"
          title="Danh sách"
        >
          <List className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive("orderedList")))}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={isProcessing || !editor}
          aria-label="Danh sách đánh số"
          title="Danh sách đánh số"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive("blockquote")))}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={isProcessing || !editor}
          aria-label="Trích dẫn"
          title="Trích dẫn"
        >
          <Quote className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={`ml-2 ${toolbarButtonClass(Boolean(editor?.isActive("taskList")), true)}`}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
          disabled={isProcessing || !editor}
          aria-label="Checklist"
          title="Danh sách công việc"
        >
          <ListTodo className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <label className="flex h-7 items-center gap-1 rounded border border-transparent px-1 text-[11px] text-muted-foreground">
          <Type className="h-3.5 w-3.5" />
          <select
            className="h-6 rounded border border-border bg-background px-1.5 text-[11px] text-foreground"
            value={fontFamily}
            onChange={(e) => applyFontFamily(e.target.value)}
            disabled={isProcessing || !editor}
            aria-label="Font chữ"
            title="Font chữ"
          >
            <option value="default">Mặc định</option>
            <option value="Inter">Inter</option>
            <option value="Be Vietnam Pro">Be Vietnam Pro</option>
            <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
          </select>
          <select
            className="h-6 rounded border border-border bg-background px-1.5 text-[11px] text-foreground"
            value={fontSize}
            onChange={(e) => applyFontSize(e.target.value)}
            disabled={isProcessing || !editor}
            aria-label="Cỡ chữ"
            title="Cỡ chữ"
          >
            <option value="12px">12</option>
            <option value="14px">14</option>
            <option value="16px">16</option>
            <option value="18px">18</option>
            <option value="20px">20</option>
            <option value="24px">24</option>
            <option value="28px">28</option>
            <option value="32px">32</option>
          </select>
        </label>

        <label
          className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          title="Màu chữ"
          aria-label="Màu chữ"
        >
          <Type className="h-3.5 w-3.5" />
          <span
            className="pointer-events-none absolute bottom-1 h-[2px] w-4 rounded"
            style={{ backgroundColor: fontColor }}
          />
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={fontColor}
            onChange={(e) => applyFontColor(e.target.value)}
            disabled={isProcessing || !editor}
            aria-label="Màu chữ"
          />
        </label>

        <label
          className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          title="Màu tô nền"
          aria-label="Màu highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
          <span
            className="pointer-events-none absolute bottom-1 h-[2px] w-4 rounded"
            style={{ backgroundColor: highlightColor }}
          />
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={highlightColor}
            onChange={(e) => applyHighlightColor(e.target.value)}
            disabled={isProcessing || !editor}
            aria-label="Màu highlight"
          />
        </label>

        <button
          type="button"
          className="flex h-7 items-center justify-center rounded border border-transparent px-2 text-[11px] hover:border-border hover:bg-muted/60"
          onClick={clearQuickFormatting}
          disabled={isProcessing || !editor}
          aria-label="Xóa nhanh size màu highlight"
          title="Xóa nhanh cỡ chữ, màu chữ, tô nền"
        >
          <Eraser className="h-3.5 w-3.5" />
          <span className="ml-1">Clear</span>
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => transformSelectedTextCase("upper")}
          disabled={isProcessing || !editor}
          aria-label="Chuyển in hoa"
          title="Chuyển thành chữ in hoa"
        >
          <CaseUpper className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => transformSelectedTextCase("lower")}
          disabled={isProcessing || !editor}
          aria-label="Chuyển in thường"
          title="Chuyển thành chữ in thường"
        >
          <CaseLower className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 items-center justify-center rounded border border-transparent px-1.5 hover:border-border hover:bg-muted/60"
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 1, cols: 2, withHeaderRow: false })
              .updateAttributes("table", { dataLayout: "split" })
              .run()
          }
          disabled={isProcessing || !editor}
          title="Một dòng trái — phải (giống space-between trong Word)"
          aria-label="Chèn dòng trái phải"
        >
          <AlignHorizontalSpaceBetween className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive({ textAlign: "left" })))}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn trái"
          title="Căn trái"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive({ textAlign: "center" })))}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn giữa"
          title="Căn giữa"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive({ textAlign: "right" })))}
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn phải"
          title="Căn phải"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className={toolbarButtonClass(Boolean(editor?.isActive({ textAlign: "justify" })))}
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn đều"
          title="Căn đều hai bên"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <Popover open={tableInsertOpen} onOpenChange={setTableInsertOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-7 items-center justify-center rounded border border-transparent px-2 hover:border-border hover:bg-muted/60"
              disabled={isProcessing || !editor}
              aria-label="Chèn bảng"
              title="Chọn số dòng, cột rồi chèn bảng"
            >
              <Table2 className="h-3.5 w-3.5" />
              <span className="ml-1 text-[10px]">Tạo bảng</span>
              <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-[240px] p-3">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                insertTableWithOptions();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="insert-table-rows" className="text-xs">
                    Số dòng
                  </Label>
                  <Input
                    id="insert-table-rows"
                    type="number"
                    min={TABLE_DIM_MIN}
                    max={TABLE_DIM_MAX}
                    className="h-8"
                    value={insertTableRows}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setInsertTableRows(
                        Number.isFinite(v)
                          ? clampTableDimension(v)
                          : TABLE_DIM_MIN,
                      );
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="insert-table-cols" className="text-xs">
                    Số cột
                  </Label>
                  <Input
                    id="insert-table-cols"
                    type="number"
                    min={TABLE_DIM_MIN}
                    max={TABLE_DIM_MAX}
                    className="h-8"
                    value={insertTableCols}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setInsertTableCols(
                        Number.isFinite(v)
                          ? clampTableDimension(v)
                          : TABLE_DIM_MIN,
                      );
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="insert-table-header"
                  checked={insertTableHeaderRow}
                  onCheckedChange={(c) => setInsertTableHeaderRow(c === true)}
                />
                <Label
                  htmlFor="insert-table-header"
                  className="cursor-pointer text-xs font-normal"
                >
                  Dòng tiêu đề
                </Label>
              </div>
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={!editor}
              >
                Chèn bảng
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          className={
            canMergeCells
              ? "flex h-7 items-center justify-center rounded border border-primary/35 bg-primary/5 px-2 hover:border-border hover:bg-muted/60"
              : "flex h-7 items-center justify-center rounded border border-transparent px-2 hover:border-border hover:bg-muted/60"
          }
          onClick={() => editor?.chain().focus().mergeCells().run()}
          disabled={isProcessing || !editor}
          aria-label="Gộp ô bảng"
          title={
            canMergeCells
              ? "Gộp các ô đang chọn"
              : "Kéo chọn nhiều ô trong bảng, rồi bấm Merge"
          }
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          <span className="ml-1 text-[10px]">Gộp ô</span>
        </button>

        <button
          type="button"
          className={
            canSplitCell
              ? "flex h-7 items-center justify-center rounded border border-primary/35 bg-primary/5 px-2 hover:border-border hover:bg-muted/60"
              : "flex h-7 items-center justify-center rounded border border-transparent px-2 hover:border-border hover:bg-muted/60"
          }
          onClick={() => editor?.chain().focus().splitCell().run()}
          disabled={isProcessing || !editor}
          aria-label="Tách ô bảng"
          title={
            canSplitCell
              ? "Tách ô đang chọn (ô đã gộp hoặc có colspan/rowspan)"
              : "Đặt con trỏ trong ô đã gộp, rồi bấm Tách ô"
          }
        >
          <TableColumnsSplit className="h-3.5 w-3.5" />
          <span className="ml-1 text-[10px]">Tách ô</span>
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
