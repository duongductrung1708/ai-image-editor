import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ban, Download, ExternalLink, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadCsv,
  fmtDate,
  fmtVnd,
  useAdminOrders,
} from "@/hooks/admin/useAdminData";
import { useTableControls } from "@/hooks/admin/useTableControls";
import { TablePagination } from "@/components/admin/TablePagination";
import { SortableHead } from "@/components/admin/SortableHead";

type OrderRow = NonNullable<ReturnType<typeof useAdminOrders>["data"]>[number];

export default function AdminOrdersPage() {
  const qc = useQueryClient();
  const orders = useAdminOrders(true);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const filtered = useMemo(() => {
    let list = orders.data ?? [];
    if (status !== "all") list = list.filter((o) => o.status === status);
    if (range !== "all") {
      const days = Number(range);
      const cutoff = Date.now() - days * 86400_000;
      list = list.filter((o) => new Date(o.created_at).getTime() >= cutoff);
    }
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter(
        (o) =>
          String(o.order_code ?? "").toLowerCase().includes(s) ||
          (o.user_id ?? "").toLowerCase().includes(s) ||
          (o.pack_id ?? "").toLowerCase().includes(s),
      );
    return list;
  }, [orders.data, status, q, range]);

  const summary = useMemo(() => {
    const total = filtered.reduce((s, o) => s + Number(o.amount ?? 0), 0);
    const paid = filtered
      .filter((o) => o.status === "PAID")
      .reduce((s, o) => s + Number(o.amount ?? 0), 0);
    return { total, paid };
  }, [filtered]);

  const { paged, sortKey, sortDir, toggleSort, page, setPage, pageSize, setPageSize, pageCount, total } =
    useTableControls(filtered, "created_at", "desc", 25);

  const cancelOrder = async () => {
    if (!detail) return;
    if (!confirm(`Huỷ đơn ${detail.order_code}?`)) return;
    setCancelling(true);
    const { error } = await supabase.rpc("admin_cancel_order", {
      p_order_id: detail.id,
      p_reason: "admin_manual_cancel",
    } as never);
    setCancelling(false);
    if (error) {
      toast({ title: "Không huỷ được", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Đã huỷ đơn hàng", description: String(detail.order_code) });
    setDetail(null);
    void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    void qc.invalidateQueries({ queryKey: ["admin", "audit_log"] });
  };

  const exportCsv = () =>
    downloadCsv(
      `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((o) => ({
        order_code: o.order_code,
        user_id: o.user_id,
        amount: o.amount,
        pack_id: o.pack_id,
        status: o.status,
        created_at: o.created_at,
      })),
      { label: "Đơn hàng" },
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Đơn hàng ({total})</CardTitle>
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
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="PAID">PAID</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
              <SelectItem value="CANCELLED">CANCELLED</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi thời gian</SelectItem>
              <SelectItem value="7">7 ngày</SelectItem>
              <SelectItem value="30">30 ngày</SelectItem>
              <SelectItem value="90">90 ngày</SelectItem>
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
                <SortableHead label="Order code" sortKey="order_code" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="User" sortKey="user_id" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Số tiền" sortKey="amount" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortableHead label="Gói" sortKey="pack_id" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Trạng thái" sortKey="status" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Thời gian" sortKey="created_at" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Thao tác" sortKey="_" currentKey={String(sortKey)} currentDir={sortDir} onSort={() => {}} align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{String(o.order_code)}</TableCell>
                  <TableCell className="font-mono text-xs">{o.user_id?.slice(0, 8)}…</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtVnd(o.amount)}</TableCell>
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
                  <TableCell className="whitespace-nowrap">{fmtDate(o.created_at)}</TableCell>
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
        <TablePagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
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
          <DialogFooter className="gap-2 sm:justify-between">
            {detail?.status === "PENDING" ? (
              <Button variant="destructive" onClick={cancelOrder} disabled={cancelling}>
                <Ban className="mr-2 h-4 w-4" />
                {cancelling ? "Đang huỷ…" : "Huỷ đơn"}
              </Button>
            ) : (
              <span />
            )}
            <Button variant="outline" onClick={() => setDetail(null)}>
              Đóng
            </Button>
          </DialogFooter>
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
