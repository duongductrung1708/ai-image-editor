import type { Editor } from "@tiptap/react";
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import HistorySidebar from "@/components/HistorySidebar";
import MarkdownEditor from "@/components/ocr/MarkdownEditor";
import JsonViewer from "@/components/ocr/JsonViewer";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";
import { GripVertical } from "lucide-react";

interface SingleImageResultPhaseProps {
  imageUrl: string;
  boundingBoxes: BoundingBox[];
  isProcessing: boolean;
  markdownLinkedBoxIndices: number[] | null;
  onMarkdownHighlightChange: (indices: number[] | null) => void;
  activeTab: "markdown" | "json";
  onActiveTabChange: (tab: "markdown" | "json") => void;
  editor: Editor | null;
  jsonText: string;
  onJsonTextChange: (text: string) => void;
  showHistory: boolean;
  isLg: boolean;
  onHistorySelect: (entry: OcrHistoryEntry) => void;
  historyRefresh: number;
}

/**
 * Kết quả OCR một ảnh: viewer + Markdown/JSON + lịch sử (desktop).
 */
const SingleImageResultPhase = ({
  imageUrl,
  boundingBoxes,
  isProcessing,
  markdownLinkedBoxIndices,
  onMarkdownHighlightChange,
  activeTab,
  onActiveTabChange,
  editor,
  jsonText,
  onJsonTextChange,
  showHistory,
  isLg,
  onHistorySelect,
  historyRefresh,
}: SingleImageResultPhaseProps) => {
  const HANDLE_PX = 10;
  const MIN_LEFT_PCT = 30;
  const MAX_LEFT_PCT = 70;

  const [leftPct, setLeftPct] = useState(50);
  const splitRef = useRef<HTMLDivElement | null>(null);

  const onResizeHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitRef.current;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      if (!containerWidth) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startPct = leftPct;

      const onPointerMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const nextPct = startPct + (dx / containerWidth) * 100;
        setLeftPct(Math.min(MAX_LEFT_PCT, Math.max(MIN_LEFT_PCT, nextPct)));
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", cleanup, { once: true });
      window.addEventListener("pointercancel", cleanup, { once: true });
    },
    [leftPct],
  );

  const leftPanel = (
    <ImageViewer
      imageUrl={imageUrl}
      boxes={boundingBoxes}
      isProcessing={isProcessing}
      linkedHighlightIndices={markdownLinkedBoxIndices}
    />
  );

  const rightPanel = (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Kết quả OCR
        </span>
        <div className="flex items-center gap-3">
          {boundingBoxes.length > 0 && (
            <span className="text-[10px] font-medium text-accent">
              {boundingBoxes.length} vùng phát hiện
            </span>
          )}
          <Tabs
            value={activeTab}
            onValueChange={(v) => onActiveTabChange(v as "markdown" | "json")}
          >
            <TabsList className="h-8">
              <TabsTrigger className="px-2 py-1 text-xs" value="markdown">
                Markdown
              </TabsTrigger>
              <TabsTrigger className="px-2 py-1 text-xs" value="json">
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => onActiveTabChange(v as "markdown" | "json")}
          className="h-full"
        >
          <TabsContent value="markdown" className="m-0 h-full">
            <MarkdownEditor
              editor={editor}
              isProcessing={isProcessing}
              boundingBoxes={boundingBoxes}
              onMarkdownHighlightChange={onMarkdownHighlightChange}
            />
          </TabsContent>
          <TabsContent value="json" className="m-0 h-full">
            <JsonViewer
              jsonText={jsonText}
              isProcessing={isProcessing}
              onChange={onJsonTextChange}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {!isLg ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-[240px] w-full flex-1 border-b border-border">
            {leftPanel}
          </div>
          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">{rightPanel}</div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-row overflow-hidden">
          <div
            ref={splitRef}
            className="grid h-full min-h-0 flex-1 overflow-hidden"
            style={{ gridTemplateColumns: `${leftPct}% ${HANDLE_PX}px 1fr` }}
          >
            <div className="min-h-0 h-full w-full overflow-hidden">{leftPanel}</div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize split"
              aria-valuemin={MIN_LEFT_PCT}
              aria-valuemax={MAX_LEFT_PCT}
              aria-valuenow={Math.round(leftPct)}
              className="relative z-10 flex h-full w-full cursor-col-resize items-center justify-center bg-border/40 hover:bg-border/70 touch-none select-none"
              onPointerDown={onResizeHandlePointerDown}
            >
              <div className="flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
                <GripVertical className="h-2.5 w-2.5" />
              </div>
            </div>
            <div className="min-h-0 h-full w-full overflow-hidden flex flex-col">{rightPanel}</div>
          </div>

          {showHistory ? (
            <HistorySidebar
              isOpen={true}
              onSelect={onHistorySelect}
              refreshKey={historyRefresh}
            />
          ) : null}
        </div>
      )}
    </div>
  );
};

export default SingleImageResultPhase;
