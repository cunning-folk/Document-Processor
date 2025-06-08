#!/usr/bin/env python3
"""Create a test PDF with proper structure for testing PDF processing"""

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import sys

def create_test_pdf():
    filename = "valid-test.pdf"
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    
    # Page 1
    c.drawString(100, height - 100, "Test Document - Page 1")
    c.drawString(100, height - 150, "This is a sample document with readable text.")
    c.drawString(100, height - 200, "The OpenAI Assistant should process this content")
    c.drawString(100, height - 250, "and format it as clean markdown output.")
    c.showPage()
    
    # Page 2
    c.drawString(100, height - 100, "Test Document - Page 2")
    c.drawString(100, height - 150, "Additional content for testing multi-page processing.")
    c.drawString(100, height - 200, "This content should be extracted and processed")
    c.drawString(100, height - 250, "through the document processing pipeline.")
    c.showPage()
    
    c.save()
    print(f"Created {filename}")

if __name__ == "__main__":
    create_test_pdf()