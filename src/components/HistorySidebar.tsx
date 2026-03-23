import { useEffect, useState } from "react";
import { Clock, Trash2, Eye, Images } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";

interface HistoryEntry {
  id: string;
  image_name: string;
  extracted_text: string;
  bounding_boxes: Json | null;
  image_data: string | null;
  created_at: string;
  /** If this entry is linked to a batch session */
  batch_page_count?: number;
}

interface HistorySidebarProps {
  isOpen: boolean;
  onSelect: (entry: HistoryEntry) => void;
  refreshKey: number;
}

const HistorySidebar = ({
  isOpen,
  onSelect,
  refreshKey,
}: HistorySidebarProps) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    imageName: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchHistory = async () => {
    // Fetch single OCR history
    const { data: histData, error: histErr } = await supabase
      .from("ocr_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (histErr) {
      console.error("Error fetching history:", histErr);
    }

    // Enrich with batch page count
    const enriched: HistoryEntry[] = (histData || []).map((entry) => {
      const bb = entry.bounding_boxes;
      let batch_page_count: number | undefined;
      if (
        bb && typeof bb === "object" && !Array.isArray(bb) &&
        (bb as { batch?: boolean }).batch === true &&
        Array.isArray((bb as { pages?: unknown }).pages)
      ) {
        batch_page_count = ((bb as { pages: unknown[] }).pages).length;
      }
      return { ...entry, batch_page_count };
    });

    setEntries(enriched);
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshKey]);

  const handleRequestDelete = (id: string, imageName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDelete({ id, imageName });
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("ocr_history")
        .delete()
        .eq("id", pendingDelete.id);

      if (error) {
        toast.error("Lỗi khi xóa");
        return;
      }

      setEntries((prev) => prev.filter((entry) => entry.id !== pendingDelete.id));
      toast.success("Đã xóa");
    } finally {
      setIsDeleting(false);
      setIsConfirmOpen(false);
      setPendingDelete(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col overflow-hidden">
      <AlertDialog
        open={isConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeleting) {
            setIsConfirmOpen(false);
            setPendingDelete(null);
          } else {
            setIsConfirmOpen(nextOpen);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa lịch sử OCR?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Bạn có chắc chắn muốn xóa "${pendingDelete.imageName}"?`
                : "Bạn có chắc chắn muốn xóa mục này không?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          Lịch sử OCR
        </span>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(entry);
                  }}
                >
                  <Eye className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={(e) =>
                    handleRequestDelete(entry.id, entry.image_name, e)
                  }
                  disabled={isDeleting}
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
