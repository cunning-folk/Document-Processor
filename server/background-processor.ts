import OpenAI from 'openai';
import { storage } from './storage';
import { log } from './vite';

export class BackgroundProcessor {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private stuckChunkThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds

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

      // Check for and recover stuck chunks
      await this.recoverStuckChunks();

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
      
      // Validate chunk size before processing
      if (chunk.content.length > 100000) {
        log(`Chunk ${chunk.chunkIndex + 1} is too large (${chunk.content.length} chars), marking as failed`, "background-processor");
        await storage.updateDocumentChunk(chunk.id, {
          status: 'failed',
          processedContent: `Error: Chunk too large (${chunk.content.length} characters). Please use a smaller document or contact support.`
        });
        return;
      }
      
      const openai = new OpenAI({ apiKey: document.apiKey });
      
      const isMultipart = totalChunks > 1;
      const chunkPrompt = isMultipart 
        ? `Clean up this text by fixing paragraph breaks, removing hyphens from line breaks, and formatting it as proper markdown. IMPORTANT: Preserve ALL text content - do not remove, condense, or summarize anything. This is part ${chunk.chunkIndex + 1} of ${totalChunks} from a larger document. Here is the text:\n\n${chunk.content}`
        : `Clean up this text by fixing paragraph breaks, removing hyphens from line breaks, and formatting it as proper markdown. IMPORTANT: Preserve ALL text content - do not remove, condense, or summarize anything. Here is the text:\n\n${chunk.content}`;

      let processedContent: string;

      try {
        // Try direct chat completion first (faster)
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a document formatting assistant. You clean messy text (often from PDFs) by: fixing line breaks in the middle of sentences, removing hyphens at line ends and joining words, restoring paragraphs, applying clean markdown (e.g., ## for section headers, * for bullets). CRITICAL: You must preserve ALL content from the original text - do not remove or summarize anything. Even if text appears repetitive (like headers, footers, page numbers), you MUST keep it. Your job is ONLY to fix formatting issues, NOT to remove content. Always output valid markdown that contains 100% of the original text content."
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
      
      // Implement retry logic for transient errors
      const isRetryable = error.message.includes('rate limit') || 
                         error.message.includes('timeout') || 
                         error.message.includes('network') ||
                         error.message.includes('503') ||
                         error.message.includes('502');
      
      if (isRetryable) {
        // Mark for retry by resetting to pending status
        await storage.updateDocumentChunk(chunk.id, {
          status: 'pending',
          errorMessage: `Retrying: ${error.message}`
        });
        log(`Chunk ${chunk.chunkIndex + 1} marked for retry`, "background-processor");
      } else {
        await storage.updateDocumentChunk(chunk.id, {
          status: 'failed',
          errorMessage: error.message
        });
        log(`Chunk ${chunk.chunkIndex + 1} marked as failed`, "background-processor");
      }
    }
  }

  async recoverStuckChunks() {
    try {
      const stuckChunks = await storage.getStuckChunks(this.stuckChunkThreshold);
      
      if (stuckChunks.length > 0) {
        log(`Found ${stuckChunks.length} stuck chunks, resetting to pending`, "background-processor");
        
        for (const chunk of stuckChunks) {
          await storage.updateDocumentChunk(chunk.id, {
            status: 'pending',
            errorMessage: null
          });
          
          log(`Reset stuck chunk ${chunk.chunkIndex + 1} for document ${chunk.documentId}`, "background-processor");
        }
      }
    } catch (error: any) {
      log(`Error recovering stuck chunks: ${error.message}`, "background-processor");
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