import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Eye, ExternalLink } from "lucide-react";
import {
  downloadCsv,
  fmtDate,
  fmtVnd,
  useAdminOrders,
} from "@/hooks/admin/useAdminData";

type OrderRow = ReturnType<typeof useAdminOrders>["data"] extends (infer T)[] | undefined ? T : never;

export default function AdminOrdersPage() {
  const orders = useAdminOrders(true);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<OrderRow | null>(null);

  const rows = useMemo(() => {
    let list = orders.data ?? [];
    if (status !== "all") list = list.filter((o) => o.status === status);
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter(
        (o) =>
          String(o.order_code ?? "").toLowerCase().includes(s) ||
          (o.user_id ?? "").toLowerCase().includes(s) ||
          (o.pack_id ?? "").toLowerCase().includes(s),
      );
    return list;
  }, [orders.data, status, q]);

  const summary = useMemo(() => {
    const total = rows.reduce((s, o) => s + Number(o.amount ?? 0), 0);
    const paid = rows.filter((o) => o.status === "PAID").reduce((s, o) => s + Number(o.amount ?? 0), 0);
    return { total, paid };
  }, [rows]);

  const exportCsv = () =>
    downloadCsv(
      `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((o) => ({
        order_code: o.order_code,
        user_id: o.user_id,
        amount: o.amount,
        pack_id: o.pack_id,
        status: o.status,
        created_at: o.created_at,
      })),
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Đơn hàng ({rows.length})</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Tổng: {fmtVnd(summary.total)} • PAID: {fmtVnd(summary.paid)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Tìm order code / user / gói…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="PAID">PAID</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
              <SelectItem value="CANCELLED">CANCELLED</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        </div>
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
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{String(o.order_code)}</TableCell>
                  <TableCell className="font-mono text-xs">{o.user_id?.slice(0, 8)}…</TableCell>
                  <TableCell className="text-right">{fmtVnd(o.amount)}</TableCell>
                  <TableCell>{o.pack_id ?? "-"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        o.status === "PAID"
                          ? "default"
                          : o.status === "CANCELLED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtDate(o.created_at)}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(o)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {o.status === "PAID" && (
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/receipt/${o.id}`} target="_blank">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chi tiết đơn hàng</DialogTitle>
          </DialogHeader>
          {detail && (
            <dl className="space-y-2 text-sm">
              <Row label="Order code" value={String(detail.order_code)} mono />
              <Row label="User" value={detail.user_id ?? "-"} mono />
              <Row label="Số tiền" value={fmtVnd(detail.amount)} />
              <Row label="Gói" value={detail.pack_id ?? "-"} />
              <Row label="Trạng thái" value={detail.status ?? "-"} />
              <Row label="Thời gian" value={fmtDate(detail.created_at)} />
              <Row label="Order ID" value={detail.id} mono />
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex justify-between gap-4 border-b border-border/50 py-1.5">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className={mono ? "font-mono text-xs break-all text-right" : "text-right"}>{value}</dd>
  </div>
);
