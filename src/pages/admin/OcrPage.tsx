import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, fmtDate, useAdminOcr } from "@/hooks/admin/useAdminData";

export default function AdminOcrPage() {
  const qc = useQueryClient();
  const ocr = useAdminOcr(true);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = ocr.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (h) => h.id.toLowerCase().includes(s) || (h.user_id ?? "").toLowerCase().includes(s),
    );
  }, [ocr.data, q]);

  const remove = async (id: string) => {
    if (!confirm("Xoá lịch sử OCR này?")) return;
    const { error } = await supabase.rpc("admin_delete_ocr_history", { p_id: id } as never);
    if (error) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Đã xoá" });
    void qc.invalidateQueries({ queryKey: ["admin", "ocr_history"] });
  };

  const exportCsv = () =>
    downloadCsv(
      `ocr-history-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((h) => ({ id: h.id, user_id: h.user_id, created_at: h.created_at })),
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Lịch sử OCR ({rows.length})</CardTitle>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Tìm theo OCR id / user id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
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
                <TableHead>OCR ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">{h.id.slice(0, 12)}…</TableCell>
                  <TableCell className="font-mono text-xs">{h.user_id?.slice(0, 8)}…</TableCell>
                  <TableCell>{fmtDate(h.created_at)}</TableCell>
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
      </CardContent>
    </Card>
  );
}
