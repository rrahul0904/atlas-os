import test from "node:test";
import assert from "node:assert/strict";
import {renderKernelDemo} from "./kernel-demo.js";

test("horizontal kernel demo is explicit about shared primitives and static data",()=>{
  const html=renderKernelDemo();
  assert.ok(html.includes("Different businesses. One operating kernel."));
  assert.ok(html.includes("static architecture preview"));
  assert.ok(html.includes("Appointment"));
  assert.ok(html.includes("Reservation"));
  assert.ok(html.includes("Pickup / production slot"));
  assert.ok(html.includes("Location + Resource + Booking + Catalog + Order + Fulfillment"));
});
