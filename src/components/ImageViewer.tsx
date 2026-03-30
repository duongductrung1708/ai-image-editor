import { useMemo, useState, useRef } from "react";
import { mergeBoxRectsPercent } from "@/lib/bboxTextMatch";

export interface BoundingBox {
  /** Cố định theo vùng OCR (vd. bbox-0, p1-bbox-2). */
  id?: string;
  /** Văn bản hoặc rỗng nếu vùng là hình/biểu đồ. */
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** `figure`: ảnh/biểu đồ; `stamp`: con dấu; `signature`: chữ ký tay. */
  kind?: "text" | "figure" | "stamp" | "signature";
}

interface ImageViewerProps {
  imageUrl: string;
  boxes: BoundingBox[];
  isProcessing: boolean;
  /** Highlight on image when user hovers matching text in markdown (cross-ref). */
  linkedHighlightIndices?: number[] | null;
  /** Bấm bbox → cuộn tới đoạn tương ứng trong editor (parent xử lý). */
  onBoxClick?: (boxIndex: number) => void;
}

const ImageViewer = ({
  imageUrl,
  boxes,
  isProcessing,
  linkedHighlightIndices = null,
  onBoxClick,
}: ImageViewerProps) => {
  const [hoveredBox, setHoveredBox] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const boxFrameClass = (kind: BoundingBox["kind"] | undefined) => {
    switch (kind) {
      case "stamp":
        return "border-purple-500/80 bg-purple-500/15 hover:border-purple-400 hover:bg-purple-500/25";
      case "signature":
        return "border-emerald-500/80 bg-emerald-500/15 hover:border-emerald-400 hover:bg-emerald-500/25";
      case "figure":
        return "border-sky-500/80 bg-sky-500/15 hover:border-sky-400 hover:bg-sky-500/25";
      default:
        return "border-accent/60 bg-accent/10 hover:border-accent hover:bg-accent/20";
    }
  };

  const boxKindLabel = (kind: BoundingBox["kind"] | undefined) => {
    switch (kind) {
      case "stamp":
        return " · Con dấu";
      case "signature":
        return " · Chữ ký";
      case "figure":
        return " · Hình";
      default:
        return "";
    }
  };

  const linkedRect = useMemo(() => {
    if (
      !linkedHighlightIndices ||
      linkedHighlightIndices.length === 0 ||
      boxes.length === 0
    ) {
      return null;
    }
    return mergeBoxRectsPercent(boxes, linkedHighlightIndices);
  }, [boxes, linkedHighlightIndices]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-auto bg-secondary/30 p-4"
    >
      <div className="relative inline-block max-h-full max-w-full">
        <img
          src={imageUrl}
          alt="Uploaded"
          className="block max-h-full max-w-full rounded-md object-contain"
        />

        {/* Bounding boxes overlay */}
        {boxes.map((box, i) => (
          <div
            key={box.id ?? `box-${i}`}
            role={onBoxClick ? "button" : undefined}
            tabIndex={onBoxClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (!onBoxClick) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onBoxClick(i);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              onBoxClick?.(i);
            }}
            onMouseEnter={() => setHoveredBox(i)}
            onMouseLeave={() => setHoveredBox(null)}
            className={`absolute z-10 border-2 transition-all duration-150 cursor-pointer ${boxFrameClass(box.kind)}`}
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
          >
            {hoveredBox === i && (
              <div className="absolute -top-8 left-0 z-10 max-w-[220px] truncate rounded bg-foreground px-2 py-1 text-xs text-card font-body shadow-md">
                <span className="font-mono text-[10px] opacity-80">
                  {box.id ?? `#${i}`}
                </span>
                {box.text ? ` · ${box.text}` : ""}
                {!box.text ? boxKindLabel(box.kind) : ""}
              </div>
            )}
          </div>
        ))}

        {linkedRect && (
          <div
            className="pointer-events-none absolute z-20 rounded-sm border-2 border-yellow-400 bg-yellow-300/25 shadow-[0_0_0_1px_rgba(250,204,21,0.4)]"
            style={{
              left: `${linkedRect.x}%`,
              top: `${linkedRect.y}%`,
              width: `${linkedRect.width}%`,
              height: `${linkedRect.height}%`,
            }}
            aria-hidden
          />
        )}

        {/* Scanning animation */}
        {isProcessing && (
          <div className="absolute inset-0 overflow-hidden rounded-md">
            <div className="absolute inset-x-0 h-0.5 bg-primary animate-scan" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageViewer;
