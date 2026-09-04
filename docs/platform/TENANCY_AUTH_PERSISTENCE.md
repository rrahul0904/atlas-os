# AtlasOS tenancy, authentication and persistence contract

AtlasOS is converging on one workspace boundary shared by every migrated module.

## Identity hierarchy

`Tenant → Workspace → Membership → User`

Every business record carries both `tenant_id` and `workspace_id`. Server-side authorization validates both; UI visibility is not an authorization mechanism.

## Roles

`owner > admin > operator > member > viewer`

Vertical packs may present role presets, but they do not bypass this canonical hierarchy.

## Sessions

The core auth package implements a signed, expiring HMAC session envelope carrying tenant/workspace/role/scopes. A production identity provider can issue or hydrate the same principal contract later without forcing every business module to understand provider-specific auth.

## Plans and entitlements

Plan configuration gates module availability. Vertical defaults are intersected with plan entitlements rather than blindly enabled.

## Persistence

`db/postgres.sql` establishes the first shared control/business state tables for tenants, workspaces, memberships, modules, tasks, approvals, events and audit. High-volume observability remains a ClickHouse concern when PulseAtlas analytics is migrated natively.

This schema is a consolidation foundation, not yet a production migration of every legacy source table.
