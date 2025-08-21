// api/download.js – Free providers with fallback (TiklyDown, TikWM, VX TikTok)
export const config = { runtime: "edge" };

function J(status, body){
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "access-control-allow-origin":"*", "cache-control":"no-store" } });
}

export default async function handler(req){
  try{
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if(!url) return J(400,{ok:false,error:"Missing ?url"});
    if(!/tiktok\.com\/|https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) return J(400,{ok:false,error:"Provide a valid TikTok link"});

    const chain = [fromTiklyDown, fromTikwm, fromVx];
    let last;
    for(const fn of chain){
      try{
        const d = await fn(url);
        if(d && (d.video?.hd || d.video?.nowm || d.video?.wm)) return J(200,{ok:true,source:d.source,...d});
      }catch(e){ last = e; }
    }
    return J(502,{ok:false,error:"All providers failed", detail:String(last||"")});
  }catch(e){
    return J(500,{ok:false,error:"Server error", detail:String(e)});
  }
}

async function fromTiklyDown(u){
  const r = await fetch("https://api.tiklydown.eu.org/api/download?url="+encodeURIComponent(u));
  if(!r.ok) throw new Error("tiklydown "+r.status);
  const j = await r.json();
  const links = collect(j);
  const mp4 = links.find(x=>/\.mp4/i.test(x));
  const nowm = links.find(x=>/no.?wm|nowm|hd/i.test(x)) || mp4;
  const wm = links.find(x=>/wm|watermark/i.test(x)) || null;
  const mp3 = links.find(x=>/\.mp3/i.test(x)) || null;
  const img = links.find(x=>/\.(jpg|jpeg|png|webp)/i.test(x)) || null;
  return {{ source:"tiklydown", title:first(j,["title","desc","description"])||"", id:first(j,["id","video_id","item_id"])||"", author:{{username:first(j,["author","uniqueId"])||"", name:first(j,["nickname","author_name"])||""}}, cover:img, audio: mp3?{{mp3}}:null, video:{{ hd: nowm, nowm: nowm, wm }} }};
}
async function fromTikwm(u){
  const form = new URLSearchParams({url:u, hd:"1"});
  const r = await fetch("https://www.tikwm.com/api/", { method:"POST", headers:{{"content-type":"application/x-www-form-urlencoded"}}, body:form });
  if(!r.ok) throw new Error("tikwm "+r.status);
  const j = await r.json(); if(!j?.data) throw new Error("tikwm no data");
  const d = j.data;
  return {{ source:"tikwm", title:d.title||"", id:d.id||d.aweme_id||"", author:{{ username:d.author?.unique_id||d.author?.uniqueId||"", name:d.author?.nickname||"" }}, cover:d.cover||d.origin_cover||null, audio: d.music?{{mp3:d.music}}:null, video:{{ hd:d.hdplay||null, nowm:d.play||null, wm:d.wmplay||null }} }};
}
async function fromVx(u){
  const vx = u.replace(/https?:\/\/(www\.)?tiktok\.com/i,"https://vxtiktok.com");
  const r = await fetch(vx, { headers:{{"user-agent":"Mozilla/5.0"}} });
  if(!r.ok) throw new Error("vx "+r.status);
  const h = await r.text();
  const mp4 = (h.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)/i)?.[1]) || (h.match(/"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i)?.[1]) || (h.match(/https?:\/\/[^"'<>]+\.mp4[^"'<>]*/i)?.[0]);
  if(!mp4) throw new Error("vx no mp4");
  const cover = (h.match(/<meta\\s+property=["']og:image["']\\s+content=["']([^"']+)/i)?.[1]) || null;
  const title = (h.match(/<meta\\s+property=["']og:title["']\\s+content=["']([^"']+)/i)?.[1]) || "";
  return {{ source:"vxtiktok", title, id:(u.match(/\\/video\\/(\\d+)/)?.[1])||"", author:{{}}, cover, audio:null, video:{{ hd:mp4, nowm:mp4, wm:null }} }};
}
function collect(obj, out=[]){{ if(!obj) return out; if(typeof obj==="string"){{ if(/^https?:\\/\\//i.test(obj)) out.push(obj); return out; }} if(Array.isArray(obj)) return obj.reduce((a,v)=>collect(v,a),out); if(typeof obj==="object") for(const k in obj) collect(obj[k],out); return out; }}
function first(obj, keys){{ if(!obj) return null; for(const k of keys) if(Object.hasOwn(obj,k) && obj[k]) return obj[k]; if(typeof obj==="object") for(const v of Object.values(obj)){{ const r = typeof v==="object" ? first(v,keys):null; if(r) return r; }} return null; }}
