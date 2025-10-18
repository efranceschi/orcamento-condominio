# Use the official Nginx image as base
FROM nginx:alpine

# Set maintainer label
LABEL maintainer="Wise Informática <contato@wiseinformatica.com>"
LABEL description="Wise Informática - Website corporativo"

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy website files to nginx html directory
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY images/ /usr/share/nginx/html/images/

# Copy nginx configuration files
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Create directory for nginx logs (if not exists)
RUN mkdir -p /var/log/nginx

# Set correct permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Expose port 80
EXPOSE 80

# Use the default nginx CMD
CMD ["nginx", "-g", "daemon off;"]
