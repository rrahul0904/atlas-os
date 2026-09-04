CREATE TABLE IF NOT EXISTS atlas_evidence (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('metric','event','integration','document','entity','agent_result','task','approval')),
  source_id text NOT NULL,
  claim text NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_action_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  source_module text NOT NULL,
  entity_type text,
  entity_id text,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  business_impact text NOT NULL,
  evidence_ids text[] NOT NULL DEFAULT '{}',
  recommended_action text NOT NULL,
  risk text NOT NULL,
  approval_policy text NOT NULL CHECK (approval_policy IN ('auto','approval_required','human')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_approval','completed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_evidence_scope_time_idx ON atlas_evidence(tenant_id, workspace_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS atlas_action_scope_status_idx ON atlas_action_items(tenant_id, workspace_id, status, severity);
