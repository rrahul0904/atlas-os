# Canonical Component Decisions

| AtlasOS capability | Canonical source | Current AtlasOS state | Decision |
|---|---|---|---|
| Founder lifecycle | founderos-ai | adapted | Preserve lifecycle/readiness and evidence-first agent roles; remove standalone auth/runtime |
| Portfolio observability | pulseatlas | adapted | Preserve privacy-safe event semantics and Live Earth as optional module |
| Agent governance | agent-control-plane | adapted | Canonical policy/approval/delegation model; every external action must converge here |
| Business operations | contractoros-ai | adapted | Genericize customer/lead/quote/work/invoice/payment/resource/review/goal models |
| Executive intelligence | programas-ai | adapted | Preserve deterministic EVM/health/risk logic; feature-gate enterprise complexity |
| Revenue intelligence | intent-revenue-os | adapted | Preserve weighted intent scoring; converge approvals/workflows on Agent Governance |
| Growth intelligence | tractionmesh | adapted | Preserve opportunity scoring, budget guardrails and attribution; share campaign/workflow contracts |
| Social operations | social-growth-os | adapted | Preserve campaign/content semantics; execution now uses shared AtlasOS workflow approval contract |
| Launch/distribution | launchgrid | adapted | Preserve launch ranking and explicit sponsored labeling behind common AtlasOS contracts |
| Outbound infrastructure | outbound-infrastructure-os | adapted | Preserve sender/domain safety semantics and safe-capacity enforcement |
| Browser/session execution | sessiongrid | adapted | Preserve authorized browser runtime contract only; no stealth/bypass behavior |
| SaaS foundation | vibe-saas-foundry | adapted | Reuse task/contracts/design-token ideas without carrying its separate auth/runtime into AtlasOS |

## Shared native AtlasOS layers now established

- universal domain/event envelope
- module/vertical registry
- Today / Action Center
- workflow contract
- integration SDK
- design token seed
- source/provenance inventory

## Non-negotiable consolidation rules

- one identity/tenancy model
- one agent-governance layer
- one workflow contract
- one Atlas event envelope
- shared business entity vocabulary
- vertical modules compose instead of forking the platform
- a module is not marked native until its AtlasOS persistence/runtime/UI and integration tests are complete
