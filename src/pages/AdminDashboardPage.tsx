import { useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Coins,
  FileText,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const fmtVnd = (n: number | null | undefined) =>
  new Intl.NumberFormat("vi-VN").format(Number(n ?? 0)) + " ₫";
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("vi-VN") : "-";
const fmtDay = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

const AdminDashboardPage = () => {
  const qc = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();

  const [rangeDays, setRangeDays] = useState<number>(30);
  const [userSearch, setUserSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState<string>("all");
  const [txnType, setTxnType] = useState<string>("all");

  const [adjustDialog, setAdjustDialog] = useState<{ open: boolean; userId: string | null; name: string }>(
    { open: false, userId: null, name: "" },
  );
  const [adjustDelta, setAdjustDelta] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState<string>("");

  const [grantUserId, setGrantUserId] = useState("");

  const profiles = useQuery({
    queryKey: ["admin", "profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const credits = useQuery({
    queryKey: ["admin", "credits"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_credits")
        .select("user_id, balance, updated_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orders = useQuery({
    queryKey: ["admin", "orders"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, user_id, order_code, amount, status, pack_id, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const transactions = useQuery({
    queryKey: ["admin", "transactions"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, user_id, amount, type, description, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ocrHistory = useQuery({
    queryKey: ["admin", "ocr_history"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocr_history")
        .select("id, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const roles = useQuery({
    queryKey: ["admin", "roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const dailyStats = useQuery({
    queryKey: ["admin", "daily_stats", rangeDays],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_daily_stats", {
        p_days: rangeDays,
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

  const chartData = useMemo(
    () =>
      (dailyStats.data ?? []).map((r) => ({
        day: fmtDay(r.day),
        revenue: Number(r.revenue) || 0,
        ocr: Number(r.ocr_count) || 0,
        users: Number(r.new_users) || 0,
        orders: Number(r.paid_orders) || 0,
      })),
    [dailyStats.data],
  );

  const stats = useMemo(() => {
    const totalUsers = profiles.data?.length ?? 0;
    const totalCredits =
      credits.data?.reduce((sum, r) => sum + (r.balance ?? 0), 0) ?? 0;
    const paidOrders = orders.data?.filter((o) => o.status === "PAID") ?? [];
    const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.amount ?? 0), 0);
    const totalOcr = ocrHistory.data?.length ?? 0;
    const rangeRevenue = (dailyStats.data ?? []).reduce(
      (s, r) => s + Number(r.revenue ?? 0),
      0,
    );
    const rangeOcr = (dailyStats.data ?? []).reduce(
      (s, r) => s + Number(r.ocr_count ?? 0),
      0,
    );
    const rangeNewUsers = (dailyStats.data ?? []).reduce(
      (s, r) => s + Number(r.new_users ?? 0),
      0,
    );
    return {
      totalUsers,
      totalCredits,
      totalRevenue,
      paidCount: paidOrders.length,
      totalOcr,
      rangeRevenue,
      rangeOcr,
      rangeNewUsers,
    };
  }, [profiles.data, credits.data, orders.data, ocrHistory.data, dailyStats.data]);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const list = profiles.data ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        (p.display_name ?? "").toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [profiles.data, userSearch]);

  const filteredOrders = useMemo(() => {
    const list = orders.data ?? [];
    if (orderStatus === "all") return list;
    return list.filter((o) => o.status === orderStatus);
  }, [orders.data, orderStatus]);

  const filteredTxn = useMemo(() => {
    const list = transactions.data ?? [];
    if (txnType === "all") return list;
    return list.filter((t) => t.type === txnType);
  }, [transactions.data, txnType]);

  const openAdjust = (userId: string, name: string) => {
    setAdjustDialog({ open: true, userId, name });
    setAdjustDelta("");
    setAdjustReason("");
  };

  const submitAdjust = async () => {
    if (!adjustDialog.userId) return;
    const delta = parseInt(adjustDelta, 10);
    if (!Number.isFinite(delta) || delta === 0) {
      toast({ title: "Số credit không hợp lệ", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("admin_adjust_credits", {
      p_target_user: adjustDialog.userId,
      p_delta: delta,
      p_reason: adjustReason || "admin_adjust",
    } as never);
    if (error) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Đã cập nhật ${delta > 0 ? "+" : ""}${delta} credit` });
    setAdjustDialog({ open: false, userId: null, name: "" });
    refreshAll();
  };

  const setRole = async (userId: string, grant: boolean) => {
    const { error } = await supabase.rpc("admin_set_user_role", {
      p_target_user: userId,
      p_role: "admin",
      p_grant: grant,
    } as never);
    if (error) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: grant ? "Đã cấp quyền admin" : "Đã thu hồi quyền admin" });
    void qc.invalidateQueries({ queryKey: ["admin", "roles"] });
  };

  const deleteOcr = async (id: string) => {
    if (!confirm("Xoá lịch sử OCR này?")) return;
    const { error } = await supabase.rpc("admin_delete_ocr_history", {
      p_id: id,
    } as never);
    if (error) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Đã xoá" });
    void qc.invalidateQueries({ queryKey: ["admin", "ocr_history"] });
  };

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/app" replace />;

  const chartCfg = {
    revenue: { label: "Doanh thu", color: "hsl(var(--primary))" },
    ocr: { label: "Lượt OCR", color: "hsl(var(--chart-2, 200 90% 50%))" },
    users: { label: "User mới", color: "hsl(var(--chart-3, 280 70% 55%))" },
    orders: { label: "Đơn PAID", color: "hsl(var(--chart-4, 40 90% 55%))" },
  } as const;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Admin Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Tổng quan & quản lý hoạt động VetaOCR
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 ngày</SelectItem>
                <SelectItem value="14">14 ngày</SelectItem>
                <SelectItem value="30">30 ngày</SelectItem>
                <SelectItem value="90">90 ngày</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="mr-2 h-4 w-4" /> Làm mới
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app">
                <ArrowLeft className="mr-2 h-4 w-4" /> Về ứng dụng
              </Link>
            </Button>
          </div>
        </div>

        {/* Overview */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <StatCard icon={<Users className="h-4 w-4" />} label="Tổng người dùng" value={stats.totalUsers}
            hint={`+${stats.rangeNewUsers} trong ${rangeDays} ngày`} />
          <StatCard icon={<Coins className="h-4 w-4" />} label="Credit đang lưu hành" value={stats.totalCredits} />
          <StatCard
            icon={<ShoppingBag className="h-4 w-4" />}
            label={`Doanh thu ${rangeDays} ngày`}
            value={fmtVnd(stats.rangeRevenue)}
            hint={`Tổng cộng: ${fmtVnd(stats.totalRevenue)} • ${stats.paidCount} đơn PAID`}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label={`OCR ${rangeDays} ngày`}
            value={stats.rangeOcr}
            hint={`Gần đây: ${stats.totalOcr} lần`}
          />
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" /> Doanh thu theo ngày
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartCfg} className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#rev)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" /> Lượt OCR & User mới
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartCfg} className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="ocr" stroke="hsl(200 90% 50%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="users" stroke="hsl(280 70% 55%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4 text-primary" /> Đơn hàng PAID theo ngày
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartCfg} className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="orders" fill="hsl(40 90% 55%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="users">Người dùng</TabsTrigger>
            <TabsTrigger value="orders">Đơn hàng</TabsTrigger>
            <TabsTrigger value="transactions">Giao dịch credit</TabsTrigger>
            <TabsTrigger value="ocr">Lịch sử OCR</TabsTrigger>
            <TabsTrigger value="roles">Phân quyền</TabsTrigger>
          </TabsList>

          {/* Users */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Người dùng ({filteredUsers.length})</CardTitle>
                <Input
                  placeholder="Tìm theo tên hoặc user id…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="max-w-xs"
                />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên hiển thị</TableHead>
                        <TableHead>User ID</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead>Ngày tạo</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((p) => {
                        const bal = credits.data?.find((c) => c.user_id === p.id)?.balance ?? 0;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.display_name ?? "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}…</TableCell>
                            <TableCell className="text-right">{bal}</TableCell>
                            <TableCell>{fmtDate(p.created_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openAdjust(p.id, p.display_name ?? p.id.slice(0, 8))}
                              >
                                <Coins className="mr-1.5 h-3.5 w-3.5" /> Điều chỉnh
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders */}
          <TabsContent value="orders">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Đơn hàng ({filteredOrders.length})</CardTitle>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="PAID">PAID</SelectItem>
                    <SelectItem value="PENDING">PENDING</SelectItem>
                    <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order code</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Số tiền</TableHead>
                        <TableHead>Gói</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{String(o.order_code)}</TableCell>
                          <TableCell className="font-mono text-xs">{o.user_id?.slice(0, 8)}…</TableCell>
                          <TableCell className="text-right">{fmtVnd(o.amount)}</TableCell>
                          <TableCell>{o.pack_id ?? "-"}</TableCell>
                          <TableCell>
                            <Badge variant={o.status === "PAID" ? "default" : "secondary"}>
                              {o.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{fmtDate(o.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Giao dịch credit ({filteredTxn.length})</CardTitle>
                <Select value={txnType} onValueChange={setTxnType}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả loại</SelectItem>
                    <SelectItem value="topup">topup</SelectItem>
                    <SelectItem value="charge">charge</SelectItem>
                    <SelectItem value="refund">refund</SelectItem>
                    <SelectItem value="admin_topup">admin_topup</SelectItem>
                    <SelectItem value="admin_debit">admin_debit</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead className="text-right">Số credit</TableHead>
                        <TableHead>Mô tả</TableHead>
                        <TableHead>Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTxn.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.user_id?.slice(0, 8)}…</TableCell>
                          <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                          <TableCell className={`text-right font-medium ${t.amount < 0 ? "text-destructive" : "text-primary"}`}>
                            {t.amount > 0 ? `+${t.amount}` : t.amount}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{t.description ?? "-"}</TableCell>
                          <TableCell>{fmtDate(t.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* OCR history */}
          <TabsContent value="ocr">
            <Card>
              <CardHeader><CardTitle>Lịch sử OCR gần đây ({ocrHistory.data?.length ?? 0})</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OCR ID</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Thời gian</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ocrHistory.data?.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="font-mono text-xs">{h.id.slice(0, 8)}…</TableCell>
                          <TableCell className="font-mono text-xs">{h.user_id?.slice(0, 8)}…</TableCell>
                          <TableCell>{fmtDate(h.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteOcr(h.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Roles */}
          <TabsContent value="roles">
            <Card>
              <CardHeader>
                <CardTitle>Phân quyền admin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label htmlFor="grant-uid" className="text-xs">
                      Cấp quyền admin cho user ID
                    </Label>
                    <Input
                      id="grant-uid"
                      placeholder="uuid…"
                      value={grantUserId}
                      onChange={(e) => setGrantUserId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    onClick={async () => {
                      if (!grantUserId.trim()) return;
                      await setRole(grantUserId.trim(), true);
                      setGrantUserId("");
                    }}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" /> Cấp quyền
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Ngày cấp</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.data?.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.user_id}</TableCell>
                          <TableCell><Badge>{r.role}</Badge></TableCell>
                          <TableCell>{fmtDate(r.created_at)}</TableCell>
                          <TableCell className="text-right">
                            {r.role === "admin" && r.user_id !== user.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setRole(r.user_id, false)}
                              >
                                <ShieldX className="mr-1.5 h-3.5 w-3.5" /> Thu hồi
                              </Button>
                            )}
                            {r.user_id === user.id && (
                              <span className="text-xs text-muted-foreground">bạn</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Credit adjust dialog */}
      <Dialog
        open={adjustDialog.open}
        onOpenChange={(open) => setAdjustDialog((s) => ({ ...s, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh credit</DialogTitle>
            <DialogDescription>
              Người dùng: <span className="font-medium">{adjustDialog.name}</span>. Nhập số dương
              để cộng, số âm để trừ.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="delta">Số credit (±)</Label>
              <Input
                id="delta"
                type="number"
                placeholder="vd: 100 hoặc -20"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reason">Ghi chú</Label>
              <Input
                id="reason"
                placeholder="Lý do điều chỉnh…"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog({ open: false, userId: null, name: "" })}>
              Huỷ
            </Button>
            <Button onClick={submitAdjust}>Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <div className="text-muted-foreground">{icon}</div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </CardContent>
  </Card>
);

export default AdminDashboardPage;
