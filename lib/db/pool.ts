import "server-only";
import { Pool, type PoolClient } from "pg";

let pool: Pool | null = null;
export function databaseConfigured(){ return Boolean(process.env.DATABASE_URL); }
function getPool(){
  if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if(!pool) pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,idleTimeoutMillis:20000,connectionTimeoutMillis:5000,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined});
  return pool;
}
export async function withTx<T>(scope:{sessionId?:string;ownerId?:string;staffId?:string;kioskId?:string;role?:"staff"|"kiosk"}, fn:(c:PoolClient)=>Promise<T>){
  const c=await getPool().connect();
  try{
    await c.query("BEGIN");
    if(scope.sessionId) await c.query("SELECT set_config('app.current_session',$1,true)",[scope.sessionId]);
    if(scope.ownerId) await c.query("SELECT set_config('app.current_owner',$1,true)",[scope.ownerId]);
    if(scope.staffId) await c.query("SELECT set_config('app.staff_id',$1,true)",[scope.staffId]);
    if(scope.kioskId) await c.query("SELECT set_config('app.kiosk_id',$1,true)",[scope.kioskId]);
    if(scope.role) await c.query("SELECT set_config('app.access_role',$1,true)",[scope.role]);
    const out=await fn(c); await c.query("COMMIT"); return out;
  }catch(e){ await c.query("ROLLBACK").catch(()=>{}); throw e; }finally{ c.release(); }
}
export const withKioskTx=<T>(sessionId:string,fn:(c:PoolClient)=>Promise<T>)=>withTx({sessionId,role:"kiosk"},fn);
export const withStaffTx=<T>(staffId:string|undefined,fn:(c:PoolClient)=>Promise<T>)=>withTx({staffId,role:"staff"},fn);
export const withOwnerTx=<T>(ownerId:string,fn:(c:PoolClient)=>Promise<T>)=>withTx({ownerId,role:"kiosk"},fn);
