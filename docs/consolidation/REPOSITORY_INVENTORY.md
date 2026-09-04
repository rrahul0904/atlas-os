# AtlasOS Repository Inventory — 2026-09-04

This inventory captures the authoritative `main` snapshots observed before AtlasOS consolidation begins. Original repositories remain untouched.

| Repository | Visibility | Main SHA | Main CI | Open PRs | Initial AtlasOS role |
|---|---|---|---|---|---|
| rrahul0904/founderos-ai | public | `88629f95b578378a404f2dd7bebf3396bb42de0e` | failing | none | Founder lifecycle / product brain |
| rrahul0904/pulseatlas | private | `2c3f303809d70ecd0b68e8eddf0e5cb3ef3c4e4a` | passing | none | Portfolio observability / Live Earth |
| rrahul0904/contractoros-ai | private | `dfbc58414209d470eb59297678a8f954f27449ed` | failing | none | Generic small-business operations source |
| rrahul0904/programos-ai | private | `076345674fda9254eaa081e9083ab361b02e1bab` | failing | #1 Production Wave 2 | Executive/program intelligence |
| rrahul0904/agent-control-plane | private | `44e51e3da3d13482e902211d69cf6c1bc5ac3987` | failing | #2 durable tool quotas/admin | Agent governance / execution kernel |
| rrahul0904/intent-revenue-os | public | `5288f3ceba32ef9fd61bdaf842cefe76045277de` | passing | none | Revenue intent / opportunity scoring |
| rrahul0904/tractionmesh | private | `aac3fbbf0a085c2041c1a1ea716e799bec8ea4e1` | failing | none | Growth Brain / attribution |
| rrahul0904/social-growth-os | public | `c239ab2123c664ed871f6cc3505492ae342103c6` | passing | none | Social/content execution |
| rrahul0904/launchgrid | private | `d614f57f87b64c9435bb7e1346dce1afb2b9a32e` | failing | none | Launch / distribution |
| rrahul0904/outbound-infrastructure-os | public | `ea1c6fb0d3d22ef46448e8ae18506bae26356e26` | passing | none | Outbound infrastructure |
| rrahul0904/sessiongrid | public | `947a55ee2010e79c8e3a72bb98e91ecd6fa8d336` | passing | none | Authorized browser/session runtime |
| rrahul0904/vibe-saas-foundry | public | `e3cf0624ee6c36e6b847140812dddbafb2f3949b` | failing | none | SaaS/app-shell reference patterns |

## Migration policy

A source repository having a failing mainline CI does not block AtlasOS. It means AtlasOS must treat that source as a migration input, extract deterministic domain logic behind new AtlasOS tests, and not mark the module `native` until AtlasOS validation passes.

Open PRs are intentionally not treated as authoritative source state until independently reviewed/merged or explicitly selected during migration.
