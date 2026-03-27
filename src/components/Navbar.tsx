import { Link } from "react-router-dom";
import { LogOut, Menu, Settings, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import monkeyLogo from "@/assets/monkey.png";

const Navbar = () => {
  const { user, signOut } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          {/* <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary"> */}
          <img src={monkeyLogo} alt="MonkeyOCR Logo" className="h-8 w-10" />
          {/* </div> */}
          <span className="text-lg font-bold font-display text-foreground">
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

        {/* Mobile nav */}
        <div className="flex items-center gap-2 sm:hidden">
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

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mở menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0">
              <SheetHeader className="px-5 py-4 border-b border-border">
                <SheetTitle className="flex items-center gap-2">
                  <img src={monkeyLogo} alt="" className="h-7 w-9" />
                  MonkeyOCR
                </SheetTitle>
              </SheetHeader>

              <div className="px-2 py-3">
                <SheetClose asChild>
                  <Link
                    to="/"
                    className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    Trang chủ
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/pricing"
                    className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    Bảng giá
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/app"
                    className="mt-1 flex w-full items-center rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary"
                  >
                    Bắt đầu OCR
                  </Link>
                </SheetClose>

                <div className="mt-3 border-t border-border pt-3 px-1">
                  {user ? (
                    <div className="space-y-2 px-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.user_metadata?.avatar_url} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {(user.email?.[0] ?? "U").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {user.user_metadata?.full_name ?? user.email}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>

                      <SheetClose asChild>
                        <Link to="/profile">
                          <Button variant="outline" className="w-full justify-start gap-2">
                            <Settings className="h-4 w-4" />
                            Quản lý hồ sơ
                          </Button>
                        </Link>
                      </SheetClose>

                      <Button
                        variant="destructive"
                        className="w-full justify-start gap-2"
                        onClick={() => {
                          void signOut();
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        Đăng xuất
                      </Button>
                    </div>
                  ) : (
                    <div className="px-2">
                      <SheetClose asChild>
                        <Link to="/auth">
                          <Button className="w-full gap-2">
                            <User className="h-4 w-4" />
                            Đăng nhập
                          </Button>
                        </Link>
                      </SheetClose>
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
