import type { Editor } from "@tiptap/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import HistorySidebar from "@/components/HistorySidebar";
import MarkdownEditor from "@/components/ocr/MarkdownEditor";
import JsonViewer from "@/components/ocr/JsonViewer";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";

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
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex min-h-[240px] w-full flex-1 border-b border-border lg:min-h-0 lg:w-1/2 lg:border-b-0 lg:border-r">
        <ImageViewer
          imageUrl={imageUrl}
          boxes={boundingBoxes}
          isProcessing={isProcessing}
          linkedHighlightIndices={markdownLinkedBoxIndices}
        />
      </div>

      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col lg:w-auto">
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
      </div>

      {showHistory && isLg ? (
        <HistorySidebar
          isOpen={true}
          onSelect={onHistorySelect}
          refreshKey={historyRefresh}
        />
      ) : null}
    </div>
  );
};

export default SingleImageResultPhase;
