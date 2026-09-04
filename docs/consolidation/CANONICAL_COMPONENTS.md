# Canonical Component Decisions

| AtlasOS capability | Canonical source | Initial state | Decision |
|---|---|---|---|
| Founder lifecycle | founderos-ai | adapted | Preserve lifecycle/readiness and evidence-first agent roles; remove standalone auth/runtime |
| Portfolio observability | pulseatlas | adapted | Preserve privacy-safe event semantics and Live Earth as optional module |
| Agent governance | agent-control-plane | adapted | Canonical policy/approval/delegation model; every external action must converge here |
| Business operations | contractoros-ai | adapted | Genericize customer/lead/quote/work/invoice/payment/resource/review/goal models |
| Executive intelligence | programas-ai | adapted | Preserve deterministic EVM/health/risk logic; feature-gate enterprise complexity |
| Revenue intelligence | intent-revenue-os | adapted | Preserve weighted intent scoring; converge approvals/workflows on Agent Governance |
| Growth | tractionmesh | legacy | Audit against Social/Launch/Revenue; create one common campaign/opportunity domain before migration |
| Social | social-growth-os | legacy | Reuse content approval/publishing/measurement after shared workflow contracts exist |
| Launch | launchgrid | legacy | Reuse distribution and launch planning after common growth entities exist |
| Outbound | outbound-infrastructure-os | legacy | Remain specialized delivery infrastructure behind Atlas integration contracts |
| Browser runtime | sessiongrid | legacy | Remain optional authorized execution runtime, never core dependency |
| SaaS foundation | vibe-saas-foundry | legacy | Mine auth/admin/app-shell patterns, but do not blindly make it canonical |

## Non-negotiable consolidation rules

- one identity/tenancy model
- one agent-governance layer
- one workflow contract
- one Atlas event envelope
- shared business entity vocabulary
- vertical modules compose instead of forking the platform
