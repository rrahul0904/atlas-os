CREATE TABLE IF NOT EXISTS atlas_secret_values (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  algorithm text NOT NULL DEFAULT 'aes-256-gcm',
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_secret_values_scope_idx
  ON atlas_secret_values(tenant_id,workspace_id,updated_at DESC);
