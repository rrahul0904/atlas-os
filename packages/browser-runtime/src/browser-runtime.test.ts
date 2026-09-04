import test from "node:test";
import assert from "node:assert/strict";
import {validateBrowserProfile} from "./index.js";

test("browser runtime rejects unsafe protocol",()=>{
  const errors=validateBrowserProfile({
    id:"p",workspaceId:"w",name:"QA",platform:"Web",owner:"u",
    locale:"en-US",timezone:"UTC",startUrl:"file:///etc/passwd",
    networkLabel:"default",status:"ready"
  });
  assert.ok(errors.length>0);
});
