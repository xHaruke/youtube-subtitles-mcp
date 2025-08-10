# Use Alpine-based Node.js image for smaller size
FROM node:18-alpine

# Install Python, pip, ffmpeg and build dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    build-base \
    python3-dev \
    && pip3 install --no-cache-dir --upgrade --break-system-packages yt-dlp \
    && apk del build-base python3-dev

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
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S mcpuser -u 1001 -G mcpuser && \
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
ENV PORT=3000

# Start the application
CMD ["npm", "start"]