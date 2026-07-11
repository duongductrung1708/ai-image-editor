import { useMemo, useState } from "react";
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
import { Download } from "lucide-react";
import {
  downloadCsv,
  fmtDate,
  useAdminTransactions,
} from "@/hooks/admin/useAdminData";

export default function AdminTransactionsPage() {
  const txn = useAdminTransactions(true);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    let list = txn.data ?? [];
    if (type !== "all") list = list.filter((t) => t.type === type);
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter(
        (t) =>
          (t.user_id ?? "").toLowerCase().includes(s) ||
          (t.description ?? "").toLowerCase().includes(s),
      );
    return list;
  }, [txn.data, type, q]);

  const totals = useMemo(() => {
    let inc = 0,
      dec = 0;
    rows.forEach((t) => {
      if (t.amount > 0) inc += t.amount;
      else dec += t.amount;
    });
    return { inc, dec, net: inc + dec };
  }, [rows]);

  const exportCsv = () =>
    downloadCsv(
      `transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((t) => ({
        user_id: t.user_id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        created_at: t.created_at,
      })),
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Giao dịch credit ({rows.length})</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cộng: <span className="text-primary">+{totals.inc}</span> • Trừ:{" "}
            <span className="text-destructive">{totals.dec}</span> • Ròng: {totals.net}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Tìm user / mô tả…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại</SelectItem>
              <SelectItem value="topup">topup</SelectItem>
              <SelectItem value="charge">charge</SelectItem>
              <SelectItem value="refund">refund</SelectItem>
              <SelectItem value="admin_topup">admin_topup</SelectItem>
              <SelectItem value="admin_debit">admin_debit</SelectItem>
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
                <TableHead>User</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Số credit</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Thời gian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.user_id?.slice(0, 8)}…</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.type}</Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      t.amount < 0 ? "text-destructive" : "text-primary"
                    }`}
                  >
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
  );
}
