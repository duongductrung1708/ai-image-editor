import Paragraph from "@tiptap/extension-paragraph";

/**
 * Paragraph gắn `data-bbox-id` để đồng bộ bbox ↔ đoạn editor.
 */
export const BboxParagraph = Paragraph.extend({
  name: "paragraph",

  addAttributes() {
    return {
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
    };
  },
});
