import Link from "next/link";
import {atlasRuntimeConfigured,atlasSignupEnabled} from "@/lib/session";

export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}){
  const query=await searchParams,runtime=atlasRuntimeConfigured(),signup=atlasSignupEnabled();
  return <main className="login-shell"><section className="login-card">
    <span className="eyebrow">ATLASOS / CONNECTED</span>
    <h1>Sign in to your business.</h1>
    <p>Connected mode uses the existing AtlasOS session, tenant and workspace permissions. Demo data is never used as a fallback.</p>
    {!runtime?<p className="login-error">Connected runtime is not configured on this deployment. You can still explore the explicit product demo.</p>:null}
    {query.error?<p className="login-error">Email or password is incorrect.</p>:null}
    <form method="post" action="/api/auth/login">
      <label>Email<input type="email" name="email" autoComplete="email" required/></label>
      <label>Password<input type="password" name="password" autoComplete="current-password" minLength={10} required/></label>
      <button type="submit" disabled={!runtime}>Sign in</button>
    </form>
    {signup?<p>New to AtlasOS? <Link href="/signup">Create a workspace →</Link></p>:null}
    <p><Link href="/demo/founder/today">Explore Demo mode →</Link></p>
  </section></main>;
}
