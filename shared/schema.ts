import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalText: text("original_text").notNull(),
  processedMarkdown: text("processed_markdown"),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  totalChunks: integer("total_chunks").default(1),
  processedChunks: integer("processed_chunks").default(0),
  errorMessage: text("error_message"),
  apiKey: text("api_key").notNull(),
  assistantId: text("assistant_id").notNull(),
  isEncrypted: boolean("is_encrypted").default(false),
  expiresAt: timestamp("expires_at").notNull().default(sql`NOW() + INTERVAL '24 HOURS'`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  processedContent: text("processed_content"),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const documentsRelations = {
  chunks: {
    type: "one-to-many",
    table: documentChunks,
    foreignKey: "documentId"
  }
};

export const documentChunksRelations = {
  document: {
    type: "many-to-one", 
    table: documents,
    foreignKey: "documentId"
  }
};

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  filename: true,
  originalText: true,
  processedMarkdown: true,
  status: true,
  apiKey: true,
  assistantId: true,
  isEncrypted: true,
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).pick({
  documentId: true,
  chunkIndex: true,
  content: true,
  processedContent: true,
  status: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type DocumentChunk = typeof documentChunks.$inferSelect;

// API request/response schemas
export const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  assistantId: z.string().min(1, "Assistant ID is required"),
});

export const processDocumentSchema = z.object({
  filename: z.string(),
  text: z.string(),
  apiKey: z.string(),
  assistantId: z.string(),
});

export type Config = z.infer<typeof configSchema>;
export type ProcessDocumentRequest = z.infer<typeof processDocumentSchema>;
