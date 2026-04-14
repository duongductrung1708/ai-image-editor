import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { CREDIT_PACKS } from "@/lib/creditPacks";
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

function toHistoryTextPreview(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  if (!raw.startsWith("<")) return raw;
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

  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { balance, loading: creditsLoading, refresh: refreshCredits } = useCredits();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [ocrHistory, setOcrHistory] = useState<OcrHistoryItem[]>([]);
  const [ocrHistoryLoading, setOcrHistoryLoading] = useState(false);
  const [ocrHistoryQuery, setOcrHistoryQuery] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [deletingAllHistory, setDeletingAllHistory] = useState(false);
  const [confirmDeleteOneOpen, setConfirmDeleteOneOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    const fetchOcrHistory = async () => {
      setOcrHistoryLoading(true);
      const { data, error } = await supabase
        .from("ocr_history")
        .select("id, image_name, extracted_text, image_data, bounding_boxes, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        toast.error("Không thể tải lịch sử OCR.");
        setOcrHistoryLoading(false);
        return;
      }
      const rows = (data ?? []) as OcrHistoryItem[];
      setOcrHistory(rows);
      setSelectedHistoryId((prev) => prev ?? rows[0]?.id ?? null);
      setOcrHistoryLoading(false);
    };
    void fetchOcrHistory();
  }, [user]);

  const filteredHistory = ocrHistory.filter((item) => {
    if (!ocrHistoryQuery.trim()) return true;
    const q = ocrHistoryQuery.trim().toLowerCase();
    return item.image_name.toLowerCase().includes(q) || item.extracted_text.toLowerCase().includes(q);
  });

  const selectedHistory = filteredHistory.find((item) => item.id === selectedHistoryId) ?? null;

  const handleDeleteSelectedHistory = async () => {
    if (!selectedHistory || deletingHistory) return;
    setDeletingHistory(true);
    try {
      const { error } = await supabase.from("ocr_history").delete().eq("id", selectedHistory.id);
      if (error) { toast.error("Không thể xóa lịch sử OCR."); return; }
      setOcrHistory((prev) => {
        const next = prev.filter((item) => item.id !== selectedHistory.id);
        setSelectedHistoryId(next[0]?.id ?? null);
        return next;
      });
      setConfirmDeleteOneOpen(false);
      toast.success("Đã xóa lịch sử OCR.");
    } finally { setDeletingHistory(false); }
  };

  const handleDeleteAllHistory = async () => {
    if (ocrHistory.length === 0 || deletingAllHistory) return;
    setDeletingAllHistory(true);
    try {
      const { error } = await supabase.from("ocr_history").delete().neq("id", "");
      if (error) { toast.error("Không thể xóa toàn bộ lịch sử OCR."); return; }
      setOcrHistory([]);
      setSelectedHistoryId(null);
      setConfirmDeleteAllOpen(false);
      toast.success("Đã xóa toàn bộ lịch sử OCR.");
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
      if (!session?.access_token) {
        toast.error("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("create-vnpay-payment", {
        body: { packId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
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
      <AlertDialog open={confirmDeleteOneOpen} onOpenChange={(open) => { if (!deletingHistory) setConfirmDeleteOneOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa lịch sử OCR?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedHistory
                ? `Bạn có chắc muốn xóa "${selectedHistory.image_name}"? Hành động này không thể hoàn tác.`
                : "Bạn có chắc muốn xóa bản ghi này? Hành động này không thể hoàn tác."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingHistory}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDeleteSelectedHistory(); }}
              disabled={deletingHistory || !selectedHistory}
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

                    <div className="rounded-md border border-border bg-card p-3">
                      {selectedHistory ? (
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{selectedHistory.image_name}</p>
                              <p className="text-xs text-muted-foreground">{new Date(selectedHistory.created_at).toLocaleString("vi-VN")}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="ghost" size="icon" onClick={() => navigate(`/app?historyId=${selectedHistory.id}`)} title="Mở trong OCR">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="destructive" size="icon" className="gap-1.5" onClick={() => setConfirmDeleteOneOpen(true)} disabled={deletingHistory}>
                                {deletingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                          {selectedHistory.image_data ? (
                            <img src={selectedHistory.image_data} alt={selectedHistory.image_name}
                              className="max-h-56 w-full cursor-pointer rounded border border-border object-contain"
                              title="Bấm để mở trong OCR" onClick={() => navigate(`/app?historyId=${selectedHistory.id}`)} />
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
