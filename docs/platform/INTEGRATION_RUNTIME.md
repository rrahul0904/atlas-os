# AtlasOS Integration Runtime

AtlasOS integrations are adapters on top of the certified durable execution spine. They are not allowed to bypass workflow state, Agent Governance, approvals, tenant/workspace scoping, or audit.

## Execution spine

```text
Workflow
  ↓
Durable Worker
  ↓
Agent Governance
  ↓
Approval when policy requires it
  ↓
IntegrationToolExecutor
  ↓
IntegrationAdapterRegistry
  ↓
Provider Adapter
  ↓
External System
```

The workflow runtime remains authoritative for retries, persisted step state, idempotency keys, dead-letter handling, and exactly-once replay protection.

## Integration architecture

```text
WorkflowRuntime
      |
      v
IntegrationToolExecutor
      |
      +-- tenant/workspace-scoped connection lookup
      |
      v
IntegrationAdapterRegistry
      |
      +-- WebhookIntegrationAdapter
      +-- GoogleWorkspaceAdapter       (next wave)
      +-- future providers
```

`IntegrationToolExecutor` converts an already-governed workflow tool call into an adapter invocation. It:

1. loads the connection inside the current tenant/workspace;
2. rejects missing, unconfigured, reauthentication-required, or non-retryably unhealthy connections;
3. resolves the canonical adapter;
4. validates adapter capability scopes against the governed tool;
5. forwards the durable workflow idempotency key;
6. stores safe health state;
7. records safe integration execution audit metadata;
8. strips credential-like provider fields before returning output to workflow state.

## Connection persistence

`atlas_integration_connections` stores:

- integration identity;
- external account or endpoint reference;
- safe configuration;
- a server-side secret reference;
- status;
- last health check;
- last success;
- last error and error timestamp;
- bounded health details.

Supported states:

```text
not_configured
connected
degraded
error
needs_reauthentication
```

Connected mode never substitutes demo or simulation health.

## Secrets boundary

```text
Atlas PostgreSQL
  stores secret_reference only

Secret provider
  stores credential value

Worker / server
  resolves credential server-side
  only at the point of provider execution
```

Plaintext API keys, bearer tokens, OAuth tokens, passwords, and client secrets must not enter:

- integration config JSON;
- workflow state;
- workflow output;
- audit metadata;
- logs;
- HTTP responses;
- health details.

The first implementation uses `env:NAME` secret references. A production secrets manager can implement the same resolver contract later without changing business modules.

## Generic Webhook / REST adapter

The first external adapter supports governed:

- POST;
- PUT;
- PATCH.

Connections must provide explicit:

- base URL;
- host allowlist;
- path allowlist;
- method allowlist;
- optional health path;
- optional server-side secret reference;
- timeout and payload bounds.

Production requires HTTPS.

The adapter rejects credentials embedded in URLs, path traversal, origin changes, redirects, private/loopback/link-local/reserved destinations, and DNS results that resolve to forbidden network ranges.

Request and response bodies are bounded. Durable workflow idempotency is propagated through the `Idempotency-Key` header.

## Failure behavior

### Non-retryable

Examples:

- integration not configured;
- adapter not registered;
- unsupported action;
- invalid configuration;
- forbidden/private destination;
- disallowed path or method;
- permanent provider 4xx;
- reauthentication required.

### Retryable

Examples:

- timeout or aborted request;
- connection reset;
- temporary DNS failure;
- provider 429;
- provider 502/503/504.

Retryable integration failures store `health_details.category = retryable`, allowing the durable worker to attempt recovery according to the workflow retry policy.

Non-retryable unhealthy connections are blocked until configuration or credentials are corrected.

## Operations UI

`/app/integrations` displays only persisted connected-workspace state.

Read access:

- owner;
- admin;
- operator.

Mutation access:

- owner;
- admin.

Webhook configuration persists only endpoint policy plus a secret reference. Google Workspace remains explicitly `Not configured` until the Google OAuth wave is certified.

## Certification contract

PR #6 must prove:

```text
persisted workflow
→ durable worker
→ governed external write
→ persisted approval
→ authorized approval
→ exact-step resume
→ IntegrationToolExecutor
→ tenant-scoped connection
→ WebhookIntegrationAdapter
→ deterministic external effect
→ safe response
→ connected health
→ safe audit
→ workflow completed
```

The same external effect must not execute twice when a completed workflow is replayed.
