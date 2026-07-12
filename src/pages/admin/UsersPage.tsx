import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Coins,
  Copy,
  Download,
  Info,
  Minus,
  Plus,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadCsv,
  fmtDate,
  useAdminCredits,
  useAdminProfiles,
  useAdminRoles,
} from "@/hooks/admin/useAdminData";
import { useTableControls } from "@/hooks/admin/useTableControls";
import { TablePagination } from "@/components/admin/TablePagination";
import { SortableHead } from "@/components/admin/SortableHead";

const REASON_PRESETS = [
  "Bồi thường lỗi hệ thống",
  "Hỗ trợ khách hàng qua support",
  "Khuyến mãi / tặng thưởng",
  "Điều chỉnh sai sót giao dịch",
];

const AMOUNT_PRESETS = [10, 50, 100, 500];

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const profiles = useAdminProfiles(true);
  const credits = useAdminCredits(true);
  const roles = useAdminRoles(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [adjust, setAdjust] = useState<{
    open: boolean;
    userId: string | null;
    name: string;
    currentBalance: number;
  }>({ open: false, userId: null, name: "", currentBalance: 0 });
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const adminIds = useMemo(
    () => new Set((roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id)),
    [roles.data],
  );

  const filtered = useMemo(() => {
    const list = profiles.data ?? [];
    const s = q.trim().toLowerCase();
    const withMeta = list.map((p) => ({
      ...p,
      balance: credits.data?.find((c) => c.user_id === p.id)?.balance ?? 0,
      isAdmin: adminIds.has(p.id),
    }));
    return withMeta.filter((p) => {
      if (roleFilter === "admin" && !p.isAdmin) return false;
      if (roleFilter === "user" && p.isAdmin) return false;
      if (!s) return true;
      return (
        (p.display_name ?? "").toLowerCase().includes(s) ||
        p.id.toLowerCase().includes(s)
      );
    });
  }, [profiles.data, credits.data, adminIds, q, roleFilter]);

  const { paged, sortKey, sortDir, toggleSort, page, setPage, pageSize, setPageSize, pageCount, total } =
    useTableControls(filtered, "created_at", "desc", 25);

  const parsedDelta = Number.parseInt(delta, 10);
  const newBalance = Number.isFinite(parsedDelta)
    ? Math.max(0, adjust.currentBalance + parsedDelta)
    : adjust.currentBalance;

  const openAdjust = (userId: string, name: string, balance: number) => {
    setAdjust({ open: true, userId, name, currentBalance: balance });
    setDelta("");
    setReason("");
  };

  const submit = async () => {
    if (!adjust.userId) return;
    if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
      toast({ title: "Số credit không hợp lệ", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({
        title: "Vui lòng nhập lý do",
        description: "Lý do sẽ được lưu vào audit log để truy vết sau này.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_adjust_credits", {
      p_target_user: adjust.userId,
      p_delta: parsedDelta,
      p_reason: reason.trim(),
    } as never);
    setSubmitting(false);
    if (error) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: `Đã ${parsedDelta > 0 ? "cộng" : "trừ"} ${Math.abs(parsedDelta)} credit`,
      description: `${adjust.name} • số dư mới: ${newBalance}`,
    });
    setAdjust({ open: false, userId: null, name: "", currentBalance: 0 });
    setDelta("");
    setReason("");
    void qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const grantAdmin = async (userId: string, grant: boolean, name: string) => {
    const verb = grant ? "cấp" : "thu hồi";
    if (!confirm(`Xác nhận ${verb} quyền admin cho ${name}?`)) return;
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
    void qc.invalidateQueries({ queryKey: ["admin", "audit_log"] });
  };

  const copyId = (id: string) => {
    void navigator.clipboard.writeText(id);
    toast({ title: "Đã copy user ID" });
  };

  const exportCsv = () =>
    downloadCsv(
      `users-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        user_id: r.id,
        display_name: r.display_name ?? "",
        balance: r.balance,
        is_admin: r.isAdmin ? "yes" : "",
        created_at: r.created_at,
      })),
      { label: "Danh sách người dùng" },
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Người dùng ({total})</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Tìm theo tên hoặc user id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả vai trò</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
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
                <SortableHead label="Tên hiển thị" sortKey="display_name" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="User ID" sortKey="id" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Credit" sortKey="balance" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} align="right" />
                <SortableHead label="Vai trò" sortKey="isAdmin" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Ngày tạo" sortKey="created_at" currentKey={String(sortKey)} currentDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Thao tác" sortKey="_" currentKey={String(sortKey)} currentDir={sortDir} onSort={() => {}} align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.display_name ?? "-"}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => copyId(p.id)}
                    >
                      {p.id.slice(0, 8)}…
                      <Copy className="h-3 w-3" />
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{p.balance}</TableCell>
                  <TableCell>
                    {p.isAdmin ? <Badge>admin</Badge> : <Badge variant="secondary">user</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(p.created_at)}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        openAdjust(p.id, p.display_name ?? p.id.slice(0, 8), p.balance)
                      }
                    >
                      <Coins className="mr-1.5 h-3.5 w-3.5" /> Credit
                    </Button>
                    {p.isAdmin ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => grantAdmin(p.id, false, p.display_name ?? p.id.slice(0, 8))}
                      >
                        <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Thu hồi
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => grantAdmin(p.id, true, p.display_name ?? p.id.slice(0, 8))}
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Cấp admin
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

      <Dialog open={adjust.open} onOpenChange={(o) => setAdjust((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Điều chỉnh credit thủ công</DialogTitle>
            <DialogDescription>
              Người dùng: <span className="font-medium text-foreground">{adjust.name}</span>. Số dư
              hiện tại: <span className="font-medium text-foreground">{adjust.currentBalance}</span>.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Dùng khi hệ thống gặp lỗi (thanh toán không cộng credit, OCR bị trừ oan…) hoặc khi hỗ
              trợ khách qua support. Mọi thao tác đều được ghi vào <b>Audit log</b>.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div>
              <Label htmlFor="delta">Số credit (dương = cộng, âm = trừ)</Label>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setDelta((v) => String(-Math.abs(Number.parseInt(v, 10) || 0) || -1))
                  }
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="delta"
                  type="number"
                  placeholder="vd: 100 hoặc -20"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  className="text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setDelta((v) => String(Math.abs(Number.parseInt(v, 10) || 0) || 1))
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AMOUNT_PRESETS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDelta(String(n))}
                  >
                    +{n}
                  </Button>
                ))}
                {AMOUNT_PRESETS.map((n) => (
                  <Button
                    key={`m-${n}`}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDelta(String(-n))}
                  >
                    -{n}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Lý do (bắt buộc)</Label>
              <Input
                id="reason"
                placeholder="Lý do điều chỉnh…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REASON_PRESETS.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setReason(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>

            {Number.isFinite(parsedDelta) && parsedDelta !== 0 && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                Số dư mới dự kiến:{" "}
                <span className="font-semibold text-foreground tabular-nums">{newBalance}</span>{" "}
                <span className="text-muted-foreground">
                  ({adjust.currentBalance} {parsedDelta > 0 ? "+" : "−"} {Math.abs(parsedDelta)})
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjust({ open: false, userId: null, name: "", currentBalance: 0 })}
            >
              Huỷ
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Đang xử lý…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
