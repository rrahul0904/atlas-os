import test from "node:test";
import assert from "node:assert/strict";
import {normalizeTask} from "./index.js";

test("saas task contract has safe defaults",()=>{
  assert.equal(normalizeTask({id:"1",title:"Do work"}).priority,"medium");
});
