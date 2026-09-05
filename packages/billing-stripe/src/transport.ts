export interface StripeHttpRequest{
  path:string;
  method?:"GET"|"POST"|"DELETE";
  form?:Record<string,string|number|boolean|undefined|null>;
  idempotencyKey?:string;
}
export interface StripeHttpResponse{status:number;body:string}
export interface StripeHttpTransport{request(input:StripeHttpRequest):Promise<StripeHttpResponse>}

function formBody(values:Record<string,string|number|boolean|undefined|null>={}){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value!==undefined&&value!==null)params.set(key,String(value));
  return params.toString();
}

async function readBounded(response:Response,maxBytes=512*1024){
  if(!response.body)return "";
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const next=await reader.read();if(next.done)break;
      total+=next.value.byteLength;if(total>maxBytes)throw new Error("stripe-response-too-large");
      chunks.push(next.value);
    }
  }finally{reader.releaseLock()}
  const merged=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}
  return new TextDecoder().decode(merged);
}

export class FetchStripeHttpTransport implements StripeHttpTransport{
  constructor(private readonly secretKey:string){
    if(!/^sk_(test|live)_/.test(secretKey))throw new Error("stripe-secret-key-invalid");
  }
  async request(input:StripeHttpRequest):Promise<StripeHttpResponse>{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10_000);
    try{
      let response:Response;
      try{
        response=await fetch("https://api.stripe.com"+input.path,{
          method:input.method??"POST",
          headers:{
            authorization:"Bearer "+this.secretKey,
            accept:"application/json",
            ...(input.method==="GET"?{}:{"content-type":"application/x-www-form-urlencoded"}),
            ...(input.idempotencyKey?{"idempotency-key":input.idempotencyKey}:{})
          },
          body:input.method==="GET"?undefined:formBody(input.form),
          redirect:"error",
          signal:controller.signal
        });
      }catch(error){
        if(error instanceof Error&&error.name==="AbortError")throw new Error("stripe-network-timeout");
        throw new Error("stripe-network-failure");
      }
      return{status:response.status,body:await readBounded(response)};
    }finally{clearTimeout(timeout)}
  }
}

export function parseStripeJson<T=Record<string,unknown>>(response:StripeHttpResponse):T{
  try{return JSON.parse(response.body) as T}catch{throw new Error("stripe-invalid-json-response")}
}
export function stripeHttpError(response:StripeHttpResponse){
  let code="";
  try{const body=JSON.parse(response.body) as any;code=String(body?.error?.code??body?.error?.type??"")}catch{}
  return new Error(`stripe-http-${response.status}${code?":"+code.slice(0,100):""}`);
}
