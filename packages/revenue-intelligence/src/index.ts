export interface ScoreBreakdown{problemMatch:number;buyingIntent:number;productFit:number;switchingIntent:number;urgency:number;freshness:number;}
const weights:Record<keyof ScoreBreakdown,number>={problemMatch:.28,buyingIntent:.24,productFit:.18,switchingIntent:.12,urgency:.10,freshness:.08};
export function calculateLeadScore(breakdown:ScoreBreakdown){const raw=Object.entries(weights).reduce((total,[key,weight])=>total+breakdown[key as keyof ScoreBreakdown]*weight,0);return Math.max(0,Math.min(100,Math.round(raw)));}
export function scoreBand(score:number):"hot"|"strong"|"watch"|"low"{if(score>=90)return"hot";if(score>=75)return"strong";if(score>=55)return"watch";return"low";}
