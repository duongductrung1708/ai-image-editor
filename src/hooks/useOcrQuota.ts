import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

const FREE_DAILY_LIMIT = 5;
const GUEST_DAILY_LIMIT = 3;
const GUEST_STORAGE_KEY = "ocr_guest_usage";

function getGuestUsageToday(): number {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    if (date === new Date().toISOString().slice(0, 10)) return count;
    return 0;
  } catch { return 0; }
}

export function incrementGuestUsage(pages = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const current = getGuestUsageToday();
  localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ date: today, count: current + pages }));
}

export function useOcrQuota() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!user) {
      setTodayCount(getGuestUsageToday());
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

  useEffect(() => { fetchCount(); }, [fetchCount]);

  const isUnlimited = tier === "pro" || tier === "business";
  const dailyLimit = user ? FREE_DAILY_LIMIT : GUEST_DAILY_LIMIT;
  const remaining = isUnlimited ? Infinity : Math.max(0, dailyLimit - todayCount);
  const canUse = isUnlimited || remaining > 0;

  return {
    todayCount,
    remaining,
    limit: isUnlimited ? Infinity : dailyLimit,
    canUse,
    isUnlimited,
    loading,
    refresh: fetchCount,
  };
}
