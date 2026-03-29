FROM node:20-slim

# Install Python and system dependencies for PDF processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ghostscript \
    graphicsmagick \
    imagemagick \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY pyproject.toml ./
RUN python3 -m pip install --break-system-packages pypdf2>=3.0.1

# Install Node dependencies (including devDependencies for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the app (Vite frontend + esbuild backend)
RUN npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

EXPOSE ${PORT:-3000}

CMD ["npm", "run", "start"]
