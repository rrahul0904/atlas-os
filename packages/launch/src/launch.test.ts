import test from "node:test";
import assert from "node:assert/strict";
import {wilsonLowerBound,sponsoredExposure,type LaunchRecord} from "./index.js";

test("wilson lower bound is bounded",()=>{
  assert.ok(wilsonLowerBound(8,10)>0&&wilsonLowerBound(8,10)<1);
});
test("sponsored exposure is explicitly labelled",()=>{
  const launch:LaunchRecord={
    id:"1",workspaceId:"w",productId:"p",status:"live",
    startsAt:"2026-01-01T00:00:00Z",endsAt:"2026-01-02T00:00:00Z",
    headline:"h",story:"s",plan:"pro",sponsoredSlots:1,qualityScore:80,
    uniqueVotes:10,weightedVotes:9,verifiedReviews:2,impressions:100,clicks:10,
    conversions:1,createdAt:"2026-01-01T00:00:00Z"
  };
  assert.equal(sponsoredExposure(launch).label,"Sponsored");
});
