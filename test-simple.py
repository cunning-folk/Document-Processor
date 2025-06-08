#!/usr/bin/env python3
"""Create a simple, unencrypted test PDF"""

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import sys

def create_simple_pdf():
    filename = "test-simple.pdf"
    
    # Create a simple PDF
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    
    # Add some text
    c.setFont("Helvetica", 16)
    c.drawString(100, height - 100, "Test Document")
    c.setFont("Helvetica", 12)
    c.drawString(100, height - 130, "This is a simple test PDF for processing.")
    c.drawString(100, height - 150, "It contains basic text content that should be")
    c.drawString(100, height - 170, "easily extractable by the PDF processor.")
    
    # Add more content on multiple lines
    content = [
        "Line 1: This is test content for PDF processing.",
        "Line 2: The PDF processor should extract this text.",
        "Line 3: This helps verify the system is working correctly.",
        "Line 4: No encryption or special formatting here.",
        "Line 5: Just plain text for testing purposes."
    ]
    
    y_position = height - 220
    for line in content:
        c.drawString(100, y_position, line)
        y_position -= 20
    
    c.save()
    print(f"Created simple test PDF: {filename}")
    
    # Verify it's a valid PDF
    with open(filename, 'rb') as f:
        header = f.read(10)
        print(f"PDF header: {header}")
        print(f"Header as string: {header.decode('ascii', errors='ignore')}")

if __name__ == "__main__":
    create_simple_pdf()