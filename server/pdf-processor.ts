const pdfParse = require('pdf-parse');
import pdf2pic from 'pdf2pic';
import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';
import { log } from './vite';

interface PDFProcessingResult {
  text: string;
  totalPages: number;
  method: 'text-extraction' | 'ocr' | 'hybrid';
}

export class PDFProcessor {
  private ocrWorker: any = null;

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
      // First, try text extraction
      const textResult = await this.extractTextFromPDF(buffer);
      
      // If we got substantial text, use it
      if (textResult.text.trim().length > 100) {
        log(`PDF text extraction successful for ${filename}`, 'pdf-processor');
        return {
          text: textResult.text,
          totalPages: textResult.totalPages,
          method: 'text-extraction'
        };
      }

      // If text extraction yielded little content, try OCR
      log(`PDF appears to be image-based, using OCR for ${filename}`, 'pdf-processor');
      const ocrResult = await this.extractTextWithOCR(buffer, filename);
      
      return {
        text: ocrResult.text,
        totalPages: ocrResult.totalPages,
        method: textResult.text.trim().length > 0 ? 'hybrid' : 'ocr'
      };

    } catch (error) {
      log(`PDF processing failed for ${filename}: ${error.message}`, 'pdf-processor');
      throw new Error(`Failed to process PDF: ${error.message}`);
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

      // Get PDF info to know page count
      const pdfData = await pdfParse(buffer);
      const totalPages = pdfData.numpages;
      
      const extractedTexts: string[] = [];

      // Process each page
      for (let pageNum = 1; pageNum <= Math.min(totalPages, 20); pageNum++) { // Limit to 20 pages for performance
        try {
          log(`Processing page ${pageNum}/${totalPages} for ${filename}`, 'pdf-processor');
          
          const image = await convert(pageNum);
          
          if (image.path) {
            // Perform OCR on the image
            const { data: { text } } = await this.ocrWorker.recognize(image.path);
            extractedTexts.push(text);
            
            // Clean up temporary image file
            try {
              fs.unlinkSync(image.path);
            } catch (unlinkError) {
              log(`Failed to clean up temp file ${image.path}`, 'pdf-processor');
            }
          }
        } catch (pageError) {
          log(`Failed to process page ${pageNum}: ${pageError.message}`, 'pdf-processor');
          extractedTexts.push(`[Page ${pageNum} processing failed]`);
        }
      }

      return {
        text: extractedTexts.join('\n\n'),
        totalPages
      };

    } catch (error) {
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