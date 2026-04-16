import { mergeAttributes } from "@tiptap/core";
import { TableCell as BaseTableCell } from "@tiptap/extension-table-cell";
import { TableHeader as BaseTableHeader } from "@tiptap/extension-table-header";

type BorderValue = string | null;

function borderAttr(name: string) {
  return {
    default: null as BorderValue,
    parseHTML: (el: HTMLElement) => el.style?.[name as keyof CSSStyleDeclaration] || null,
    renderHTML: (attrs: { [k: string]: unknown }) => {
      const v = attrs?.[name] as BorderValue | undefined;
      if (!v) return {};
      return { style: `${name.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${v};` };
    },
  };
}

/**
 * Adds border-top/right/bottom/left attributes to table cells.
 * We will set these attributes from UI commands.
 */
export const TableCellWithBorders = BaseTableCell.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      borderTop: borderAttr("borderTop"),
      borderRight: borderAttr("borderRight"),
      borderBottom: borderAttr("borderBottom"),
      borderLeft: borderAttr("borderLeft"),
    };
  },

  renderHTML({ HTMLAttributes }) {
    const { borderTop, borderRight, borderBottom, borderLeft } = HTMLAttributes as Record<
      string,
      BorderValue
    >;

    const styleParts: string[] = [];
    if (borderTop) styleParts.push(`border-top: ${borderTop};`);
    if (borderRight) styleParts.push(`border-right: ${borderRight};`);
    if (borderBottom) styleParts.push(`border-bottom: ${borderBottom};`);
    if (borderLeft) styleParts.push(`border-left: ${borderLeft};`);

    const merged: Record<string, unknown> = { ...HTMLAttributes };
    // Ensure `style` exists; keep existing style too.
    const existingStyle = typeof HTMLAttributes.style === "string" ? HTMLAttributes.style : "";
    const nextStyle = `${existingStyle}${existingStyle && !existingStyle.endsWith(";") ? ";" : ""}${styleParts.join(" ")}`.trim();
    if (nextStyle) merged.style = nextStyle;

    // Remove attrs so they don't show up as invalid HTML attributes.
    delete (merged as Record<string, unknown>).borderTop;
    delete (merged as Record<string, unknown>).borderRight;
    delete (merged as Record<string, unknown>).borderBottom;
    delete (merged as Record<string, unknown>).borderLeft;

    return ["td", mergeAttributes(this.options.HTMLAttributes, merged), 0];
  },
});

export const TableHeaderWithBorders = BaseTableHeader.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      borderTop: borderAttr("borderTop"),
      borderRight: borderAttr("borderRight"),
      borderBottom: borderAttr("borderBottom"),
      borderLeft: borderAttr("borderLeft"),
    };
  },

  renderHTML({ HTMLAttributes }) {
    const { borderTop, borderRight, borderBottom, borderLeft } = HTMLAttributes as Record<
      string,
      BorderValue
    >;

    const styleParts: string[] = [];
    if (borderTop) styleParts.push(`border-top: ${borderTop};`);
    if (borderRight) styleParts.push(`border-right: ${borderRight};`);
    if (borderBottom) styleParts.push(`border-bottom: ${borderBottom};`);
    if (borderLeft) styleParts.push(`border-left: ${borderLeft};`);

    const merged: Record<string, unknown> = { ...HTMLAttributes };
    const existingStyle = typeof HTMLAttributes.style === "string" ? HTMLAttributes.style : "";
    const nextStyle = `${existingStyle}${existingStyle && !existingStyle.endsWith(";") ? ";" : ""}${styleParts.join(" ")}`.trim();
    if (nextStyle) merged.style = nextStyle;

    delete (merged as Record<string, unknown>).borderTop;
    delete (merged as Record<string, unknown>).borderRight;
    delete (merged as Record<string, unknown>).borderBottom;
    delete (merged as Record<string, unknown>).borderLeft;

    return ["th", mergeAttributes(this.options.HTMLAttributes, merged), 0];
  },
});

