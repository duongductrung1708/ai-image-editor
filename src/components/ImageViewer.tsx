import { useState, useRef } from "react";

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
}

const ImageViewer = ({ imageUrl, boxes, isProcessing }: ImageViewerProps) => {
  const [hoveredBox, setHoveredBox] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
            className="absolute border-2 border-accent/60 bg-accent/10 transition-all duration-150 cursor-pointer hover:border-accent hover:bg-accent/20"
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
