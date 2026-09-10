import Link from "next/link";
import {atlasSignupEnabled} from "@/lib/session";
import {signupVerticals} from "@/lib/signup";

const errors:Record<string,string>={
  invalid:"Check the form and try again.",
  exists:"An account already exists for that email. Sign in instead.",
  unavailable:"Account creation is temporarily unavailable."
};

export default async function SignupPage({searchParams}:{searchParams:Promise<{error?:string}>}){
  const query=await searchParams,enabled=atlasSignupEnabled();
  return <main className="login-shell"><section className="login-card signup-card">
    <span className="eyebrow">ATLASOS / FIRST RUN</span>
    <h1>Create your business workspace.</h1>
    <p>Start with a 14-day AtlasOS trial. Your account, workspace, billing state and core operating modules are created together in one transaction.</p>
    {!enabled?<p className="login-error">New account creation is not enabled on this deployment.</p>:null}
    {query.error?<p className="login-error">{errors[query.error]??errors.unavailable}</p>:null}
    <form method="post" action="/api/auth/signup">
      <label>Your name<input type="text" name="displayName" autoComplete="name" minLength={2} maxLength={100} required/></label>
      <label>Work email<input type="email" name="email" autoComplete="email" maxLength={254} required/></label>
      <label>Password<input type="password" name="password" autoComplete="new-password" minLength={10} maxLength={256} required/></label>
      <label>Business name<input type="text" name="workspaceName" autoComplete="organization" minLength={2} maxLength={120} required/></label>
      <label>Business type<select name="verticalId" defaultValue="founder" required>{signupVerticals.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <button type="submit" disabled={!enabled}>Create workspace</button>
    </form>
    <p>Already have an account? <Link href="/login">Sign in →</Link></p>
    <p><Link href="/demo/founder/today">Explore Demo mode →</Link></p>
  </section></main>;
}
