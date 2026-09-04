import fs from "node:fs";
const manifest=JSON.parse(fs.readFileSync(new URL("../docs/consolidation/PROVENANCE_MANIFEST.json",import.meta.url),"utf8"));
const required=["founderos-ai","pulseatlas","contractoros-ai","programos-ai","agent-control-plane","intent-revenue-os","tractionmesh","social-growth-os","launchgrid","outbound-infrastructure-os","sessiongrid","vibe-saas-foundry"];
const present=new Set(manifest.sources.map(x=>x.repository.split("/").pop()));
const missing=required.filter(x=>!present.has(x));
if(missing.length){console.error(`Missing source manifest entries: ${missing.join(", ")}`);process.exit(1)}
console.log(`Source manifest OK: ${manifest.sources.length} canonical repositories.`);
