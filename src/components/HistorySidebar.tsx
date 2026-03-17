import { useEffect, useState } from "react";
import { Clock, Trash2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface HistoryEntry {
  id: string;
  image_name: string;
  extracted_text: string;
  bounding_boxes: Json | null;
  image_data: string | null;
  created_at: string;
}

interface HistorySidebarProps {
  isOpen: boolean;
  onSelect: (entry: HistoryEntry) => void;
  refreshKey: number;
}

const HistorySidebar = ({ isOpen, onSelect, refreshKey }: HistorySidebarProps) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from("ocr_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("Error fetching history:", error);
    } else {
      setEntries(data || []);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshKey]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("ocr_history").delete().eq("id", id);
    if (error) {
      toast.error("Lỗi khi xóa");
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Đã xóa");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Lịch sử OCR</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Chưa có lịch sử
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="group flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-secondary/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {entry.image_name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {entry.extracted_text.slice(0, 80)}...
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(entry.created_at).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); onSelect(entry); }}
                >
                  <Eye className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={(e) => handleDelete(entry.id, e)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HistorySidebar;
