import type {AtlasSql} from "../../db/src/index.js";
import {BillingEventRepository,BillingRepository,CheckoutSessionRepository} from "../../repositories/src/index.js";
import {stripeBillingConfigFromEnv,stripeBillingConfigured} from "./config.js";
import {StripeBillingService} from "./service.js";
import {FetchStripeHttpTransport} from "./transport.js";

export function createStripeBillingRuntime(sql:AtlasSql,env=process.env){
  const config=stripeBillingConfigFromEnv(env);
  return new StripeBillingService({
    config,
    transport:new FetchStripeHttpTransport(config.secretKey),
    billing:new BillingRepository(sql),
    checkout:new CheckoutSessionRepository(sql),
    events:new BillingEventRepository(sql)
  });
}
export {stripeBillingConfigured};
