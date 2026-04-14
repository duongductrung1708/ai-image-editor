import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";

const FREE_DAILY_LIMIT = 5;

export function useOcrQuota() {
  const { user } = useAuth();
  const { balance, loading: creditsLoading, refresh: refreshCredits } = useCredits();
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!user) {
      setTodayCount(0);
      setLoading(false);
      return;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    const [singleRes, batchRes] = await Promise.all([
      supabase
        .from("ocr_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", iso),
      supabase
        .from("ocr_batch_sessions")
        .select("page_count")
        .eq("user_id", user.id)
        .gte("created_at", iso),
    ]);

    const singleCount = singleRes.count ?? 0;
    const batchPageCount = (batchRes.data ?? []).reduce((s, r) => s + (r.page_count ?? 0), 0);
    setTodayCount(singleCount + batchPageCount);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  const hasCredits = balance > 0;
  const freeDailyRemaining = Math.max(0, FREE_DAILY_LIMIT - todayCount);
  const ready = Boolean(user) && !loading && !creditsLoading;

  // User can OCR if: has credits OR has free daily remaining
  const canUse = Boolean(user) && (hasCredits || freeDailyRemaining > 0);

  // Remaining: credits + free daily remaining
  const remaining = !user
    ? 0
    : creditsLoading
      ? undefined
      : hasCredits
        ? balance + freeDailyRemaining
        : freeDailyRemaining;

  return {
    todayCount,
    remaining,
    balance,
    freeDailyRemaining,
    limit: hasCredits ? Infinity : FREE_DAILY_LIMIT,
    canUse,
    isUnlimited: false,
    loading: loading || creditsLoading,
    ready,
    refresh: () => { fetchCount(); refreshCredits(); },
  };
}
