import { Link } from "react-router-dom";
import { ScanText } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <ScanText className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold font-display text-foreground">VietOCR</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Trang chủ
          </Link>
          <Link to="/app" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
            Bắt đầu OCR
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
