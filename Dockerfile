# Multi-stage build for FastAPI application with Nginx
FROM python:3.13-slim as builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    gfortran \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

# Final stage
FROM python:3.13-slim

# Set maintainer label
LABEL maintainer="Eduardo Franceschi"
LABEL description="Sistema de Orçamento - FastAPI + Nginx"

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH=/root/.local/bin:$PATH

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    curl \
    libopenblas0 \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .

# Copy application files
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY main.py .

# Show copied files
RUN echo "Copied folders:"
RUN find /app -type d

RUN pip install --user --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p /var/log/supervisor /var/log/nginx /var/log/uvicorn /app/data

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/init-db.sh /usr/local/bin/init-db.sh

# Make scripts executable
RUN chmod +x /app/migrations/*.py

# Initialize database on first run
RUN /usr/local/bin/init-db.sh

# Set correct permissions
RUN chown -R www-data:www-data /app && \
    chown -R www-data:www-data /var/log/uvicorn

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Expose port
EXPOSE 80

# Start supervisor (will manage nginx and uvicorn)
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
