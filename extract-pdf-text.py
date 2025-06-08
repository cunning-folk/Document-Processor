#!/usr/bin/env python3
"""
PDF Text Extraction Tool
Extracts text from PDF files locally to bypass upload encryption issues.
"""

import sys
import os
try:
    import PyPDF2
except ImportError:
    print("PyPDF2 not found. Installing...")
    os.system("pip install PyPDF2")
    import PyPDF2

def extract_text_from_pdf(pdf_path):
    """Extract text from a PDF file."""
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text += page.extract_text() + "\n"
            
            return text.strip()
    
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return None

def main():
    if len(sys.argv) != 2:
        print("Usage: python extract-pdf-text.py <pdf_file>")
        print("Example: python extract-pdf-text.py document.pdf")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    if not os.path.exists(pdf_path):
        print(f"Error: File '{pdf_path}' not found.")
        sys.exit(1)
    
    if not pdf_path.lower().endswith('.pdf'):
        print("Error: File must be a PDF.")
        sys.exit(1)
    
    print(f"Extracting text from: {pdf_path}")
    text = extract_text_from_pdf(pdf_path)
    
    if text:
        # Save to text file
        output_path = pdf_path.replace('.pdf', '_extracted.txt')
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(text)
        
        print(f"Text extracted successfully!")
        print(f"Output saved to: {output_path}")
        print(f"Extracted {len(text)} characters")
        
        # Show first 200 characters as preview
        print("\nPreview:")
        print("-" * 50)
        print(text[:200] + "..." if len(text) > 200 else text)
        print("-" * 50)
        
    else:
        print("Failed to extract text from PDF.")
        sys.exit(1)

if __name__ == "__main__":
    main()