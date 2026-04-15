import { Link } from "react-router-dom";
import { Home, LogOut, Menu, Settings, Sparkles, Tag, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import monkeyLogo from "@/assets/monkey.png";

const mobileNavLinkClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary active:bg-secondary/80";

const Navbar = () => {
  const { user, signOut } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link to="/" className="flex min-w-0 shrink items-center gap-2">
          <img src={monkeyLogo} alt="MonkeyOCR Logo" className="h-8 w-10 shrink-0" />
          <span className="truncate text-lg font-bold font-display text-foreground">
            MonkeyOCR
          </span>
        </Link>
        {/* Desktop nav */}
        <div className="hidden items-center gap-4 sm:flex">
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Trang chủ
          </Link>
          <Link
            to="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Bảng giá
          </Link>
          <Link
            to="/app"
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Bắt đầu OCR
          </Link>
          <Link
            to="/privacy"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
          <Link
            to="/terms"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms
          </Link>
          <Link
            to="/support"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Hỗ trợ
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-accent/40 hover:text-accent-foreground/90"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {(user.email?.[0] ?? "U").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-foreground truncate">
                    {user.user_metadata?.full_name ?? user.email}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <Link to="/profile">
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-3.5 w-3.5" />
                    Quản lý hồ sơ
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button variant="outline" size="sm" className="gap-1.5">
                <User className="h-3.5 w-3.5" />
                Đăng nhập
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile: CTA nhanh + menu (tài khoản chỉ trong sheet — tránh trùng với avatar) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
          <Link to="/app">
            <Button
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3.5 text-xs font-semibold shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              OCR
            </Button>
          </Link>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Mở menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[min(100vw,20rem)] flex-col gap-0 border-l bg-background p-0"
            >
              <SheetHeader className="space-y-1 border-b border-border bg-muted/30 px-4 py-4 text-left">
                <SheetTitle className="flex items-center gap-2.5 text-base font-semibold">
                  <img src={monkeyLogo} alt="" className="h-8 w-10" />
                  Menu
                </SheetTitle>
                <p className="text-xs font-normal text-muted-foreground">
                  MonkeyOCR — nhận diện văn bản đa ngôn ngữ
                </p>
              </SheetHeader>

              <div className="flex flex-1 flex-col overflow-y-auto px-3 pb-6 pt-2">
                {user ? (
                  <div className="mb-3 rounded-2xl border border-border/80 bg-card p-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 ring-2 ring-primary/15">
                        <AvatarImage src={user.user_metadata?.avatar_url} />
                        <AvatarFallback className="bg-primary/10 text-sm text-primary">
                          {(user.email?.[0] ?? "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {user.user_metadata?.full_name ?? user.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <nav className="flex flex-col gap-0.5" aria-label="Điều hướng">
                  <SheetClose asChild>
                    <Link to="/" className={cn(mobileNavLinkClass)}>
                      <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                      Trang chủ
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link to="/pricing" className={cn(mobileNavLinkClass)}>
                      <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                      Bảng giá
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      to="/app"
                      className={cn(
                        mobileNavLinkClass,
                        "bg-primary/8 font-semibold text-primary hover:bg-primary/15",
                      )}
                    >
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                      Bắt đầu OCR
                    </Link>
                  </SheetClose>
                </nav>

                <Separator className="my-3" />

                <nav className="mb-3 flex flex-col gap-0.5" aria-label="Pháp lý">
                  <SheetClose asChild>
                    <Link to="/privacy" className={cn(mobileNavLinkClass)}>
                      Privacy Policy
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link to="/terms" className={cn(mobileNavLinkClass)}>
                      Terms of Service
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link to="/support" className={cn(mobileNavLinkClass)}>
                      Hỗ trợ & FAQ
                    </Link>
                  </SheetClose>
                </nav>

                {user ? (
                  <div className="flex flex-col gap-1.5">
                    <SheetClose asChild>
                      <Link to="/profile" className={cn(mobileNavLinkClass)}>
                        <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
                        Quản lý hồ sơ
                      </Link>
                    </SheetClose>
                    <Button
                      variant="ghost"
                      className="h-auto justify-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        void signOut();
                      }}
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      Đăng xuất
                    </Button>
                  </div>
                ) : (
                  <SheetClose asChild>
                    <Link to="/auth">
                      <Button className="h-11 w-full gap-2 rounded-xl text-sm font-semibold shadow-sm">
                        <User className="h-4 w-4" />
                        Đăng nhập
                      </Button>
                    </Link>
                  </SheetClose>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
