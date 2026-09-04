ALTER TABLE atlas_integration_connections
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS atlas_integrations_health_idx
  ON atlas_integration_connections(tenant_id,workspace_id,integration_id,status,last_health_at);
