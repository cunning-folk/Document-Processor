import { Express } from "express";
import { createServer, Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { pdfProcessor } from "./pdf-processor";
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
      const isEncrypted = req.body.isEncrypted === "true";

      if (fileExtension === "txt" || fileExtension === "md" || fileExtension === "markdown") {
        extractedText = req.file.buffer.toString("utf-8");
        
        // Note: For encrypted files, the content remains encrypted
        // The OpenAI API will process the encrypted content directly
        // This ensures the server admin never sees the actual content
        
      } else if (fileExtension === "pdf") {
        log(`Processing PDF file: ${req.file.originalname}`, "express");
        
        try {
          const pdfResult = await pdfProcessor.processPDF(req.file.buffer, req.file.originalname);
          extractedText = pdfResult.text;
          
          log(`PDF processed successfully using ${pdfResult.method}, ${pdfResult.totalPages} pages`, "express");
        } catch (pdfError: any) {
          log(`PDF processing failed: ${pdfError.message}`, "express");
          return res.status(400).json({ 
            message: `Failed to process PDF: ${pdfError.message}` 
          });
        }
        
      } else {
        return res.status(400).json({ 
          message: "Unsupported file type. Please upload .txt, .md, .markdown, or .pdf files." 
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
        assistantId,
        isEncrypted
      });

      // Chunk the document and create chunk records
      const maxChunkSize = 50000; // Reduced from 250k to 50k for faster processing
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
      
      // Determine appropriate status code and message based on error type
      let statusCode = 422; // Default to unprocessable entity for PDF issues
      let message = error.message;
      
      // Return the error message directly without wrapping
      res.status(statusCode).json({ 
        message: message
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

  // Serve test PDF for download
  app.get("/api/test-pdf", async (req, res) => {
    try {
      const path = await import('path');
      const fs = await import('fs');
      const testPdfPath = path.join(process.cwd(), 'test-simple.pdf');
      
      // Check if file exists first
      if (!fs.existsSync(testPdfPath)) {
        return res.status(404).json({ message: "Test PDF not found" });
      }
      
      res.download(testPdfPath, "test-document.pdf", (err) => {
        if (err) {
          console.error("Test PDF download error:", err);
          res.status(500).json({ message: "Failed to download test PDF" });
        }
      });
    } catch (error) {
      console.error("Test PDF endpoint error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve test text file for download
  app.get("/api/test-txt", async (req, res) => {
    try {
      const path = await import('path');
      const fs = await import('fs');
      const testTxtPath = path.join(process.cwd(), 'test-simple.txt');
      
      if (!fs.existsSync(testTxtPath)) {
        return res.status(404).json({ message: "Test text file not found" });
      }
      
      res.download(testTxtPath, "test-document.txt", (err) => {
        if (err) {
          console.error("Test text download error:", err);
          res.status(500).json({ message: "Failed to download test text file" });
        }
      });
    } catch (error) {
      console.error("Test text endpoint error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve PDF text extractor script
  app.get("/extract-pdf-text.py", async (req, res) => {
    try {
      const path = await import('path');
      const fs = await import('fs');
      const extractorPath = path.join(process.cwd(), 'extract-pdf-text.py');
      
      if (!fs.existsSync(extractorPath)) {
        return res.status(404).json({ message: "PDF extractor script not found" });
      }
      
      res.download(extractorPath, "extract-pdf-text.py", (err) => {
        if (err) {
          console.error("PDF extractor download error:", err);
          res.status(500).json({ message: "Failed to download PDF extractor" });
        }
      });
    } catch (error) {
      console.error("PDF extractor endpoint error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all documents (history)
  app.get("/api/documents", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;
      
      // Get all documents ordered by creation date (newest first)
      const allDocuments = await storage.getAllDocuments();
      const totalCount = allDocuments.length;
      const documents = allDocuments
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(offset, offset + limit);
      
      res.json({
        documents,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to retrieve documents", error: error.message });
    }
  });

  // Get document by ID
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

  // Download processed document as markdown file
  app.get("/api/documents/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (document.status !== 'completed' || !document.processedMarkdown) {
        return res.status(400).json({ message: "Document processing not completed or no processed content available" });
      }
      
      // Create filename for download
      const originalName = document.filename.replace(/\.[^/.]+$/, ""); // Remove extension
      const downloadFilename = `${originalName}_processed.md`;
      
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.send(document.processedMarkdown);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to download document", error: error.message });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteDocument(id);
      
      if (!success) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json({ message: "Document deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete document", error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}