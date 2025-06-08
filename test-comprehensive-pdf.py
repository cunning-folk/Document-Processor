#!/usr/bin/env python3
"""Create a comprehensive test PDF to demonstrate all processing capabilities"""

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    
    def create_comprehensive_pdf():
        filename = "comprehensive-test.pdf"
        doc = SimpleDocTemplate(filename, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # Title
        story.append(Paragraph("Comprehensive PDF Processing Test", styles['Title']))
        story.append(Spacer(1, 12))
        
        # Introduction
        story.append(Paragraph("Introduction", styles['Heading1']))
        story.append(Paragraph(
            "This document tests the multi-layer PDF processing system including "
            "text extraction, normalization, and OCR capabilities.", 
            styles['Normal']
        ))
        story.append(Spacer(1, 12))
        
        # Sample content
        story.append(Paragraph("Sample Content", styles['Heading1']))
        for i in range(5):
            story.append(Paragraph(
                f"This is paragraph {i+1} with substantial content that should be "
                f"properly extracted and processed by the OpenAI Assistant API. "
                f"The system should format this into clean markdown output.",
                styles['Normal']
            ))
            story.append(Spacer(1, 6))
        
        # Technical details
        story.append(Paragraph("Technical Processing Notes", styles['Heading1']))
        story.append(Paragraph(
            "The PDF processing system uses multiple methods: direct text extraction, "
            "PDF normalization via Ghostscript/qpdf/pdftk, and OCR with Tesseract. "
            "This ensures maximum compatibility with various PDF formats.",
            styles['Normal']
        ))
        
        doc.build(story)
        print(f"Created {filename}")
        
    if __name__ == "__main__":
        create_comprehensive_pdf()
        
except ImportError:
    print("ReportLab not available, creating simple text-based test document")
    
    # Create a simple text file instead
    with open("comprehensive-test.txt", "w") as f:
        f.write("""Comprehensive Document Processing Test

Introduction
This document tests the document processing system's ability to handle various content types and format them appropriately.

Sample Content
This is paragraph 1 with substantial content that should be properly extracted and processed by the OpenAI Assistant API. The system should format this into clean markdown output.

This is paragraph 2 demonstrating the system's capability to handle multiple paragraphs and maintain proper formatting throughout the processing pipeline.

This is paragraph 3 showing how the system processes longer blocks of text and ensures all content is captured and formatted correctly.

Technical Processing Notes
The document processing system supports multiple file formats including PDF, TXT, and MD files. It uses advanced text extraction and formatting capabilities to ensure clean, readable output.

Conclusion
This test document validates the comprehensive processing capabilities of the document formatting system.
""")
    print("Created comprehensive-test.txt")