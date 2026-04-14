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

  // User can OCR if: has free daily remaining OR has credits
  const canUse = Boolean(user) && (freeDailyRemaining > 0 || hasCredits);

  // Will this next OCR use a credit (i.e. free daily exhausted)?
  const willUseCredit = freeDailyRemaining <= 0 && hasCredits;

  const remaining = !user
    ? 0
    : creditsLoading
      ? undefined
      : hasCredits
        ? balance + freeDailyRemaining
        : freeDailyRemaining;

  /** Call after a successful OCR to deduct 1 credit if free daily is exhausted */
  const deductCredit = useCallback(async () => {
    if (!user) return;
    // Re-check: if today's count >= free limit, deduct a credit
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // We just did an OCR so todayCount is stale; check if free was already used
    if (todayCount >= FREE_DAILY_LIMIT && balance > 0) {
      await supabase.rpc("deduct_credit" as never, { p_user_id: user.id } as never).then(() => {
        // Also log the transaction
        supabase.from("credit_transactions").insert({
          user_id: user.id,
          amount: -1,
          type: "usage" as const,
          description: "OCR usage",
        });
      });
      refreshCredits();
    }
  }, [user, todayCount, balance, refreshCredits]);

  return {
    todayCount,
    remaining,
    balance,
    freeDailyRemaining,
    limit: hasCredits ? Infinity : FREE_DAILY_LIMIT,
    canUse,
    willUseCredit,
    isUnlimited: false,
    loading: loading || creditsLoading,
    ready,
    refresh: () => { fetchCount(); refreshCredits(); },
    deductCredit,
  };
}
