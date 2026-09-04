import type { ModuleDescriptor, VerticalDescriptor } from "../../domain/src/index.js";

const modules = new Map<string,ModuleDescriptor>();
const verticals = new Map<string,VerticalDescriptor>();

export function defineModule(module:ModuleDescriptor):ModuleDescriptor {
  if(modules.has(module.id)) throw new Error(`duplicate module: ${module.id}`);
  modules.set(module.id,module);
  return module;
}
export function defineVertical(vertical:VerticalDescriptor):VerticalDescriptor {
  const missing=vertical.modules.filter(id=>!modules.has(id));
  if(missing.length) throw new Error(`vertical ${vertical.id} references unknown modules: ${missing.join(", ")}`);
  if(verticals.has(vertical.id)) throw new Error(`duplicate vertical: ${vertical.id}`);
  verticals.set(vertical.id,vertical);
  return vertical;
}
export function getModule(id:string){ return modules.get(id); }
export function listModules(){ return [...modules.values()]; }
export function getVertical(id:string){ return verticals.get(id); }
export function listVerticals(){ return [...verticals.values()]; }
export function resetRegistry(){ modules.clear(); verticals.clear(); }
