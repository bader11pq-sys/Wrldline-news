export type AgentId = 'omar'|'sara'|'khalid'|'layla'|'adam'|'noura'|'faisal'|'mariam';
export type Channel = AgentId | 'meeting';
export type Status = 'Queued'|'In Progress'|'Waiting for Fact Check'|'Waiting for CEO Approval'|'Approved'|'Rejected'|'Done'|'Blocked';
export type TaskKind = 'research'|'check'|'edit'|'seo'|'image'|'review'|'stage'|'ideas'|'analytics'|'reply';
export type Intent = 'edition'|'breaking'|'verify'|'website'|'meeting'|'ideas'|'images'|'analytics'|'direct';
export type Topic = 'سياسة'|'اقتصاد'|'متنوع';
export interface Source {id:string; url:string; publisher:string; group:string; title:string; text:string; publishedAt:string; observedAt:string; demo?:boolean; untrusted?:boolean}
export interface Evidence {sourceId:string; quote:string}
export interface Claim {text:string; evidence:Evidence[]}
export interface Brief {headline:string; topic:Topic; eventDate:string; claims:Claim[]; developing:string[]; conflict:boolean}
export interface Check {state:'passed'|'incomplete'|'blocked'; reasons:string[]; checkedAt:string}
export interface Editorial {title:string;summary:string;body:string[]}
export interface Article {id:string; workflowId:string; title:string; topic:Topic; summary:string; body:string[]; brief:Brief; check:Check; sources:Source[]; status:'review'|'published'|'rejected'; author:'sara'; factChecker:'layla'; createdAt:string; publishedAt?:string; demo:boolean; seo?:string; images?:ImageOption[]; selectedImage?:number; breaking?:boolean}
export interface ImageOption {label:string; url?:string; palette?:string[]}
export interface Release {commit:string; preview:string; report:string; testsPassed:boolean; deploymentUrl?:string}
export interface Task {id:string; workflowId:string; title:string; owner:AgentId; kind:TaskKind; status:Status; priority:'Urgent'|'High'|'Normal'; createdAt:string; dueAt:string; dependencies:string[]; inputs:Record<string,unknown>; output?:string; sources?:Source[]; approval:'none'|'pending'|'approved'|'rejected'; feedback?:string; attempt:number}
export interface Workflow {id:string; intent:Intent; order:string; createdAt:string; plan:Record<Topic,number>; briefs?:Brief[]; sources?:Source[]; checks?:Check[]; edit?:Record<number,Editorial|null>; seo?:Record<number,string>; images?:ImageOption[]; imagesByStory?:Record<number,ImageOption[]>; release?:Release; channel:Channel; summarySent?:boolean; candidateIds?:string[]; revisionOf?:string}
export interface Message {id:string; channel:Channel; author:'ceo'|AgentId; text:string; createdAt:string}
export interface Log {id:string; action:string; actor:string; details:string; createdAt:string}
export interface Approval {id:string; targetId:string; decision:'approved'|'rejected'; feedback:string; actor:string; createdAt:string}
export interface Report {id:string; day:string; type:'morning'|'evening'; createdAt:string; text:string; stories:Source[]}
export interface ReadEvent {articleId:string; hour:number; day:string; topic:Topic}
export type ProviderId='openrouter'|'groq';
export interface ModelProfile {provider:ProviderId;fast:string;editor:string;checker:string}
export interface Office {revision:number; workflows:Workflow[]; tasks:Task[]; articles:Article[]; messages:Message[]; logs:Log[]; approvals:Approval[]; reports:Report[]; usage:Record<string,Partial<Record<AgentId,number>>>; dailyLimit:number; reads:ReadEvent[]; demo:boolean;modelProfile?:ModelProfile}
export const uid = () => crypto.randomUUID();
export const iso = () => new Date().toISOString();
export const dayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export const fresh = (demo:boolean, dailyLimit=60000):Office => ({revision:0,workflows:[],tasks:[],articles:[],messages:[],logs:[],approvals:[],reports:[],usage:{},dailyLimit,reads:[],demo});
