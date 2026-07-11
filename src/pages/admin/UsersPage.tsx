import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Coins, Download, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadCsv,
  fmtDate,
  useAdminCredits,
  useAdminProfiles,
  useAdminRoles,
} from "@/hooks/admin/useAdminData";

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const profiles = useAdminProfiles(true);
  const credits = useAdminCredits(true);
  const roles = useAdminRoles(true);

  const [q, setQ] = useState("");
  const [adjust, setAdjust] = useState<{ open: boolean; userId: string | null; name: string }>({
    open: false,
    userId: null,
    name: "",
  });
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const adminIds = useMemo(
    () => new Set((roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id)),
    [roles.data],
  );

  const rows = useMemo(() => {
    const list = profiles.data ?? [];
    const s = q.trim().toLowerCase();
    const filtered = s
      ? list.filter(
          (p) =>
            (p.display_name ?? "").toLowerCase().includes(s) ||
            p.id.toLowerCase().includes(s),
        )
      : list;
    return filtered.map((p) => ({
      ...p,
      balance: credits.data?.find((c) => c.user_id === p.id)?.balance ?? 0,
      isAdmin: adminIds.has(p.id),
    }));
  }, [profiles.data, credits.data, adminIds, q]);

  const submit = async () => {
    if (!adjust.userId) return;
    const d = parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) {
      toast({ title: "Số credit không hợp lệ", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("admin_adjust_credits", {
      p_target_user: adjust.userId,
      p_delta: d,
      p_reason: reason || "admin_adjust",
    } as never);
    if (error) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Đã cập nhật ${d > 0 ? "+" : ""}${d} credit` });
    setAdjust({ open: false, userId: null, name: "" });
    setDelta("");
    setReason("");
    void qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const grantAdmin = async (userId: string, grant: boolean) => {
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

  const exportCsv = () =>
    downloadCsv(
      `users-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        user_id: r.id,
        display_name: r.display_name ?? "",
        balance: r.balance,
        is_admin: r.isAdmin ? "yes" : "",
        created_at: r.created_at,
      })),
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Người dùng ({rows.length})</CardTitle>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Tìm theo tên hoặc user id…"
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
                <TableHead>Tên hiển thị</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.display_name ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}…</TableCell>
                  <TableCell className="text-right font-medium">{p.balance}</TableCell>
                  <TableCell>
                    {p.isAdmin ? <Badge>admin</Badge> : <Badge variant="secondary">user</Badge>}
                  </TableCell>
                  <TableCell>{fmtDate(p.created_at)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setAdjust({
                          open: true,
                          userId: p.id,
                          name: p.display_name ?? p.id.slice(0, 8),
                        })
                      }
                    >
                      <Coins className="mr-1.5 h-3.5 w-3.5" /> Credit
                    </Button>
                    {!p.isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => grantAdmin(p.id, true)}>
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Cấp admin
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={adjust.open} onOpenChange={(o) => setAdjust((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh credit</DialogTitle>
            <DialogDescription>
              Người dùng: <span className="font-medium">{adjust.name}</span>. Nhập số dương để cộng,
              số âm để trừ.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="delta">Số credit (±)</Label>
              <Input
                id="delta"
                type="number"
                placeholder="vd: 100 hoặc -20"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reason">Ghi chú</Label>
              <Input
                id="reason"
                placeholder="Lý do điều chỉnh…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjust({ open: false, userId: null, name: "" })}>
              Huỷ
            </Button>
            <Button onClick={submit}>Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
