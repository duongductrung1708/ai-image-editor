import type { Editor } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownEditor, {
  type JumpToBoxRequest,
} from "@/components/ocr/MarkdownEditor";
import JsonViewer from "@/components/ocr/JsonViewer";
import HistorySidebar from "@/components/HistorySidebar";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import type { OcrBatchPageResult } from "@/types/ocr";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";

interface BatchResultViewProps {
  files: File[];
  batchPages: OcrBatchPageResult[] | null;
  effectivePreviewUrls: string[];
  pageCount: number;
  restoredFromHistory: boolean;
  linkedBatchHighlight: {
    pageIndex: number;
    indices: number[];
  } | null;
  onBatchMarkdownHighlightChange: (
    payload: { pageIndex: number; indices: number[] } | null,
  ) => void;
  activeTab: "markdown" | "json";
  onActiveTabChange: (tab: "markdown" | "json") => void;
  editor: Editor | null;
  jsonText: string;
  onJsonTextChange: (text: string) => void;
  totalBoxCount: number;
  showHistory: boolean;
  isLg: boolean;
  onHistorySelect: (entry: OcrHistoryEntry) => void;
  historyRefresh: number;
  activeHistoryId?: string | null;
  orderedFileIndices?: number[];
  draggedIndex?: number | null;
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (index: number) => void;
  onDragEnd?: () => void;
}

/**
 * Sau OCR batch: cột ảnh + Markdown/JSON + sidebar lịch sử (desktop).
 */
const BatchResultView = ({
  files,
  batchPages,
  effectivePreviewUrls,
  pageCount,
  restoredFromHistory,
  linkedBatchHighlight,
  onBatchMarkdownHighlightChange,
  activeTab,
  onActiveTabChange,
  editor,
  jsonText,
  onJsonTextChange,
  totalBoxCount,
  showHistory,
  isLg,
  onHistorySelect,
  historyRefresh,
  activeHistoryId,
  orderedFileIndices = [],
  draggedIndex = null,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: BatchResultViewProps) => {
  const [jumpToBox, setJumpToBox] = useState<JumpToBoxRequest | null>(null);
  const jumpNonceRef = useRef(0);

  const handleBatchImageBoxClick = useCallback(
    (pageIndex: number, boxIndex: number) => {
      onActiveTabChange("markdown");
      onBatchMarkdownHighlightChange({ pageIndex, indices: [boxIndex] });
      jumpNonceRef.current += 1;
      setJumpToBox({
        kind: "batch",
        pageIndex,
        boxIndex,
        nonce: jumpNonceRef.current,
      });
    },
    [onActiveTabChange, onBatchMarkdownHighlightChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex min-h-[220px] w-full flex-1 flex-col overflow-hidden border-b border-border bg-muted/20 lg:min-h-0 lg:w-1/2 lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-border bg-card/80 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Ảnh gốc · {pageCount} trang
            </span>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Bbox theo từng trang; rê chuột trên Markdown để sáng vùng tương
              ứng (theo section ##).
            </p>
            {restoredFromHistory && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-500">
                Từ lịch sử: ảnh xem trước theo từng trang (nếu có dữ liệu
                preview).
              </p>
            )}
          </div>
          <ScrollArea className="min-h-0 w-full flex-1">
            <div className="space-y-4 p-3 pr-3">
              {(orderedFileIndices.length > 0 ? orderedFileIndices : effectivePreviewUrls.map((_, i) => i)).map((originalIndex, displayIndex) => {
                const url = effectivePreviewUrls[originalIndex];
                const title =
                  batchPages?.[originalIndex]?.name ?? files[originalIndex]?.name ?? `Trang ${originalIndex + 1}`;
                const pageBoxes = (batchPages?.[originalIndex]?.blocks ??
                  []) as BoundingBox[];
                const isDragging = draggedIndex === displayIndex;
                return (
                  <figure
                    key={`${url}-${originalIndex}`}
                    draggable
                    onDragStart={() => onDragStart?.(displayIndex)}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop?.(displayIndex)}
                    onDragEnd={onDragEnd}
                    className={`overflow-hidden rounded-lg border border-border bg-card shadow-sm cursor-grab active:cursor-grabbing transition-opacity ${
                      isDragging ? "opacity-50" : ""
                    }`}
                  >
                    <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                      <span className="truncate">
                        {displayIndex + 1}. {title}
                      </span>
                      {pageBoxes.length > 0 && (
                        <span className="shrink-0 text-[10px] text-accent">
                          {pageBoxes.length} vùng
                        </span>
                      )}
                    </figcaption>
                    <div className="h-[min(70vh,520px)] w-full bg-black/[0.03]">
                      <ImageViewer
                        imageUrl={url}
                        boxes={pageBoxes}
                        isProcessing={false}
                        linkedHighlightIndices={
                          linkedBatchHighlight?.pageIndex === originalIndex
                            ? linkedBatchHighlight.indices
                            : null
                        }
                        onBoxClick={(boxIdx) =>
                          handleBatchImageBoxClick(originalIndex, boxIdx)
                        }
                      />
                    </div>
                  </figure>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Tabs
            value={activeTab}
            onValueChange={(v) => onActiveTabChange(v as "markdown" | "json")}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Kết quả gộp
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {totalBoxCount > 0 && (
                  <span className="text-[10px] font-medium text-accent">
                    {totalBoxCount} vùng bbox (tất cả trang)
                  </span>
                )}
                <TabsList className="h-8">
                  <TabsTrigger className="px-2 py-1 text-xs" value="markdown">
                    Markdown
                  </TabsTrigger>
                  <TabsTrigger className="px-2 py-1 text-xs" value="json">
                    JSON
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            <TabsContent
              value="markdown"
              className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <MarkdownEditor
                editor={editor}
                isProcessing={false}
                batchBoxPages={
                  batchPages
                    ? batchPages.map(
                        (p) =>
                          (Array.isArray(p.blocks)
                            ? p.blocks
                            : []) as BoundingBox[],
                      )
                    : []
                }
                onBatchMarkdownHighlightChange={onBatchMarkdownHighlightChange}
                jumpToBox={jumpToBox}
                onJumpToBoxHandled={() => setJumpToBox(null)}
              />
            </TabsContent>
            <TabsContent
              value="json"
              className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <JsonViewer
                jsonText={jsonText}
                isProcessing={false}
                onChange={onJsonTextChange}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {showHistory && isLg && (
        <HistorySidebar
          isOpen={true}
          onSelect={onHistorySelect}
          refreshKey={historyRefresh}
          activeEntryId={activeHistoryId}
        />
      )}
    </div>
  );
};

export default BatchResultView;
