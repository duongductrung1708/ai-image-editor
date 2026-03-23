import { Table } from "@tiptap/extension-table";

/**
 * Bảng OCR: thêm data-layout="split" cho một hàng 2 ô — căn trái / căn phải full width
 * (tương tự một dòng Word với space-between).
 */
export const OcrTable = Table.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      dataLayout: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-layout"),
        renderHTML: (attributes) => {
          if (!attributes.dataLayout) return {};
          return { "data-layout": attributes.dataLayout };
        },
      },
    };
  },
});
