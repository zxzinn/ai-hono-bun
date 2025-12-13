#!/bin/bash

set -e

CERTS_DIR="./certs"
mkdir -p "$CERTS_DIR"

echo "Generating self-signed certificates for Phoenix gRPC..."

openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "$CERTS_DIR/server-key.pem" \
  -out "$CERTS_DIR/server-cert.pem" \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

echo "✓ Certificate generated: $CERTS_DIR/server-cert.pem"
echo "✓ Private key generated: $CERTS_DIR/server-key.pem"
echo ""
echo "Next steps:"
echo "1. Update docker-compose.yml to mount certificates"
echo "2. Set GRPC_DEFAULT_SSL_ROOTS_FILE_PATH environment variable"
echo "3. Restart Phoenix: docker compose restart phoenix"
