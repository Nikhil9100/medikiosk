import type { PatientWorkflow } from "@/lib/patient-flow";

const DB_NAME="medikiosk-resilience-v1";
const DB_VERSION=1;
const STATE_KEY="active";
const KEY_ID="draft-key";
export const OFFLINE_RESUME_TTL_MS=8*60*60*1000;

export type PendingMutation={id:string;path:string;method:"POST"|"PATCH"|"DELETE";body?:Record<string,unknown>;createdAt:number};
type Snapshot={version:1;updatedAt:number;expiresAt:number;workflow:PatientWorkflow|null;pending:PendingMutation[];drafts:Record<string,unknown>;createKey:string;resumeSecret:string};
type CipherRecord={id:string;iv:ArrayBuffer;cipher:ArrayBuffer;updatedAt:number};

let chain:Promise<unknown>=Promise.resolve();
function serialize<T>(fn:()=>Promise<T>):Promise<T>{const next=chain.then(fn,fn);chain=next.then(()=>undefined,()=>undefined);return next;}
function randomToken(bytes=32){const raw=new Uint8Array(bytes);crypto.getRandomValues(raw);return Array.from(raw,b=>b.toString(16).padStart(2,"0")).join("");}
function emptySnapshot():Snapshot{return{version:1,updatedAt:Date.now(),expiresAt:Date.now()+OFFLINE_RESUME_TTL_MS,workflow:null,pending:[],drafts:{},createKey:crypto.randomUUID(),resumeSecret:randomToken(32)};}

function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(typeof indexedDB==="undefined")return reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("keys"))db.createObjectStore("keys",{keyPath:"id"});if(!db.objectStoreNames.contains("state"))db.createObjectStore("state",{keyPath:"id"});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error??new Error("OFFLINE_STORAGE_UNAVAILABLE"));});}
function reqResult<T>(req:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function keyFor(db:IDBDatabase):Promise<CryptoKey>{const tx=db.transaction("keys","readwrite");const store=tx.objectStore("keys");const existing=await reqResult<any>(store.get(KEY_ID));if(existing?.key)return existing.key as CryptoKey;const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);await reqResult(store.put({id:KEY_ID,key}));return key;}
async function deleteStateRecord(db:IDBDatabase){const tx=db.transaction("state","readwrite");await reqResult(tx.objectStore("state").delete(STATE_KEY)).catch(()=>undefined);}
async function readRaw(db:IDBDatabase,key:CryptoKey):Promise<Snapshot|null>{const tx=db.transaction("state","readonly");const rec=await reqResult<CipherRecord|undefined>(tx.objectStore("state").get(STATE_KEY));if(!rec)return null;try{const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(rec.iv)},key,rec.cipher);const snap=JSON.parse(new TextDecoder().decode(plain)) as Snapshot;if(!snap||snap.version!==1||snap.expiresAt<=Date.now()){await deleteStateRecord(db);return null;}return snap;}catch{await deleteStateRecord(db);return null;}}
async function writeRaw(db:IDBDatabase,key:CryptoKey,snap:Snapshot){snap.updatedAt=Date.now();snap.expiresAt=Date.now()+OFFLINE_RESUME_TTL_MS;const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=new TextEncoder().encode(JSON.stringify(snap));const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes);const tx=db.transaction("state","readwrite");await reqResult(tx.objectStore("state").put({id:STATE_KEY,iv:iv.buffer,cipher,updatedAt:snap.updatedAt} satisfies CipherRecord));}
async function readInternal():Promise<{db:IDBDatabase;key:CryptoKey;snap:Snapshot}>{const db=await openDb();const key=await keyFor(db);const snap=(await readRaw(db,key))??emptySnapshot();return{db,key,snap};}
async function update(mutator:(snap:Snapshot)=>void){return serialize(async()=>{const {db,key,snap}=await readInternal();mutator(snap);await writeRaw(db,key,snap);db.close();return snap;});}

