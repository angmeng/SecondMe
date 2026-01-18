# FalkorDB Parameter Syntax

## Problem
When using ioredis to call FalkorDB, passing parameters with `--params` flag causes:
`ReplyError: Missing parameters`

## Root Cause
The `--params` flag syntax doesn't work when calling FalkorDB via ioredis `client.call()`.

## Correct Syntax
Use CYPHER prefix to inject parameters directly into the query string:

```typescript
const cypherPrefix = Object.entries(params)
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  .join(' ');

const fullQuery = cypherPrefix ? `CYPHER ${cypherPrefix} ${query}` : query;
const result = await client.call('GRAPH.QUERY', GRAPH_NAME, fullQuery);
```

This produces: `CYPHER personaId="test-1" MATCH (p:Persona {id: $personaId}) ...`

## Reference Files
- Working example: `frontend/src/app/api/persona/route.ts`
- Fixed file: `frontend/src/app/api/persona/[id]/route.ts`
