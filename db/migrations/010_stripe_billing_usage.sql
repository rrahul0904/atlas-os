ALTER TABLE atlas_billing_accounts
  ADD COLUMN IF NOT EXISTS price_ref text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_invoice_ref text,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_event_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS atlas_billing_customer_ref_unique
  ON atlas_billing_accounts(customer_ref) WHERE customer_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS atlas_billing_subscription_ref_unique
  ON atlas_billing_accounts(subscription_ref) WHERE subscription_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_billing_events (
  id text PRIMARY KEY,
  stripe_event_id text NOT NULL UNIQUE,
  tenant_id text REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  object_ref text,
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  provider_created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS atlas_billing_events_scope_idx
  ON atlas_billing_events(tenant_id,workspace_id,received_at DESC);

CREATE TABLE IF NOT EXISTS atlas_checkout_sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  requested_plan_id text NOT NULL CHECK (requested_plan_id IN ('solo','professional','business','platform')),
  stripe_session_ref text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','expired')),
  created_by text REFERENCES atlas_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS atlas_checkout_sessions_scope_idx
  ON atlas_checkout_sessions(tenant_id,workspace_id,created_at DESC);

CREATE TABLE IF NOT EXISTS atlas_usage_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  metric text NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity >= 0),
  module_id text,
  agent_id text,
  workflow_id text,
  provider text,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,metric,idempotency_key)
);

CREATE INDEX IF NOT EXISTS atlas_usage_events_scope_idx
  ON atlas_usage_events(tenant_id,workspace_id,metric,occurred_at DESC);
