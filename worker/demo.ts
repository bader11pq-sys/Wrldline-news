import {dayKey,fresh,iso,uid,type Article,type Brief,type Office,type Source,type Topic} from '../shared/schema';
import {checkBrief} from './factcheck';

const titles:Record<Topic,string[]> = {
  'سياسة':['مجلس مدينة السرو يناقش مشروع النقل العام','لجنة الخدمات تراجع خطة الأحياء','بلدية الوادي تعقد جلسة استماع','مدينة النخيل تناقش تنظيم الأسواق','مجلس الروابي يراجع أولويات الخدمات'],
  'اقتصاد':['تعاونية الواحة تراجع أسعار السلع الأساسية','مركز الميناء يعرض خطة دعم المشاريع','جمعية السهل تقترح سوقاً أسبوعياً'],
  'متنوع':['مكتبة الندى تطلق ورشة للقراءة','مركز الحي يعد معرضاً للخط العربي']
};
export function fixtures(plan:Record<Topic,number>,incomplete=false) {
  const briefs:Brief[]=[],sources:Source[]=[];
  let i=0;
  for(const [key, count] of Object.entries(plan)){
    const topic=key as Topic;
    for(let n=0;n<count;n++){
      const headline=titles[topic][n%titles[topic].length]+(n>=titles[topic].length?` (${n+1})`:'');
      const claim=`في هذا السيناريو التدريبي، ${headline} بتاريخ ${dayKey()}.`;
      const a=`ورد في محضر تدريبي منشور أن ${headline} في جلسة مخصصة لمراجعة المقترح.`;
      const b=`أوضح بيان تدريبي مستقل أن بند اليوم يتناول الآتي: ${headline} من دون اتخاذ قرار نهائي.`;
      const refs=[{id:`demo-a-${i}`,url:`https://example.invalid/fixture/a/${i}`,publisher:'محضر تدريبي (غير حقيقي)',group:'fixture-a',title:headline,text:a,publishedAt:iso(),observedAt:iso(),demo:true},{id:`demo-b-${i}`,url:`https://example.invalid/fixture/b/${i}`,publisher:'بيان تدريبي (غير حقيقي)',group:'fixture-b',title:headline,text:b,publishedAt:iso(),observedAt:iso(),demo:true}].slice(0,incomplete?1:2);
      sources.push(...refs);briefs.push({headline,topic,eventDate:dayKey(),claims:[{text:claim,evidence:refs.map(s=>({sourceId:s.id,quote:s.text}))}],developing:['لم يُتخذ قرار نهائي في هذا المثال التدريبي.'],conflict:false});i++;
    }
  }
  return {briefs,sources};
}
export const mockImages=[{label:'هندسي · نموذج',palette:['#e4d9be','#264939','#a8ae85']},{label:'تحريري · نموذج',palette:['#d0cfba','#656e54','#d29d5c']},{label:'تجريدي · نموذج',palette:['#e7ded1','#284c42','#c1aa81']}];
export function demoSeed():Office {
  const o=fresh(true), {briefs,sources}=fixtures({'سياسة':1,'اقتصاد':1,'متنوع':0}), time=iso();
  const args=[['سياسة','سياسة'],['اقتصاد','اقتصاد']];
  for(const [i,brief] of briefs.entries()){
    const wid=uid(), id=uid(), evidence=sources.slice(i*2,i*2+2);
    const a:Article={id,workflowId:wid,title:brief.headline,topic:brief.topic,summary:brief.claims[0].text,body:[brief.claims[0].text,'هذه مادة خيالية توضح طريقة مراجعة المصادر والموافقة داخل المكتب.'],brief,check:checkBrief(brief,evidence,true),sources:evidence,status:'review',author:'sara',factChecker:'layla',createdAt:time,demo:true,images:mockImages};
    o.articles.push(a);o.workflows.push({id:wid,intent:'edition',order:'مسودة تدريبية',createdAt:time,channel:'omar',plan:{'سياسة':+ (args[i][0]==='سياسة'),'اقتصاد':+(args[i][0]==='اقتصاد'),'متنوع':0},briefs:[brief],sources:evidence,summarySent:true});
    o.tasks.push({id:uid(),workflowId:wid,title:'CEO review',kind:'review',owner:'omar',status:'Waiting for CEO Approval',priority:'Normal',createdAt:time,dueAt:time,dependencies:[],inputs:{},approval:'pending',attempt:1});
  }
  o.messages.push({id:uid(),channel:'omar',author:'omar',text:'أهلاً بك. يمكنك إعداد نشرة تجريبية، فحص خبر، أو اختيار مسودة للمراجعة. بيانات العرض خيالية ولا تُنشر على موقع حي.',createdAt:time});
  o.logs.push({id:uid(),action:'Demo office opened',actor:'omar',details:'Two fictional drafts are ready for CEO review.',createdAt:time});
  return o;
}
