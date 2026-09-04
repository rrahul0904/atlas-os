import test from "node:test";
import assert from "node:assert/strict";
import {renderSignup,renderLogin,renderOnboarding,renderConnectedToday} from "./auth-pages.js";

test("signup and login use POST forms",()=>{
  assert.ok(renderSignup().includes('method="post" action="/signup"'));
  assert.ok(renderLogin().includes('method="post" action="/login"'));
});

test("onboarding offers all five verticals",()=>{
  const html=renderOnboarding({email:"x@example.test"});
  for(const id of ["founder","ceo","dental","contractor","agency"]) assert.ok(html.includes('value="'+id+'"'));
});

test("connected Today never claims demo data",()=>{
  const html=renderConnectedToday({workspaceName:"Acme",verticalId:"founder",planId:"business",billingStatus:"trialing",trialEndsAt:null,modules:["today"]});
  assert.ok(html.includes("No business signals yet"));
  assert.ok(html.includes("Connected Atlas never borrows data"));
});
