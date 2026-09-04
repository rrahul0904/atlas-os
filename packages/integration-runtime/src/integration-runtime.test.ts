import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeIntegrationData} from "./index.js";

test("integration output sanitizer removes credential-like fields",()=>{
  const sanitized=sanitizeIntegrationData({
    id:"ok",
    access_token:"secret",
    nested:{password:"hidden",value:3},
    authorization:"Bearer raw"
  }) as Record<string,unknown>;
  assert.equal(sanitized.id,"ok");
  assert.equal("access_token" in sanitized,false);
  assert.equal("authorization" in sanitized,false);
  const nested=sanitized.nested as Record<string,unknown>;
  assert.equal("password" in nested,false);
  assert.equal(nested.value,3);
});
