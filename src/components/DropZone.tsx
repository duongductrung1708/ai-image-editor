import { useCallback, useState, useEffect } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";

interface DropZoneProps {
  /** Một hoặc nhiều ảnh (thứ tự giữ nguyên; nên sắp xếp theo tên ở caller). */
  onFilesSelect: (files: File[]) => void;
}

const DropZone = ({ onFilesSelect }: DropZoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const pickImages = useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list).filter((f) => f.type.startsWith("image/"));
      if (arr.length) onFilesSelect(arr);
    },
    [onFilesSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files?.length) pickImages(e.dataTransfer.files);
    },
    [pickImages],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) pickImages(e.target.files);
      e.target.value = "";
    },
    [pickImages],
  );

  // Clipboard paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            onFilesSelect([file]);
            break;
          }
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [onFilesSelect]);

  return (
    <div className="w-full max-w-2xl text-center">
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-16 transition-colors duration-200 ${
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/50 hover:bg-secondary/50"
        }`}
      >
        <div className="mb-4 rounded-full bg-primary/10 p-4">
          {isDragOver ? (
            <ImageIcon className="h-8 w-8 text-primary" />
          ) : (
            <Upload className="h-8 w-8 text-primary" />
          )}
        </div>

        <p className="mb-1 text-sm font-medium text-foreground">
          {isDragOver
            ? "Thả hình ảnh tại đây"
            : "Kéo thả một hoặc nhiều ảnh, hoặc nhấn để chọn"}
        </p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WEBP · Nhiều trang → OCR hàng loạt gộp một file · Ctrl+V dán
        </p>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </label>
    </div>
  );
};

export default DropZone;
