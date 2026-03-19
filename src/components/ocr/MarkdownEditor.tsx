import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Grid3x3,
  Heading2,
  Highlighter,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Underline,
  Bold,
  Italic,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MarkdownEditorProps {
  editor: Editor | null;
  isProcessing: boolean;
}

const MarkdownEditor = ({ editor, isProcessing }: MarkdownEditorProps) => {
  if (isProcessing && !editor) {
    return (
      <div className="h-full w-full p-4 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-9/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="mr-1 text-[11px] font-medium">Định dạng nhanh:</span>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={isProcessing || !editor}
          aria-label="Đậm"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={isProcessing || !editor}
          aria-label="Nghiêng"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={isProcessing || !editor}
          aria-label="Tiêu đề"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={isProcessing || !editor}
          aria-label="Gạch chân"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
          disabled={isProcessing || !editor}
          aria-label="Highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={isProcessing || !editor}
          aria-label="Danh sách"
        >
          <List className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={isProcessing || !editor}
          aria-label="Danh sách đánh số"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={isProcessing || !editor}
          aria-label="Trích dẫn"
        >
          <Quote className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="ml-2 flex h-7 items-center justify-center rounded border border-transparent px-2 hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
          disabled={isProcessing || !editor}
          aria-label="Checklist"
        >
          <ListTodo className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn trái"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn giữa"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn phải"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
          disabled={isProcessing || !editor}
          aria-label="Căn đều"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <button
          type="button"
          className="flex h-7 items-center justify-center rounded border border-transparent px-2 hover:border-border hover:bg-muted/60"
          onClick={() => editor?.chain().focus().mergeCells().run()}
          disabled={isProcessing || !editor}
          aria-label="Gộp ô bảng"
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          <span className="ml-1 text-[10px]">Merge</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-card px-4 py-3">
        {editor ? (
          <EditorContent editor={editor} className="h-full" />
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </div>
        )}
      </div>
    </div>
  );
};

export default MarkdownEditor;

