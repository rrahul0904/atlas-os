CREATE UNIQUE INDEX IF NOT EXISTS atlas_appointments_scope_unique
  ON atlas_appointments(tenant_id,workspace_id,id);

CREATE TABLE IF NOT EXISTS atlas_locations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  timezone text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
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
CREATE INDEX IF NOT EXISTS atlas_locations_scope_idx
  ON atlas_locations(tenant_id,workspace_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS atlas_resources (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  location_id text,
  name text NOT NULL,
  resource_type text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance','archived')),
  capacity numeric(20,4) NOT NULL DEFAULT 1 CHECK (capacity > 0),
  unit text NOT NULL DEFAULT 'unit',
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,location_id)
    REFERENCES atlas_locations(tenant_id,workspace_id,id) ON DELETE SET NULL (location_id)
);
CREATE INDEX IF NOT EXISTS atlas_resources_scope_idx
  ON atlas_resources(tenant_id,workspace_id,location_id,status,resource_type);

CREATE TABLE IF NOT EXISTS atlas_catalog_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('product','service','package')),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  sku text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  price_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
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
CREATE UNIQUE INDEX IF NOT EXISTS atlas_catalog_items_sku_unique
  ON atlas_catalog_items(workspace_id,sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_catalog_items_scope_idx
  ON atlas_catalog_items(tenant_id,workspace_id,status,kind,updated_at DESC);

CREATE TABLE IF NOT EXISTS atlas_bookings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  location_id text,
  contact_id text,
  catalog_item_id text,
  legacy_appointment_id text,
  title text NOT NULL,
  booking_type text NOT NULL DEFAULT 'booking',
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('tentative','scheduled','confirmed','completed','canceled','no_show')),
  confirmation_state text NOT NULL DEFAULT 'pending'
    CHECK (confirmation_state IN ('pending','confirmed','not_required')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  demand_quantity numeric(20,4) NOT NULL DEFAULT 1 CHECK (demand_quantity > 0),
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(tenant_id,workspace_id,legacy_appointment_id),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,location_id)
    REFERENCES atlas_locations(tenant_id,workspace_id,id) ON DELETE SET NULL (location_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id)
    REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (tenant_id,workspace_id,catalog_item_id)
    REFERENCES atlas_catalog_items(tenant_id,workspace_id,id) ON DELETE SET NULL (catalog_item_id),
  FOREIGN KEY (tenant_id,workspace_id,legacy_appointment_id)
    REFERENCES atlas_appointments(tenant_id,workspace_id,id) ON DELETE SET NULL (legacy_appointment_id)
);
CREATE INDEX IF NOT EXISTS atlas_bookings_scope_idx
  ON atlas_bookings(tenant_id,workspace_id,status,starts_at);
CREATE INDEX IF NOT EXISTS atlas_bookings_location_idx
  ON atlas_bookings(tenant_id,workspace_id,location_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS atlas_booking_resources (
  booking_id text NOT NULL,
  resource_id text NOT NULL,
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  quantity numeric(20,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id,resource_id),
  FOREIGN KEY (tenant_id,workspace_id,booking_id)
    REFERENCES atlas_bookings(tenant_id,workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,workspace_id,resource_id)
    REFERENCES atlas_resources(tenant_id,workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atlas_booking_resources_capacity_idx
  ON atlas_booking_resources(tenant_id,workspace_id,resource_id,booking_id);

CREATE TABLE IF NOT EXISTS atlas_orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES atlas_tenants(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
  contact_id text,
  location_id text,
  booking_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','confirmed','completed','canceled')),
  fulfillment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending','preparing','ready','fulfilled','canceled','failed')),
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(20,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total numeric(20,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  last_synced_at timestamptz,
  sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,contact_id)
    REFERENCES atlas_contacts(tenant_id,workspace_id,id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (tenant_id,workspace_id,location_id)
    REFERENCES atlas_locations(tenant_id,workspace_id,id) ON DELETE SET NULL (location_id),
  FOREIGN KEY (tenant_id,workspace_id,booking_id)
    REFERENCES atlas_bookings(tenant_id,workspace_id,id) ON DELETE SET NULL (booking_id)
);
CREATE INDEX IF NOT EXISTS atlas_orders_scope_idx
  ON atlas_orders(tenant_id,workspace_id,status,fulfillment_status,created_at DESC);

CREATE TABLE IF NOT EXISTS atlas_order_lines (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  order_id text NOT NULL,
  catalog_item_id text,
  description_snapshot text NOT NULL,
  quantity numeric(20,4) NOT NULL CHECK (quantity > 0),
  unit_amount numeric(20,2) NOT NULL CHECK (unit_amount >= 0),
  total_amount numeric(20,2) NOT NULL CHECK (total_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  FOREIGN KEY (tenant_id,workspace_id,order_id)
    REFERENCES atlas_orders(tenant_id,workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,workspace_id,catalog_item_id)
    REFERENCES atlas_catalog_items(tenant_id,workspace_id,id) ON DELETE SET NULL (catalog_item_id)
);
CREATE INDEX IF NOT EXISTS atlas_order_lines_scope_idx
  ON atlas_order_lines(tenant_id,workspace_id,order_id);

CREATE TABLE IF NOT EXISTS atlas_fulfillments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  order_id text NOT NULL,
  fulfillment_type text NOT NULL DEFAULT 'service',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','preparing','ready','fulfilled','canceled','failed')),
  due_at timestamptz,
  completed_at timestamptz,
  source text NOT NULL DEFAULT 'native',
  source_integration_id text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workspace_id,id),
  UNIQUE(workspace_id,source,source_integration_id,external_id),
  FOREIGN KEY (tenant_id,workspace_id,order_id)
    REFERENCES atlas_orders(tenant_id,workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atlas_fulfillments_scope_idx
  ON atlas_fulfillments(tenant_id,workspace_id,status,due_at);

CREATE TABLE IF NOT EXISTS atlas_catalog_inventory_links (
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  catalog_item_id text NOT NULL,
  inventory_item_id text NOT NULL,
  quantity_per_unit numeric(20,4) NOT NULL DEFAULT 1 CHECK (quantity_per_unit > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_item_id,inventory_item_id),
  FOREIGN KEY (tenant_id,workspace_id,catalog_item_id)
    REFERENCES atlas_catalog_items(tenant_id,workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,workspace_id,inventory_item_id)
    REFERENCES atlas_inventory_items(tenant_id,workspace_id,id) ON DELETE CASCADE
);

INSERT INTO atlas_bookings(
  id,tenant_id,workspace_id,contact_id,legacy_appointment_id,title,booking_type,status,
  confirmation_state,starts_at,ends_at,timezone,demand_quantity,source,source_integration_id,
  external_id,last_synced_at,sync_version,created_at,updated_at
)
SELECT
  a.id,a.tenant_id,a.workspace_id,a.contact_id,a.id,a.title,'appointment',a.status,
  CASE WHEN a.status='confirmed' THEN 'confirmed' ELSE 'pending' END,
  a.starts_at,a.ends_at,a.timezone,1,a.source,a.source_integration_id,a.external_id,
  a.last_synced_at,a.sync_version,a.created_at,a.updated_at
FROM atlas_appointments a
ON CONFLICT (id) DO NOTHING;
