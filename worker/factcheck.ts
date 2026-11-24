import {iso,type Brief,type Check,type Source} from '../shared/schema';
import {norm,siteFor} from './integrations';

const ar=/[\u0600-\u06ff]/;
export function checkBrief(brief:Brief,sources:Source[],demo:boolean,clock=Date.now()):Check {
  const fail=(state:Check['state'],reasons:string[]):Check=>({state,reasons,checkedAt:iso()});
  if(brief.conflict) return fail('blocked',['تعارضت المصادر. يلزم حل التعارض قبل إعادة المراجعة.']);
  const date=Date.parse(brief.eventDate);
  if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==brief.eventDate||date<clock-7*864e5||date>clock+864e5) return fail('blocked',['تاريخ الحدث غير صالح أو خارج نافذة الأخبار الحديثة.']);
  if(!brief.claims.length||!ar.test(brief.headline)||brief.claims.some(c=>!ar.test(c.text))) return fail('incomplete',['المادة تحتاج وقائع وصياغة عربية.']);
  const failures:string[]=[];
  for(const claim of brief.claims) {
    const matches=new Map<string,string>();
    for(const ev of claim.evidence){
      const s=sources.find(x=>x.id===ev.sourceId), quote=norm(ev.quote);
      if(!s||!!s.demo!==demo||s.untrusted||quote.length<18||!norm(s.text).includes(quote)) continue;
      const publish=Date.parse(s.publishedAt), event=Date.parse(brief.eventDate);
      if(!Number.isFinite(publish)||publish<event-864e5||publish>clock+300000) continue;
      const p=demo?s.group:siteFor(s.url)?.group;
      if(p&&![...matches.values()].some(prior=>prior.includes(quote)||quote.includes(prior))) matches.set(p,quote);
    }
    if(matches.size<2) failures.push(`دليلان مستقلان غير متاحين لـ: ${claim.text}`);
  }
  return failures.length?fail('incomplete',failures):fail('passed',['تمت مطابقة مقتطفين مستقلين لكل واقعة.']);
}
