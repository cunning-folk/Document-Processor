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
  method: 'text-extraction' | 'ocr' | 'hybrid' | 'normalized-text-extraction';
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
    log(`Processing PDF file: ${filename}`, 'pdf-processor');
    
    try {
      await this.initializePdfParse();
      
      // Step 1: Always attempt PDF normalization first (emulates print-to-PDF)
      log(`Starting automatic PDF preprocessing for ${filename}`, 'pdf-processor');
      const normalizedBuffer = await this.normalizePDF(buffer, filename);
      
      let processingBuffer = normalizedBuffer || buffer;
      let normalizationUsed = normalizedBuffer !== null;
      
      if (normalizationUsed) {
        log(`PDF preprocessing successful, using normalized version for ${filename}`, 'pdf-processor');
      } else {
        log(`PDF preprocessing failed, using original for ${filename}`, 'pdf-processor');
      }
      
      // Step 2: Try text extraction on preprocessed PDF
      try {
        const textResult = await this.extractTextFromPDF(processingBuffer);
        const extractedText = textResult.text.trim();
        
        // Check for encryption markers in extracted text
        if (extractedText.includes('U2FsdGVkX1') || extractedText.includes('encrypted')) {
          log(`Extracted text contains encryption markers for ${filename}`, 'pdf-processor');
          throw new Error('This PDF contains encrypted content that cannot be processed. Please provide an unprotected version.');
        }
        
        if (extractedText.length >= 50) {
          log(`Text extraction successful for ${filename} using ${normalizationUsed ? 'preprocessed' : 'original'} PDF`, 'pdf-processor');
          return {
            text: textResult.text,
            totalPages: textResult.totalPages,
            method: normalizationUsed ? 'normalized-text-extraction' : 'text-extraction'
          };
        } else {
          log(`Text extraction yielded minimal content (${extractedText.length} chars) for ${filename}`, 'pdf-processor');
        }
      } catch (textError: any) {
        log(`Text extraction failed for ${filename}: ${textError.message}`, 'pdf-processor');
        
        // Check for encryption/protection indicators
        const errorMessage = textError.message.toLowerCase();
        if (errorMessage.includes('encrypted') || errorMessage.includes('password') || errorMessage.includes('protected')) {
          throw new Error('This PDF appears to be password-protected or encrypted. Please provide an unprotected version.');
        }
      }

      // Step 3: Try OCR on preprocessed PDF as final attempt
      log(`Attempting OCR processing on ${normalizationUsed ? 'preprocessed' : 'original'} PDF for ${filename}`, 'pdf-processor');
      const ocrResult = await this.extractTextWithOCR(processingBuffer, filename);
      
      return {
        text: ocrResult.text,
        totalPages: ocrResult.totalPages,
        method: 'ocr'
      };

    } catch (error: any) {
      const errorMessage = error.message.toLowerCase();
      
      // Provide specific error messages for different failure types
      if (errorMessage.includes('u2fsdgvkx1') || errorMessage.includes('salted') || errorMessage.includes('encrypted')) {
        log(`PDF contains encrypted content: ${filename}`, 'pdf-processor');
        throw new Error('This PDF contains encrypted or protected content that cannot be processed. Please provide an unprotected version.');
      } else if (errorMessage.includes('undefined in') || errorMessage.includes('improper image header')) {
        log(`PDF has structural issues: ${filename}`, 'pdf-processor');
        throw new Error('This PDF has structural issues that prevent processing. The file may be corrupted or use an unsupported format.');
      } else {
        log(`PDF processing completely failed for ${filename}: ${error.message}`, 'pdf-processor');
        throw new Error('Unable to process PDF file. The file may be corrupted, password-protected, or in an unsupported format.');
      }
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
      // First, check if PDF contains encrypted content markers by examining the raw buffer
      const bufferString = buffer.toString('utf8');
      if (bufferString.includes('U2FsdGVkX1') || bufferString.includes('/Encrypt')) {
        log(`OCR skipped: PDF contains encryption markers for ${filename}`, 'pdf-processor');
        throw new Error('PDF contains encrypted content that prevents OCR processing');
      }

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

      // Method 2: Try direct ImageMagick with safer options if pdf2pic failed
      if (extractedTexts.length === 0) {
        try {
          log('Attempting direct ImageMagick conversion with safe options', 'pdf-processor');
          
          for (let pageNum = 0; pageNum < maxTotalPages; pageNum++) {
            const outputPath = `/tmp/page_${Date.now()}_${pageNum}.png`;
            
            try {
              // Use safer ImageMagick options that bypass problematic PDF structures
              await execAsync(`convert -limit memory 256MiB -limit map 512MiB -density 150 "${tempPdfPath}[${pageNum}]" -flatten -background white -alpha remove "${outputPath}"`);
              
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
              log(`ImageMagick safe mode failed for page ${pageNum + 1}: ${pageError.message}`, 'pdf-processor');
              break; // Stop if conversion fails
            }
          }
        } catch (imageMagickError: any) {
          log(`ImageMagick conversion failed: ${imageMagickError.message}`, 'pdf-processor');
        }
      }

      // Method 2b: Try ImageMagick with different Ghostscript options
      if (extractedTexts.length === 0) {
        try {
          log('Attempting ImageMagick with custom Ghostscript settings', 'pdf-processor');
          
          for (let pageNum = 0; pageNum < maxTotalPages; pageNum++) {
            const outputPath = `/tmp/page_gs_${Date.now()}_${pageNum}.png`;
            
            try {
              // Use custom Ghostscript parameters for better compatibility
              await execAsync(`convert -define pdf:use-cropbox=true -define pdf:fit-page=true -density 150 "${tempPdfPath}[${pageNum}]" "${outputPath}"`);
              
              if (fs.existsSync(outputPath)) {
                const { data: { text } } = await this.ocrWorker.recognize(outputPath);
                const cleanText = text.trim();
                
                if (cleanText.length > 10) {
                  extractedTexts.push(cleanText);
                  successfulPages++;
                  log(`Successfully extracted text from page ${pageNum + 1} using custom GS settings`, 'pdf-processor');
                }
                
                fs.unlinkSync(outputPath);
              }
            } catch (pageError: any) {
              log(`Custom GS settings failed for page ${pageNum + 1}: ${pageError.message}`, 'pdf-processor');
              break;
            }
          }
        } catch (gsError: any) {
          log(`Custom Ghostscript method failed: ${gsError.message}`, 'pdf-processor');
        }
      }

      // Method 3: Try direct Ghostscript with error recovery
      if (extractedTexts.length === 0) {
        try {
          log('Attempting direct Ghostscript conversion with error recovery', 'pdf-processor');
          
          for (let pageNum = 1; pageNum <= maxTotalPages; pageNum++) {
            const outputPath = `/tmp/gs_page_${Date.now()}_${pageNum}.png`;
            
            try {
              // Direct Ghostscript command with error recovery options
              await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -dFirstPage=${pageNum} -dLastPage=${pageNum} -sDEVICE=png16m -r150 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${outputPath}" "${tempPdfPath}"`);
              
              if (fs.existsSync(outputPath)) {
                const { data: { text } } = await this.ocrWorker.recognize(outputPath);
                const cleanText = text.trim();
                
                if (cleanText.length > 10) {
                  extractedTexts.push(cleanText);
                  successfulPages++;
                  log(`Successfully extracted text from page ${pageNum} using direct Ghostscript`, 'pdf-processor');
                }
                
                fs.unlinkSync(outputPath);
              }
            } catch (pageError: any) {
              log(`Direct Ghostscript failed for page ${pageNum}: ${pageError.message}`, 'pdf-processor');
              break;
            }
          }
        } catch (gsDirectError: any) {
          log(`Direct Ghostscript conversion failed: ${gsDirectError.message}`, 'pdf-processor');
        }
      }

      // Method 4: Try GraphicsMagick as final fallback
      if (extractedTexts.length === 0) {
        try {
          log('Attempting GraphicsMagick conversion as final fallback', 'pdf-processor');
          
          for (let pageNum = 0; pageNum < maxTotalPages; pageNum++) {
            const outputPath = `/tmp/gm_page_${Date.now()}_${pageNum}.png`;
            
            try {
              await execAsync(`gm convert "${tempPdfPath}[${pageNum}]" -density 150 "${outputPath}"`);
              
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

  private async normalizePDF(buffer: Buffer, filename: string): Promise<Buffer | null> {
    const execAsync = promisify(exec);
    
    try {
      // Save original PDF to temporary file
      const tempInputPath = `/tmp/input_${Date.now()}.pdf`;
      const tempOutputPath = `/tmp/normalized_${Date.now()}.pdf`;
      const tempCleanPath = `/tmp/clean_${Date.now()}.pdf`;
      
      fs.writeFileSync(tempInputPath, buffer);
      
      // Method 1: Advanced Ghostscript reconstruction (emulates print-to-PDF)
      try {
        log(`Attempting advanced PDF reconstruction for ${filename}`, 'pdf-processor');
        
        // First pass: Remove encryption and flatten structure
        const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -dNOOUTERSAVE \
          -sDEVICE=pdfwrite \
          -dCompatibilityLevel=1.7 \
          -dPDFSETTINGS=/default \
          -dEmbedAllFonts=true \
          -dSubsetFonts=true \
          -dOptimize=true \
          -dUseCIEColor=true \
          -dDetectDuplicateImages=true \
          -dCompressFonts=true \
          -dNOTRANSPARENCY \
          -sOutputFile="${tempOutputPath}" \
          "${tempInputPath}" 2>/dev/null`;
        
        await execAsync(gsCommand);
        
        if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
          // Second pass: Further cleanup and optimization
          const cleanCommand = `gs -dNOPAUSE -dBATCH -dSAFER \
            -sDEVICE=pdfwrite \
            -dCompatibilityLevel=1.4 \
            -dPDFSETTINGS=/ebook \
            -dDetectDuplicateImages=true \
            -dCompressFonts=true \
            -dNOTRANSPARENCY \
            -sOutputFile="${tempCleanPath}" \
            "${tempOutputPath}" 2>/dev/null`;
          
          await execAsync(cleanCommand);
          
          if (fs.existsSync(tempCleanPath) && fs.statSync(tempCleanPath).size > 0) {
            const normalizedBuffer = fs.readFileSync(tempCleanPath);
            try {
              fs.unlinkSync(tempInputPath);
              fs.unlinkSync(tempOutputPath);
              fs.unlinkSync(tempCleanPath);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            log(`Advanced PDF reconstruction successful for ${filename}`, 'pdf-processor');
            return normalizedBuffer;
          }
        }
      } catch (gsError: any) {
        log(`Advanced Ghostscript reconstruction failed: ${gsError.message}`, 'pdf-processor');
      }
      
      // Method 2: Simple Ghostscript flattening (fallback)
      try {
        log(`Attempting simple PDF flattening for ${filename}`, 'pdf-processor');
        await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -sOutputFile="${tempOutputPath}" "${tempInputPath}" 2>/dev/null`);
        
        if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
          const normalizedBuffer = fs.readFileSync(tempOutputPath);
          try {
            fs.unlinkSync(tempInputPath);
            fs.unlinkSync(tempOutputPath);
            if (fs.existsSync(tempCleanPath)) fs.unlinkSync(tempCleanPath);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          log(`Simple PDF flattening successful for ${filename}`, 'pdf-processor');
          return normalizedBuffer;
        }
      } catch (gsSimpleError: any) {
        log(`Simple PDF flattening failed: ${gsSimpleError.message}`, 'pdf-processor');
      }
      
      // Method 3: qpdf decrypt and repair
      try {
        log(`Attempting qpdf decrypt and repair for ${filename}`, 'pdf-processor');
        // First try to decrypt if encrypted, then linearize
        await execAsync(`qpdf --decrypt "${tempInputPath}" "${tempOutputPath}" 2>/dev/null || qpdf --linearize "${tempInputPath}" "${tempOutputPath}" 2>/dev/null`);
        
        if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
          const normalizedBuffer = fs.readFileSync(tempOutputPath);
          fs.unlinkSync(tempInputPath);
          fs.unlinkSync(tempOutputPath);
          log(`PDF normalization successful via qpdf for ${filename}`, 'pdf-processor');
          return normalizedBuffer;
        }
      } catch (qpdfError: any) {
        log(`qpdf normalization failed: ${qpdfError.message}`, 'pdf-processor');
      }
      
      // Method 3: Use pdftk for PDF reconstruction
      try {
        log(`Attempting PDF normalization via pdftk for ${filename}`, 'pdf-processor');
        await execAsync(`pdftk "${tempInputPath}" output "${tempOutputPath}" compress`);
        
        if (fs.existsSync(tempOutputPath)) {
          const normalizedBuffer = fs.readFileSync(tempOutputPath);
          fs.unlinkSync(tempInputPath);
          fs.unlinkSync(tempOutputPath);
          log(`PDF normalization successful via pdftk for ${filename}`, 'pdf-processor');
          return normalizedBuffer;
        }
      } catch (pdftkError: any) {
        log(`pdftk normalization failed: ${pdftkError.message}`, 'pdf-processor');
      }
      
      // Clean up input file
      try {
        fs.unlinkSync(tempInputPath);
      } catch (cleanupError: any) {
        log(`Failed to clean up temp input file: ${cleanupError.message}`, 'pdf-processor');
      }
      
      log(`All PDF normalization methods failed for ${filename}`, 'pdf-processor');
      return null;
      
    } catch (error: any) {
      log(`PDF normalization error for ${filename}: ${error.message}`, 'pdf-processor');
      return null;
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