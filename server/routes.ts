import { Express } from "express";
import { createServer, Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { pdfProcessor } from "./pdf-processor";
import { log } from "./vite";
import { backgroundProcessor } from "./background-processor";
import { setupAuth, isAuthenticated } from "./replitAuth";

// Sanitize text for PostgreSQL - removes null bytes and other invalid UTF-8 sequences
function sanitizeTextForDB(text: string): string {
  // Remove null bytes (0x00) which PostgreSQL text fields can't store
  // Also remove other control characters that might cause issues
  return text
    .replace(/\x00/g, '') // Remove null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '') // Remove other control chars except tab, newline, carriage return
    .replace(/\uFFFD/g, '') // Remove replacement characters
    .replace(/[\uD800-\uDFFF]/g, ''); // Remove lone surrogates
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);
  
  // Auth routes
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  
  // Start background processor
  backgroundProcessor.start();

  // Validate file endpoint - quick check before upload
  app.post("/api/validate-file", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }

      const fileExtension = req.file.originalname.toLowerCase().split('.').pop();
      
      // For PDF files, use the full PDF validation
      if (fileExtension === 'pdf') {
        const validation = await pdfProcessor.validatePDF(req.file.buffer, req.file.originalname);
        res.json(validation);
        return;
      }
      
      // For text-based files (TXT, MD, MARKDOWN), do basic validation
      if (['txt', 'md', 'markdown'].includes(fileExtension || '')) {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Basic file checks
        if (req.file.buffer.length === 0) {
          errors.push('File is empty');
          return res.json({ isValid: false, errors, warnings, estimatedTextLength: 0, hasText: false, isImageBased: false });
        }
        
        if (req.file.buffer.length > 50 * 1024 * 1024) { // 50MB
          errors.push('File too large (maximum 50MB supported)');
          return res.json({ isValid: false, errors, warnings, estimatedTextLength: 0, hasText: false, isImageBased: false });
        }
        
        // Try to decode as UTF-8
        let textContent = '';
        try {
          textContent = req.file.buffer.toString('utf-8');
        } catch (decodeError) {
          errors.push('File encoding not supported - please use UTF-8 text files');
          return res.json({ isValid: false, errors, warnings, estimatedTextLength: 0, hasText: false, isImageBased: false });
        }
        
        const estimatedTextLength = textContent.length;
        const hasText = estimatedTextLength > 10; // Minimum meaningful text
        
        if (!hasText) {
          errors.push('File contains no readable text content');
          return res.json({ isValid: false, errors, warnings, estimatedTextLength, hasText, isImageBased: false });
        }
        
        // Add helpful warnings
        if (estimatedTextLength > 1000000) { // 1MB of text
          warnings.push(`Large amount of text detected (${Math.round(estimatedTextLength / 1000)}K characters) - will be split into multiple chunks`);
        }
        
        if (fileExtension === 'md' || fileExtension === 'markdown') {
          warnings.push('Markdown formatting will be cleaned and restructured by OpenAI');
        }
        
        log(`Text file validation successful for ${req.file.originalname}: ${estimatedTextLength} characters`, "express");
        res.json({
          isValid: true,
          errors,
          warnings,
          estimatedTextLength,
          hasText,
          isImageBased: false
        });
        return;
      }
      
      // Unsupported file type
      res.json({
        isValid: false,
        errors: ['Unsupported file type. Please upload .pdf, .txt, .md, or .markdown files.'],
        warnings: [],
        estimatedTextLength: 0,
        hasText: false,
        isImageBased: false
      });
      
    } catch (error: any) {
      log(`File validation error: ${error.message}`, "express");
      res.status(500).json({ 
        message: "Validation failed", 
        error: error.message,
        isValid: false,
        errors: [error.message],
        warnings: []
      });
    }
  });

  // Retry failed document processing
  app.post("/api/documents/:id/retry", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (document.status !== 'failed') {
        return res.status(400).json({ message: "Only failed documents can be retried" });
      }
      
      // Reset document status and clear error
      await storage.updateDocument(documentId, {
        status: 'processing',
        errorMessage: null,
        processedChunks: 0
      });
      
      // Reset all failed chunks to pending
      const chunks = await storage.getDocumentChunks(documentId);
      for (const chunk of chunks) {
        if (chunk.status === 'failed') {
          await storage.updateDocumentChunk(chunk.id, {
            status: 'pending',
            errorMessage: null,
            processedContent: null
          });
        }
      }
      
      log(`Document ${documentId} retry initiated`, "express");
      res.json({ message: "Document retry initiated", documentId });
    } catch (error: any) {
      log(`Error retrying document: ${error.message}`, "express");
      res.status(500).json({ message: "Failed to retry document", error: error.message });
    }
  });

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

      // Sanitize text to remove null bytes and invalid characters for PostgreSQL
      const sanitizedText = sanitizeTextForDB(extractedText);

      // Create document record with user ID
      const userId = (req.user as any)?.claims?.sub || 'demo_user'; // Fallback for demo
      const document = await storage.createDocument({
        userId,
        filename: req.file.originalname,
        originalText: sanitizedText,
        status: "pending",
        apiKey,
        assistantId,
        isEncrypted
      });

      // Chunk the document and create chunk records
      const maxChunkSize = 15000; // Safe size to stay well under OpenAI's limits
      const chunks = [];
      
      log(`Starting chunking for ${req.file.originalname}: ${extractedText.length} characters`, "express");
      
      if (extractedText.length > maxChunkSize) {
        // Try multiple splitting strategies for robust chunking
        let textParts = extractedText.split('\n\n').filter(part => part.trim()); // Paragraphs
        
        // If we don't get enough splits from paragraphs, try single newlines
        if (textParts.length === 1) {
          textParts = extractedText.split('\n').filter(part => part.trim());
        }
        
        // If still one big chunk, force split by sentences
        if (textParts.length === 1) {
          textParts = extractedText.split(/(?<=[.!?])\s+/).filter(part => part.trim());
        }
        
        // If still one chunk, force split by character count as last resort
        if (textParts.length === 1) {
          const text = textParts[0];
          textParts = [];
          for (let i = 0; i < text.length; i += maxChunkSize) {
            textParts.push(text.substring(i, i + maxChunkSize));
          }
        }
        
        let currentChunk = '';
        
        for (const part of textParts) {
          // If adding this part would exceed the limit
          if ((currentChunk + part).length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = part;
          } 
          // If even a single part is too large, force split it
          else if (part.length > maxChunkSize) {
            // Save current chunk if it has content
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
              currentChunk = '';
            }
            
            // Force split by character count
            for (let i = 0; i < part.length; i += maxChunkSize) {
              chunks.push(part.substring(i, i + maxChunkSize));
            }
          } else {
            currentChunk += (currentChunk ? '\n' : '') + part;
          }
        }
        
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
      } else {
        chunks.push(extractedText);
      }

      log(`Chunking complete for ${req.file.originalname}: Created ${chunks.length} chunks`, "express");
      chunks.forEach((chunk, index) => {
        log(`Chunk ${index + 1}: ${chunk.length} characters`, "express");
      });

      // Update document with total chunks and set to processing
      await storage.updateDocument(document.id, {
        totalChunks: chunks.length,
        status: "processing"
      });

      // Create chunk records (sanitize each chunk to be safe)
      for (let i = 0; i < chunks.length; i++) {
        await storage.createDocumentChunk({
          documentId: document.id,
          chunkIndex: i,
          content: sanitizeTextForDB(chunks[i]),
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

  // Get user's documents (history) - user-specific
  app.get("/api/documents", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;
      
      // Get user ID from auth or fallback for demo
      const userId = (req.user as any)?.claims?.sub || 'demo_user';
      
      // Get user's documents ordered by creation date (newest first)
      const userDocuments = await storage.getUserDocuments(userId);
      const totalCount = userDocuments.length;
      const documents = userDocuments
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

  // Get user's document by ID - user-specific
  app.get("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.claims?.sub || 'demo_user';
      
      const document = await storage.getUserDocument(id, userId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve document" });
    }
  });

  // Download user's processed document as markdown file - user-specific
  app.get("/api/documents/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.claims?.sub || 'demo_user';
      
      const document = await storage.getUserDocument(id, userId);
      
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