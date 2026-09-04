CREATE TABLE IF NOT EXISTS atlas_approvals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  agent_id text,
  tool_id text NOT NULL,
  action text NOT NULL,
  risk text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS atlas_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  module text NOT NULL,
  type text NOT NULL,
  entity_type text,
  entity_id text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_audit_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  actor_id text,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_events_scope_time_idx ON atlas_events(tenant_id, workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS atlas_approvals_scope_status_idx ON atlas_approvals(tenant_id, workspace_id, status);
CREATE INDEX IF NOT EXISTS atlas_audit_scope_time_idx ON atlas_audit_events(tenant_id, workspace_id, occurred_at DESC);
