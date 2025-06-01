import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { processDocumentSchema } from "@shared/schema";
import OpenAI from "openai";
// PDF parsing temporarily disabled due to library issues

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only TXT files are allowed for now.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Process document endpoint
  app.post("/api/process-document", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { apiKey, assistantId } = req.body;
      
      if (!apiKey || !assistantId) {
        return res.status(400).json({ message: "API key and Assistant ID are required" });
      }

      let extractedText = "";
      
      // Extract text based on file type
      if (req.file.mimetype === "application/pdf") {
        return res.status(400).json({ 
          message: "PDF processing is temporarily unavailable. Please use text files (.txt) for now." 
        });
      } else if (req.file.mimetype === "text/plain") {
        extractedText = req.file.buffer.toString('utf-8');
      }

      if (!extractedText.trim()) {
        return res.status(400).json({ message: "No text could be extracted from the file" });
      }

      // Create document record
      const document = await storage.createDocument({
        filename: req.file.originalname,
        originalText: extractedText,
        status: "processing"
      });

      // Process with OpenAI Assistant
      try {
        const openai = new OpenAI({ apiKey });

        // Create a thread
        const thread = await openai.beta.threads.create();

        // Add message to thread
        await openai.beta.threads.messages.create(thread.id, {
          role: "user",
          content: `Please clean up this text by fixing paragraph breaks, removing hyphens from line breaks, and formatting it as proper markdown. Here is the text:\n\n${extractedText}`
        });

        // Run the assistant
        const run = await openai.beta.threads.runs.create(thread.id, {
          assistant_id: assistantId
        });

        // Poll for completion
        let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        
        while (runStatus.status === "queued" || runStatus.status === "in_progress") {
          await new Promise(resolve => setTimeout(resolve, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        }

        if (runStatus.status === "completed") {
          // Get the assistant's response
          const messages = await openai.beta.threads.messages.list(thread.id);
          const assistantMessage = messages.data.find(msg => msg.role === "assistant");
          
          if (assistantMessage && assistantMessage.content[0].type === "text") {
            const processedMarkdown = assistantMessage.content[0].text.value;
            
            // Update document with processed result
            await storage.updateDocument(document.id, {
              processedMarkdown,
              status: "completed"
            });

            res.json({
              id: document.id,
              filename: req.file.originalname,
              processedMarkdown,
              status: "completed"
            });
          } else {
            throw new Error("No valid response from assistant");
          }
        } else {
          throw new Error(`Assistant run failed with status: ${runStatus.status}`);
        }

      } catch (openaiError) {
        await storage.updateDocument(document.id, { status: "failed" });
        console.error("OpenAI error:", openaiError);
        return res.status(500).json({ 
          message: "Failed to process document with OpenAI Assistant",
          error: openaiError.message 
        });
      }

    } catch (error) {
      console.error("Processing error:", error);
      res.status(500).json({ 
        message: "Failed to process document",
        error: error.message 
      });
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

  const httpServer = createServer(app);
  return httpServer;
}
