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
  const [lastFetchDate, setLastFetchDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const fetchCount = useCallback(async () => {
    if (!user) {
      setTodayCount(0);
      setLoading(false);
      return;
    }

    // Check if date has changed - if so, reset the count
    const today = new Date().toISOString().split('T')[0];
    if (today !== lastFetchDate) {
      setLastFetchDate(today);
    }

    // Call get_daily_free_uses to ensure today's record exists and get the count
    const { data, error } = await supabase.rpc("get_daily_free_uses", {
      p_user_id: user.id,
    } as never);

    if (error) {
      console.error("[v0] Error fetching daily uses:", error);
      setTodayCount(0);
    } else {
      setTodayCount(data ?? 0);
    }
    setLoading(false);
  }, [user, lastFetchDate]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Check every minute if date has changed (for edge case when user keeps app open past midnight)
  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toISOString().split('T')[0];
      if (today !== lastFetchDate) {
        fetchCount();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [lastFetchDate, fetchCount]);

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

  /**
   * Refresh quota + credit state after a successful OCR.
   * Billing (free-use deduction and credit charging) is performed server-side
   * in the `ocr-vietnamese` edge function — this client-side call must never
   * mutate quota or balance, otherwise users get double-billed.
   */
  const deductCredit = useCallback(async () => {
    if (!user) return;
    await fetchCount();
    refreshCredits();
  }, [user, refreshCredits, fetchCount]);

  /**
   * After batch OCR: refresh UI state only. The edge function decrements
   * `daily_free_uses` and charges credits atomically server-side.
   */
  const deductDailyFreeUsesUpTo = useCallback(
    async (_maxSlots: number) => {
      if (!user) return;
      await fetchCount();
      refreshCredits();
    },
    [user, fetchCount, refreshCredits],
  );

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
    deductDailyFreeUsesUpTo,
  };
}
