import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Coins, FileText, ShoppingBag, TrendingUp, Users } from "lucide-react";
import {
  fmtDay,
  fmtVnd,
  useAdminCredits,
  useAdminDailyStats,
  useAdminOcr,
  useAdminOrders,
  useAdminProfiles,
} from "@/hooks/admin/useAdminData";

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
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <div className="text-muted-foreground">{icon}</div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </CardContent>
  </Card>
);

export default function AdminOverviewPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const profiles = useAdminProfiles(true);
  const credits = useAdminCredits(true);
  const orders = useAdminOrders(true);
  const ocrHistory = useAdminOcr(true);
  const daily = useAdminDailyStats(true, rangeDays);

  const chartData = useMemo(
    () =>
      (daily.data ?? []).map((r) => ({
        day: fmtDay(r.day),
        revenue: Number(r.revenue) || 0,
        ocr: Number(r.ocr_count) || 0,
        users: Number(r.new_users) || 0,
        orders: Number(r.paid_orders) || 0,
      })),
    [daily.data],
  );

  const stats = useMemo(() => {
    const totalUsers = profiles.data?.length ?? 0;
    const totalCredits = credits.data?.reduce((s, r) => s + (r.balance ?? 0), 0) ?? 0;
    const paid = orders.data?.filter((o) => o.status === "PAID") ?? [];
    const totalRevenue = paid.reduce((s, o) => s + Number(o.amount ?? 0), 0);
    const totalOcr = ocrHistory.data?.length ?? 0;
    const rangeRevenue = (daily.data ?? []).reduce((s, r) => s + Number(r.revenue ?? 0), 0);
    const rangeOcr = (daily.data ?? []).reduce((s, r) => s + Number(r.ocr_count ?? 0), 0);
    const rangeNewUsers = (daily.data ?? []).reduce((s, r) => s + Number(r.new_users ?? 0), 0);
    return {
      totalUsers,
      totalCredits,
      totalRevenue,
      paidCount: paid.length,
      totalOcr,
      rangeRevenue,
      rangeOcr,
      rangeNewUsers,
    };
  }, [profiles.data, credits.data, orders.data, ocrHistory.data, daily.data]);

  const chartCfg = {
    revenue: { label: "Doanh thu", color: "hsl(var(--primary))" },
    ocr: { label: "Lượt OCR", color: "hsl(200 90% 50%)" },
    users: { label: "User mới", color: "hsl(280 70% 55%)" },
    orders: { label: "Đơn PAID", color: "hsl(40 90% 55%)" },
  } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Thống kê chi tiết hoạt động toàn nền tảng.</p>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Tổng người dùng"
          value={stats.totalUsers}
          hint={`+${stats.rangeNewUsers} trong ${rangeDays} ngày`}
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Credit đang lưu hành"
          value={stats.totalCredits}
        />
        <StatCard
          icon={<ShoppingBag className="h-4 w-4" />}
          label={`Doanh thu ${rangeDays} ngày`}
          value={fmtVnd(stats.rangeRevenue)}
          hint={`Tổng: ${fmtVnd(stats.totalRevenue)} • ${stats.paidCount} đơn PAID`}
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label={`OCR ${rangeDays} ngày`}
          value={stats.rangeOcr}
          hint={`Gần đây: ${stats.totalOcr} lần`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    fill="url(#rev)"
                    strokeWidth={2}
                  />
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
    </div>
  );
}
