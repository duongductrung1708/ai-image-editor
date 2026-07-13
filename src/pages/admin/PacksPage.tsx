import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Package, Coins, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCreditPacks, type CreditPack } from "@/hooks/useCreditPacks";
import { fmtVnd } from "@/hooks/admin/useAdminData";

type FormState = {
  id: string;
  credits: string;
  priceVnd: string;
  label: string;
  description: string;
  sortOrder: string;
  active: boolean;
};

const emptyForm: FormState = {
  id: "",
  credits: "",
  priceVnd: "",
  label: "",
  description: "",
  sortOrder: "0",
  active: true,
};

function toForm(p: CreditPack): FormState {
  return {
    id: p.id,
    credits: String(p.credits),
    priceVnd: String(p.priceVnd),
    label: p.label,
    description: p.description ?? "",
    sortOrder: String(p.sortOrder),
    active: p.active,
  };
}

export default function AdminPacksPage() {
  const { packs, loading, refresh } = useCreditPacks({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CreditPack | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? toForm(editing) : emptyForm);
    }
  }, [open, editing]);

  const totals = useMemo(() => {
    const active = packs.filter((p) => p.active).length;
    return { total: packs.length, active, inactive: packs.length - active };
  }, [packs]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (p: CreditPack) => {
    setEditing(p);
    setOpen(true);
  };

  const save = async () => {
    const credits = Number(form.credits);
    const priceVnd = Number(form.priceVnd);
    const sortOrder = Number(form.sortOrder);
    if (!form.id.trim() || !form.label.trim()) {
      toast({ title: "Thiếu thông tin", description: "Mã gói và tên hiển thị là bắt buộc.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(credits) || credits <= 0 || !Number.isFinite(priceVnd) || priceVnd <= 0) {
      toast({ title: "Giá trị không hợp lệ", description: "Số credit và giá phải là số dương.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_upsert_credit_pack", {
      p_id: form.id.trim(),
      p_credits: Math.floor(credits),
      p_price_vnd: Math.floor(priceVnd),
      p_label: form.label.trim(),
      p_description: form.description.trim() || null,
      p_sort_order: Number.isFinite(sortOrder) ? Math.floor(sortOrder) : 0,
      p_active: form.active,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Lỗi khi lưu", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Đã cập nhật gói" : "Đã tạo gói mới" });
    setOpen(false);
    void refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.rpc("admin_delete_credit_pack", { p_id: id });
    if (error) {
      toast({ title: "Lỗi xóa", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Đã xóa gói ${id}` });
    void refresh();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4" /> Tổng số gói
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="h-4 w-4" /> Đang bán
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-primary">{totals.active}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4" /> Đã tắt
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-muted-foreground">{totals.inactive}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Gói credit</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-1 h-4 w-4" /> Tạo gói
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? `Sửa gói ${editing.id}` : "Tạo gói mới"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pack-id">Mã gói (ID)</Label>
                    <Input
                      id="pack-id"
                      value={form.id}
                      onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                      placeholder="pack_500"
                      disabled={!!editing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Dùng cho URL & webhook. Không thay đổi sau khi tạo.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pack-label">Tên hiển thị</Label>
                    <Input
                      id="pack-label"
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="500 credits"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="pack-credits">Số credit</Label>
                      <Input
                        id="pack-credits"
                        type="number"
                        value={form.credits}
                        onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="pack-price">Giá (VND)</Label>
                      <Input
                        id="pack-price"
                        type="number"
                        value={form.priceVnd}
                        onChange={(e) => setForm((f) => ({ ...f, priceVnd: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pack-desc">Mô tả</Label>
                    <Input
                      id="pack-desc"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="~$5"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="pack-sort">Thứ tự hiển thị</Label>
                      <Input
                        id="pack-sort"
                        type="number"
                        value={form.sortOrder}
                        onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label htmlFor="pack-active" className="cursor-pointer">Đang bán</Label>
                        <p className="text-xs text-muted-foreground">Ẩn khỏi trang giá khi tắt.</p>
                      </div>
                      <Switch
                        id="pack-active"
                        checked={form.active}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Giá</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead className="text-right">Thứ tự</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && packs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : packs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Chưa có gói nào. Bấm "Tạo gói" để thêm.
                    </TableCell>
                  </TableRow>
                ) : (
                  packs.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell className="font-medium">{p.label}</TableCell>
                      <TableCell className="text-right">{p.credits.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{fmtVnd(p.priceVnd)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.description ?? "—"}</TableCell>
                      <TableCell className="text-right">{p.sortOrder}</TableCell>
                      <TableCell>
                        {p.active ? (
                          <Badge>Đang bán</Badge>
                        ) : (
                          <Badge variant="secondary">Đã tắt</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Xóa gói {p.id}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Hành động này không thể hoàn tác. Các đơn hàng cũ dùng gói này vẫn được giữ lại nhưng khách hàng sẽ không thể mua gói này nữa. Cân nhắc "Tắt" thay vì xóa.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Hủy</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(p.id)}>Xóa</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
