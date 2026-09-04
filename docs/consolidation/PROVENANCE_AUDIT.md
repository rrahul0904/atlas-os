# Provisional Provenance Audit

This is an initial code-migration gate, not a legal opinion.

Classification:

- **A** — owned clean-room/original implementation with clear repository provenance
- **B** — owned implementation using third-party dependencies; preserve dependency/license obligations
- **C** — permissively licensed upstream-derived code; preserve notices
- **D** — fork / upstream provenance uncertain; do not absorb into proprietary core without review
- **E** — empty / placeholder

## Initial canonical sources

| Repository | Provisional class | Notes |
|---|---|---|
| founderos-ai | B | Original clean-room framing in repo; has dependency surface and LICENSE file; verify notices during import |
| pulseatlas | B | Original portfolio implementation; dependency/license inventory still required |
| contractoros-ai | B | Clean-room product framing; generic domain logic is being adapted rather than copied wholesale |
| programas-ai | B | Deterministic domain logic; dependency/license inventory still required |
| agent-control-plane | B | Governed execution logic is strong candidate; dependency/license inventory still required |
| intent-revenue-os | B | Original clean-room framing; dependencies include Next/Drizzle/Postgres |
| tractionmesh | B | Original implementation framing; dependency/license inventory required before wholesale copy |
| social-growth-os | B | Original implementation framing; dependency/license inventory required |
| launchgrid | B | Original implementation framing; dependency/license inventory required |
| outbound-infrastructure-os | B | Original implementation framing; dependency/license inventory required |
| sessiongrid | C/B review | README declares MIT; verify exact LICENSE content and imported dependencies before proprietary redistribution |
| vibe-saas-foundry | B | Original clean-room framing; dependency/license inventory required |

No source repository is deleted, archived, or commercially relicensed during this phase.
