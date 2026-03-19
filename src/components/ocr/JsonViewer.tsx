import { Skeleton } from "@/components/ui/skeleton";

interface JsonViewerProps {
  jsonText: string;
  isProcessing: boolean;
  onChange: (value: string) => void;
}

const JsonViewer = ({ jsonText, isProcessing, onChange }: JsonViewerProps) => {
  if (isProcessing && !jsonText) {
    return (
      <div className="h-full w-full p-4 space-y-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-9/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
      </div>
    );
  }

  return (
    <textarea
      value={jsonText}
      onChange={(e) => onChange(e.target.value)}
      placeholder={isProcessing ? "Đang xử lý..." : "JSON sẽ xuất hiện ở đây..."}
      className="h-full w-full resize-none bg-card p-4 font-mono text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      disabled={isProcessing}
    />
  );
};

export default JsonViewer;

