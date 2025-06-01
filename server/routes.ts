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
    const allowedTypes = ['text/plain', 'text/markdown'];
    const allowedExtensions = ['.txt', '.md', '.markdown'];
    const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only TXT and Markdown files are allowed.'));
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

      const apiKey = process.env.OPENAI_API_KEY;
      const assistantId = req.body.assistantId || "asst_OqSPqevzweqfm85VGKcJuNPF";
      
      if (!apiKey) {
        return res.status(500).json({ message: "OpenAI API key not configured" });
      }

      let extractedText = "";
      
      // Extract text based on file type
      if (req.file.mimetype === "application/pdf") {
        return res.status(400).json({ 
          message: "PDF processing is temporarily unavailable. Please use text or markdown files for now." 
        });
      } else if (req.file.mimetype === "text/plain" || req.file.mimetype === "text/markdown" || 
                 req.file.originalname.toLowerCase().endsWith('.md') || 
                 req.file.originalname.toLowerCase().endsWith('.markdown')) {
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
        
        // Check if text needs to be chunked (OpenAI limit is 256,000 characters)
        const maxChunkSize = 250000; // Leave some buffer for prompt text
        const chunks = [];
        
        if (extractedText.length > maxChunkSize) {
          // Split into chunks at paragraph boundaries when possible
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

        let processedMarkdown = '';
        
        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const isMultipart = chunks.length > 1;
          const chunkPrompt = isMultipart 
            ? `Please clean up this text by fixing paragraph breaks, removing hyphens from line breaks, and formatting it as proper markdown. This is part ${i + 1} of ${chunks.length} from a larger document. Here is the text:\n\n${chunk}`
            : `Please clean up this text by fixing paragraph breaks, removing hyphens from line breaks, and formatting it as proper markdown. Here is the text:\n\n${chunk}`;

          // Create a thread
          console.log(`Creating thread for chunk ${i + 1}...`);
          const thread = await openai.beta.threads.create();
          console.log(`Thread created:`, thread);
          
          if (!thread || !thread.id) {
            throw new Error(`Failed to create thread for chunk ${i + 1}`);
          }

          // Add message to thread
          await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: chunkPrompt
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
              const chunkResult = assistantMessage.content[0].text.value;
              processedMarkdown += (processedMarkdown ? '\n\n' : '') + chunkResult;
            } else {
              throw new Error(`No valid response from assistant for chunk ${i + 1}`);
            }
          } else {
            throw new Error(`Assistant run failed with status: ${runStatus.status} for chunk ${i + 1}`);
          }
        }

        // Update document with processed result
        await storage.updateDocument(document.id, {
          processedMarkdown,
          status: "completed"
        });

        res.json({
          id: document.id,
          filename: req.file.originalname,
          processedMarkdown,
          status: "completed",
          chunksProcessed: chunks.length
        });

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
