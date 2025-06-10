import { documents, documentChunks, users, type Document, type InsertDocument, type DocumentChunk, type InsertDocumentChunk, type User, type UpsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, and, lt } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Document operations
  getDocument(id: number): Promise<Document | undefined>;
  getUserDocument(id: number, userId: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined>;
  getDocumentsByStatus(status: string): Promise<Document[]>;
  getUserDocuments(userId: string): Promise<Document[]>;
  getAllDocuments(): Promise<Document[]>;
  deleteDocument(id: number): Promise<boolean>;
  deleteUserDocument(id: number, userId: string): Promise<boolean>;
  
  // Privacy and cleanup
  getExpiredDocuments(): Promise<Document[]>;
  cleanupExpiredDocuments(): Promise<number>;
  
  // Chunk management
  createDocumentChunk(chunk: InsertDocumentChunk): Promise<DocumentChunk>;
  getDocumentChunks(documentId: number): Promise<DocumentChunk[]>;
  updateDocumentChunk(id: number, updates: Partial<DocumentChunk>): Promise<DocumentChunk | undefined>;
  getChunkByDocumentAndIndex(documentId: number, chunkIndex: number): Promise<DocumentChunk | undefined>;
  getStuckChunks(stuckThresholdMs: number): Promise<DocumentChunk[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Document operations
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async getUserDocument(id: number, userId: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(
      and(eq(documents.id, id), eq(documents.userId, userId))
    );
    return document || undefined;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(insertDocument)
      .returning();
    return document;
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const [document] = await db
      .update(documents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return document || undefined;
  }

  async getDocumentsByStatus(status: string): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.status, status));
  }

  async getUserDocuments(userId: string): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.userId, userId));
  }

  async getAllDocuments(): Promise<Document[]> {
    return await db.select().from(documents);
  }

  async deleteDocument(id: number): Promise<boolean> {
    try {
      // First delete all chunks for this document
      await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
      
      // Then delete the document
      const result = await db.delete(documents).where(eq(documents.id, id));
      return true;
    } catch (error) {
      return false;
    }
  }

  async deleteUserDocument(id: number, userId: string): Promise<boolean> {
    try {
      // First delete all chunks for this document
      await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
      
      // Then delete the document, but only if it belongs to the user
      const result = await db.delete(documents).where(
        and(eq(documents.id, id), eq(documents.userId, userId))
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  async createDocumentChunk(chunk: InsertDocumentChunk): Promise<DocumentChunk> {
    const [documentChunk] = await db
      .insert(documentChunks)
      .values(chunk)
      .returning();
    return documentChunk;
  }

  async getDocumentChunks(documentId: number): Promise<DocumentChunk[]> {
    return await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
  }

  async updateDocumentChunk(id: number, updates: Partial<DocumentChunk>): Promise<DocumentChunk | undefined> {
    const [chunk] = await db
      .update(documentChunks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documentChunks.id, id))
      .returning();
    return chunk || undefined;
  }

  async getChunkByDocumentAndIndex(documentId: number, chunkIndex: number): Promise<DocumentChunk | undefined> {
    const results = await db
      .select()
      .from(documentChunks)
      .where(and(
        eq(documentChunks.documentId, documentId),
        eq(documentChunks.chunkIndex, chunkIndex)
      ));
    return results[0] || undefined;
  }

  // Privacy and cleanup methods
  async getExpiredDocuments(): Promise<Document[]> {
    return await db.select().from(documents).where(lt(documents.expiresAt, new Date()));
  }

  async cleanupExpiredDocuments(): Promise<number> {
    const expiredDocs = await this.getExpiredDocuments();
    let deletedCount = 0;

    for (const doc of expiredDocs) {
      const success = await this.deleteDocument(doc.id);
      if (success) deletedCount++;
    }

    return deletedCount;
  }

  async getStuckChunks(stuckThresholdMs: number): Promise<DocumentChunk[]> {
    const stuckTime = new Date(Date.now() - stuckThresholdMs);
    
    const stuckChunks = await db.select()
      .from(documentChunks)
      .where(and(
        eq(documentChunks.status, 'processing'),
        lt(documentChunks.updatedAt, stuckTime)
      ));
    
    return stuckChunks;
  }
}

export const storage = new DatabaseStorage();
