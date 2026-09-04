# AtlasOS

AtlasOS is the consolidation platform for the existing business-operating-system portfolio.

**Product loop:** Observe → Understand → Decide → Act → Automate → Learn.

This repository is intentionally not twelve products copied into one folder. It defines one shared domain, one agent-governance layer, one module registry, one vertical-composition model, and migration adapters for the useful capabilities already present in the source repositories.

## Phase 0/1 implemented in this foundation

- canonical source/provenance inventory for the 12 initial product repositories
- source-branch import script that preserves each source repository as `source/*`
- universal AtlasOS domain/event contracts
- reusable module + vertical registry
- governed agent policy engine adapted from `agent-control-plane`
- Founder lifecycle/readiness adapted from `founderos-ai`
- generic small-business operations and deterministic health calculations adapted from `contractoros-ai`
- executive EVM and assessed-health logic adapted from `programos-ai`
- intent scoring adapted from `intent-revenue-os`
- privacy-safe observability event contracts adapted from `pulseatlas`
- deterministic Today/Action Center primitives
- Founder, CEO, Dental, Contractor, and Agency vertical definitions
- executable demo that proves modules compose through one AtlasOS core

## Verify

```bash
npm run verify
```

No external packages are required for the current domain foundation. Node.js 22 and TypeScript are sufficient.

## Source repositories

Original repositories are not deleted or archived during migration. See `docs/consolidation/REPOSITORY_INVENTORY.md` and `docs/consolidation/PROVENANCE_MANIFEST.json`.
