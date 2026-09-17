type CaseBundle = { caseId:string; sessionId:string; language:string; complaint?:string|null; createdAt:string; completedAt?:string|null; documents?:Array<{id:string;name:string;mimeType?:string}>; practitioner:{id:string;displayName:string} };
function id(prefix:string,value:string){return `${prefix}-${value.replace(/[^a-zA-Z0-9.-]/g,"-").slice(0,50)}`;}
function full(type:string,id:string){return `https://medikiosk.invalid/fhir/${type}/${id}`;}
export function buildFhirBundle(input:CaseBundle){
 const patientId=id("patient",input.sessionId),encounterId=id("encounter",input.sessionId),compositionId=id("composition",input.sessionId),practitionerId=id("practitioner",input.practitioner.id);
 const patientUrl=full("Patient",patientId),encounterUrl=full("Encounter",encounterId),practitionerUrl=full("Practitioner",practitionerId);
 const entries:any[]=[
  {fullUrl:full("Composition",compositionId),resource:{resourceType:"Composition",id:compositionId,status:"final",type:{text:"Clinical history and pre-consultation summary"},subject:{reference:patientUrl},encounter:{reference:encounterUrl},author:[{reference:practitionerUrl,display:input.practitioner.displayName}],date:input.completedAt??input.createdAt,title:`MediKiosk pre-consultation ${input.caseId}`,section:[{title:"Chief complaint",text:{status:"generated",div:`<div xmlns="http://www.w3.org/1999/xhtml"><p>${escapeXml(input.complaint??"Not provided")}</p></div>`}}]}},
  {fullUrl:patientUrl,resource:{resourceType:"Patient",id:patientId,language:input.language}},
  {fullUrl:practitionerUrl,resource:{resourceType:"Practitioner",id:practitionerId,name:[{text:input.practitioner.displayName}]}},
  {fullUrl:encounterUrl,resource:{resourceType:"Encounter",id:encounterId,status:"finished",class:{system:"http://terminology.hl7.org/CodeSystem/v3-ActCode",code:"AMB",display:"ambulatory"},subject:{reference:patientUrl},period:{start:input.createdAt,end:input.completedAt??undefined}}}
 ];
 for(const doc of input.documents??[]){const docId=id("document",doc.id);entries.push({fullUrl:full("DocumentReference",docId),resource:{resourceType:"DocumentReference",id:docId,status:"current",subject:{reference:patientUrl},content:[{attachment:{title:doc.name,contentType:doc.mimeType??"application/octet-stream"}}]}});}
 return {resourceType:"Bundle",type:"document",timestamp:new Date().toISOString(),entry:entries};
}
function escapeXml(v:string){return v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[c]??c));}
export const ABDM_EXPORT_STATUS={status:"ABDM_READY_PREVIEW",liveAbdmConnected:false,profileValidated:false};
