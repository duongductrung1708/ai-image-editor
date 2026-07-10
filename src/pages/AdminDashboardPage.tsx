import { useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { ArrowLeft, Users, Coins, ShoppingBag, FileText } from "lucide-react";

const fmtVnd = (n: number | null | undefined) =>
  new Intl.NumberFormat("vi-VN").format(Number(n ?? 0)) + " ₫";

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("vi-VN") : "-";

const AdminDashboardPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();

  const profiles = useQuery({
    queryKey: ["admin", "profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
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
        .limit(200);
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
        .limit(200);
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

  const stats = useMemo(() => {
    const totalUsers = profiles.data?.length ?? 0;
    const totalCredits =
      credits.data?.reduce((sum, r) => sum + (r.balance ?? 0), 0) ?? 0;
    const paidOrders =
      orders.data?.filter((o) => o.status === "PAID") ?? [];
    const totalRevenue = paidOrders.reduce(
      (sum, o) => sum + Number(o.amount ?? 0),
      0,
    );
    const totalOcr = ocrHistory.data?.length ?? 0;
    return { totalUsers, totalCredits, totalRevenue, paidCount: paidOrders.length, totalOcr };
  }, [profiles.data, credits.data, orders.data, ocrHistory.data]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Tổng quan hoạt động của VetaOCR
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/app">
              <ArrowLeft className="mr-2 h-4 w-4" /> Về ứng dụng
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <StatCard icon={<Users className="h-4 w-4" />} label="Người dùng" value={stats.totalUsers} />
          <StatCard icon={<Coins className="h-4 w-4" />} label="Tổng credit đang giữ" value={stats.totalCredits} />
          <StatCard
            icon={<ShoppingBag className="h-4 w-4" />}
            label={`Doanh thu (${stats.paidCount} đơn PAID)`}
            value={fmtVnd(stats.totalRevenue)}
          />
          <StatCard icon={<FileText className="h-4 w-4" />} label="Lần OCR gần đây" value={stats.totalOcr} />
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Người dùng</TabsTrigger>
            <TabsTrigger value="orders">Đơn hàng</TabsTrigger>
            <TabsTrigger value="transactions">Giao dịch credit</TabsTrigger>
            <TabsTrigger value="ocr">Lịch sử OCR</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader><CardTitle>Người dùng gần đây</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên hiển thị</TableHead>
                        <TableHead>User ID</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead>Ngày tạo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profiles.data?.map((p) => {
                        const bal = credits.data?.find((c) => c.user_id === p.id)?.balance ?? 0;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.display_name ?? "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}…</TableCell>
                            <TableCell className="text-right">{bal}</TableCell>
                            <TableCell>{fmtDate(p.created_at)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader><CardTitle>Đơn hàng gần đây</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order code</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Gói</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.data?.map((o) => (
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

          <TabsContent value="transactions">
            <Card>
              <CardHeader><CardTitle>Giao dịch credit</CardTitle></CardHeader>
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
                      {transactions.data?.map((t) => (
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

          <TabsContent value="ocr">
            <Card>
              <CardHeader><CardTitle>Lịch sử OCR gần đây</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OCR ID</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ocrHistory.data?.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="font-mono text-xs">{h.id.slice(0, 8)}…</TableCell>
                          <TableCell className="font-mono text-xs">{h.user_id?.slice(0, 8)}…</TableCell>
                          <TableCell>{fmtDate(h.created_at)}</TableCell>
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
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <div className="text-muted-foreground">{icon}</div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

export default AdminDashboardPage;
