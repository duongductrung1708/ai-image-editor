import HistorySidebar from "@/components/HistorySidebar";
import type { Json } from "@/integrations/supabase/types";

export interface OcrHistoryEntry {
  id: string;
  image_name: string;
  extracted_text: string;
  bounding_boxes: Json | null;
  image_data: string | null;
  created_at: string;
}

interface OcrHistoryMobileDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (entry: OcrHistoryEntry) => void;
  refreshKey: number;
  activeEntryId?: string | null;
}

/**
 * Lớp phủ + sidebar lịch sử bên phải (mobile / viewport nhỏ).
 */
const OcrHistoryMobileDrawer = ({
  open,
  onClose,
  onSelect,
  refreshKey,
  activeEntryId = null,
}: OcrHistoryMobileDrawerProps) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="absolute right-0 top-0 h-full"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <HistorySidebar
          isOpen={true}
          onSelect={(entry) => {
            onSelect(entry);
            onClose();
          }}
          refreshKey={refreshKey}
          activeEntryId={activeEntryId}
        />
      </div>
    </div>
  );
};

export default OcrHistoryMobileDrawer;
