import { useMemo, useState } from "react";
import { Clock, Trash2, Eye, Images, ChevronDown, ChevronRight, FileText, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { useOcrHistory } from "@/hooks/useOcrHistory";
import { useUiStore } from "@/stores/uiStore";

interface HistoryEntry {
  id: string;
  image_name: string;
  extracted_text: string;
  bounding_boxes: Json | null;
  image_data: string | null;
  created_at: string;
  batch_page_count?: number;
  batch_session_id?: string;
}

interface BatchPageDetail {
  id: string;
  page_index: number;
  file_name: string;
  ok: boolean;
  markdown: string;
  full_text: string;
  blocks: Json;
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
  void refreshKey;
  const { entries, loading, deleteOne } = useOcrHistory(50);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    imageName: string;
    batchSessionId?: string;
  } | null>(null);
  const isDeleting = deleteOne.isPending;

  const searchQuery = useUiStore((s) => s.historySearchQuery);
  const setSearchQuery = useUiStore((s) => s.setHistorySearchQuery);
  const dateFilter = useUiStore((s) => s.historyDateFilter);
  const setDateFilter = useUiStore((s) => s.setHistoryDateFilter);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchPages, setBatchPages] = useState<Record<string, BatchPageDetail[]>>({});
  const [loadingPages, setLoadingPages] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.image_name.toLowerCase().includes(q) ||
          e.extracted_text.toLowerCase().includes(q)
      );
    }

    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      if (dateFilter === "today") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === "week") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      result = result.filter((e) => new Date(e.created_at) >= cutoff);
    }

    return result;
  }, [entries, searchQuery, dateFilter]);

  // refreshKey is kept for compatibility; history hook uses cache invalidation elsewhere.

  const toggleBatchExpand = async (entry: HistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const entryId = entry.id;

    if (expandedBatch === entryId) {
      setExpandedBatch(null);
      return;
    }

    setExpandedBatch(entryId);

    // If we have a batch_session_id, load pages from DB
    if (entry.batch_session_id && !batchPages[entryId]) {
      setLoadingPages(entryId);
      const { data, error } = await supabase
        .from("ocr_batch_pages")
        .select("id, page_index, file_name, ok, markdown, full_text, blocks")
        .eq("session_id", entry.batch_session_id)
        .order("page_index", { ascending: true });

      if (!error && data) {
        setBatchPages((prev) => ({ ...prev, [entryId]: data }));
      }
      setLoadingPages(null);
    } else if (!entry.batch_session_id && !batchPages[entryId]) {
      // Fallback: extract from bounding_boxes JSON
      const bb = entry.bounding_boxes as { pages?: Array<{ index: number; name: string; ok: boolean; markdown: string; full_text: string; blocks: Json }> };
      if (bb?.pages) {
        const pages: BatchPageDetail[] = bb.pages.map((p, i) => ({
          id: `inline-${i}`,
          page_index: p.index,
          file_name: p.name,
          ok: p.ok,
          markdown: p.markdown,
          full_text: p.full_text,
          blocks: p.blocks as Json,
        }));
        setBatchPages((prev) => ({ ...prev, [entryId]: pages }));
      }
    }
  };

  const handleSelectPage = (page: BatchPageDetail, parentEntry: HistoryEntry) => {
    // For batch entries, we may store preview images per page inside
    // `parentEntry.bounding_boxes.pages[].image_data`.
    const bb = parentEntry.bounding_boxes as
      | { pages?: Array<{ index?: number; image_data?: string | null }> }
      | null;
    const pages = bb?.pages ?? [];
    const imageData =
      pages.find((p) => p.index === page.page_index)?.image_data ?? null;

    // Create a synthetic history entry for this single page
    const pageEntry: HistoryEntry = {
      id: page.id,
      image_name: page.file_name,
      extracted_text: page.markdown || page.full_text,
      bounding_boxes: page.blocks,
      image_data: imageData,
      created_at: parentEntry.created_at,
    };
    onSelect(pageEntry);
  };

  const handleRequestDelete = (id: string, imageName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const entry = entries.find((en) => en.id === id);
    setPendingDelete({ id, imageName, batchSessionId: entry?.batch_session_id });
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteOne.mutateAsync({
        id: pendingDelete.id,
        batchSessionId: pendingDelete.batchSessionId,
      });
      toast.success("Đã xóa");
    } catch {
      toast.error("Lỗi khi xóa");
    } finally {
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

      {/* Search & filter */}
      <div className="border-b border-border px-3 py-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên file..."
            className="h-8 pl-8 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {(["all", "today", "week", "month"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                dateFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {f === "all" ? "Tất cả" : f === "today" ? "Hôm nay" : f === "week" ? "7 ngày" : "30 ngày"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Đang tải...
          </p>
        ) : filteredEntries.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {entries.length === 0 ? "Chưa có lịch sử" : "Không tìm thấy kết quả"}
          </p>
        ) : (
          filteredEntries.map((entry) => {
            const isBatch = !!entry.batch_page_count;
            const isExpanded = expandedBatch === entry.id;
            const pages = batchPages[entry.id];

            return (
              <div key={entry.id}>
                <div
                  onClick={() => onSelect(entry)}
                  className="group flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-foreground truncate">
                        {entry.image_name}
                      </p>
                      {isBatch && (
                        <Badge variant="secondary" className="shrink-0 text-[9px] px-1 py-0 h-4 gap-0.5">
                          <Images className="h-2.5 w-2.5" />
                          {entry.batch_page_count}
                        </Badge>
                      )}
                    </div>
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
                    {isBatch && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => toggleBatchExpand(entry, e)}
                        title="Xem từng trang"
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </Button>
                    )}
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

                {/* Expanded batch pages */}
                {isBatch && isExpanded && (
                  <div className="border-b border-border bg-muted/30">
                    {loadingPages === entry.id ? (
                      <p className="px-6 py-2 text-[10px] text-muted-foreground">
                        Đang tải trang...
                      </p>
                    ) : pages && pages.length > 0 ? (
                      pages.map((page) => (
                        <div
                          key={page.id}
                          onClick={() => handleSelectPage(page, entry)}
                          className="flex cursor-pointer items-center gap-2 px-6 py-2 transition-colors hover:bg-secondary/50"
                        >
                          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-foreground truncate">
                              {page.page_index + 1}. {page.file_name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {page.markdown.slice(0, 50)}...
                            </p>
                          </div>
                          {!page.ok && (
                            <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3.5">
                              Lỗi
                            </Badge>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="px-6 py-2 text-[10px] text-muted-foreground">
                        Không có dữ liệu trang
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default HistorySidebar;
