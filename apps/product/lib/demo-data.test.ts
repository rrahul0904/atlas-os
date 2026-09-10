import {describe,it,expect} from "vitest";
import {demoModel,demoVerticals} from "./demo-data";

describe("explicit product demo data",()=>{
  it("certifies all four horizontal-kernel verticals through one model",()=>{
    for(const vertical of demoVerticals){const model=demoModel(vertical);expect(model.mode).toBe("demo");expect(model.workspace.verticalId).toBe(vertical);expect(model.metrics.length).toBeGreaterThan(0)}
  });
  it("does not pretend demo integration or billing state is connected authority",()=>{
    const model=demoModel("bakery");
    expect(model.rows.integrations.every(row=>row.meta.includes("Demo state only"))).toBe(true);
    expect(model.rows.billing[0].status).toBe("Demo");
  });
  it("demonstrates distinct business shapes over canonical bookings",()=>{
    expect(demoModel("dental").terminology.booking).toBe("Appointment");
    expect(demoModel("restaurant").terminology.booking).toBe("Reservation");
    expect(demoModel("bakery").terminology.booking).toBe("Pickup / production slot");
  });
});
