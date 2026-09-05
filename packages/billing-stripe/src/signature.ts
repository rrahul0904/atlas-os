import {createHmac,timingSafeEqual} from "node:crypto";

export interface StripeSignatureResult{timestamp:number;signature:string}

export function verifyStripeSignature(rawBody:string,header:string,secret:string,nowSeconds=Math.floor(Date.now()/1000),toleranceSeconds=300):StripeSignatureResult{
  if(!secret.startsWith("whsec_"))throw new Error("stripe-webhook-secret-invalid");
  const parts=header.split(",").map(part=>part.trim());
  const timestampPart=parts.find(part=>part.startsWith("t="));
  const signatures=parts.filter(part=>part.startsWith("v1=")).map(part=>part.slice(3)).filter(Boolean);
  const timestamp=Number(timestampPart?.slice(2));
  if(!Number.isInteger(timestamp)||!signatures.length)throw new Error("stripe-signature-invalid");
  if(Math.abs(nowSeconds-timestamp)>toleranceSeconds)throw new Error("stripe-signature-expired");
  const expected=createHmac("sha256",secret).update(String(timestamp)+"."+rawBody).digest("hex");
  const expectedBytes=Buffer.from(expected,"hex");
  const matched=signatures.some(signature=>{
    if(!/^[0-9a-f]{64}$/i.test(signature))return false;
    const actual=Buffer.from(signature,"hex");
    return actual.length===expectedBytes.length&&timingSafeEqual(actual,expectedBytes);
  });
  if(!matched)throw new Error("stripe-signature-mismatch");
  return{timestamp,signature:expected};
}
