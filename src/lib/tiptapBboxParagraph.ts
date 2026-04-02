import { mergeAttributes } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";

/**
 * Paragraph gắn `data-bbox-id` để đồng bộ bbox ↔ đoạn editor.
 * Gộp text-align (TextAlign) + text-indent (OCR) trong một `style`.
 */
export const BboxParagraph = Paragraph.extend({
  name: "paragraph",

  addAttributes() {
    return {
      ...this.parent?.(),
      dataBboxId: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute("data-bbox-id"),
        renderHTML: (attrs) =>
          attrs.dataBboxId
            ? { "data-bbox-id": attrs.dataBboxId as string }
            : {},
      },
      dataBboxKind: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute("data-bbox-kind"),
        renderHTML: (attrs) =>
          attrs.dataBboxKind
            ? { "data-bbox-kind": attrs.dataBboxKind as string }
            : {},
      },
      textIndent: {
        default: null as string | null,
        parseHTML: (el) => {
          const t = el.style?.textIndent;
          if (!t || t === "0px") return null;
          return t;
        },
        renderHTML: () => ({}),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const styles: string[] = [];
    const ta = node.attrs.textAlign as string | null | undefined;
    const ti = node.attrs.textIndent as string | null | undefined;
    if (ta) styles.push(`text-align: ${ta}`);
    if (ti) styles.push(`text-indent: ${ti}`);
    const merged: Record<string, unknown> = { ...HTMLAttributes };
    if (styles.length) {
      merged.style = styles.join("; ");
    }
    return [
      "p",
      mergeAttributes(this.options.HTMLAttributes, merged),
      0,
    ];
  },
});
