import type { PoolClient } from "pg";
import { detectSafetySignals } from "./safety-signals";
export type Citation={corpus:"MODERN_MEDICINE"|"AYURVEDA";title:string;source:string;section:string|null};
export async function answerPatient(c:PoolClient,sessionId:string,message:string,clientMutationId:string){
  const safety=detectSafetySignals([message]);
  const terms=message.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(x=>x.length>3).slice(0,8);
  const search=async(corpus:"MODERN_MEDICINE"|"AYURVEDA")=>terms.length?c.query(`SELECT d.title,d.source,d.section,k.content FROM knowledge_chunks k JOIN knowledge_documents d ON d.id=k.document_id WHERE d.corpus=$1 AND k.search_vector @@ plainto_tsquery('simple',$2) ORDER BY ts_rank(k.search_vector,plainto_tsquery('simple',$2)) DESC LIMIT 2`,[corpus,terms.join(" ")]):{rows:[]} as any;
  const [modern,ayurveda]=await Promise.all([search("MODERN_MEDICINE"),search("AYURVEDA")]);
  const citations:Citation[]=[...modern.rows.map((r:any)=>({corpus:"MODERN_MEDICINE" as const,title:r.title,source:r.source,section:r.section})),...ayurveda.rows.map((r:any)=>({corpus:"AYURVEDA" as const,title:r.title,source:r.source,section:r.section}))];
  let reply=safety.length?`${safety[0].summary} I cannot diagnose this. Please alert hospital staff now.`:"I can provide general information to help you describe your history, but I cannot diagnose or prescribe.";
  if(!safety.length&&modern.rows[0]) reply+=` Reference information: ${String(modern.rows[0].content).slice(0,420)}`;
  if(!safety.length&&ayurveda.rows[0]) reply+=` Ayurveda reference: ${String(ayurveda.rows[0].content).slice(0,260)}`;
  if(!safety.length&&!citations.length) reply+=" I do not have a reliable reference match for that question. Please tell the doctor directly.";
  await c.query(`INSERT INTO chat_messages(session_id,role,content,client_mutation_id) VALUES($1,'PATIENT',$2,$3)`,[sessionId,message,clientMutationId]);
  await c.query(`INSERT INTO chat_messages(session_id,role,content,intent,citations,provider,client_mutation_id) VALUES($1,'ASSISTANT',$2,$3,$4,'deterministic-kb',$5)`,[sessionId,reply,safety.length?"SAFETY":"INFORMATION",JSON.stringify(citations),clientMutationId]);
  return{reply,citations,safety,idempotent:false};
}
