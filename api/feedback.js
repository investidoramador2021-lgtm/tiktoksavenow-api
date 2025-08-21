// api/feedback.js – accepts POST JSON and logs to console or temp file
export const config = { runtime: "edge" };

function J(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: {"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*"}
  });
}

export default async function handler(req){
  if(req.method !== "POST") return J(405,{ok:false,error:"Method not allowed"});
  try{
    const data = await req.json();
    const entry = {
      type: (data.type||"other").toString().slice(0,30),
      message: (data.message||"").toString().slice(0,4000),
      contact: (data.contact||"").toString().slice(0,200),
      path: (data.path||"").toString().slice(0,200),
      ua: (data.ua||"").toString().slice(0,400),
      ts: new Date().toISOString()
    };
    // Note: Edge runtime is stateless. We emit to console for log capture.
    console.log("feedback", entry);
    return J(200,{ok:true});
  }catch(e){
    return J(400,{ok:false,error:"Bad JSON"});
  }
}
