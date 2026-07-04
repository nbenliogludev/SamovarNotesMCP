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

export function createTableBlock(command: ParsedNotionCommand): Record<string, unknown> {
  const rows = Array.from({ length: command.rowCount }, (_item, rowIndex) =>
    createTableRowBlock(command.columns.map(() => `Row ${rowIndex + 1}`))
  );

  return {
    object: "block",
    type: "table",
    table: {
      table_width: command.columnCount,
      has_column_header: true,
      has_row_header: false,
      children: [createTableRowBlock(command.columns), ...rows]
    }
  };
}
