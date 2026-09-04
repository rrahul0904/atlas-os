#!/usr/bin/env bash
set -euo pipefail

# Run from the root of rrahul0904/atlas-os after the repository exists and
# this foundation has been pushed to main. The script preserves each source
# repository as an unrelated source/* branch; it never merges those histories.

sources=(
  "founderos-ai:source/founderos-ai"
  "pulseatlas:source/pulseatlas"
  "contractoros-ai:source/contractoros-ai"
  "programos-ai:source/programos-ai"
  "agent-control-plane:source/agent-control-plane"
  "intent-revenue-os:source/intent-revenue-os"
  "tractionmesh:source/tractionmesh"
  "social-growth-os:source/social-growth-os"
  "launchgrid:source/launchgrid"
  "outbound-infrastructure-os:source/outbound-infrastructure-os"
  "sessiongrid:source/sessiongrid"
  "vibe-saas-foundry:source/vibe-saas-foundry"
  "n8n-ai-automated-hvac-appointment-booking-n8n-workflow-json:source/automation-appointment-booking"
  "n8n-ai-meeting-analyzer-transcribe-extract-tasks-update-ghl:source/automation-meeting-actions"
  "n8n-automated-vendor-invoice-to-purchase-order-matching:source/automation-invoice-po"
  "n8n-automated-inventory-reorder-vendor-notification-pipeline:source/automation-inventory-reorder"
  "n8n-lead-scoring-and-automated-whatsapp-proposal-sender:source/automation-lead-whatsapp"
  "n8n-pet-clinic-appointment-scheduling-agent:source/automation-clinic-scheduling"
  "n8n-hotel-guest-whatsapp-concierge:source/automation-hotel-concierge"
  "n8n-routing-of-medical-equipment-enquiry:source/automation-medical-enquiry"
  "n8n-automate-multi-carrier-shipping-quotes-with-ai:source/automation-shipping-quotes"
)

for pair in "${sources[@]}"; do
  repo="${pair%%:*}"
  branch="${pair#*:}"
  remote="source-${repo//[^a-zA-Z0-9]/-}"
  url="https://github.com/rrahul0904/${repo}.git"

  echo "==> ${repo} -> ${branch}"
  git remote remove "$remote" >/dev/null 2>&1 || true
  git remote add "$remote" "$url"
  git fetch --no-tags "$remote" main

  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "    local branch exists; leaving it untouched"
  else
    git branch "$branch" FETCH_HEAD
  fi

  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    echo "    remote branch already exists; leaving it untouched"
  else
    git push origin "$branch:$branch"
  fi

done

echo "All source branches imported without modifying main."
