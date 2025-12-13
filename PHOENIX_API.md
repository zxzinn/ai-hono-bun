# Phoenix API Usage

## GraphQL Endpoint

```
http://localhost:6006/graphql
```

## Essential Queries

### Get all projects
```bash
curl -s http://localhost:6006/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ projects { edges { node { name traceCount recordCount } } } }"}' \
  | python3 -m json.tool
```

### Get recent spans (last 10)
```bash
curl -s http://localhost:6006/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ node(id: \"UHJvamVjdDox\") { ... on Project { spans(first: 10, sort: { col: startTime, dir: desc }) { edges { node { name spanKind startTime latencyMs statusCode context { spanId traceId } attributes } } } } } }"
  }' | python3 -m json.tool
```

### Explore GraphQL schema
```bash
curl -s http://localhost:6006/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { queryType { fields { name } } } }"}' \
  | python3 -m json.tool
```

## Key Data in Span Attributes

Each span's `attributes` field contains JSON with:

- `ai.model.id` - Model used (e.g., "gpt-4o")
- `ai.usage.{inputTokens,outputTokens,totalTokens}` - Token counts
- `ai.prompt.messages` - Full conversation history
- `ai.response.{text,finishReason}` - LLM response
- `ai.toolCall.{name,args,result}` - Tool execution details
- `telemetry.functionId` - Agent identifier
- `latencyMs` - Span execution time

## Common Use Cases

**Monitor token usage across agents:**
```bash
# Parse attributes JSON to extract token counts
curl -s http://localhost:6006/graphql -H "Content-Type: application/json" \
  -d '{"query": "{ node(id: \"UHJvamVjdDox\") { ... on Project { spans(first: 100) { edges { node { name attributes } } } } } }"}' \
  | python3 -c "import json, sys; data=json.load(sys.stdin); [print(f\"{s['node']['name']}: {json.loads(s['node']['attributes']).get('ai',{}).get('usage')}\") for s in data['data']['node']['spans']['edges'] if 'ai' in json.loads(s['node']['attributes'])]"
```

**Find slow operations:**
```bash
# Filter spans by latency > 1000ms
curl -s http://localhost:6006/graphql -H "Content-Type: application/json" \
  -d '{"query": "{ node(id: \"UHJvamVjdDox\") { ... on Project { spans(first: 50, sort: { col: startTime, dir: desc }) { edges { node { name latencyMs } } } } } }"}' \
  | python3 -c "import json, sys; [print(f\"{s['node']['name']}: {s['node']['latencyMs']}ms\") for s in json.load(sys.stdin)['data']['node']['spans']['edges'] if s['node']['latencyMs'] > 1000]"
```

## Tips

- Default project ID is usually `UHJvamVjdDox` (base64 encoded "Project:1")
- Use GraphQL introspection to discover available fields
- Parse `attributes` JSON for detailed telemetry data
- Filter spans by `spanKind`, `latencyMs`, or custom attributes
