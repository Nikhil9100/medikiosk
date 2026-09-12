const API = "https://medikiosk-five-delta.vercel.app";

async function run() {
  let r = await fetch(API + "/api/patient/session", { method: 'POST', body: JSON.stringify({}) });
  const cookie = r.headers.get('set-cookie');
  console.log("POST session:", r.status);
  const headers = { 'Cookie': cookie, 'Content-Type': 'application/json' };

  r = await fetch(API + "/api/patient/session", { method: 'PATCH', headers, body: JSON.stringify({ language: 'en', workflowStep: 'consent' }) });
  console.log("3. Language", r.status);

  r = await fetch(API + "/api/patient/session", { method: 'PATCH', headers, body: JSON.stringify({ consentStatus: 'ACCEPTED', workflowStep: 'identity' }) });
  console.log("4. Consent", r.status);

  r = await fetch(API + "/api/patient/identity", { method: 'POST', headers, body: JSON.stringify({ method: 'skip' }) });
  console.log("5. Identity", r.status);

  r = await fetch(API + "/api/patient/session", { method: 'PATCH', headers, body: JSON.stringify({ workflowStep: 'complaint' }) });
  r = await fetch(API + "/api/patient/session", { method: 'PATCH', headers, body: JSON.stringify({ complaintText: 'I have a headache', workflowStep: 'anatomy' }) });
  console.log("6. Complaint", r.status);

  r = await fetch(API + "/api/patient/session", { method: 'PATCH', headers, body: JSON.stringify({ bodyRegion: 'head', bodySubregion: 'front', workflowStep: 'symptoms' }) });
  console.log("7. Anatomy", r.status);

  r = await fetch(API + "/api/patient/complaints", { method: 'POST', headers, body: JSON.stringify({ complaintText: 'Also nausea' }) });
  console.log("8. Additional Complaint", r.status);

  r = await fetch(API + "/api/patient/session", { method: 'PATCH', headers, body: JSON.stringify({ workflowStep: 'interview' }) });
  r = await fetch(API + "/api/patient/session", { method: 'PATCH', headers, body: JSON.stringify({ interviewData: { "How long?": "2 days" } }) });
  console.log("9. Interview", r.status);

  r = await fetch(API + "/api/patient/complete", { method: 'POST', headers, body: JSON.stringify({}) });
  console.log("13. Complete", r.status);
}
run().catch(console.error);
