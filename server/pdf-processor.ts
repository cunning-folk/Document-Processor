import pdf2pic from 'pdf2pic';
import { exec } from 'child_process';
import { promisify } from 'util';
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
    const execAsync = promisify(exec);

    try {
      // Save PDF to temporary file for processing
      const tempPdfPath = `/tmp/pdf_${Date.now()}.pdf`;
      fs.writeFileSync(tempPdfPath, buffer);

      // Try multiple conversion approaches
      const extractedTexts: string[] = [];
      let successfulPages = 0;
      const maxTotalPages = 20;

      // Method 1: Try pdf2pic with different settings
      try {
        const convert = pdf2pic.fromPath(tempPdfPath, {
          density: 200,
          saveFilename: "page",
          savePath: "/tmp",
          format: "png",
          width: 2000,
          height: 2000
        });

        for (let pageNum = 1; pageNum <= maxTotalPages; pageNum++) {
          try {
            log(`Attempting pdf2pic conversion for page ${pageNum}`, 'pdf-processor');
            const image = await convert(pageNum);
            
            if (image.path && fs.existsSync(image.path)) {
              const { data: { text } } = await this.ocrWorker.recognize(image.path);
              const cleanText = text.trim();
              
              if (cleanText.length > 10) {
                extractedTexts.push(cleanText);
                successfulPages++;
                log(`Successfully extracted text from page ${pageNum} using pdf2pic`, 'pdf-processor');
              }
              
              fs.unlinkSync(image.path);
            }
          } catch (pageError: any) {
            log(`pdf2pic failed for page ${pageNum}: ${pageError.message}`, 'pdf-processor');
            break; // Stop trying pdf2pic if it fails
          }
        }
      } catch (pdf2picError: any) {
        log(`pdf2pic conversion failed: ${pdf2picError.message}`, 'pdf-processor');
      }

      // Method 2: Try direct ImageMagick conversion if pdf2pic failed
      if (extractedTexts.length === 0) {
        try {
          log('Attempting direct ImageMagick conversion', 'pdf-processor');
          
          for (let pageNum = 0; pageNum < maxTotalPages; pageNum++) {
            const outputPath = `/tmp/page_${Date.now()}_${pageNum}.png`;
            
            try {
              await execAsync(`convert "${tempPdfPath}[${pageNum}]" -density 200 -quality 100 "${outputPath}"`);
              
              if (fs.existsSync(outputPath)) {
                const { data: { text } } = await this.ocrWorker.recognize(outputPath);
                const cleanText = text.trim();
                
                if (cleanText.length > 10) {
                  extractedTexts.push(cleanText);
                  successfulPages++;
                  log(`Successfully extracted text from page ${pageNum + 1} using ImageMagick`, 'pdf-processor');
                }
                
                fs.unlinkSync(outputPath);
              }
            } catch (pageError: any) {
              log(`ImageMagick failed for page ${pageNum + 1}: ${pageError.message}`, 'pdf-processor');
              break; // Stop if conversion fails
            }
          }
        } catch (imageMagickError: any) {
          log(`ImageMagick conversion failed: ${imageMagickError.message}`, 'pdf-processor');
        }
      }

      // Method 3: Try GraphicsMagick as fallback
      if (extractedTexts.length === 0) {
        try {
          log('Attempting GraphicsMagick conversion as fallback', 'pdf-processor');
          
          for (let pageNum = 0; pageNum < maxTotalPages; pageNum++) {
            const outputPath = `/tmp/gm_page_${Date.now()}_${pageNum}.png`;
            
            try {
              await execAsync(`gm convert "${tempPdfPath}[${pageNum}]" -density 200 "${outputPath}"`);
              
              if (fs.existsSync(outputPath)) {
                const { data: { text } } = await this.ocrWorker.recognize(outputPath);
                const cleanText = text.trim();
                
                if (cleanText.length > 10) {
                  extractedTexts.push(cleanText);
                  successfulPages++;
                  log(`Successfully extracted text from page ${pageNum + 1} using GraphicsMagick`, 'pdf-processor');
                }
                
                fs.unlinkSync(outputPath);
              }
            } catch (pageError: any) {
              log(`GraphicsMagick failed for page ${pageNum + 1}: ${pageError.message}`, 'pdf-processor');
              break;
            }
          }
        } catch (gmError: any) {
          log(`GraphicsMagick conversion failed: ${gmError.message}`, 'pdf-processor');
        }
      }

      // Clean up temporary PDF file
      try {
        fs.unlinkSync(tempPdfPath);
      } catch (cleanupError: any) {
        log(`Failed to clean up temp PDF: ${cleanupError.message}`, 'pdf-processor');
      }

      if (extractedTexts.length === 0) {
        throw new Error('No text could be extracted from PDF pages using any conversion method');
      }

      log(`Successfully extracted text from ${successfulPages} pages using OCR`, 'pdf-processor');
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