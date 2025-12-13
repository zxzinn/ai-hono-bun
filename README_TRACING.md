# Phoenix Tracing Integration

This project uses [Arize Phoenix](https://arize.com/phoenix) for LLM observability and tracing with OpenTelemetry.

## Quick Start

### 1. Start Phoenix

```bash
docker compose up -d
```

Phoenix UI: http://localhost:6006

### 2. Run an Agent

```bash
bun src/agent-typed.ts "What's the weather in Tokyo?"
```

### 3. View Traces

Open http://localhost:6006/projects to see:
- LLM calls with prompts and responses
- Tool invocations and results
- Performance metrics and timing
- Token usage statistics

## Current Configuration

**Exporter**: HTTP/Protobuf (`@opentelemetry/exporter-trace-otlp-proto`)
**Endpoint**: `http://localhost:6006/v1/traces`
**Storage**: PostgreSQL (port 15432)

All agents automatically send traces to Phoenix on every run.

## Documentation

- **[PHOENIX_SETUP.md](./PHOENIX_SETUP.md)** - Phoenix installation and basic usage
- **[GRPC_CONFIGURATION.md](./GRPC_CONFIGURATION.md)** - gRPC vs HTTP/Protobuf exporters, TLS configuration
- **[TRACING_EXPORTER_ANALYSIS.md](./TRACING_EXPORTER_ANALYSIS.md)** - Detailed technical analysis and test results

## Files

- `src/lib/phoenix-tracing.ts` - Tracing initialization
- `docker-compose.yml` - Phoenix and PostgreSQL services
- `.env` - Port configuration

## Configuration

Edit `.env` to customize ports:

```bash
PHOENIX_UI_PORT=6006
PHOENIX_GRPC_PORT=4317
PHOENIX_DB_PORT=15432
```

## Troubleshooting

See [PHOENIX_SETUP.md](./PHOENIX_SETUP.md#troubleshooting) for common issues.

For gRPC configuration and TLS setup, see [GRPC_CONFIGURATION.md](./GRPC_CONFIGURATION.md).
