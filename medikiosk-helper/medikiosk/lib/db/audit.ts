import type { PoolClient } from "pg";
export async function writeAudit(c:PoolClient, actor:{type:string;id?:string|null}, action:string, target?:{type:string;id?:string|null}, detail?:Record<string,unknown>){
  await c.query(`INSERT INTO audit_log(actor_type,actor_id,action,target_type,target_id,detail) VALUES($1,$2,$3,$4,$5,$6)`,[actor.type,actor.id??null,action,target?.type??null,target?.id??null,detail?JSON.stringify(detail):null]);
}