export async function getResumeCredentials(){const snap=await update(()=>{});return{createKey:snap.createKey,resumeSecret:snap.resumeSecret};}
export async function loadResumeCredentials(){try{const db=await openDb();const key=await keyFor(db);const snap=await readRaw(db,key);db.close();return snap?{createKey:snap.createKey,resumeSecret:snap.resumeSecret}:null;}catch{return null;}}
export async function loadOfflineWorkflow(){try{const {db,key,snap}=await readInternal();db.close();return snap.workflow;}catch{return null;}}
export async function saveOfflineWorkflow(workflow:PatientWorkflow){try{await update(s=>{s.workflow=workflow;});return true;}catch{return false;}}
export async function pendingMutationCount(){try{const {db,key,snap}=await readInternal();db.close();return snap.pending.length;}catch{return 0;}}
export async function listPendingMutations(){try{const {db,key,snap}=await readInternal();db.close();return snap.pending;}catch{return[] as PendingMutation[];}}

function containsForbiddenOffline(value:unknown,seen=new WeakSet<object>()):boolean{
 if(value==null)return false;
 if(typeof Blob!=="undefined"&&value instanceof Blob)return true;
 if(typeof File!=="undefined"&&value instanceof File)return true;
 if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return true;
 if(typeof value!=="object")return false;
 if(seen.has(value as object))return true;seen.add(value as object);
 if(Array.isArray(value))return value.some(v=>containsForbiddenOffline(v,seen));
 for(const [k,v] of Object.entries(value as Record<string,unknown>)){
   if(/abha(number|address)|full.*identifier|document|file|blob/i.test(k))return true;
   if(containsForbiddenOffline(v,seen))return true;
 }
 return false;
}
export async function enqueueJsonMutation(input:Omit<PendingMutation,"createdAt">){
 if(containsForbiddenOffline(input.body))throw new Error("SENSITIVE_IDENTITY_NOT_CACHEABLE");
 if(!input.path.startsWith("/api/patient/"))throw new Error("MUTATION_NOT_CACHEABLE");
 await update(s=>{if(s.pending.some(x=>x.id===input.id))return;if(s.pending.length>=100)throw new Error("OFFLINE_QUEUE_FULL");s.pending.push({...input,createdAt:Date.now()});});
}
export async function removePendingMutation(id:string){await update(s=>{s.pending=s.pending.filter(x=>x.id!==id);});}

export type ReplayResult={synced:number;remaining:number;sessionLost:boolean;conflict:boolean;networkLost:boolean};
export async function replayQueuedMutations(fetcher:typeof fetch=fetch):Promise<ReplayResult>{let synced=0;for(const m of await listPendingMutations()){let res:Response;try{res=await fetcher(m.path,{method:m.method,headers:{"content-type":"application/json","X-MediKiosk-Replay":"1"},body:m.body===undefined?undefined:JSON.stringify(m.body),cache:"no-store"});}catch{return{synced,remaining:await pendingMutationCount(),sessionLost:false,conflict:false,networkLost:true};}if(res.ok){await removePendingMutation(m.id);synced++;continue;}if(res.status===404||res.status===410)return{synced,remaining:await pendingMutationCount(),sessionLost:true,conflict:false,networkLost:false};if(res.status===400||res.status===403||res.status===409||res.status===422)return{synced,remaining:await pendingMutationCount(),sessionLost:false,conflict:true,networkLost:false};return{synced,remaining:await pendingMutationCount(),sessionLost:false,conflict:false,networkLost:false};}return{synced,remaining:0,sessionLost:false,conflict:false,networkLost:false};}

export async function saveFormDraft(key:string,value:unknown){if(/abha|document|file|blob/i.test(key)||containsForbiddenOffline(value))throw new Error("SENSITIVE_DRAFT_NOT_CACHEABLE");await update(s=>{s.drafts[key]=value;});}
export async function loadFormDraft<T>(key:string):Promise<T|null>{try{const {db,key:cryptoKey,snap}=await readInternal();db.close();return (key in snap.drafts?snap.drafts[key]:null) as T|null;}catch{return null;}}
export async function clearFormDraft(key:string){try{await update(s=>{delete s.drafts[key];});}catch{}}
export async function clearOfflineState(){return serialize(async()=>{if(typeof indexedDB==="undefined")return;const db=await openDb().catch(()=>null);if(!db)return;await new Promise<void>((resolve)=>{const tx=db.transaction(["state","keys"],"readwrite");tx.objectStore("state").delete(STATE_KEY);tx.objectStore("keys").delete(KEY_ID);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});db.close();});}
