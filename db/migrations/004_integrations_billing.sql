CREATE TABLE IF NOT EXISTS atlas_integration_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured',
  external_account_ref text,
  secret_reference text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_health_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, integration_id)
);

CREATE TABLE IF NOT EXISTS atlas_billing_accounts (
  workspace_id text PRIMARY KEY REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  customer_ref text,
  subscription_ref text,
  status text NOT NULL DEFAULT 'trialing',
  plan_id text NOT NULL DEFAULT 'business',
  current_period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_integrations_scope_idx ON atlas_integration_connections(tenant_id, workspace_id, status);
