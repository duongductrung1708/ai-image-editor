/**
 * Convert TipTap editor HTML to docx Paragraph[] preserving rich formatting.
 * Handles: headings, bold, italic, underline, highlight, lists, blockquotes,
 * tables, text alignment.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  ShadingType,
  type IRunOptions,
  type IParagraphOptions,
} from "docx";

type RunStyle = {
  bold?: boolean;
  italics?: boolean;
  underline?: { type: "single" };
  highlight?: string;
};

function getAlignment(el: HTMLElement): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const align = el.style?.textAlign || el.getAttribute("align");
  switch (align) {
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    case "justify":
      return AlignmentType.JUSTIFIED;
    default:
      return undefined;
  }
}

function getHeadingLevel(tag: string): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  switch (tag) {
    case "H1":
      return HeadingLevel.HEADING_1;
    case "H2":
      return HeadingLevel.HEADING_2;
    case "H3":
      return HeadingLevel.HEADING_3;
    case "H4":
      return HeadingLevel.HEADING_4;
    default:
      return undefined;
  }
}

/** Recursively extract TextRun[] from an inline element. */
function extractRuns(node: Node, parentStyle: RunStyle = {}): TextRun[] {
  const runs: TextRun[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (text) {
      const opts: IRunOptions = { text };
      if (parentStyle.bold) opts.bold = true;
      if (parentStyle.italics) opts.italics = true;
      if (parentStyle.underline) opts.underline = parentStyle.underline;
      if (parentStyle.highlight) {
        opts.shading = {
          type: ShadingType.CLEAR,
          fill: parentStyle.highlight === "true" ? "FFFF00" : parentStyle.highlight,
        };
      }
      runs.push(new TextRun(opts));
    }
    return runs;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return runs;

  const el = node as HTMLElement;
  const tag = el.tagName;
  const style = { ...parentStyle };

  if (tag === "STRONG" || tag === "B") style.bold = true;
  if (tag === "EM" || tag === "I") style.italics = true;
  if (tag === "U") style.underline = { type: "single" };
  if (tag === "MARK") {
    style.highlight = el.getAttribute("data-color") || "FFFF00";
  }
  if (tag === "BR") {
    runs.push(new TextRun({ break: 1, text: "" }));
    return runs;
  }

  for (const child of Array.from(el.childNodes)) {
    runs.push(...extractRuns(child, style));
  }
  return runs;
}

/** Convert a block-level element (p, h1-h4, li) to a Paragraph. */
function blockToParagraph(
  el: HTMLElement,
  overrides?: Partial<IParagraphOptions>,
): Paragraph {
  const children = extractRuns(el);
  if (children.length === 0) {
    children.push(new TextRun(""));
  }

  const opts: IParagraphOptions = {
    children,
    ...overrides,
  };

  const alignment = getAlignment(el);
  if (alignment) opts.alignment = alignment;

  const heading = getHeadingLevel(el.tagName);
  if (heading) opts.heading = heading;

  return new Paragraph(opts);
}

/** Convert a <table> element to a docx Table. */
function tableToDocxTable(tableEl: HTMLElement): Table {
  const cellBorder = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: "CCCCCC",
  };
  const cellBorders = {
    top: cellBorder,
    bottom: cellBorder,
    left: cellBorder,
    right: cellBorder,
  };

  const rows: TableRow[] = [];
  const trEls = tableEl.querySelectorAll("tr");

  // Determine column count from first row
  const firstTr = trEls[0];
  const colCount = firstTr
    ? firstTr.querySelectorAll("td, th").length
    : 2;
  const tableWidth = 9360; // A4 with 1" margins
  const colWidth = Math.floor(tableWidth / Math.max(colCount, 1));

  trEls.forEach((tr) => {
    const cells: TableCell[] = [];
    tr.querySelectorAll("td, th").forEach((td) => {
      const paragraphs = processChildren(td as HTMLElement);
      if (paragraphs.length === 0) {
        paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
      }
      cells.push(
        new TableCell({
          borders: cellBorders,
          width: { size: colWidth, type: WidthType.DXA },
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: paragraphs,
        }),
      );
    });
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  });

  if (rows.length === 0) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun("")] })],
            width: { size: tableWidth, type: WidthType.DXA },
          }),
        ],
      }),
    );
  }

  const columnWidths = Array(colCount).fill(colWidth);

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    rows,
  });
}

/** Process children of a container, returning Paragraph[] and Table[]. */
function processChildren(
  container: HTMLElement,
): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent || "").trim();
      if (text) {
        result.push(new Paragraph({ children: [new TextRun(text)] }));
      }
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const tag = el.tagName;

    if (tag === "TABLE") {
      result.push(tableToDocxTable(el));
      continue;
    }

    if (tag === "BLOCKQUOTE") {
      // Process blockquote children with indent
      for (const bChild of Array.from(el.childNodes)) {
        if (bChild.nodeType === Node.ELEMENT_NODE) {
          const bEl = bChild as HTMLElement;
          result.push(
            blockToParagraph(bEl, {
              indent: { left: 720 },
            }),
          );
        } else if (bChild.nodeType === Node.TEXT_NODE) {
          const t = (bChild.textContent || "").trim();
          if (t) {
            result.push(
              new Paragraph({
                children: [new TextRun({ text: t, italics: true })],
                indent: { left: 720 },
              }),
            );
          }
        }
      }
      continue;
    }

    if (tag === "UL" || tag === "OL") {
      const items = el.querySelectorAll(":scope > li");
      items.forEach((li, idx) => {
        const prefix =
          tag === "OL" ? `${idx + 1}. ` : "• ";
        const runs = extractRuns(li);
        if (runs.length > 0) {
          result.push(
            new Paragraph({
              children: [new TextRun(prefix), ...runs],
              indent: { left: 720, hanging: 360 },
            }),
          );
        }
      });
      continue;
    }

    if (
      tag === "P" ||
      tag === "H1" ||
      tag === "H2" ||
      tag === "H3" ||
      tag === "H4" ||
      tag === "DIV"
    ) {
      result.push(blockToParagraph(el));
      continue;
    }

    // Fallback: treat as paragraph
    const text = el.textContent?.trim();
    if (text) {
      result.push(blockToParagraph(el));
    }
  }

  return result;
}

/**
 * Convert TipTap HTML string to docx Document children (Paragraph[] & Table[]).
 */
export function htmlToDocxChildren(
  html: string,
): (Paragraph | Table)[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return processChildren(doc.body);
}

/**
 * Export HTML (from TipTap editor) to a DOCX blob.
 */
export async function htmlToDocxBlob(html: string): Promise<Blob> {
  const children = htmlToDocxChildren(html);

  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun("")] }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}

/**
 * Download DOCX from HTML content.
 */
export async function downloadHtmlAsDocx(
  html: string,
  filename: string,
): Promise<void> {
  const blob = await htmlToDocxBlob(html);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
