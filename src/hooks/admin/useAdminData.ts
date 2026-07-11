import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAdminProfiles = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "profiles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useAdminCredits = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "credits"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_credits")
        .select("user_id, balance, updated_at");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useAdminOrders = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "orders"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, user_id, order_code, amount, status, pack_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useAdminTransactions = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "transactions"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, user_id, amount, type, description, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useAdminOcr = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "ocr_history"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocr_history")
        .select("id, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useAdminRoles = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "roles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const useAdminDailyStats = (enabled: boolean, days: number) =>
  useQuery({
    queryKey: ["admin", "daily_stats", days],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_daily_stats", {
        p_days: days,
      } as never);
      if (error) throw error;
      return (data ?? []) as Array<{
        day: string;
        revenue: number;
        ocr_count: number;
        new_users: number;
        paid_orders: number;
      }>;
    },
  });

export const fmtVnd = (n: number | null | undefined) =>
  new Intl.NumberFormat("vi-VN").format(Number(n ?? 0)) + " ₫";
export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("vi-VN") : "-";
export const fmtDay = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

export const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
