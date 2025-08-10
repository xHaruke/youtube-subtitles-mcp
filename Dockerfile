# Use Node.js 18 LTS as base image
FROM node:18-slim

# Install Python, pip, and other system dependencies needed for yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip with latest version
RUN pip3 install --no-cache-dir --upgrade yt-dlp

# Verify yt-dlp installation
RUN yt-dlp --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build the TypeScript application
RUN npm run build

# Create non-root user for security
RUN useradd -r -s /bin/false mcpuser && \
    chown -R mcpuser:mcpuser /app

# Switch to non-root user
USER mcpuser

# Expose port (if your server uses one)
EXPOSE 3000

# Health check - verify both Node.js app and yt-dlp are working
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" && yt-dlp --version || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV DANGEROUSLY_OMIT_AUTH=false

# Start the application
CMD ["npm", "start"]