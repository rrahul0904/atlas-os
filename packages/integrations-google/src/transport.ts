export interface GoogleHttpRequest{
  url:string;
  method?:"GET"|"POST"|"PUT"|"PATCH"|"DELETE";
  headers?:Record<string,string>;
  body?:string;
  timeoutMs?:number;
}
export interface GoogleHttpResponse{
  status:number;
  body:string;
  headers:Record<string,string>;
}
export interface GoogleHttpTransport{
  request(input:GoogleHttpRequest):Promise<GoogleHttpResponse>;
}

async function readBounded(response:Response,maxBytes=512*1024){
  if(!response.body)return "";
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const next=await reader.read();
      if(next.done)break;
      total+=next.value.byteLength;
      if(total>maxBytes)throw new Error("google-response-too-large");
      chunks.push(next.value);
    }
  }finally{reader.releaseLock()}
  const merged=new Uint8Array(total);
  let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}
  return new TextDecoder().decode(merged);
}

export class FetchGoogleHttpTransport implements GoogleHttpTransport{
  async request(input:GoogleHttpRequest):Promise<GoogleHttpResponse>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),Math.max(250,Math.min(30_000,input.timeoutMs??10_000)));
    try{
      let response:Response;
      try{
        response=await fetch(input.url,{
          method:input.method??"GET",
          headers:input.headers,
          body:input.body,
          redirect:"error",
          signal:controller.signal
        });
      }catch(error){
        if(error instanceof Error&&error.name==="AbortError")throw new Error("google-network-timeout");
        throw new Error("google-network-failure");
      }
      const headers:Record<string,string>={};
      response.headers.forEach((value,key)=>{headers[key]=value});
      return{status:response.status,body:await readBounded(response),headers};
    }finally{clearTimeout(timeout)}
  }
}

export function parseGoogleJson<T=Record<string,unknown>>(response:GoogleHttpResponse):T{
  if(!response.body)return{} as T;
  try{return JSON.parse(response.body) as T}catch{throw new Error("google-invalid-json-response")}
}

export function formBody(values:Record<string,string|undefined>){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value!==undefined)params.set(key,value);
  return params.toString();
}

export function googleHttpError(response:GoogleHttpResponse){
  let reason="";
  try{
    const parsed=JSON.parse(response.body) as any;
    reason=String(parsed?.error?.status??parsed?.error?.message??parsed?.error??"");
  }catch{}
  return new Error(`google-http-${response.status}${reason?":"+reason.slice(0,120):""}`);
}
