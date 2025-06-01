import { documents, type Document, type InsertDocument } from "@shared/schema";

export interface IStorage {
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined>;
  getDocumentsByStatus(status: string): Promise<Document[]>;
}

export class MemStorage implements IStorage {
  private documents: Map<number, Document>;
  currentId: number;

  constructor() {
    this.documents = new Map();
    this.currentId = 1;
  }

  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = this.currentId++;
    const document: Document = { 
      ...insertDocument, 
      id,
      createdAt: new Date()
    };
    this.documents.set(id, document);
    return document;
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const document = this.documents.get(id);
    if (!document) return undefined;
    
    const updatedDocument = { ...document, ...updates };
    this.documents.set(id, updatedDocument);
    return updatedDocument;
  }

  async getDocumentsByStatus(status: string): Promise<Document[]> {
    return Array.from(this.documents.values()).filter(doc => doc.status === status);
  }
}

export const storage = new MemStorage();
