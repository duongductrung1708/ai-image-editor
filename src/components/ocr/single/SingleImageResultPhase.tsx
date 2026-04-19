import type { Editor } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import HistorySidebar from "@/components/HistorySidebar";
import MarkdownEditor, {
  type JumpToBoxRequest,
} from "@/components/ocr/MarkdownEditor";
import JsonViewer from "@/components/ocr/JsonViewer";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

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
  activeHistoryId?: string | null;
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
  activeHistoryId = null,
}: SingleImageResultPhaseProps) => {
  const [jumpToBox, setJumpToBox] = useState<JumpToBoxRequest | null>(null);
  const jumpNonceRef = useRef(0);

  const handleImageBoxClick = useCallback(
    (boxIndex: number) => {
      onActiveTabChange("markdown");
      onMarkdownHighlightChange([boxIndex]);
      jumpNonceRef.current += 1;
      setJumpToBox({
        kind: "single",
        boxIndex,
        nonce: jumpNonceRef.current,
      });
    },
    [onActiveTabChange, onMarkdownHighlightChange],
  );

  const leftPanel = (
    <ImageViewer
      imageUrl={imageUrl}
      boxes={boundingBoxes}
      isProcessing={isProcessing}
      linkedHighlightIndices={markdownLinkedBoxIndices}
      onBoxClick={handleImageBoxClick}
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
              jumpToBox={jumpToBox}
              onJumpToBoxHandled={() => setJumpToBox(null)}
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
          <div className="flex h-full min-h-0 flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
              <ResizablePanel defaultSize={50} minSize={30} maxSize={70} className="min-h-0">
                <div className="min-h-0 h-full w-full overflow-hidden">{leftPanel}</div>
              </ResizablePanel>
              <ResizableHandle
                withHandle
                className="z-20 w-3 cursor-col-resize touch-none bg-border/40 hover:bg-border/70"
              />
              <ResizablePanel defaultSize={50} minSize={30} className="min-h-0">
                <div className="min-h-0 h-full w-full overflow-hidden flex flex-col">
                  {rightPanel}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {showHistory ? (
            <HistorySidebar
              isOpen={true}
              onSelect={onHistorySelect}
              refreshKey={historyRefresh}
              activeEntryId={activeHistoryId}
            />
          ) : null}
        </div>
      )}
    </div>
  );
};

export default SingleImageResultPhase;
