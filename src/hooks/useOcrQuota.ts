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

  /** Call after a successful OCR to deduct 1 daily use. Returns true if free use was deducted, false if credit should be used */
  const deductCredit = useCallback(async () => {
    if (!user) return;

    // Try to deduct from daily free uses
    const { data: deducted, error } = await supabase.rpc("deduct_daily_use", {
      p_user_id: user.id,
    } as never);

    if (error) {
      console.error("[v0] Error deducting daily use:", error);
      return;
    }

    // If deducted successfully (true), free use was consumed
    if (deducted === true) {
      // Refresh the quota display
      fetchCount();
      return;
    }

    // If deducted is false, free uses are exhausted, so deduct a credit instead
    if (balance > 0) {
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
  }, [user, balance, refreshCredits, fetchCount]);

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
