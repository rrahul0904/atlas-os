import type {AtlasPlan} from "../../entitlements/src/index.js";

export interface StripeBillingConfig{
  secretKey:string;
  webhookSecret:string;
  prices:Record<AtlasPlan,string>;
  successUrl:string;
  cancelUrl:string;
  portalReturnUrl:string;
}
function httpsUrl(value:string,name:string,production:boolean){
  let url:URL;try{url=new URL(value)}catch{throw new Error(name+"-invalid")}
  if(production&&url.protocol!=="https:")throw new Error(name+"-https-required");
  if(!["http:","https:"].includes(url.protocol))throw new Error(name+"-invalid");
  return url.toString();
}
export function stripeBillingConfigFromEnv(env=process.env):StripeBillingConfig{
  const secretKey=env.STRIPE_SECRET_KEY?.trim()??"";
  const webhookSecret=env.STRIPE_WEBHOOK_SECRET?.trim()??"";
  if(!/^(sk|rk)_(test|live)_/.test(secretKey))throw new Error("stripe-secret-key-not-configured");
  if(!webhookSecret.startsWith("whsec_"))throw new Error("stripe-webhook-secret-not-configured");
  const prices={
    solo:env.STRIPE_PRICE_SOLO?.trim()??"",
    professional:env.STRIPE_PRICE_PROFESSIONAL?.trim()??"",
    business:env.STRIPE_PRICE_BUSINESS?.trim()??"",
    platform:env.STRIPE_PRICE_PLATFORM?.trim()??""
  } satisfies Record<AtlasPlan,string>;
  for(const [plan,price] of Object.entries(prices))if(!price.startsWith("price_"))throw new Error("stripe-price-"+plan+"-not-configured");
  const production=env.NODE_ENV==="production";
  return{
    secretKey,webhookSecret,prices,
    successUrl:httpsUrl(env.STRIPE_SUCCESS_URL?.trim()??"","stripe-success-url",production),
    cancelUrl:httpsUrl(env.STRIPE_CANCEL_URL?.trim()??"","stripe-cancel-url",production),
    portalReturnUrl:httpsUrl(env.STRIPE_PORTAL_RETURN_URL?.trim()??"","stripe-portal-return-url",production)
  };
}
export function planFromPrice(config:StripeBillingConfig,priceRef:string):AtlasPlan|null{
  for(const [plan,ref] of Object.entries(config.prices))if(ref===priceRef)return plan as AtlasPlan;
  return null;
}
export function stripeBillingConfigured(env=process.env){
  try{stripeBillingConfigFromEnv(env);return true}catch{return false}
}
