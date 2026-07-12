import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Download, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, fmtDate, useAdminOcr } from "@/hooks/admin/useAdminData";
import { useTableControls } from "@/hooks/admin/useTableControls";
import { TablePagination } from "@/components/admin/TablePagination";
import { SortableHead } from "@/components/admin/SortableHead";

export default function AdminOcrPage() {
  const qc = useQueryClient();
  const ocr = useAdminOcr(true);
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");

  const filtered = useMemo(() => {
    let list = ocr.data ?? [];
    if (range !== "all") {
      const days = Number(range);
      const cutoff = Date.now() - days * 86400_000;
      list = list.filter((h) => new Date(h.created_at).getTime() >= cutoff);
    }
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (h) => h.id.toLowerCase().includes(s) || (h.user_id ?? "").toLowerCase().includes(s),
    );
  }, [ocr.data, q, range]);

  const { paged, sortKey, sortDir, toggleSort, page, setPage, pageSize, setPageSize, pageCount, total } =
    useTableControls(filtered, "created_at", "desc", 50);

  const remove = async (id: string) => {
    if (!confirm("Xoá lịch sử OCR này? Thao tác được ghi vào audit log.")) return;
    const { error } = await supabase.rpc("admin_delete_ocr_history", { p_id: id } as never);
    if (error) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Đã xoá lịch sử OCR" });
    void qc.invalidateQueries({ queryKey: ["admin", "ocr_history"] });
    void qc.invalidateQueries({ queryKey: ["admin", "audit_log"] });
  };

  const exportCsv = () =>
    downloadCsv(
      `ocr-history-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((h) => ({ id: h.id, user_id: h.user_id, created_at: h.created_at })),
      { label: "Lịch sử OCR" },
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Lịch sử OCR ({total})</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Tìm theo OCR id / user id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
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
                <SortableHead label="OCR ID" sortKey="id" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="User" sortKey="user_id" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Thời gian" sortKey="created_at" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Thao tác" sortKey="_" currentKey={String(sortKey)} currentDir={sortDir} onSort={() => {}} align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">{h.id.slice(0, 12)}…</TableCell>
                  <TableCell className="font-mono text-xs">{h.user_id?.slice(0, 8)}…</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(h.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(h.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
    </Card>
  );
}
