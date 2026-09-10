export const signupVerticals=[
  {id:"founder",label:"Founder / SaaS"},
  {id:"dental",label:"Dental"},
  {id:"restaurant",label:"Restaurant / Reservations"},
  {id:"bakery",label:"Bakery"},
  {id:"agency",label:"Agency"},
  {id:"contractor",label:"Contractor / Field Service"},
  {id:"business",label:"Other business"}
] as const;

const allowedVerticals=new Set(signupVerticals.map(item=>item.id));

export interface SignupInput{
  displayName:string;
  email:string;
  password:string;
  workspaceName:string;
  verticalId:string;
}

export function validateSignupInput(value:Record<string,unknown>):
  |{ok:true;value:SignupInput}
  |{ok:false;message:string}{
  const displayName=String(value.displayName??"").trim();
  const email=String(value.email??"").trim().toLowerCase();
  const password=String(value.password??"");
  const workspaceName=String(value.workspaceName??"").trim();
  const verticalId=String(value.verticalId??"").trim();

  if(displayName.length<2||displayName.length>100)return{ok:false,message:"Name must be between 2 and 100 characters."};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return{ok:false,message:"Enter a valid email address."};
  if(password.length<10||password.length>256)return{ok:false,message:"Password must be between 10 and 256 characters."};
  if(workspaceName.length<2||workspaceName.length>120)return{ok:false,message:"Business name must be between 2 and 120 characters."};
  if(!allowedVerticals.has(verticalId as any))return{ok:false,message:"Choose a supported business type."};
  return{ok:true,value:{displayName,email,password,workspaceName,verticalId}};
}

export const defaultWorkspaceModules=["today","business-ops","agent-governance"] as const;
