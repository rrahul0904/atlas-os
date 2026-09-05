CREATE TABLE IF NOT EXISTS atlas_oauth_transactions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  verifier_secret_reference text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_oauth_transactions_scope_idx
  ON atlas_oauth_transactions(tenant_id,workspace_id,user_id,provider,expires_at DESC);

CREATE TABLE IF NOT EXISTS atlas_integration_actions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  connection_id text NOT NULL REFERENCES atlas_integration_connections(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  action_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','completed','ambiguous','failed')),
  external_id text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(workspace_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS atlas_integration_actions_scope_idx
  ON atlas_integration_actions(tenant_id,workspace_id,integration_id,status,updated_at DESC);
