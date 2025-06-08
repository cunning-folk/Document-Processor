import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import pdf2pic from 'pdf2pic';
import { log } from './vite';

interface PDFProcessingResult {
  text: string;
  totalPages: number;
  method: 'text-extraction' | 'ocr' | 'hybrid' | 'normalized-text-extraction';
}

export class PDFProcessor {
  private ocrWorker: any = null;
  private pdfParse: any = null;

  async initializePdfParse() {
    try {
      log('PDF parsing library ready', 'pdf-processor');
    } catch (error: any) {
      log(`Failed to initialize PDF parsing: ${error.message}`, 'pdf-processor');
      throw new Error('PDF processing initialization failed');
    }
  }

  async initializeOCR() {
    if (this.ocrWorker) return;

    try {
      const { createWorker } = await import('tesseract.js');
      this.ocrWorker = await createWorker('eng');
      log('OCR worker initialized', 'pdf-processor');
    } catch (error: any) {
      log(`Failed to initialize OCR: ${error.message}`, 'pdf-processor');
      throw new Error('OCR initialization failed');
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
    log(`Buffer size: ${buffer.length} bytes`, 'pdf-processor');
    
    try {
      // Detailed header analysis
      const first20Bytes = buffer.subarray(0, 20);
      const headerHex = first20Bytes.toString('hex');
      const headerBinary = first20Bytes.toString('binary');
      const headerAscii = first20Bytes.toString('ascii');
      const headerUtf8 = first20Bytes.toString('utf8');
      
      log(`Header analysis for ${filename}:`, 'pdf-processor');
      log(`- Hex: ${headerHex}`, 'pdf-processor');
      log(`- Binary: ${headerBinary}`, 'pdf-processor');
      log(`- ASCII: ${headerAscii}`, 'pdf-processor');
      log(`- UTF-8: ${headerUtf8}`, 'pdf-processor');
      
      // Multiple ways to check for PDF header
      const hasValidPDFHeader = headerBinary.includes('%PDF-') || 
                               headerAscii.includes('%PDF-') ||
                               headerUtf8.includes('%PDF-') ||
                               buffer.subarray(0, 5).toString('ascii') === '%PDF-' ||
                               buffer.subarray(0, 5).toString('utf8') === '%PDF-';
      
      // First check for encryption signatures before PDF validation
      if (headerBinary.includes('U2FsdGVkX1') || headerAscii.includes('U2FsdGVkX1') || headerUtf8.includes('U2FsdGVkX1')) {
        log(`Encrypted upload detected for ${filename}`, 'pdf-processor');
        throw new Error('This file appears to be encrypted during upload. This usually happens due to browser extensions or security software. Please try: 1) Disable browser extensions temporarily, 2) Use a different browser or incognito mode, 3) Try uploading from a different network, or 4) Use the test PDF provided in the interface.');
      }

      if (!hasValidPDFHeader) {
        log(`No PDF header found in first 20 bytes for ${filename}`, 'pdf-processor');
        
        // Check if file is too small
        if (buffer.length < 1024) {
          throw new Error('File too small to be a valid PDF. Please check the file and try again.');
        }
        
        // Search for PDF signature in larger portion
        let pdfFound = false;
        for (let i = 0; i < Math.min(buffer.length, 4096); i += 512) {
          const chunk = buffer.subarray(i, i + 512).toString('binary');
          if (chunk.includes('%PDF-')) {
            log(`PDF signature found at offset ${i} for ${filename}`, 'pdf-processor');
            pdfFound = true;
            break;
          }
        }
        
        if (!pdfFound) {
          log(`No PDF signature found for ${filename}`, 'pdf-processor');
          throw new Error('Unable to detect PDF format. Please ensure you are uploading a valid, unprotected PDF file. You can try the test PDF provided in the interface to verify the system is working correctly.');
        }
      } else {
        log(`Valid PDF header detected for ${filename}`, 'pdf-processor');
      }
      
      // Check for encryption markers early
      const fullBufferString = buffer.toString('binary');
      const hasEncryptionMarkers = fullBufferString.includes('U2FsdGVkX1') || 
                                  fullBufferString.includes('/Encrypt') ||
                                  fullBufferString.includes('encrypted');
      
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
        
        // If normalization failed and we detected encryption markers, fail early
        if (hasEncryptionMarkers) {
          log(`Preprocessing failed on encrypted PDF: ${filename}`, 'pdf-processor');
          throw new Error('This PDF contains encrypted or protected content that cannot be processed. Please save it as an unprotected PDF and try again.');
        }
      }
      
      // Step 2: Try text extraction on preprocessed PDF
      try {
        const textResult = await this.extractTextFromPDF(processingBuffer);
        const extractedText = textResult.text.trim();
        
        // Check for encryption markers in extracted text
        if (extractedText.includes('U2FsdGVkX1') || extractedText.includes('encrypted')) {
          log(`Extracted text contains encryption markers for ${filename}`, 'pdf-processor');
          throw new Error('This PDF contains encrypted content. Please save it as an unprotected PDF using your PDF viewer\'s "Print to PDF" option and try again.');
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
        
        // Check for specific error types and provide helpful messages
        const errorMessage = textError.message.toLowerCase();
        if (errorMessage.includes('invalid pdf structure')) {
          throw new Error('This PDF has structural issues that prevent processing. Try using "Print to PDF" from your PDF viewer to create a clean version.');
        }
        if (errorMessage.includes('encrypted') || errorMessage.includes('password') || errorMessage.includes('protected')) {
          throw new Error('This PDF is password-protected. Please remove the password or use "Print to PDF" to create an unprotected version.');
        }
      }

      // Step 3: Only try OCR if we don't have encryption markers (OCR will fail on encrypted content)
      if (hasEncryptionMarkers) {
        log(`Skipping OCR due to encryption markers for ${filename}`, 'pdf-processor');
        throw new Error('This PDF contains encrypted content that cannot be processed. Please save it as an unprotected PDF using "Print to PDF" and try again.');
      }

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
      if (errorMessage.includes('u2fsdgvkx1') || errorMessage.includes('salted') || errorMessage.includes('encrypted during upload')) {
        log(`PDF contains encrypted content: ${filename}`, 'pdf-processor');
        // Re-throw the original specific error message instead of generic one
        throw error;
      } else if (errorMessage.includes('encrypted')) {
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
    // Use Ghostscript-based text extraction since pdftotext isn't available
    const execAsync = promisify(exec);
    
    try {
      const tempPdfPath = `/tmp/extract_${Date.now()}.pdf`;
      const tempTextPath = `/tmp/extract_${Date.now()}.txt`;
      
      fs.writeFileSync(tempPdfPath, buffer);
      
      // Extract text using Ghostscript
      await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=txtwrite -sOutputFile="${tempTextPath}" "${tempPdfPath}" 2>/dev/null`);
      
      if (fs.existsSync(tempTextPath)) {
        const extractedText = fs.readFileSync(tempTextPath, 'utf8');
        
        // Get page count using Ghostscript
        let pageCount = 1;
        try {
          const pageCountResult = await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -dNODISPLAY -c "(\`${tempPdfPath}\`) (r) file runpdfbegin pdfpagecount = quit"`);
          const count = parseInt(pageCountResult.stdout.trim(), 10);
          if (!isNaN(count) && count > 0) {
            pageCount = count;
          }
        } catch (countError) {
          // Fallback: estimate from file size
          const stats = fs.statSync(tempPdfPath);
          pageCount = Math.max(1, Math.floor(stats.size / 50000)); // Rough estimate
        }
        
        // Cleanup
        if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
        if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);
        
        if (extractedText.trim().length < 10) {
          throw new Error('Text extraction yielded minimal content');
        }
        
        return {
          text: extractedText,
          totalPages: pageCount
        };
      } else {
        throw new Error('Text extraction failed - no output file generated');
      }
    } catch (error: any) {
      throw new Error(`PDF text extraction failed: ${error.message}`);
    }
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
        const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -dNOOUTERSAVE \\
          -sDEVICE=pdfwrite \\
          -dCompatibilityLevel=1.7 \\
          -dPDFSETTINGS=/default \\
          -dEmbedAllFonts=true \\
          -dSubsetFonts=true \\
          -dOptimize=true \\
          -dUseCIEColor=true \\
          -dDetectDuplicateImages=true \\
          -dCompressFonts=true \\
          -dNOTRANSPARENCY \\
          -sOutputFile="${tempOutputPath}" \\
          "${tempInputPath}" 2>/dev/null`;
        
        await execAsync(gsCommand);
        
        if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
          // Second pass: Further cleanup and optimization
          const cleanCommand = `gs -dNOPAUSE -dBATCH -dSAFER \\
            -sDEVICE=pdfwrite \\
            -dCompatibilityLevel=1.4 \\
            -dPDFSETTINGS=/ebook \\
            -dDetectDuplicateImages=true \\
            -dCompressFonts=true \\
            -dNOTRANSPARENCY \\
            -sOutputFile="${tempCleanPath}" \\
            "${tempOutputPath}" 2>/dev/null`;
          
          await execAsync(cleanCommand);
          
          if (fs.existsSync(tempCleanPath) && fs.statSync(tempCleanPath).size > 0) {
            const normalizedBuffer = fs.readFileSync(tempCleanPath);
            this.cleanupFiles([tempInputPath, tempOutputPath, tempCleanPath]);
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
          this.cleanupFiles([tempInputPath, tempOutputPath, tempCleanPath]);
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
          this.cleanupFiles([tempInputPath, tempOutputPath, tempCleanPath]);
          log(`qpdf decrypt and repair successful for ${filename}`, 'pdf-processor');
          return normalizedBuffer;
        }
      } catch (qpdfError: any) {
        log(`qpdf decrypt and repair failed: ${qpdfError.message}`, 'pdf-processor');
      }
      
      // Final cleanup
      this.cleanupFiles([tempInputPath, tempOutputPath, tempCleanPath]);
      log(`All PDF normalization methods failed for ${filename}`, 'pdf-processor');
      return null;
      
    } catch (error: any) {
      log(`PDF normalization completely failed: ${error.message}`, 'pdf-processor');
      return null;
    }
  }

  private cleanupFiles(filePaths: string[]): void {
    filePaths.forEach(path => {
      try {
        if (fs.existsSync(path)) {
          fs.unlinkSync(path);
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    });
  }

  async cleanup() {
    await this.terminateOCR();
  }
}

export const pdfProcessor = new PDFProcessor();

// Cleanup on process exit
process.on('exit', () => {
  pdfProcessor.cleanup();
});

process.on('SIGINT', () => {
  pdfProcessor.cleanup();
  process.exit();
});

process.on('SIGTERM', () => {
  pdfProcessor.cleanup();
  process.exit();
});