import { z } from "zod";

export const notionPropertyTypeSchema = z.enum([
  "title",
  "rich_text",
  "number",
  "select",
  "multi_select",
  "url",
  "date",
  "checkbox"
]);

export type NotionPropertyType = z.infer<typeof notionPropertyTypeSchema>;

export const notionColumnSchema = z.object({
  name: z.string().trim().min(1),
  type: notionPropertyTypeSchema
});

export const notionCreatePageInputSchema = z.object({
  parentPageId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  markdownContent: z.string().optional()
});

export const notionCreateDatabaseInputSchema = z.object({
  parentPageId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  properties: z.array(notionColumnSchema).min(1)
});

export const notionAddDatabaseRowsInputSchema = z.object({
  databaseId: z.string().trim().min(1),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1)
});

export const notionBlockSchema = z.object({
  type: z.enum(["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item"]),
  text: z.string()
});

export const notionAppendBlocksInputSchema = z.object({
  pageId: z.string().trim().min(1),
  blocks: z.array(notionBlockSchema).min(1)
});

export const notionSearchPagesInputSchema = z.object({
  query: z.string().trim().min(1)
});

export const researchToNotionDatabaseInputSchema = z.object({
  prompt: z.string().trim().min(1),
  parentPageId: z.string().trim().min(1),
  title: z.string().trim().optional()
});

export const researchTableSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string(),
  columns: z.array(notionColumnSchema).min(1),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1)
});

export type ResearchTable = z.infer<typeof researchTableSchema>;
