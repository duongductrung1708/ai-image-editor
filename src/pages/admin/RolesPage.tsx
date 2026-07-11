import { useState } from "react";
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
import { ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDate, useAdminRoles } from "@/hooks/admin/useAdminData";

export default function AdminRolesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const roles = useAdminRoles(true);
  const [uid, setUid] = useState("");

  const setRole = async (userId: string, grant: boolean) => {
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cấp quyền admin</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="grant-uid" className="text-xs">
                User ID (UUID)
              </Label>
              <Input
                id="grant-uid"
                placeholder="uuid…"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button
              onClick={async () => {
                if (!uid.trim()) return;
                await setRole(uid.trim(), true);
                setUid("");
              }}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> Cấp quyền
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Mẹo: bạn cũng có thể cấp quyền trực tiếp từ tab Người dùng.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách quyền ({roles.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Ngày cấp</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.data?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs break-all">{r.user_id}</TableCell>
                    <TableCell>
                      <Badge>{r.role}</Badge>
                    </TableCell>
                    <TableCell>{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {r.role === "admin" && r.user_id !== user?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRole(r.user_id, false)}
                        >
                          <ShieldX className="mr-1.5 h-3.5 w-3.5" /> Thu hồi
                        </Button>
                      )}
                      {r.user_id === user?.id && (
                        <span className="text-xs text-muted-foreground">bạn</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
