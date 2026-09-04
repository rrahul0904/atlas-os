import{resetRegistry,getVertical}from"../../../packages/module-registry/src/index.js";
import{registerAtlasModules,registerAtlasVerticals}from"../../../packages/module-registry/src/catalog.js";
import{renderWorkspace}from"../../../packages/ui/src/index.js";
import{agencyDemo,ceoDemo,contractorDemo,dentalDemo,founderDemo}from"./demo-data.js";
export type DemoId="founder"|"ceo"|"dental"|"contractor"|"agency";
const builders={founder:founderDemo,ceo:ceoDemo,dental:dentalDemo,contractor:contractorDemo,agency:agencyDemo};
function registry(){resetRegistry();registerAtlasModules();registerAtlasVerticals()}
export function renderDemo(id:DemoId):string{registry();const vertical=getVertical(id);if(!vertical)throw new Error(`unknown vertical: ${id}`);return renderWorkspace(builders[id](vertical))}
export function renderIndex():string{const cards=(Object.keys(builders) as DemoId[]).map(id=>`<a href="/demo/${id}"><b>${id.toUpperCase()} OS</b><span>Open demo →</span></a>`).join("");return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AtlasOS</title><link rel="stylesheet" href="/assets/atlas.css"></head><body class="landing"><main><small class="eyebrow">ATLAS OS</small><h1>Run the business, not the software stack.</h1><p>Observe → Understand → Decide → Act → Automate → Learn.</p><div class="demo-grid">${cards}</div></main></body></html>`}
