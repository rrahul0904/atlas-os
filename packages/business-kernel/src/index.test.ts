import test from "node:test";
import assert from "node:assert/strict";
import {terminologyFor,kernelEntityRef} from "./index.js";

test("vertical terminology changes labels without changing canonical entity types",()=>{
  assert.equal(terminologyFor("dental").booking,"Appointment");
  assert.equal(terminologyFor("restaurant").booking,"Reservation");
  assert.equal(terminologyFor("bakery").booking,"Pickup / production slot");
  assert.deepEqual(kernelEntityRef("booking","b1"),{type:"booking",id:"b1"});
});

test("unknown verticals fail toward generic business terminology",()=>{
  assert.equal(terminologyFor("new-future-vertical").booking,"Booking");
  assert.equal(terminologyFor("new-future-vertical").contact,"Contact");
});
