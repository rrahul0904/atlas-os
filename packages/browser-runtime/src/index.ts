export interface BrowserProfile { id:string;workspaceId:string;name:string;platform:string;owner:string;locale:string;timezone:string;startUrl:string;networkLabel:string;status:string; }
export interface BrowserSession { id:string;profileId:string;status:string;currentUrl?:string;currentTitle?:string;error?:string;screenshots:number;startedAt:string;stoppedAt?:string; }
export interface BrowserRuntimeProvider {
  launch(profile:BrowserProfile):Promise<BrowserSession>;
  stop(sessionId:string):Promise<void>;
  screenshot(sessionId:string):Promise<Uint8Array>;
  pointer(sessionId:string,x:number,y:number):Promise<void>;
  text(sessionId:string,text:string):Promise<void>;
  state(sessionId:string):Promise<{url?:string;title?:string}>;
}
export function validateBrowserProfile(profile:BrowserProfile):string[]{
  const errors:string[]=[];
  if(profile.name.trim().length<2) errors.push("name-too-short");
  try{
    const url=new URL(profile.startUrl);
    if(!["http:","https:"].includes(url.protocol)) errors.push("unsupported-protocol");
  }catch{
    errors.push("invalid-start-url");
  }
  return errors;
}
