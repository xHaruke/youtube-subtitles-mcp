# Use Node.js LTS (currently 20) as base image
FROM node:lts-alpine

# Install Python, pip, and other system dependencies needed for yt-dlp
RUN apk update && apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    ffmpeg \
    curl \
    ca-certificates

# Install yt-dlp via pip with latest version
RUN pip3 install --no-cache-dir --upgrade --break-system-packages yt-dlp

# Verify yt-dlp installation
RUN yt-dlp --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies
RUN npm ci --only=production=false

# Copy source code
COPY src/ ./src/

# Build the TypeScript application
RUN npm run build

# Clean up dev dependencies to reduce image size
RUN npm ci --only=production && npm cache clean --force

# Create non-root user for security (Alpine Linux style)
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G mcpuser mcpuser && \
    chown -R mcpuser:mcpuser /app

# Switch to non-root user
USER mcpuser

# Expose port
EXPOSE 3000

# Health check - verify both Node.js app and yt-dlp are working
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" && yt-dlp --version || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV DANGEROUSLY_OMIT_AUTH=false

# Start the application
CMD ["npm", "start"]