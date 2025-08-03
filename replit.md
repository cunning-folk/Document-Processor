# The Field Processor

## Overview

The Field Processor is a web application that processes documents (PDF, TXT, Markdown) using OpenAI's Assistant API to convert them into clean, formatted markdown. The system features client-side encryption for privacy, background processing with chunked document handling, and automatic cleanup after 24 hours. Built as a full-stack TypeScript application with React frontend and Express backend.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for the UI layer
- **Vite** as the build tool and development server
- **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query** for server state management and API caching
- **Tailwind CSS** with shadcn/ui components for styling
- **Custom font integration** using GT-Alpina (display) and GT-America (body/sans)

### Backend Architecture
- **Express.js** server with TypeScript
- **Drizzle ORM** with PostgreSQL for database operations
- **Background processing system** for handling document chunks asynchronously
- **Health monitoring system** for tracking processing status and cleanup
- **Session-based authentication** using OpenID Connect with Replit
- **Multer** for handling file uploads up to 50MB

### Data Storage Solutions
- **Neon PostgreSQL** database with connection pooling
- **Three main tables**: users, documents, and documentChunks
- **Automatic data expiration** - documents auto-delete after 24 hours for privacy
- **Session storage** using connect-pg-simple for user sessions

### Authentication and Authorization
- **Replit OpenID Connect** integration using passport.js
- **Session-based auth** with PostgreSQL session store
- **User-scoped document access** - users can only see their own documents
- **Automatic user creation** on first login

### Document Processing Pipeline
- **Multi-format support**: PDF, TXT, and Markdown files
- **PDF processing** with text extraction, normalization, and OCR fallback using PyPDF2
- **Document chunking** for large files to handle OpenAI API limits
- **Background processing** with status tracking and progress updates
- **Client-side encryption** using CryptoJS before upload for privacy
- **Retry mechanism** for failed processing attempts

### Privacy and Security Features
- **Client-side encryption** of document content before server upload
- **Filename hashing** to protect user privacy
- **Session-based key storage** that clears on browser close
- **24-hour auto-deletion** of all document data
- **Server admin cannot read** encrypted document content

### Error Handling and Resilience
- **Comprehensive PDF validation** before processing
- **Stuck chunk recovery** system in background processor
- **Health monitoring** with automatic failure detection
- **Graceful degradation** when PDF processing fails
- **User-friendly error messages** with retry options

## External Dependencies

### Third-party Services
- **OpenAI Assistant API** - Document processing and markdown formatting
- **Neon Database** - Managed PostgreSQL hosting
- **Replit Authentication** - OAuth provider for user authentication

### Key Libraries and Tools
- **Database**: Drizzle ORM, @neondatabase/serverless, drizzle-kit
- **Authentication**: passport.js, openid-client, connect-pg-simple
- **File Processing**: multer, PyPDF2 (Python script), pdf2pic, tesseract.js
- **Frontend UI**: @radix-ui components, class-variance-authority, clsx
- **Encryption**: crypto-js for client-side content encryption
- **Utilities**: date-fns, nanoid, memoizee, react-markdown

### Development Tools
- **Build**: Vite, esbuild, TypeScript
- **Styling**: Tailwind CSS, PostCSS, Autoprefixer
- **Code Quality**: ESLint, Prettier (implied by clean code structure)
- **Deployment**: Configured for Replit hosting environment