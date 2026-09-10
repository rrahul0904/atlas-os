import {describe,it,expect} from "vitest";
import {terminologyFor} from "@atlas/business-kernel";
import {productNavigation} from "./navigation";

describe("product navigation",()=>{
  it("uses vertical terminology without changing canonical sections",()=>{
    const dental=productNavigation({mode:"demo",verticalId:"dental",terms:terminologyFor("dental"),demoVertical:"dental"});
    const restaurant=productNavigation({mode:"demo",verticalId:"restaurant",terms:terminologyFor("restaurant"),demoVertical:"restaurant"});
    expect(dental.find(x=>x.section==="bookings")?.label).toBe("Appointments");
    expect(restaurant.find(x=>x.section==="bookings")?.label).toBe("Reservations");
    expect(dental.find(x=>x.section==="bookings")?.section).toBe("bookings");
  });
  it("de-emphasizes pipeline for operational verticals",()=>{
    expect(productNavigation({mode:"demo",verticalId:"bakery",terms:terminologyFor("bakery"),demoVertical:"bakery"}).some(x=>x.section==="pipeline")).toBe(false);
    expect(productNavigation({mode:"demo",verticalId:"founder",terms:terminologyFor("founder"),demoVertical:"founder"}).some(x=>x.section==="pipeline")).toBe(true);
  });
  it("omits sensitive connected sections for lower roles",()=>{
    const terms=terminologyFor("founder");
    const viewer=productNavigation({mode:"connected",verticalId:"founder",terms,role:"viewer"});
    const operator=productNavigation({mode:"connected",verticalId:"founder",terms,role:"operator"});
    const admin=productNavigation({mode:"connected",verticalId:"founder",terms,role:"admin"});
    expect(viewer.some(x=>x.section==="integrations")).toBe(false);
    expect(viewer.some(x=>x.section==="billing")).toBe(false);
    expect(operator.some(x=>x.section==="integrations")).toBe(true);
    expect(operator.some(x=>x.section==="billing")).toBe(false);
    expect(admin.some(x=>x.section==="integrations")).toBe(true);
    expect(admin.some(x=>x.section==="billing")).toBe(true);
  });
});
