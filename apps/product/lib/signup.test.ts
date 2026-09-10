import {describe,it,expect} from "vitest";
import {defaultWorkspaceModules,signupVerticals,validateSignupInput} from "./signup";

describe("signup validation",()=>{
  it("accepts every supported vertical and normalizes email",()=>{
    for(const vertical of signupVerticals){
      const result=validateSignupInput({displayName:"Rahul",email:"  OWNER@EXAMPLE.COM ",password:"long-enough-password",workspaceName:"Atlas Test",verticalId:vertical.id});
      expect(result.ok).toBe(true);
      if(result.ok)expect(result.value.email).toBe("owner@example.com");
    }
  });
  it("rejects short passwords and unknown verticals",()=>{
    expect(validateSignupInput({displayName:"R",email:"bad",password:"short",workspaceName:"A",verticalId:"unknown"}).ok).toBe(false);
    expect(validateSignupInput({displayName:"Rahul",email:"r@example.com",password:"long-enough-password",workspaceName:"Atlas",verticalId:"unknown"}).ok).toBe(false);
  });
  it("enables only canonical first-run modules",()=>{
    expect(defaultWorkspaceModules).toEqual(["today","business-ops","agent-governance"]);
  });
});
