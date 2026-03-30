import type { Editor } from "@tiptap/core";
import {
  findMatchingBoxIndices,
  textSimilarityNormalized,
  type BoxPercent,
} from "@/lib/bboxTextMatch";
import type { BoundingBox } from "@/components/ImageViewer";

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

function clampDocPos(pos: number, editor: Editor): number {
  const max = editor.state.doc.content.size;
  return Math.min(Math.max(pos, 0), max);
}

/**
 * Khi editor dùng HTML từ `buildOcrHtmlFromBlocks`, mỗi đoạn có `data-bbox-id`.
 */
export function findFirstDocPosForBboxId(
  editor: Editor,
  bboxId: string,
): number | null {
  if (!bboxId) return null;
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (
      node.type.name === "paragraph" &&
      (node.attrs as { dataBboxId?: string }).dataBboxId === bboxId
    ) {
      found = clampDocPos(pos + 1, editor);
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Tìm block đầu tiên trong doc mà khớp bbox index (cùng logic hover Markdown → ảnh).
 * Fallback: block có độ tương đồng cao nhất với text của bbox đó.
 */
export function findFirstDocPosForBoxIndex(
  editor: Editor,
  boxIndex: number,
  boxes: readonly BoxPercent[],
): number | null {
  if (boxIndex < 0 || boxIndex >= boxes.length) return null;
  const withId = boxes[boxIndex] as BoundingBox;
  if (withId?.id) {
    const byId = findFirstDocPosForBboxId(editor, withId.id);
    if (byId !== null) return byId;
  }
  const { doc } = editor.state;
  const targetBox = boxes[boxIndex];
  let foundPos: number | null = null;

  doc.descendants((node, pos) => {
    if (foundPos !== null) return false;
    if (!node.isBlock) return true;
    const blockText = node.textContent.trim();
    if (!blockText) return true;
    const indices = findMatchingBoxIndices(blockText, boxes);
    if (indices.includes(boxIndex)) {
      foundPos = clampDocPos(pos + 1, editor);
      return false;
    }
    return true;
  });

  if (foundPos !== null) return foundPos;

  let bestPos: number | null = null;
  let bestScore = 0.28;
  const boxText = targetBox.text ?? "";

  doc.descendants((node, pos) => {
    if (!node.isBlock) return true;
    const blockText = node.textContent.trim();
    if (!blockText) return true;
    const s = textSimilarityNormalized(blockText, boxText);
    if (s > bestScore) {
      bestScore = s;
      bestPos = clampDocPos(pos + 1, editor);
    }
    return true;
  });

  return bestPos;
}

/**
 * Batch: bbox thuộc `pageIndex` trong `batchBoxPages` và chỉ số local trong trang.
 */
export function findFirstDocPosForBatchBox(
  editor: Editor,
  pageIndex: number,
  localBoxIndex: number,
  batchBoxPages: readonly BoxPercent[][],
): number | null {
  const pageBoxes = batchBoxPages[pageIndex] ?? [];
  if (localBoxIndex < 0 || localBoxIndex >= pageBoxes.length) return null;
  const bid = (pageBoxes[localBoxIndex] as BoundingBox)?.id;
  if (bid) {
    const byId = findFirstDocPosForBboxId(editor, bid);
    if (byId !== null) return byId;
  }
  const { doc } = editor.state;
  let foundPos: number | null = null;

  doc.descendants((node, pos) => {
    if (foundPos !== null) return false;
    if (!node.isBlock) return true;
    const blockText = node.textContent.trim();
    if (!blockText) return true;
    const pIdx = getBatchMarkdownPageIndex(editor, pos + 1);
    if (pIdx !== pageIndex) return true;
    const indices = findMatchingBoxIndices(blockText, pageBoxes);
    if (indices.includes(localBoxIndex)) {
      foundPos = clampDocPos(pos + 1, editor);
      return false;
    }
    return true;
  });

  if (foundPos !== null) return foundPos;

  const targetBox = pageBoxes[localBoxIndex];
  let bestPos: number | null = null;
  let bestScore = 0.28;
  const boxText = targetBox.text ?? "";

  doc.descendants((node, pos) => {
    if (!node.isBlock) return true;
    const blockText = node.textContent.trim();
    if (!blockText) return true;
    const pIdx = getBatchMarkdownPageIndex(editor, pos + 1);
    if (pIdx !== pageIndex) return true;
    const s = textSimilarityNormalized(blockText, boxText);
    if (s > bestScore) {
      bestScore = s;
      bestPos = clampDocPos(pos + 1, editor);
    }
    return true;
  });

  return bestPos;
}
