import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDocumentChat } from "./useDocumentChat";

interface DocumentChatPanelProps {
  imageUrl: string;
  ocrText: string;
  /** Đổi khi mở ảnh khác → reset hội thoại. */
  sessionKey: string;
  /** Disable khi OCR chưa xong. */
  disabled?: boolean;
}

const SUGGESTED: string[] = [
  "Tóm tắt nội dung tài liệu này.",
  "Liệt kê các thông tin quan trọng.",
  "Có số liệu nào trong tài liệu không?",
];

const DocumentChatPanel = ({
  imageUrl,
  ocrText,
  sessionKey,
  disabled,
}: DocumentChatPanelProps) => {
  const { messages, isSending, error, send, reset } = useDocumentChat({
    imageUrl,
    ocrText,
    sessionKey,
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setInput("");
  }, [sessionKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isSending]);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled, sessionKey]);

  const submit = async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || isSending || disabled) return;
    setInput("");
    await send(value);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Bot className="h-3.5 w-3.5 text-primary" />
          Hỏi đáp về tài liệu
        </div>
        {messages.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={reset}
            disabled={isSending}
          >
            <RotateCcw className="h-3 w-3" />
            Xóa
          </Button>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div className="max-w-sm text-sm text-muted-foreground">
              Hỏi bất kỳ điều gì về ảnh tài liệu bạn vừa OCR. AI sẽ trả lời
              dựa trên nội dung tài liệu.
            </div>
            <div className="flex w-full max-w-md flex-col gap-1.5">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent"
                  onClick={() => void submit(s)}
                  disabled={disabled || isSending}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground",
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {isSending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  AI đang trả lời…
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-border bg-card px-3 py-2"
      >
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            disabled
              ? "Đang chờ OCR hoàn tất…"
              : "Hỏi về tài liệu… (Enter để gửi, Shift+Enter xuống dòng)"
          }
          disabled={disabled || isSending}
          className="min-h-[40px] max-h-32 resize-none text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || isSending || !input.trim()}
          aria-label="Gửi"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
};

export default DocumentChatPanel;
