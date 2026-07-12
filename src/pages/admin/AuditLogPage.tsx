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
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Eye } from "lucide-react";
import {
  downloadCsv,
  fmtDate,
  useAdminAuditLog,
  useAdminProfiles,
} from "@/hooks/admin/useAdminData";
import { useTableControls } from "@/hooks/admin/useTableControls";
import { TablePagination } from "@/components/admin/TablePagination";
import { SortableHead } from "@/components/admin/SortableHead";

type AuditRow = NonNullable<ReturnType<typeof useAdminAuditLog>["data"]>[number];

const ACTION_LABEL: Record<string, string> = {
  adjust_credits: "Điều chỉnh credit",
  grant_role: "Cấp vai trò",
  revoke_role: "Thu hồi vai trò",
  delete_ocr_history: "Xoá lịch sử OCR",
  cancel_order: "Huỷ đơn hàng",
};

const ACTION_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  adjust_credits: "default",
  grant_role: "default",
  revoke_role: "destructive",
  delete_ocr_history: "destructive",
  cancel_order: "destructive",
};

export default function AdminAuditLogPage() {
  const audit = useAdminAuditLog(true);
  const profiles = useAdminProfiles(true);
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (profiles.data ?? []).forEach((p) => m.set(p.id, p.display_name ?? ""));
    return m;
  }, [profiles.data]);

  const filtered = useMemo(() => {
    let list = audit.data ?? [];
    if (action !== "all") list = list.filter((r) => r.action === action);
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter(
        (r) =>
          (r.actor_user_id ?? "").toLowerCase().includes(s) ||
          (r.target_user_id ?? "").toLowerCase().includes(s) ||
          (r.target_id ?? "").toLowerCase().includes(s) ||
          JSON.stringify(r.details ?? {}).toLowerCase().includes(s) ||
          (nameById.get(r.actor_user_id ?? "") ?? "").toLowerCase().includes(s) ||
          (nameById.get(r.target_user_id ?? "") ?? "").toLowerCase().includes(s),
      );
    return list;
  }, [audit.data, action, q, nameById]);

  const { paged, sortKey, sortDir, toggleSort, page, setPage, pageSize, setPageSize, pageCount, total } =
    useTableControls(filtered, "created_at", "desc", 25);

  const actionsFound = useMemo(() => {
    const set = new Set<string>();
    (audit.data ?? []).forEach((r) => set.add(r.action));
    return Array.from(set).sort();
  }, [audit.data]);

  const exportCsv = () =>
    downloadCsv(
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        created_at: r.created_at,
        action: r.action,
        actor_user_id: r.actor_user_id,
        actor_name: nameById.get(r.actor_user_id ?? "") ?? "",
        target_user_id: r.target_user_id ?? "",
        target_name: nameById.get(r.target_user_id ?? "") ?? "",
        target_id: r.target_id ?? "",
        details: JSON.stringify(r.details ?? {}),
      })),
      { label: "Audit log" },
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Audit log ({total})</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Ghi lại mọi thao tác admin: điều chỉnh credit, cấp/thu hồi vai trò, xoá OCR, huỷ đơn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Tìm actor / target / mô tả…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả action</SelectItem>
              {actionsFound.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABEL[a] ?? a}
                </SelectItem>
              ))}
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
                <SortableHead label="Thời gian" sortKey="created_at" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Action" sortKey="action" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Người thực hiện" sortKey="actor_user_id" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Đối tượng" sortKey="target_user_id" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Chi tiết" sortKey="details" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => {
                const actorName = nameById.get(r.actor_user_id ?? "") || "-";
                const targetName = r.target_user_id ? nameById.get(r.target_user_id) || "" : "";
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[r.action] ?? "outline"}>
                        {ACTION_LABEL[r.action] ?? r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{actorName}</div>
                      <div className="font-mono text-muted-foreground">{r.actor_user_id?.slice(0, 8)}…</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.target_user_id ? (
                        <>
                          <div className="font-medium">{targetName || "-"}</div>
                          <div className="font-mono text-muted-foreground">{r.target_user_id.slice(0, 8)}…</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {JSON.stringify(r.details ?? {})}
                        </span>
                        <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chi tiết thao tác</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <Row label="Action" value={ACTION_LABEL[detail.action] ?? detail.action} />
              <Row label="Thời gian" value={fmtDate(detail.created_at)} />
              <Row label="Actor" value={`${nameById.get(detail.actor_user_id) ?? ""} (${detail.actor_user_id})`} mono />
              {detail.target_user_id && (
                <Row label="Target user" value={`${nameById.get(detail.target_user_id) ?? ""} (${detail.target_user_id})`} mono />
              )}
              {detail.target_id && <Row label="Target ID" value={detail.target_id} mono />}
              <div>
                <div className="mb-1 text-muted-foreground">Chi tiết</div>
                <pre className="max-h-64 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">
                  {JSON.stringify(detail.details ?? {}, null, 2)}
                </pre>
              </div>
            </div>
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
