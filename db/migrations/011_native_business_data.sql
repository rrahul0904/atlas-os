CREATE TABLE IF NOT EXISTS atlas_contacts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'contact' CHECK (relationship IN ('contact','prospect','customer','patient_reference','vendor','other')),
  display_name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(workspace_id,source,source_integration_id,external_id)
);
CREATE INDEX IF NOT EXISTS atlas_contacts_scope_idx ON atlas_contacts(tenant_id,workspace_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS atlas_contacts_email_idx ON atlas_contacts(tenant_id,workspace_id,email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_leads (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  contact_id text REFERENCES atlas_contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','qualified','working','converted','lost','archived')),
  score numeric(8,3),
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id) REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id)
);
CREATE INDEX IF NOT EXISTS atlas_leads_scope_idx ON atlas_leads(tenant_id,workspace_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS atlas_opportunities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  contact_id text REFERENCES atlas_contacts(id) ON DELETE SET NULL,
  lead_id text REFERENCES atlas_leads(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','archived')),
  stage text NOT NULL DEFAULT 'discovery',
  amount numeric(20,2),
  currency text NOT NULL DEFAULT 'USD',
  expected_close_at timestamptz,
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id) REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (tenant_id,workspace_id,lead_id) REFERENCES atlas_leads(tenant_id,workspace_id,id) ON DELETE SET NULL (lead_id)
);
CREATE INDEX IF NOT EXISTS atlas_opportunities_scope_idx ON atlas_opportunities(tenant_id,workspace_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS atlas_appointments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  contact_id text REFERENCES atlas_contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','canceled','no_show')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  service_category text,
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id) REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id)
);
CREATE INDEX IF NOT EXISTS atlas_appointments_scope_idx ON atlas_appointments(tenant_id,workspace_id,status,starts_at);

CREATE TABLE IF NOT EXISTS atlas_communications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  contact_id text REFERENCES atlas_contacts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','phone','chat','other')),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  status text NOT NULL DEFAULT 'recorded',
  subject text,
  body_preview text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id) REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id)
);
CREATE INDEX IF NOT EXISTS atlas_communications_scope_idx ON atlas_communications(tenant_id,workspace_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS atlas_invoices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  contact_id text REFERENCES atlas_contacts(id) ON DELETE SET NULL,
  invoice_number text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','paid','past_due','void','uncollectible')),
  currency text NOT NULL DEFAULT 'USD',
  total_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  due_at timestamptz,
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id) REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id)
);
CREATE INDEX IF NOT EXISTS atlas_invoices_scope_idx ON atlas_invoices(tenant_id,workspace_id,status,due_at);

CREATE TABLE IF NOT EXISTS atlas_payments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  invoice_id text REFERENCES atlas_invoices(id) ON DELETE SET NULL,
  contact_id text REFERENCES atlas_contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded','void')),
  currency text NOT NULL DEFAULT 'USD',
  amount numeric(20,2) NOT NULL CHECK (amount >= 0),
  paid_at timestamptz,
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,invoice_id) REFERENCES atlas_invoices(tenant_id,workspace_id,id) ON DELETE SET NULL (invoice_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id) REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id)
);
CREATE INDEX IF NOT EXISTS atlas_payments_scope_idx ON atlas_payments(tenant_id,workspace_id,status,paid_at DESC);

CREATE TABLE IF NOT EXISTS atlas_inventory_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  quantity_on_hand numeric(20,4) NOT NULL DEFAULT 0,
  reorder_point numeric(20,4),
  unit_cost numeric(20,2),
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(workspace_id,source,source_integration_id,external_id)
);
CREATE INDEX IF NOT EXISTS atlas_inventory_items_scope_idx ON atlas_inventory_items(tenant_id,workspace_id,status,updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS atlas_inventory_items_sku_unique ON atlas_inventory_items(workspace_id,sku) WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_inventory_transactions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  inventory_item_id text NOT NULL REFERENCES atlas_inventory_items(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('receipt','usage','adjustment','return','reorder')),
  quantity numeric(20,4) NOT NULL,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,inventory_item_id) REFERENCES atlas_inventory_items(tenant_id,workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atlas_inventory_transactions_scope_idx ON atlas_inventory_transactions(tenant_id,workspace_id,inventory_item_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS atlas_campaigns (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','active','paused','completed','archived')),
  channel text,
  starts_at timestamptz,
  ends_at timestamptz,
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source,source_integration_id,external_id)
);
CREATE INDEX IF NOT EXISTS atlas_campaigns_scope_idx ON atlas_campaigns(tenant_id,workspace_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS atlas_projects (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','blocked','completed','archived')),
  description text,
  starts_at timestamptz,
  due_at timestamptz,
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source,source_integration_id,external_id)
);
CREATE INDEX IF NOT EXISTS atlas_projects_scope_idx ON atlas_projects(tenant_id,workspace_id,status,updated_at DESC);
