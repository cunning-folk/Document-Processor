import OpenAI from 'openai';
import { storage } from './storage';
import { log } from './vite';

export class BackgroundProcessor {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  start() {
    if (this.processingInterval) return;
    
    log("Starting background processor", "background-processor");
    this.processingInterval = setInterval(() => {
      this.processNextChunk();
    }, 2000); // Check every 2 seconds
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      log("Stopped background processor", "background-processor");
    }
  }

  async processNextChunk() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // First, cleanup expired documents for privacy
      const deletedCount = await storage.cleanupExpiredDocuments();
      if (deletedCount > 0) {
        log(`Cleaned up ${deletedCount} expired documents for privacy`, "background-processor");
      }

      // Find pending chunks to process
      const pendingDocuments = await storage.getDocumentsByStatus('processing');
      
      for (const document of pendingDocuments) {
        const chunks = await storage.getDocumentChunks(document.id);
        const pendingChunk = chunks.find(chunk => chunk.status === 'pending');
        
        if (pendingChunk) {
          await this.processChunk(document, pendingChunk, chunks.length);
          break; // Process one chunk at a time
        } else {
          // Check if all chunks are completed
          const completedChunks = chunks.filter(chunk => chunk.status === 'completed');
          const failedChunks = chunks.filter(chunk => chunk.status === 'failed');
          
          if (completedChunks.length === chunks.length) {
            // All chunks completed, combine results
            await this.finalizeDocument(document.id, chunks);
          } else if (failedChunks.length > 0) {
            // Some chunks failed
            await storage.updateDocument(document.id, {
              status: 'failed',
              errorMessage: `${failedChunks.length} chunks failed to process`
            });
          }
        }
      }
    } catch (error: any) {
      log(`Background processor error: ${error.message}`, "background-processor");
    } finally {
      this.isProcessing = false;
    }
  }

  async processChunk(document: any, chunk: any, totalChunks: number) {
    try {
      log(`Processing chunk ${chunk.chunkIndex + 1} of ${totalChunks} for document ${document.id}`, "background-processor");
      
      await storage.updateDocumentChunk(chunk.id, { status: 'processing' });
      
      const openai = new OpenAI({ apiKey: document.apiKey });
      
      const isMultipart = totalChunks > 1;
      const chunkPrompt = isMultipart 
        ? `Please clean up this text by fixing paragraph breaks, removing hyphens from line breaks, and formatting it as proper markdown. This is part ${chunk.chunkIndex + 1} of ${totalChunks} from a larger document. Here is the text:\n\n${chunk.content}`
        : `Please clean up this text by fixing paragraph breaks, removing hyphens from line breaks, and formatting it as proper markdown. Here is the text:\n\n${chunk.content}`;

      let processedContent: string;

      try {
        // Try direct chat completion first (faster)
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a document formatting assistant. You clean messy text (often from PDFs) by: fixing line breaks in the middle of sentences, removing hyphens at line ends and joining words, restoring paragraphs, applying clean markdown (e.g., ## for section headers, * for bullets). Always output valid markdown. Do not destroy text."
            },
            {
              role: "user",
              content: chunkPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 16000
        });

        processedContent = response.choices[0].message.content || chunk.content;
        log(`Completed chunk ${chunk.chunkIndex + 1} using direct API for document ${document.id}`, "background-processor");

      } catch (directApiError) {
        log(`Direct API failed, trying assistant for chunk ${chunk.chunkIndex + 1}: ${directApiError}`, "background-processor");
        
        // Fallback to assistant if direct API fails
        const thread = await openai.beta.threads.create();
        
        if (!thread || !thread.id) {
          throw new Error(`Failed to create thread for chunk ${chunk.chunkIndex + 1}`);
        }

        await openai.beta.threads.messages.create(thread.id, {
          role: "user",
          content: chunkPrompt
        });

        const run = await openai.beta.threads.runs.create(thread.id, {
          assistant_id: document.assistantId
        });

        let runStatus = await openai.beta.threads.runs.retrieve(run.id, {
          thread_id: thread.id
        });
        
        const maxWaitTime = 2 * 60 * 1000;
        const startTime = Date.now();
        
        while (runStatus.status === "queued" || runStatus.status === "in_progress") {
          if (Date.now() - startTime > maxWaitTime) {
            throw new Error(`OpenAI assistant timeout after 2 minutes for chunk ${chunk.chunkIndex + 1}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          runStatus = await openai.beta.threads.runs.retrieve(run.id, {
            thread_id: thread.id
          });
          
          log(`Waiting for assistant... Status: ${runStatus.status}`, "background-processor");
        }

        if (runStatus.status === "completed") {
          const messages = await openai.beta.threads.messages.list(thread.id);
          const assistantMessage = messages.data.find(m => m.role === "assistant");
          
          if (assistantMessage && assistantMessage.content[0].type === "text") {
            processedContent = assistantMessage.content[0].text.value;
            log(`Completed chunk ${chunk.chunkIndex + 1} using assistant for document ${document.id}`, "background-processor");
          } else {
            throw new Error(`No valid response from assistant for chunk ${chunk.chunkIndex + 1}`);
          }
        } else {
          throw new Error(`Assistant run failed with status: ${runStatus.status} for chunk ${chunk.chunkIndex + 1}`);
        }
      }

      await storage.updateDocumentChunk(chunk.id, {
        processedContent,
        status: 'completed'
      });
      
      // Update document processed chunks count
      const currentDoc = await storage.getDocument(document.id);
      await storage.updateDocument(document.id, {
        processedChunks: (currentDoc?.processedChunks || 0) + 1
      });
      
    } catch (error: any) {
      log(`Error processing chunk ${chunk.chunkIndex + 1}: ${error.message}`, "background-processor");
      await storage.updateDocumentChunk(chunk.id, {
        status: 'failed',
        errorMessage: error.message
      });
    }
  }

  async finalizeDocument(documentId: number, chunks: any[]) {
    try {
      // Combine all processed chunks in order
      const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const processedMarkdown = sortedChunks
        .map(chunk => chunk.processedContent)
        .join('\n\n');
      
      await storage.updateDocument(documentId, {
        processedMarkdown,
        status: 'completed'
      });
      
      log(`Document ${documentId} processing completed`, "background-processor");
    } catch (error: any) {
      log(`Error finalizing document ${documentId}: ${error.message}`, "background-processor");
      await storage.updateDocument(documentId, {
        status: 'failed',
        errorMessage: 'Failed to finalize document'
      });
    }
  }
}

export const backgroundProcessor = new BackgroundProcessor();