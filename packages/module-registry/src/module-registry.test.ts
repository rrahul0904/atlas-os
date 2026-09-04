import test from "node:test";
import assert from "node:assert/strict";
import {defineModule,defineVertical,resetRegistry} from "./index.js";

test("verticals cannot reference missing modules",()=>{
  resetRegistry();
  defineModule({id:"today",name:"Today",state:"native",sourceRepository:"atlas-os",description:"Action center",permissions:["today:read"],eventTypes:[]});
  assert.throws(()=>defineVertical({id:"bad",name:"Bad",modules:["missing"],terminology:{}}));
});
