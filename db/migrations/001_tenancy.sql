CREATE TABLE IF NOT EXISTS atlas_tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS atlas_workspaces (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  vertical_id text NOT NULL,
  plan_id text NOT NULL DEFAULT 'business',
  billing_status text NOT NULL DEFAULT 'trialing',
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE atlas_workspaces ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'trialing';
ALTER TABLE atlas_workspaces ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

CREATE TABLE IF NOT EXISTS atlas_memberships (
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','operator','member','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS atlas_memberships_user_idx ON atlas_memberships(user_id, status);
