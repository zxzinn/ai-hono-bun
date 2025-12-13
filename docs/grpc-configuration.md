# gRPC Configuration for Phoenix Tracing

## Problem Statement

Phoenix's gRPC endpoint (port 4317) runs in **plaintext (non-encrypted)** mode by default, but OpenTelemetry's gRPC exporter attempts **TLS/SSL** connections by default, causing the following error:

```
Error: 14 UNAVAILABLE: No connection established.
Last error: Error: SSL routines:ssl3_get_record:wrong version number
```

## Three Solutions

### ✅ Solution 1: Use Insecure Credentials (Recommended for Development)

**Pros**:
- Simplest approach
- No certificate management required
- Perfect for local development

**Cons**:
- Unencrypted, not suitable for production
- Requires explicit configuration

**Configuration Example**:

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import * as grpc from '@grpc/grpc-js'

const exporter = new OTLPTraceExporter({
  url: 'localhost:4317',
  credentials: grpc.credentials.createInsecure(),  // ⭐ Key configuration
})
```

Update `phoenix-tracing.ts`:

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import * as grpc from '@grpc/grpc-js'

export function initPhoenixTracingGrpc(projectName: string = 'ai-agent-playground') {
  const exporter = new OTLPTraceExporter({
    url: `localhost:${process.env.PHOENIX_GRPC_PORT || 4317}`,
    credentials: grpc.credentials.createInsecure(),
  })

  const spanProcessor = new SimpleSpanProcessor(exporter as any)
  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  })

  tracerProvider.register()
  console.log(`[Phoenix] gRPC tracing initialized (insecure)`)
}
```

**Verification**:
- ✅ Bun: Tested and working
- ✅ Node.js: Tested and working
- ✅ Spans successfully written to database

---

### ✅ Solution 2: Use HTTP/Protobuf Exporter (Currently Used, Recommended)

**Pros**:
- No gRPC TLS configuration needed
- HTTP/1.1, easier to debug
- Firewall-friendly
- Fully supported by both Bun and Node.js

**Cons**:
- No bidirectional streaming (not needed for tracing anyway)

**Configuration Example** (already implemented):

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

const exporter = new OTLPTraceExporter({
  url: `http://localhost:${process.env.PHOENIX_UI_PORT || 6006}/v1/traces`,
})
```

**Verification**:
- ✅ Bun: Tested and working
- ✅ Node.js: Tested and working
- ✅ Spans successfully written to database

---

### 🔒 Solution 3: Configure TLS/SSL (Recommended for Production)

**Pros**:
- Encrypted transmission
- Production-ready
- Follows security best practices

**Cons**:
- Complex configuration
- Certificate management required
- Cumbersome for local development

#### Step 1: Generate Self-Signed Certificates

```bash
# Run certificate generation script
./scripts/generate-certs.sh

# Or manually generate
mkdir -p certs
openssl req -x509 \
  -newkey rsa:4096 \
  -keyout certs/server-key.pem \
  -out certs/server-cert.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

#### Step 2: Update docker-compose.yml

```yaml
services:
  phoenix:
    image: arizephoenix/phoenix:latest
    volumes:
      - ./certs:/certs:ro  # Mount certificates directory
    environment:
      - PHOENIX_SQL_DATABASE_URL=postgresql://postgres:postgres@db:5432/phoenix
      - PHOENIX_PORT=6006
      # gRPC TLS configuration (environment variables may vary by Phoenix version)
      - GRPC_DEFAULT_SSL_ROOTS_FILE_PATH=/certs/server-cert.pem
      - PHOENIX_GRPC_TLS_CERT_PATH=/certs/server-cert.pem
      - PHOENIX_GRPC_TLS_KEY_PATH=/certs/server-key.pem
```

#### Step 3: Configure Client

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import * as grpc from '@grpc/grpc-js'
import * as fs from 'fs'

const exporter = new OTLPTraceExporter({
  url: 'localhost:4317',
  credentials: grpc.credentials.createSsl(
    fs.readFileSync('./certs/server-cert.pem')  // CA certificate
  ),
})
```

#### Important Notes

**⚠️ Phoenix TLS Support Status**:
- Phoenix added TLS support in April 2025 (v8.29+)
- Environment variable names may vary by version
- Refer to: [Phoenix TLS Release Notes](https://arize.com/docs/phoenix/release-notes/04.2025/04.28.2025-tls-support-for-phoenix-server)

**Certificate Verification Issues**:
- Self-signed certificates will have hostname verification issues
- Production should use CA-signed certificates
- Or set `checkServerIdentity: () => undefined` on client (not recommended)

---

## Performance Comparison

| Exporter | Protocol | Encryption | Config Complexity | Performance | Use Case |
|----------|----------|------------|------------------|-------------|----------|
| gRPC (insecure) | gRPC over HTTP/2 | ❌ | Low | Fastest | Local dev |
| gRPC (TLS) | gRPC over HTTP/2 | ✅ | High | Fast | Production |
| HTTP/Protobuf | HTTP/1.1 + Protobuf | ❌ | Lowest | Medium | Dev/Test |
| HTTP/Protobuf + HTTPS | HTTPS + Protobuf | ✅ | Medium | Medium | Production (Simple) |

## Recommendations

### Current Project (Local Development)
✅ **Continue using HTTP/Protobuf** (`@opentelemetry/exporter-trace-otlp-proto`)
- Already configured and working
- Simple and reliable
- No additional setup needed

### Future Improvements (Optional)
If you need better performance or want to use gRPC:
1. Use gRPC + insecure credentials (development)
2. Or configure TLS (production)

### When Deploying to Cloud
🔒 **TLS is mandatory**:
- gRPC + TLS
- Or HTTPS + Protobuf
- Never use insecure connections in production

## Test Results Summary

| Runtime | gRPC (default) | gRPC (insecure) | HTTP/Protobuf | HTTP/JSON |
|---------|---------------|-----------------|---------------|-----------|
| Bun     | ❌ SSL error   | ✅ Working      | ✅ Working    | ❌ 415     |
| Node.js | ❌ SSL error   | ✅ Working      | ✅ Working    | ❌ 415     |

**Conclusion**: Both exporters work, choose based on your needs:
- Simplicity first → HTTP/Protobuf
- Performance first → gRPC (insecure locally, TLS in production)

## Root Cause Analysis

The original error **"h2 is not supported"** was misleading. The actual problem was:

1. ❌ **NOT** a Bun HTTP/2 compatibility issue (Bun 1.2+ fully supports HTTP/2)
2. ❌ **NOT** a `@grpc/grpc-js` incompatibility (works fine with proper config)
3. ✅ **YES** a TLS/SSL configuration mismatch:
   - Client defaulting to secure (TLS) connection
   - Server running in plaintext (non-TLS) mode
   - SSL handshake fails with "wrong version number"
   - Secondary error message "h2 is not supported" is misleading

## References

- [Phoenix TLS Support Release Notes](https://arize.com/docs/phoenix/release-notes/04.2025/04.28.2025-tls-support-for-phoenix-server)
- [Phoenix Configuration Docs](https://arize.com/docs/phoenix/self-hosting/configuration)
- [Phoenix Docker Deployment](https://arize.com/docs/phoenix/self-hosting/deployment-options/docker)
