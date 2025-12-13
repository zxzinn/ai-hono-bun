# Phoenix Tracing Setup

This project uses [Arize Phoenix](https://arize.com/docs/phoenix) for LLM observability and tracing.

## Quick Start

### 1. Start Phoenix

```bash
docker compose up -d
```

This starts:
- **Phoenix UI**: http://localhost:6006
- **gRPC collector**: localhost:4317
- **PostgreSQL**: localhost:15432 (configurable in `.env`)

### 2. Check Status

```bash
docker compose ps
docker compose logs phoenix
```

### 3. Run Traced Agent

```bash
bun run src/agent-typed.ts "What's the weather in Tokyo?"
```

### 4. View Traces

Open http://localhost:6006 in your browser to see:
- Trace timeline
- LLM calls and responses
- Tool invocations
- Performance metrics

## Configuration

Edit `.env` to customize ports:

```bash
PHOENIX_UI_PORT=6006
PHOENIX_GRPC_PORT=4317
PHOENIX_METRICS_PORT=9090
PHOENIX_DB_PORT=15432
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:4317
```

## Usage in Your Code

Phoenix tracing is automatically enabled in `agent-typed.ts`:

```typescript
import { initPhoenixTracing } from './lib/phoenix-tracing'

initPhoenixTracing('your-project-name')
```

## Database Access

Direct PostgreSQL access (useful for custom queries):

```bash
psql -h localhost -p 15432 -U postgres -d phoenix
# Password: postgres
```

## Stopping Phoenix

```bash
docker compose down      # Stop but keep data
docker compose down -v   # Stop and remove data
```

## Troubleshooting

### Port conflicts

If ports are already in use, change them in `.env`:

```bash
PHOENIX_DB_PORT=25432  # Change from 15432
```

Then restart:

```bash
docker compose down
docker compose up -d
```

### No traces showing up

1. Check Phoenix is running: `docker compose ps`
2. Check logs: `docker compose logs phoenix`
3. Verify endpoint in your code matches `.env`
4. Make sure `initPhoenixTracing()` is called before agent usage
5. Ensure you're using `@opentelemetry/exporter-trace-otlp-proto` (not `-http` or `-grpc`)
6. Endpoint should be `http://localhost:6006/v1/traces` (UI port, not gRPC port 4317)

### Database connection issues

```bash
# Check database health
docker compose exec db pg_isready -U postgres

# View database logs
docker compose logs db
```
