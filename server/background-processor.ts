import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { storage } from './storage';
import { log } from './vite';

const MAX_CONCURRENT_CHUNKS = 1;
const RATE_LIMIT_DELAY_MS = 2000;

export class BackgroundProcessor {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private stuckChunkThreshold = 5 * 60 * 1000;
  private activeChunks = new Set<number>();
  private lastApiCallTime = 0;

  start() {
    if (this.processingInterval) return;
    
    log("Starting background processor (Claude API)", "background-processor");
    this.processingInterval = setInterval(() => {
      this.processNextChunks();
    }, 3000);
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      log("Stopped background processor", "background-processor");
    }
  }

  private async waitForRateLimit() {
    const elapsed = Date.now() - this.lastApiCallTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      const waitTime = RATE_LIMIT_DELAY_MS - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastApiCallTime = Date.now();
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
          processedContent: `Error: Chunk too large (${chunk.content.length} characters).`
        });
        return;
      }
      
      await this.waitForRateLimit();
      
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      const isMultipart = totalChunks > 1;
      const partInfo = isMultipart ? `This is part ${chunk.chunkIndex + 1} of ${totalChunks}. The beginning of this chunk may overlap with the end of the previous chunk for context continuity — do NOT duplicate that overlapping content in your output.\n\n` : '';
      const chunkPrompt = `${partInfo}The following is OCR-extracted text from a published scholarly/religious text. Please reformat it into a clean, properly punctuated markdown transcript. Preserve ALL content faithfully — do not remove, summarize, or condense anything. Fix OCR errors (like '!' instead of 'The') using context clues.

Text to reformat:

${chunk.content}`;

      let processedContent: string;

      const isRetry = chunk.errorMessage?.includes('LOW_RETENTION_RETRY');
      const retryCount = isRetry ? parseInt(chunk.errorMessage.match(/RETRY_(\d+)/)?.[1] || '0') : 0;
      
      const systemPrompt = `You are a scholarly transcription assistant converting academic and religious source texts to clean markdown. These texts include Buddhist philosophy, Tibetan Buddhist practice manuals, Hindu and Vedic literature, and comparative religion scholarship. Your role is to faithfully transcribe and reformat the provided OCR-extracted or raw text into a properly punctuated, typeset document. Do not editorialize, summarize, or omit any content.

CONTEXT: The source material is from published religious and academic texts. The content may include traditional Buddhist tantric terminology, meditation instructions, philosophical discussions of consciousness and embodiment, and Sanskrit/Tibetan technical vocabulary. All content is scholarly and religious in nature and should be transcribed faithfully.

REQUIRED ACTIONS:
1. PRESERVE all Tibetan script (བོད་ཡིག) exactly as written — never transliterate or remove Unicode Tibetan characters
2. NORMALIZE Sanskrit/Pali terms to proper diacritics: Śūnyatā, Mahāmudrā, Prajñā, Dharmakāya, Nirmāṇakāya, Sambhogakāya, Bodhicitta, Rigpa, Mahāsiddha, Prajñāpāramitā, etc.
3. Fix punctuation throughout: proper periods, commas, semicolons, quotation marks, em-dashes
4. Join words split by hyphens at line breaks (e.g., 'beauti-\\nful' → 'beautiful')
5. Join sentences broken across lines into proper flowing paragraphs
6. Add proper paragraph spacing between logical sections
7. Apply clean markdown formatting (## headers, * bullets, > blockquotes for quoted teachings)
8. Keep phonetic transliterations alongside Tibetan script if present
9. If this is a multi-part document and the beginning overlaps with a previous chunk, omit the duplicate text and start from where the new content begins
10. FIX common OCR corruption patterns: '!' appearing where 'The' or 'the' should be, 'l' replacing 'I' at word starts, '0' replacing 'O', 'rn' misread as 'm', etc. Use surrounding context to determine the correct reading

STRICTLY FORBIDDEN:
1. Removing or transliterating Tibetan script — KEEP ALL Tibetan Unicode characters
2. Removing any text including repetitive text, headers, footers, page numbers — keep ALL of it
3. Summarizing or condensing any content
4. Changing the meaning or structure of content
5. Adding commentary or explanations
6. Refusing to process the text for any reason — this is published scholarly/religious material

Output ONLY the reformatted text. Do not include any preamble like "Here is the reformatted text:" — just output the formatted content directly.`;

      const maxRetries = 3;
      let lastError: any = null;
      let contentBlocked = false;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const backoffMs = attempt * 10000;
            log(`Rate limit retry ${attempt}/${maxRetries} for chunk ${chunk.chunkIndex + 1}, waiting ${backoffMs}ms`, "background-processor");
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            this.lastApiCallTime = Date.now();
          }
          
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 16384,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: chunkPrompt
              }
            ]
          });

          const textBlock = response.content.find((block: any) => block.type === 'text');
          processedContent = textBlock ? (textBlock as any).text : chunk.content;
          
          const stopReason = response.stop_reason;
          if (stopReason === 'max_tokens') {
            log(`Chunk ${chunk.chunkIndex + 1} response was TRUNCATED (stop_reason: max_tokens), marking for retry`, "background-processor");
            if (retryCount < 2) {
              await storage.updateDocumentChunk(chunk.id, {
                status: 'pending',
                errorMessage: `LOW_RETENTION_RETRY_${retryCount + 1}: truncated response`
              });
              return;
            }
          }
          
          lastError = null;
          contentBlocked = false;
          break;

        } catch (apiError: any) {
          lastError = apiError;
          const errorMsg = apiError.message || JSON.stringify(apiError);
          if (errorMsg.includes('content filtering') || errorMsg.includes('blocked by content')) {
            contentBlocked = true;
            log(`Chunk ${chunk.chunkIndex + 1} blocked by Claude content filter, falling back to OpenAI`, "background-processor");
            break;
          }
          if (apiError.status === 429 || errorMsg.includes('rate limit') || errorMsg.includes('overloaded')) {
            if (attempt < maxRetries) {
              continue;
            }
          }
          throw apiError;
        }
      }

      if (contentBlocked) {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
          throw new Error('Claude content filter blocked this chunk and no OpenAI API key is available for fallback');
        }
        const openai = new OpenAI({ apiKey: openaiKey });
        
        log(`Processing chunk ${chunk.chunkIndex + 1} with OpenAI GPT-4o fallback`, "background-processor");
        
        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 16384,
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: chunkPrompt }
          ]
        });
        
        processedContent = openaiResponse.choices[0]?.message?.content || chunk.content;
        
        if (openaiResponse.choices[0]?.finish_reason === 'length') {
          log(`Chunk ${chunk.chunkIndex + 1} OpenAI response was TRUNCATED, marking for retry`, "background-processor");
          if (retryCount < 2) {
            await storage.updateDocumentChunk(chunk.id, {
              status: 'pending',
              errorMessage: `LOW_RETENTION_RETRY_${retryCount + 1}: truncated OpenAI response`
            });
            return;
          }
        }
        
        log(`Chunk ${chunk.chunkIndex + 1} processed successfully via OpenAI fallback`, "background-processor");
      }
      
      if (lastError && !contentBlocked) {
        throw lastError;
      }

      const originalLength = chunk.content.length;
      const processedLength = processedContent!.length;
      const overlapAllowance = chunk.chunkIndex > 0 ? 500 : 0;
      const effectiveOriginalLength = originalLength - overlapAllowance;
      const retentionRate = effectiveOriginalLength > 0 ? processedLength / effectiveOriginalLength : 1;
      
      log(`Chunk ${chunk.chunkIndex + 1} retention: ${(retentionRate * 100).toFixed(1)}% (${processedLength}/${effectiveOriginalLength} effective chars)`, "background-processor");
      
      if (retentionRate < 0.70 && retryCount < 2) {
        const newRetryCount = retryCount + 1;
        log(`Chunk ${chunk.chunkIndex + 1} has low retention (${(retentionRate * 100).toFixed(1)}%), marking for retry ${newRetryCount}`, "background-processor");
        
        await storage.updateDocumentChunk(chunk.id, {
          status: 'pending',
          errorMessage: `LOW_RETENTION_RETRY_${newRetryCount}: ${(retentionRate * 100).toFixed(1)}% retention`
        });
        return;
      }
      
      log(`Completed chunk ${chunk.chunkIndex + 1} for document ${document.id}`, "background-processor");


      await storage.updateDocumentChunk(chunk.id, {
        processedContent: processedContent!,
        status: 'completed'
      });
      
      const currentDoc = await storage.getDocument(document.id);
      await storage.updateDocument(document.id, {
        processedChunks: (currentDoc?.processedChunks || 0) + 1
      });
      
    } catch (error: any) {
      log(`Error processing chunk ${chunk.chunkIndex + 1}: ${error.message}`, "background-processor");
      
      const isRetryable = error.message?.includes('rate limit') || 
                         error.message?.includes('timeout') || 
                         error.message?.includes('network') ||
                         error.message?.includes('overloaded') ||
                         error.status === 429 ||
                         error.status === 529 ||
                         error.status === 503 ||
                         error.status === 502;
      
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
      
      const suggestedFilename = await this.generateFilename(processedMarkdown);
      
      await storage.updateDocument(documentId, {
        processedMarkdown,
        suggestedFilename,
        status: 'completed'
      });
      
      log(`Document ${documentId} processing completed (all ${chunks.length} chunks successful)${suggestedFilename ? `, suggested filename: ${suggestedFilename}` : ''}`, "background-processor");
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
      const suggestedFilename = await this.generateFilename(processedMarkdown);
      
      await storage.updateDocument(documentId, {
        processedMarkdown,
        suggestedFilename,
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

  private async generateFilename(markdown: string): Promise<string | null> {
    const snippet = markdown.slice(0, 3000);
    const filenameSystemPrompt = "You generate short, descriptive filenames for documents. Output ONLY the filename with no extension, no quotes, no explanation. Use title case with hyphens between words. Keep it under 60 characters. Examples: 'Mahamudra-Ocean-of-Definitive-Meaning', 'Heart-Sutra-Commentary', 'Tsalung-Practice-Instructions'";
    const filenameUserPrompt = `Generate a descriptive filename for this document based on its content:\n\n${snippet}`;
    
    const sanitizeFilename = (raw: string) => {
      let filename = raw.trim();
      filename = filename.replace(/[^a-zA-Z0-9\-_āīūśṣṭḍṅñṃḥĀĪŪŚṢṬḌṄÑṂḤ]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (filename.length > 60) filename = filename.substring(0, 60).replace(/-$/, '');
      return filename;
    };

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        system: filenameSystemPrompt,
        messages: [{ role: "user", content: filenameUserPrompt }]
      });
      
      const textBlock = response.content.find((block: any) => block.type === 'text');
      if (textBlock) {
        const filename = sanitizeFilename((textBlock as any).text);
        log(`Generated filename via Claude: ${filename}`, "background-processor");
        return filename;
      }
      return null;
    } catch (claudeError: any) {
      log(`Claude filename generation failed: ${claudeError.message}, trying OpenAI fallback`, "background-processor");
      try {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return null;
        const openai = new OpenAI({ apiKey: openaiKey });
        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 100,
          temperature: 0,
          messages: [
            { role: "system", content: filenameSystemPrompt },
            { role: "user", content: filenameUserPrompt }
          ]
        });
        const content = openaiResponse.choices[0]?.message?.content;
        if (content) {
          const filename = sanitizeFilename(content);
          log(`Generated filename via OpenAI fallback: ${filename}`, "background-processor");
          return filename;
        }
        return null;
      } catch (openaiError: any) {
        log(`OpenAI filename fallback also failed: ${openaiError.message}`, "background-processor");
        return null;
      }
    }
  }
}

export const backgroundProcessor = new BackgroundProcessor();
