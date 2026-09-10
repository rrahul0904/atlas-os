"use client";
import {FormEvent,useState} from "react";

export function AskAtlasCommand({mode,demoSummary}:{mode:"demo"|"connected";demoSummary?:string}){
  const [question,setQuestion]=useState(""),[answer,setAnswer]=useState<string|null>(null),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();const q=question.trim();if(!q)return;setBusy(true);
    try{
      if(mode==="demo"){setAnswer("Demo mode · "+(demoSummary||"This preview uses explicit fixture data. Sign in to ask Atlas about a connected workspace."));return}
      const response=await fetch("/api/atlas/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question:q})});
      const body=await response.json();if(!response.ok)throw new Error(body.message||"Ask Atlas failed safely.");setAnswer(body.answer);
    }catch(error){setAnswer(error instanceof Error?error.message:"Ask Atlas failed safely.")}finally{setBusy(false)}
  }
  return <div className="command-wrap"><form className="command-bar" onSubmit={submit}><div className="command-icon" aria-hidden>⌘</div><label className="sr-only" htmlFor="atlas-command">Ask Atlas</label><input id="atlas-command" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask Atlas anything about this business…" maxLength={2000}/><button disabled={busy}>{busy?"Checking…":"Ask Atlas"}</button></form>{answer?<div className="command-result"><strong>Atlas</strong> · {answer}</div>:null}</div>;
}
