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
        ? `Reformat this text with proper markdown. Do NOT remove ANY content. Just fix line breaks and add markdown formatting. Keep every single word, number, and character from the input. This is part ${chunk.chunkIndex + 1} of ${totalChunks}.\n\nText to reformat:\n\n${chunk.content}`
        : `Reformat this text with proper markdown. Do NOT remove ANY content. Just fix line breaks and add markdown formatting. Keep every single word, number, and character from the input.\n\nText to reformat:\n\n${chunk.content}`;

      let processedContent: string;

      // Check if this is a retry for low retention
      const isRetry = chunk.errorMessage?.includes('LOW_RETENTION_RETRY');
      const retryCount = isRetry ? parseInt(chunk.errorMessage.match(/RETRY_(\d+)/)?.[1] || '0') : 0;
      
      try {
        // Use gpt-4o for better instruction following, especially on retries
        const modelToUse = (isRetry || retryCount > 0) ? "gpt-4o" : "gpt-4o-mini";
        
        const response = await openai.chat.completions.create({
          model: modelToUse,
          messages: [
            {
              role: "system",
              content: "You are a text reformatter that ONLY fixes formatting - you do NOT edit, remove, or condense content.\n\nYour ONLY allowed actions:\n1. Join words split by hyphens at line breaks (e.g., 'beauti-\\nful' → 'beautiful')\n2. Join sentences broken across lines\n3. Add markdown formatting (## headers, * bullets, etc.)\n\nSTRICTLY FORBIDDEN actions:\n1. Removing repetitive text (headers, footers, page numbers) - keep ALL of it\n2. Removing OCR errors or garbled text - keep ALL of it\n3. Summarizing or condensing any content\n4. Removing anything that seems redundant\n5. Correcting spelling or grammar\n\nYou are NOT a cleanup tool. You are a reformatter. The output text length should be nearly identical to the input. If you're removing more than 5% of characters, you're doing it wrong."
            },
            {
              role: "user",
              content: chunkPrompt
            }
          ],
          temperature: 0,
          max_tokens: 16000
        });

        processedContent = response.choices[0].message.content || chunk.content;
        
        // Validate content retention
        const originalLength = chunk.content.length;
        const processedLength = processedContent.length;
        const retentionRate = processedLength / originalLength;
        
        log(`Chunk ${chunk.chunkIndex + 1} retention: ${(retentionRate * 100).toFixed(1)}% (${processedLength}/${originalLength} chars) using ${modelToUse}`, "background-processor");
        
        // If retention is too low and we haven't retried too many times, mark for retry
        if (retentionRate < 0.95 && retryCount < 2) {
          const newRetryCount = retryCount + 1;
          log(`Chunk ${chunk.chunkIndex + 1} has low retention (${(retentionRate * 100).toFixed(1)}%), marking for retry ${newRetryCount}`, "background-processor");
          
          await storage.updateDocumentChunk(chunk.id, {
            status: 'pending',
            errorMessage: `LOW_RETENTION_RETRY_${newRetryCount}: ${(retentionRate * 100).toFixed(1)}% retention`
          });
          return; // Exit without marking as completed
        }
        
        log(`Completed chunk ${chunk.chunkIndex + 1} using ${modelToUse} for document ${document.id}`, "background-processor");

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