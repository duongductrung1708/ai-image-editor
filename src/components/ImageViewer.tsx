import { useMemo, useState, useRef } from "react";
import { mergeBoxRectsPercent } from "@/lib/bboxTextMatch";

export interface BoundingBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageViewerProps {
  imageUrl: string;
  boxes: BoundingBox[];
  isProcessing: boolean;
  /** Highlight on image when user hovers matching text in markdown (cross-ref). */
  linkedHighlightIndices?: number[] | null;
}

const ImageViewer = ({
  imageUrl,
  boxes,
  isProcessing,
  linkedHighlightIndices = null,
}: ImageViewerProps) => {
  const [hoveredBox, setHoveredBox] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
            key={i}
            onMouseEnter={() => setHoveredBox(i)}
            onMouseLeave={() => setHoveredBox(null)}
            className="absolute z-10 border-2 border-accent/60 bg-accent/10 transition-all duration-150 cursor-pointer hover:border-accent hover:bg-accent/20"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
          >
            {hoveredBox === i && (
              <div className="absolute -top-8 left-0 z-10 max-w-[200px] truncate rounded bg-foreground px-2 py-1 text-xs text-card font-body shadow-md">
                {box.text}
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
