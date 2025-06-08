import pdf2pic from 'pdf2pic';
import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';
import { log } from './vite';
import { createRequire } from 'module';

// Use createRequire for pdf-parse to handle the library properly
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

interface PDFProcessingResult {
  text: string;
  totalPages: number;
  method: 'text-extraction' | 'ocr' | 'hybrid';
}

export class PDFProcessor {
  private ocrWorker: any = null;

  async initializePdfParse() {
    // pdf-parse is now imported at module level
    log('PDF parsing library ready', 'pdf-processor');
  }

  async initializeOCR() {
    if (!this.ocrWorker) {
      this.ocrWorker = await createWorker('eng');
      log('OCR worker initialized', 'pdf-processor');
    }
  }

  async terminateOCR() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
      log('OCR worker terminated', 'pdf-processor');
    }
  }

  async processPDF(buffer: Buffer, filename: string): Promise<PDFProcessingResult> {
    try {
      await this.initializePdfParse();
      
      // First, try text extraction
      let textResult = null;
      try {
        textResult = await this.extractTextFromPDF(buffer);
        
        // If we got substantial text, use it
        if (textResult.text.trim().length > 50) {
          log(`PDF text extraction successful for ${filename}`, 'pdf-processor');
          return {
            text: textResult.text,
            totalPages: textResult.totalPages,
            method: 'text-extraction'
          };
        }
      } catch (textError: any) {
        log(`PDF text extraction failed for ${filename}: ${textError.message}`, 'pdf-processor');
      }

      // If text extraction failed or yielded little content, try OCR
      log(`Attempting OCR processing for ${filename}`, 'pdf-processor');
      const ocrResult = await this.extractTextWithOCR(buffer, filename);
      
      return {
        text: ocrResult.text,
        totalPages: ocrResult.totalPages,
        method: textResult && textResult.text.trim().length > 0 ? 'hybrid' : 'ocr'
      };

    } catch (error: any) {
      log(`PDF processing completely failed for ${filename}: ${error.message}`, 'pdf-processor');
      throw new Error(`Unable to process PDF file. The file may be corrupted, password-protected, or in an unsupported format.`);
    }
  }

  private async extractTextFromPDF(buffer: Buffer): Promise<{ text: string; totalPages: number }> {
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      totalPages: data.numpages
    };
  }

  private async extractTextWithOCR(buffer: Buffer, filename: string): Promise<{ text: string; totalPages: number }> {
    await this.initializeOCR();

    try {
      // Convert PDF to images
      const convert = pdf2pic.fromBuffer(buffer, {
        density: 100,           // DPI
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: 2000,           // Higher resolution for better OCR
        height: 2000
      });

      // Try to get PDF info to know page count, fallback if it fails
      let totalPages = 1;
      try {
        const pdfData = await pdfParse(buffer);
        totalPages = pdfData.numpages || 1;
      } catch (pageCountError: any) {
        log(`Could not determine page count, will process up to 5 pages: ${pageCountError.message}`, 'pdf-processor');
        totalPages = 5; // Fallback to processing up to 5 pages
      }
      
      const extractedTexts: string[] = [];

      // Process each page
      const maxPages = Math.min(totalPages, 5); // Limit to 5 pages for performance
      let successfulPages = 0;
      
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        try {
          log(`Processing page ${pageNum}/${totalPages} for ${filename}`, 'pdf-processor');
          
          const image = await convert(pageNum);
          
          if (image.path) {
            // Perform OCR on the image
            const { data: { text } } = await this.ocrWorker.recognize(image.path);
            if (text.trim().length > 0) {
              extractedTexts.push(text.trim());
              successfulPages++;
            }
            
            // Clean up temporary image file
            try {
              fs.unlinkSync(image.path);
            } catch (unlinkError) {
              log(`Failed to clean up temp file ${image.path}`, 'pdf-processor');
            }
          }
        } catch (pageError: any) {
          log(`Failed to process page ${pageNum}: ${pageError.message}`, 'pdf-processor');
          // Don't add error text, just continue to next page
          if (pageNum > 2 && successfulPages === 0) {
            // If we've failed on multiple pages with no success, stop trying
            break;
          }
        }
      }

      if (extractedTexts.length === 0) {
        throw new Error('No text could be extracted from PDF pages');
      }

      return {
        text: extractedTexts.join('\n\n'),
        totalPages: successfulPages
      };

    } catch (error: any) {
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  async cleanup() {
    await this.terminateOCR();
  }
}

// Global instance
export const pdfProcessor = new PDFProcessor();

// Cleanup on process exit
process.on('exit', () => {
  pdfProcessor.cleanup();
});

process.on('SIGINT', () => {
  pdfProcessor.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  pdfProcessor.cleanup();
  process.exit(0);
});