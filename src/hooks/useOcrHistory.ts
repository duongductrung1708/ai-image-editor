import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface OcrHistoryEntryRow {
  id: string;
  image_name: string;
  extracted_text: string;
  bounding_boxes: Json | null;
  image_data: string | null;
  created_at: string;
}

export interface OcrHistoryEntryEnriched extends OcrHistoryEntryRow {
  batch_page_count?: number;
  batch_session_id?: string;
}

const ocrHistoryQueryKey = (limit: number) => ["ocr_history", { limit }] as const;

function updateAllHistoryCaches(
  qc: ReturnType<typeof useQueryClient>,
  updater: (prev: OcrHistoryEntryEnriched[] | undefined) => OcrHistoryEntryEnriched[],
) {
  const all = qc.getQueriesData({ queryKey: ["ocr_history"] });
  for (const [key, data] of all) {
    qc.setQueryData(
      key,
      updater(data as OcrHistoryEntryEnriched[] | undefined),
    );
  }
}

function enrichEntry(entry: OcrHistoryEntryRow): OcrHistoryEntryEnriched {
  const bb = entry.bounding_boxes;
  let batch_page_count: number | undefined;
  let batch_session_id: string | undefined;

  if (
    bb &&
    typeof bb === "object" &&
    !Array.isArray(bb) &&
    (bb as { batch?: boolean }).batch === true
  ) {
    if (Array.isArray((bb as { pages?: unknown }).pages)) {
      batch_page_count = ((bb as { pages: unknown[] }).pages).length;
    }
    if (typeof (bb as { batch_session_id?: string }).batch_session_id === "string") {
      batch_session_id = (bb as { batch_session_id: string }).batch_session_id;
    }
  }

  return { ...entry, batch_page_count, batch_session_id };
}

export function useOcrHistory(limit = 50) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ocrHistoryQueryKey(limit),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocr_history")
        .select("id, image_name, extracted_text, bounding_boxes, image_data, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return ((data ?? []) as OcrHistoryEntryRow[]).map(enrichEntry);
    },
    staleTime: 10_000,
  });

  const deleteOne = useMutation({
    mutationFn: async (payload: { id: string; batchSessionId?: string }) => {
      if (payload.batchSessionId) {
        const { error } = await supabase
          .from("ocr_batch_sessions")
          .delete()
          .eq("id", payload.batchSessionId);
        if (error) throw error;
      }

      const { error } = await supabase.from("ocr_history").delete().eq("id", payload.id);
      if (error) throw error;
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["ocr_history"] });
      const prev = qc.getQueriesData({ queryKey: ["ocr_history"] });
      updateAllHistoryCaches(qc, (old) =>
        (old ?? []).filter((e) => e.id !== payload.id),
      );
      return { prev };
    },
    onError: async (_err, _vars, ctx) => {
      if (!ctx?.prev) return;
      for (const [key, data] of ctx.prev) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["ocr_history"] });
    },
  });

  const deleteAll = useMutation({
    mutationFn: async () => {
      // Supabase requires a non-empty filter for DELETE. Using a "always true" predicate.
      const { error } = await supabase
        .from("ocr_history")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["ocr_history"] });
      const prev = qc.getQueriesData({ queryKey: ["ocr_history"] });
      updateAllHistoryCaches(qc, () => []);
      return { prev };
    },
    onError: async (_err, _vars, ctx) => {
      if (!ctx?.prev) return;
      for (const [key, data] of ctx.prev) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["ocr_history"] });
    },
  });

  return {
    entries: q.data ?? [],
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    deleteOne,
    deleteAll,
  };
}

