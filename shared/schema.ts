import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  filename: true,
  originalText: true,
  processedMarkdown: true,
  status: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

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
