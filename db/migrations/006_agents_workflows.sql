ALTER TABLE atlas_workspaces ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'BALANCED' CHECK (approval_mode IN ('SAFE_AUTOPILOT','BALANCED','APPROVAL_FIRST','MANUAL'));

CREATE TABLE IF NOT EXISTS atlas_agents (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  module_id text NOT NULL,
  description text NOT NULL,
  tools text[] NOT NULL DEFAULT '{}',
  scopes text[] NOT NULL DEFAULT '{}',
  risk_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_budget_daily numeric(14,4) NOT NULL DEFAULT 0,
  model_preference text,
  memory_scope text NOT NULL DEFAULT 'workspace',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS atlas_workflow_definitions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_workflow_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  workflow_id text NOT NULL REFERENCES atlas_workflow_definitions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','running','waiting_approval','completed','failed','dead_letter')),
  current_step_index integer NOT NULL DEFAULT 0,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  initiated_by text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_workflow_step_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES atlas_workflow_runs(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','waiting','completed','failed')),
  attempt_count integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (run_id, step_id)
);

ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS workflow_run_id text REFERENCES atlas_workflow_runs(id) ON DELETE SET NULL;
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS workflow_step_id text;
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS business_reason text;
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS external_system text;
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS target text;
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS estimated_cost numeric(14,4);
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS requested_by text;
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS resolved_by text;
ALTER TABLE atlas_approvals ADD COLUMN IF NOT EXISTS resolution_note text;

CREATE INDEX IF NOT EXISTS atlas_agents_scope_idx ON atlas_agents(tenant_id,workspace_id,enabled);
CREATE INDEX IF NOT EXISTS atlas_workflows_scope_idx ON atlas_workflow_definitions(tenant_id,workspace_id,enabled);
CREATE INDEX IF NOT EXISTS atlas_runs_queue_idx ON atlas_workflow_runs(status,next_attempt_at,created_at);
CREATE INDEX IF NOT EXISTS atlas_runs_scope_idx ON atlas_workflow_runs(tenant_id,workspace_id,status);
CREATE INDEX IF NOT EXISTS atlas_steps_run_idx ON atlas_workflow_step_runs(run_id,status);
CREATE INDEX IF NOT EXISTS atlas_approval_workflow_idx ON atlas_approvals(workflow_run_id,workflow_step_id,status);
