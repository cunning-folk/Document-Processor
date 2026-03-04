import OpenAI from 'openai';
import { storage } from './storage';
import { log } from './vite';

const MAX_CONCURRENT_CHUNKS = 3;

export class BackgroundProcessor {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private stuckChunkThreshold = 5 * 60 * 1000;
  private activeChunks = new Set<number>();

  start() {
    if (this.processingInterval) return;
    
    log("Starting background processor", "background-processor");
    this.processingInterval = setInterval(() => {
      this.processNextChunks();
    }, 2000);
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      log("Stopped background processor", "background-processor");
    }
  }

  async processNextChunks() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const deletedCount = await storage.cleanupExpiredDocuments();
      if (deletedCount > 0) {
        log(`Cleaned up ${deletedCount} expired documents for privacy`, "background-processor");
      }

      await this.recoverStuckChunks();

      const pendingDocuments = await storage.getDocumentsByStatus('processing');
      
      for (const document of pendingDocuments) {
        const chunks = await storage.getDocumentChunks(document.id);
        const pendingChunks = chunks.filter(chunk => chunk.status === 'pending' && !this.activeChunks.has(chunk.id));
        
        if (pendingChunks.length > 0) {
          const availableSlots = MAX_CONCURRENT_CHUNKS - this.activeChunks.size;
          if (availableSlots <= 0) break;
          
          const chunksToProcess = pendingChunks.slice(0, availableSlots);
          
          for (const chunk of chunksToProcess) {
            this.activeChunks.add(chunk.id);
            this.processChunk(document, chunk, chunks.length).finally(() => {
              this.activeChunks.delete(chunk.id);
            });
          }
          
          log(`Launched ${chunksToProcess.length} parallel chunk(s) for document ${document.id} (${this.activeChunks.size} active total)`, "background-processor");
        } else if (pendingChunks.length === 0) {
          const processingChunks = chunks.filter(chunk => chunk.status === 'processing' || this.activeChunks.has(chunk.id));
          if (processingChunks.length > 0) continue;

          const completedChunks = chunks.filter(chunk => chunk.status === 'completed');
          const failedChunks = chunks.filter(chunk => chunk.status === 'failed');
          
          if (completedChunks.length + failedChunks.length === chunks.length) {
            if (failedChunks.length === 0) {
              await this.finalizeDocument(document.id, chunks);
            } else if (completedChunks.length > 0) {
              await this.finalizeDocumentPartial(document.id, chunks, failedChunks.length);
            } else {
              await storage.updateDocument(document.id, {
                status: 'failed',
                errorMessage: `All ${failedChunks.length} chunks failed to process`
              });
            }
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
      const partInfo = isMultipart ? `This is part ${chunk.chunkIndex + 1} of ${totalChunks}. The beginning of this chunk may overlap with the end of the previous chunk for context continuity — do NOT duplicate that overlapping content in your output.\n\n` : '';
      const chunkPrompt = `${partInfo}Reformat this text with proper markdown formatting. Preserve ALL content exactly.

CRITICAL REQUIREMENTS:
1. PRESERVE all Tibetan script (ཆོས་ཉིད་, བདེན་མེད་, etc.) exactly as written - do NOT transliterate or remove
2. NORMALIZE Sanskrit/Pali diacritics to proper Unicode: Śūnyatā, Mahāsiddha, Rigpa, Prajñāpāramitā, Dharmakāya, etc.
3. Add proper paragraph spacing between logical sections
4. Join words split by hyphens at line breaks (e.g., 'beauti-\nful' → 'beautiful')
5. Apply clean markdown formatting (## headers, proper spacing)
6. Keep phonetic transliterations alongside Tibetan script if present
7. If content at the start overlaps with a previous chunk, skip the duplicate portion and begin from new content

Text to reformat:

${chunk.content}`;

      let processedContent: string;

      const isRetry = chunk.errorMessage?.includes('LOW_RETENTION_RETRY');
      const retryCount = isRetry ? parseInt(chunk.errorMessage.match(/RETRY_(\d+)/)?.[1] || '0') : 0;
      
      try {
        const modelToUse = (isRetry || retryCount > 0) ? "gpt-4o" : "gpt-4o-mini";
        
        const response = await openai.chat.completions.create({
          model: modelToUse,
          messages: [
            {
              role: "system",
              content: `You are a text reformatter specializing in Buddhist and philosophical texts. You ONLY fix formatting - you do NOT edit, remove, or condense content.

REQUIRED ACTIONS:
1. PRESERVE all Tibetan script (བོད་ཡིག) exactly as written - never transliterate or remove Unicode Tibetan characters
2. NORMALIZE Sanskrit/Pali terms to proper diacritics: Śūnyatā, Mahāmudrā, Prajñā, Dharmakāya, Nirmāṇakāya, Sambhogakāya, Bodhicitta, Rigpa, Mahāsiddha, etc.
3. Join words split by hyphens at line breaks (e.g., 'beauti-\nful' → 'beautiful')
4. Join sentences broken across lines
5. Add proper paragraph spacing between logical sections
6. Apply clean markdown formatting (## headers, * bullets, etc.)
7. Keep phonetic transliterations alongside Tibetan script if present
8. If this is a multi-part document and the beginning overlaps with a previous chunk, omit the duplicate text and start from where the new content begins

STRICTLY FORBIDDEN:
1. Removing or transliterating Tibetan script - KEEP ALL Tibetan Unicode characters
2. Removing repetitive text, headers, footers, page numbers - keep ALL of it
3. Summarizing or condensing any content
4. Removing OCR artifacts or seemingly garbled text
5. Changing the meaning or structure of content

The output text length should be nearly identical to input. If you're removing more than 5% of characters, you're doing it wrong.`
            },
            {
              role: "user",
              content: chunkPrompt
            }
          ],
          temperature: 0,
          max_tokens: 32000
        });

        processedContent = response.choices[0].message.content || chunk.content;
        
        const finishReason = response.choices[0].finish_reason;
        if (finishReason === 'length') {
          log(`Chunk ${chunk.chunkIndex + 1} response was TRUNCATED (finish_reason: length), marking for retry`, "background-processor");
          if (retryCount < 2) {
            await storage.updateDocumentChunk(chunk.id, {
              status: 'pending',
              errorMessage: `LOW_RETENTION_RETRY_${retryCount + 1}: truncated response`
            });
            return;
          }
        }
        
        const originalLength = chunk.content.length;
        const processedLength = processedContent.length;
        const retentionRate = processedLength / originalLength;
        
        log(`Chunk ${chunk.chunkIndex + 1} retention: ${(retentionRate * 100).toFixed(1)}% (${processedLength}/${originalLength} chars) using ${modelToUse}`, "background-processor");
        
        if (retentionRate < 0.95 && retryCount < 2) {
          const newRetryCount = retryCount + 1;
          log(`Chunk ${chunk.chunkIndex + 1} has low retention (${(retentionRate * 100).toFixed(1)}%), marking for retry ${newRetryCount}`, "background-processor");
          
          await storage.updateDocumentChunk(chunk.id, {
            status: 'pending',
            errorMessage: `LOW_RETENTION_RETRY_${newRetryCount}: ${(retentionRate * 100).toFixed(1)}% retention`
          });
          return;
        }
        
        log(`Completed chunk ${chunk.chunkIndex + 1} using ${modelToUse} for document ${document.id}`, "background-processor");

      } catch (directApiError) {
        log(`Direct API failed, trying assistant for chunk ${chunk.chunkIndex + 1}: ${directApiError}`, "background-processor");
        
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
      
      const currentDoc = await storage.getDocument(document.id);
      await storage.updateDocument(document.id, {
        processedChunks: (currentDoc?.processedChunks || 0) + 1
      });
      
    } catch (error: any) {
      log(`Error processing chunk ${chunk.chunkIndex + 1}: ${error.message}`, "background-processor");
      
      const isRetryable = error.message.includes('rate limit') || 
                         error.message.includes('timeout') || 
                         error.message.includes('network') ||
                         error.message.includes('503') ||
                         error.message.includes('502');
      
      if (isRetryable) {
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
          this.activeChunks.delete(chunk.id);
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
      const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const processedMarkdown = sortedChunks
        .map(chunk => chunk.processedContent)
        .join('\n\n');
      
      await storage.updateDocument(documentId, {
        processedMarkdown,
        status: 'completed'
      });
      
      log(`Document ${documentId} processing completed (all ${chunks.length} chunks successful)`, "background-processor");
    } catch (error: any) {
      log(`Error finalizing document ${documentId}: ${error.message}`, "background-processor");
      await storage.updateDocument(documentId, {
        status: 'failed',
        errorMessage: 'Failed to finalize document'
      });
    }
  }

  async finalizeDocumentPartial(documentId: number, chunks: any[], failedCount: number) {
    try {
      const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const totalChunks = sortedChunks.length;
      const successCount = totalChunks - failedCount;
      
      const processedParts = sortedChunks.map(chunk => {
        if (chunk.status === 'completed' && chunk.processedContent) {
          return chunk.processedContent;
        }
        return `\n\n---\n\n**[Section ${chunk.chunkIndex + 1} of ${totalChunks} could not be processed: ${chunk.errorMessage || 'Unknown error'}]**\n\n---\n\n`;
      });
      
      const processedMarkdown = processedParts.join('\n\n');
      
      await storage.updateDocument(documentId, {
        processedMarkdown,
        status: 'completed',
        errorMessage: `Partial result: ${successCount} of ${totalChunks} sections processed successfully. ${failedCount} section(s) could not be formatted.`
      });
      
      log(`Document ${documentId} partially completed: ${successCount}/${totalChunks} chunks successful`, "background-processor");
    } catch (error: any) {
      log(`Error finalizing partial document ${documentId}: ${error.message}`, "background-processor");
      await storage.updateDocument(documentId, {
        status: 'failed',
        errorMessage: 'Failed to finalize document'
      });
    }
  }
}

export const backgroundProcessor = new BackgroundProcessor();
