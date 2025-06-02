import { Express } from "express";
import { createServer, Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { log } from "./vite";
import { backgroundProcessor } from "./background-processor";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Start background processor
  backgroundProcessor.start();

  // Process document endpoint
  app.post("/api/process-document", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Get API credentials from environment
      const apiKey = process.env.OPENAI_API_KEY;
      const assistantId = "asst_OqSPqevzweqfm85VGKcJuNPF";

      if (!apiKey) {
        return res.status(400).json({ message: "OpenAI API key not configured" });
      }

      // Extract text from file
      let extractedText = "";
      const fileExtension = req.file.originalname.toLowerCase().split('.').pop();

      if (fileExtension === "txt" || fileExtension === "md" || fileExtension === "markdown") {
        extractedText = req.file.buffer.toString("utf-8");
      } else {
        return res.status(400).json({ 
          message: "Unsupported file type. Please upload .txt, .md, or .markdown files." 
        });
      }

      if (!extractedText.trim()) {
        return res.status(400).json({ message: "No text could be extracted from the file" });
      }

      // Create document record
      const document = await storage.createDocument({
        filename: req.file.originalname,
        originalText: extractedText,
        status: "pending",
        apiKey,
        assistantId
      });

      // Chunk the document and create chunk records
      const maxChunkSize = 250000;
      const chunks = [];
      
      if (extractedText.length > maxChunkSize) {
        const paragraphs = extractedText.split('\n\n');
        let currentChunk = '';
        
        for (const paragraph of paragraphs) {
          if ((currentChunk + paragraph).length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
          } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
          }
        }
        
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
      } else {
        chunks.push(extractedText);
      }

      // Update document with total chunks and set to processing
      await storage.updateDocument(document.id, {
        totalChunks: chunks.length,
        status: "processing"
      });

      // Create chunk records
      for (let i = 0; i < chunks.length; i++) {
        await storage.createDocumentChunk({
          documentId: document.id,
          chunkIndex: i,
          content: chunks[i],
          status: "pending"
        });
      }

      // Return immediately - processing will happen in background
      res.json({
        id: document.id,
        filename: req.file.originalname,
        status: "processing",
        totalChunks: chunks.length,
        processedChunks: 0
      });

    } catch (error: any) {
      console.error("Processing error:", error);
      res.status(500).json({ 
        message: "Failed to process document",
        error: error.message 
      });
    }
  });

  // Get document status endpoint
  app.get("/api/document/:id", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get document", error: error.message });
    }
  });

  // Get document by ID (legacy endpoint)
  app.get("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve document" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}