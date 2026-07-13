import { Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminSidebar } from "./AdminSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { RefreshCw, LogOut, User } from "lucide-react";

const titleFor = (path: string) => {
  if (path === "/admin") return "Tổng quan";
  if (path.startsWith("/admin/users")) return "Người dùng";
  if (path.startsWith("/admin/orders")) return "Đơn hàng";
  if (path.startsWith("/admin/transactions")) return "Giao dịch credit";
  if (path.startsWith("/admin/ocr")) return "Lịch sử OCR";
  if (path.startsWith("/admin/packs")) return "Gói credit";
  if (path.startsWith("/admin/roles")) return "Phân quyền";
  if (path.startsWith("/admin/audit")) return "Audit log";
  return "Admin";

};

export default function AdminLayout() {
  const qc = useQueryClient();
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const { pathname } = useLocation();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/app" replace />;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AdminSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="mx-2 h-5 w-px bg-border" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold sm:text-base">{titleFor(pathname)}</h1>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Bảng điều khiển quản trị VetaOCR
              </p>
            </div>

            <Badge variant="secondary" className="hidden sm:inline-flex">
              <User className="mr-1 h-3 w-3" />
              {user.email}
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin"] })}
            >
              <RefreshCw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Làm mới</span>
            </Button>

            <Button variant="ghost" size="sm" asChild>
              <Link to="/app">Ứng dụng</Link>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="text-destructive hover:text-destructive"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </header>

          <main className="flex-1 overflow-x-hidden p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
