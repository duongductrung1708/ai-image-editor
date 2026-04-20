import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useOcrHistory } from "@/hooks/useOcrHistory";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { CREDIT_PACKS } from "@/lib/creditPacks";
import { useCreateVnpayPayment } from "@/hooks/useVnpay";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Save,
  Upload,
  KeyRound,
  User,
  Coins,
  Check,
  History,
  Trash2,
  Eye,
} from "lucide-react";
import { useProfileStore } from "@/stores/profileStore";
import { Badge } from "@/components/ui/badge";

function toHistoryTextPreview(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";

  // OCR history can be:
  // - plain text/markdown
  // - HTML produced by the OCR editor
  // - mixed text + embedded HTML tags
  // If it contains HTML tags anywhere, prefer extracting text-only preview.
  const looksLikeHtml =
    raw.startsWith("<") ||
    /<\s*(p|div|span|table|img|br|h\d|ul|ol|li)\b/i.test(raw);
  if (!looksLikeHtml) return raw;

  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const out: string[] = [];
    const blocks = Array.from(doc.querySelectorAll("p"));
    for (const p of blocks) {
      const kind = (p.getAttribute("data-bbox-kind") || "").toLowerCase();
      const hasImg = Boolean(p.querySelector("img"));
      const t = (p.textContent ?? "").trim();
      if (hasImg) {
        if (kind === "stamp") out.push("[CON DẤU]");
        else if (kind === "signature") out.push("[CHỮ KÝ]");
        else out.push("[HÌNH]");
        continue;
      }
      if (t) out.push(t);
    }
    const joined = out.join("\n").trim();
    return joined || doc.body.textContent?.trim() || "";
  } catch {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

const ProfilePage = () => {
  interface OcrHistoryItem {
    id: string;
    image_name: string;
    extracted_text: string;
    image_data: string | null;
    bounding_boxes: Json | null;
    created_at: string;
  }

  const { user } = useAuth();
  const navigate = useNavigate();
  const { balance, loading: creditsLoading } = useCredits();
  const createVnpayPayment = useCreateVnpayPayment();

  // Transaction history
  const [transactions, setTransactions] = useState<
    { id: string; amount: number; type: string; description: string | null; created_at: string; vnpay_txn_ref: string | null }[]
  >([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setTxLoading(true);
    supabase
      .from("credit_transactions")
      .select("id, amount, type, description, created_at, vnpay_txn_ref")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setTransactions(data ?? []);
        setTxLoading(false);
      });
  }, [user]);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const ocrHistoryQuery = useProfileStore((s) => s.ocrHistoryQuery);
  const setOcrHistoryQuery = useProfileStore((s) => s.setOcrHistoryQuery);
  const selectedHistoryId = useProfileStore((s) => s.selectedHistoryId);
  const setSelectedHistoryId = useProfileStore((s) => s.setSelectedHistoryId);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [deletingAllHistory, setDeletingAllHistory] = useState(false);
  const [confirmDeleteOneOpen, setConfirmDeleteOneOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  /** Snapshot at open so dialog text / mutation target stay stable if cache refetch retargets selection. */
  const [deleteOnePending, setDeleteOnePending] = useState<{
    id: string;
    image_name: string;
    batch_session_id?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? "");
          setAvatarUrl(data.avatar_url);
        }
        setLoading(false);
      });
  }, [user]);

  const {
    entries: ocrHistory,
    loading: ocrHistoryLoading,
    deleteOne: deleteHistoryOne,
    deleteAll: deleteHistoryAll,
  } = useOcrHistory(100);

  useEffect(() => {
    if (confirmDeleteOneOpen || deletingHistory) return;
    if (!selectedHistoryId) {
      setSelectedHistoryId(ocrHistory[0]?.id ?? null);
      return;
    }
    if (ocrHistory.length > 0 && !ocrHistory.some((h) => h.id === selectedHistoryId)) {
      setSelectedHistoryId(ocrHistory[0]?.id ?? null);
    }
  }, [
    ocrHistory,
    selectedHistoryId,
    setSelectedHistoryId,
    confirmDeleteOneOpen,
    deletingHistory,
  ]);

  const filteredHistory = ocrHistory.filter((item) => {
    if (!ocrHistoryQuery.trim()) return true;
    const q = ocrHistoryQuery.trim().toLowerCase();
    return item.image_name.toLowerCase().includes(q) || item.extracted_text.toLowerCase().includes(q);
  });

  const selectedHistory = filteredHistory.find((item) => item.id === selectedHistoryId) ?? null;
  const [batchPagePreviews, setBatchPagePreviews] = useState<
    Array<{ pageIndex: number; fileName: string; imageData: string | null }>
  >([]);
  const [batchPreviewLoading, setBatchPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setBatchPagePreviews([]);
      if (!selectedHistory) return;

      const batchSessionId =
        (selectedHistory as unknown as { batch_session_id?: string }).batch_session_id ?? null;

      const bbPages =
        (
          selectedHistory.bounding_boxes as
            | { pages?: Array<{ index?: number; name?: string; image_data?: string | null }> }
            | null
        )?.pages ?? [];
      const bbImageByIndex = new Map<number, string | null>();
      for (const p of bbPages) {
        if (typeof p?.index === "number") {
          bbImageByIndex.set(p.index, p.image_data ?? null);
        }
      }

      const isBatch =
        Boolean((selectedHistory as unknown as { batch_page_count?: number }).batch_page_count) ||
        Boolean(batchSessionId) ||
        (() => {
          const bb = selectedHistory.bounding_boxes;
          return (
            bb &&
            typeof bb === "object" &&
            !Array.isArray(bb) &&
            (bb as { batch?: boolean }).batch === true
          );
        })();

      if (!isBatch) return;

      setBatchPreviewLoading(true);
      try {
        if (batchSessionId) {
          const { data, error } = await supabase
            .from("ocr_batch_pages")
            .select("page_index, file_name, image_data")
            .eq("session_id", batchSessionId)
            .order("page_index", { ascending: true });
          if (error) throw error;

          const rows = (data ?? []).map((p) => {
            const pageIndex = p.page_index;
            const dbImg = p.image_data ?? null;
            const fallbackImg = bbImageByIndex.get(pageIndex) ?? null;
            return {
              pageIndex,
              fileName: p.file_name,
              imageData: dbImg ?? fallbackImg,
            };
          });
          if (!cancelled) setBatchPagePreviews(rows);
          return;
        }

        // Fallback: try to extract from bounding_boxes.pages[] (older rows)
        const bb = selectedHistory.bounding_boxes as
          | { pages?: Array<{ index?: number; name?: string; image_data?: string | null }> }
          | null;
        const pages = bb?.pages ?? [];
        const rows = pages
          .map((p, idx) => ({
            pageIndex: typeof p.index === "number" ? p.index : idx,
            fileName: typeof p.name === "string" ? p.name : `Trang ${idx + 1}`,
            imageData: p.image_data ?? null,
          }))
          .sort((a, b) => a.pageIndex - b.pageIndex);
        if (!cancelled) setBatchPagePreviews(rows);
      } catch {
        if (!cancelled) setBatchPagePreviews([]);
      } finally {
        if (!cancelled) setBatchPreviewLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedHistory]);

  const handleDeleteSelectedHistory = async () => {
    if (!deleteOnePending || deletingHistory) return;
    setDeletingHistory(true);
    try {
      await deleteHistoryOne.mutateAsync({
        id: deleteOnePending.id,
        batchSessionId: deleteOnePending.batch_session_id ?? undefined,
      });
      setConfirmDeleteOneOpen(false);
      setDeleteOnePending(null);
      toast.success("Đã xóa lịch sử OCR.");
    } catch {
      toast.error("Không thể xóa lịch sử OCR.");
    } finally {
      setDeletingHistory(false);
    }
  };

  const handleDeleteAllHistory = async () => {
    if (ocrHistory.length === 0 || deletingAllHistory) return;
    setDeletingAllHistory(true);
    try {
      await deleteHistoryAll.mutateAsync();
      setSelectedHistoryId(null);
      setConfirmDeleteAllOpen(false);
      toast.success("Đã xóa toàn bộ lịch sử OCR.");
    } catch {
      toast.error("Không thể xóa toàn bộ lịch sử OCR.");
    } finally { setDeletingAllHistory(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error("Không thể lưu hồ sơ.");
    else toast.success("Đã cập nhật hồ sơ!");
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) { toast.error("Vui lòng nhập đầy đủ mật khẩu mới."); return; }
    if (newPassword.length < 6) { toast.error("Mật khẩu mới phải có ít nhất 6 ký tự."); return; }
    if (newPassword !== confirmPassword) { toast.error("Mật khẩu xác nhận không khớp."); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) toast.error(error.message || "Không thể đổi mật khẩu.");
    else { toast.success("Đã đổi mật khẩu thành công!"); setNewPassword(""); setConfirmPassword(""); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast.error("Vui lòng chọn file ảnh."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Ảnh không được vượt quá 2MB."); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: dataUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      setAvatarUrl(dataUrl);
      toast.success("Đã cập nhật ảnh đại diện!");
    } catch { toast.error("Không thể tải ảnh lên."); }
    finally { setUploading(false); }
  };

  const handleBuyCredits = async (packId: string) => {
    setCheckoutLoading(packId);
    try {
      const data = await createVnpayPayment.mutateAsync(packId);
      if (data?.url) window.location.href = data.url;
    } catch { toast.error("Không thể tạo phiên thanh toán."); }
    finally { setCheckoutLoading(null); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AlertDialog
        open={confirmDeleteOneOpen}
        onOpenChange={(open) => {
          if (deletingHistory) return;
          setConfirmDeleteOneOpen(open);
          if (!open) setDeleteOnePending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa lịch sử OCR?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="min-w-0">
                {deleteOnePending ? (
                  <p className="text-left">
                    Bạn có chắc muốn xóa{" "}
                    <span className="inline font-mono text-xs break-all">
                      &quot;{deleteOnePending.image_name}&quot;
                    </span>
                    ? Hành động này không thể hoàn tác.
                  </p>
                ) : (
                  "Bạn có chắc muốn xóa bản ghi này? Hành động này không thể hoàn tác."
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingHistory}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteSelectedHistory();
              }}
              disabled={deletingHistory || !deleteOnePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingHistory ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteAllOpen} onOpenChange={(open) => { if (!deletingAllHistory) setConfirmDeleteAllOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa toàn bộ lịch sử OCR?</AlertDialogTitle>
            <AlertDialogDescription>Hành động này sẽ xóa toàn bộ lịch sử OCR và không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAllHistory}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDeleteAllHistory(); }}
              disabled={deletingAllHistory || ocrHistory.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAllHistory ? "Đang xóa..." : "Xóa toàn bộ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Navbar />
      <div className="mx-auto max-w-2xl px-6 pt-24 pb-16">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-4 w-4" />
              Hồ sơ
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              <KeyRound className="h-4 w-4" />
              Bảo mật
            </TabsTrigger>
            <TabsTrigger value="plan" className="gap-1.5">
              <Coins className="h-4 w-4" />
              Credits
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              Lịch sử OCR
            </TabsTrigger>
          </TabsList>

          {/* Tab: Hồ sơ */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Hồ sơ cá nhân</CardTitle>
                <CardDescription>Cập nhật tên hiển thị và ảnh đại diện</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {(displayName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="relative">
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={uploading}>
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {uploading ? "Đang tải..." : "Đổi ảnh đại diện"}
                    </Button>
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="absolute inset-0 cursor-pointer opacity-0" disabled={uploading} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Tên hiển thị</Label>
                  <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nhập tên hiển thị" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email ?? ""} disabled className="opacity-60" />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Bảo mật */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  Đổi mật khẩu
                </CardTitle>
                <CardDescription>Cập nhật mật khẩu đăng nhập của bạn</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Mật khẩu mới</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nhập mật khẩu mới" minLength={6} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu mới" minLength={6} />
                </div>
                <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full gap-1.5">
                  {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {changingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Credits */}
          <TabsContent value="plan">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Số dư Credits
                </CardTitle>
                <CardDescription>1 credit = 1 lượt OCR. Bạn được 5 lượt miễn phí mỗi ngày.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <Coins className="h-5 w-5 text-primary" />
                  <span className="text-2xl font-bold text-foreground">
                    {creditsLoading ? "..." : balance.toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground">credits</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {CREDIT_PACKS.map((pack) => (
                    <div key={pack.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div>
                        <p className="font-semibold text-foreground">{pack.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {pack.priceVnd.toLocaleString("vi-VN")}đ {pack.description}
                        </p>
                      </div>
                      <Button size="sm" disabled={checkoutLoading === pack.id} onClick={() => handleBuyCredits(pack.id)}>
                        {checkoutLoading === pack.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mua"}
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Transaction history */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <History className="h-4 w-4" />
                    Lịch sử giao dịch
                  </h3>
                  {txLoading ? (
                    <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải...
                    </div>
                  ) : transactions.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Chưa có giao dịch nào.</p>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Thời gian</TableHead>
                            <TableHead className="text-xs">Loại</TableHead>
                            <TableHead className="text-xs">Mô tả</TableHead>
                            <TableHead className="text-xs text-right">Số lượng</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((tx) => (
                            <TableRow key={tx.id}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(tx.created_at).toLocaleString("vi-VN")}
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  tx.type === "topup" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : tx.type === "refund" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                }`}>
                                  {tx.type === "topup" ? "Nạp" : tx.type === "refund" ? "Hoàn" : "Sử dụng"}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                {tx.description || tx.vnpay_txn_ref || "—"}
                              </TableCell>
                              <TableCell className={`text-xs text-right font-medium ${tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                                {tx.amount > 0 ? "+" : ""}{tx.amount}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Lịch sử OCR */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Lịch sử OCR</CardTitle>
                <CardDescription>Xem nhanh các lần nhận diện trước đó của bạn.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={ocrHistoryQuery} onChange={(e) => setOcrHistoryQuery(e.target.value)} placeholder="Tìm theo tên file hoặc nội dung..." className="flex-1" />
                  <Button type="button" variant="destructive" onClick={() => setConfirmDeleteAllOpen(true)} disabled={ocrHistory.length === 0 || deletingAllHistory} className="gap-1.5">
                    {deletingAllHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Xóa toàn bộ
                  </Button>
                </div>

                {ocrHistoryLoading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang tải lịch sử...
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Chưa có dữ liệu lịch sử OCR.</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                    <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
                      {filteredHistory.map((item) => {
                        const isActive = item.id === selectedHistory?.id;
                        return (
                          <button key={item.id} type="button" onClick={() => setSelectedHistoryId(item.id)}
                            className={`w-full border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 ${isActive ? "bg-secondary" : "hover:bg-secondary/40"}`}>
                            <p className="truncate text-xs font-medium text-foreground">{item.image_name}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString("vi-VN")}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="min-w-0 rounded-md border border-border bg-card p-3">
                      {selectedHistory ? (
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {selectedHistory.image_name}
                              </p>
                              <p className="text-xs text-muted-foreground">{new Date(selectedHistory.created_at).toLocaleString("vi-VN")}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="ghost" size="icon" onClick={() => navigate(`/app?historyId=${selectedHistory.id}`)} title="Mở trong OCR">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="gap-1.5"
                                onClick={() => {
                                  if (!selectedHistory || deletingHistory) return;
                                  setDeleteOnePending({
                                    id: selectedHistory.id,
                                    image_name: selectedHistory.image_name,
                                    batch_session_id: (
                                      selectedHistory as unknown as { batch_session_id?: string | null }
                                    ).batch_session_id,
                                  });
                                  setConfirmDeleteOneOpen(true);
                                }}
                                disabled={deletingHistory || !selectedHistory}
                              >
                                {deletingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                          {batchPreviewLoading ? (
                            <div className="flex items-center justify-center rounded border border-border bg-background p-6 text-xs text-muted-foreground">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Đang tải ảnh từng trang...
                            </div>
                          ) : batchPagePreviews.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground">
                                  Ảnh trong batch
                                </p>
                                <Badge variant="secondary" className="text-[10px]">
                                  {batchPagePreviews.length} trang
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {batchPagePreviews.map((p) => (
                                  <button
                                    key={`${selectedHistory.id}-${p.pageIndex}`}
                                    type="button"
                                    className="group overflow-hidden rounded border border-border bg-background text-left"
                                    title="Mở batch trong OCR"
                                    onClick={() => navigate(`/app?historyId=${selectedHistory.id}`)}
                                  >
                                    <div className="aspect-[4/3] w-full bg-muted/20">
                                      {p.imageData ? (
                                        <img
                                          src={p.imageData}
                                          alt={p.fileName}
                                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                          (Không có ảnh)
                                        </div>
                                      )}
                                    </div>
                                    <div className="px-2 py-1">
                                      <p className="truncate text-[10px] text-muted-foreground">
                                        {p.pageIndex + 1}. {p.fileName}
                                      </p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : selectedHistory.image_data ? (
                            <div className="w-full overflow-hidden rounded border border-border bg-background">
                              <img
                                src={selectedHistory.image_data}
                                alt={selectedHistory.image_name}
                                className="block max-h-56 w-full max-w-full cursor-pointer object-contain"
                                title="Bấm để mở trong OCR"
                                onClick={() => navigate(`/app?historyId=${selectedHistory.id}`)}
                              />
                            </div>
                          ) : null}
                          <div className="max-h-48 overflow-y-auto rounded border border-border bg-background p-2">
                            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                              {toHistoryTextPreview(selectedHistory.extracted_text) || "(Không có nội dung)"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Chọn một bản ghi để xem chi tiết.</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ProfilePage;
