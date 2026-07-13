import type { ParsedNotionCommand } from "../types";
import { textRichText } from "./richText";

export function createParagraphBlock(content: string): Record<string, unknown> {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: textRichText(content)
    }
  };
}

function createTableRowBlock(values: string[]): Record<string, unknown> {
  return {
    object: "block",
    type: "table_row",
    table_row: {
      cells: values.map((value) => textRichText(value || " "))
    }
  };
}

export function createTableBlockFromRows(columns: string[], rows: string[][]): Record<string, unknown> {
  const safeColumns = columns.map((column, index) => column.trim() || `Column ${index + 1}`);
  const safeRows = rows.map((row) =>
    safeColumns.map((_column, columnIndex) => {
      const cell = row[columnIndex]?.trim();

      return cell || " ";
    })
  );

  return {
    object: "block",
    type: "table",
    table: {
      table_width: safeColumns.length,
      has_column_header: true,
      has_row_header: false,
      children: [createTableRowBlock(safeColumns), ...safeRows.map(createTableRowBlock)]
    }
  };
}

export function createTableBlock(command: ParsedNotionCommand): Record<string, unknown> {
  const rows = Array.from({ length: command.rowCount }, (_item, rowIndex) =>
    command.columns.map(() => `Row ${rowIndex + 1}`)
  );

  return createTableBlockFromRows(command.columns, rows);
}
