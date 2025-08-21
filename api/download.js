// api/download.js (Node serverless/ @vercel/node style)
module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost"); // base needed on vercel
    const url = u.searchParams.get("url");
    if (!url) return j(res, 400, { ok: false, error: "Missing ?url" });
    if (!/tiktok\.com\/|https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) {
      return j(res, 400, { ok: false, error: "Provide a valid TikTok link" });
    }

    const chain = [fromTiklyDown, fromTikwm, fromVx];
    let lastErr = null;
    for (const fn of chain) {
      try {
        const d = await fn(url);
        if (d && (d.video?.hd || d.video?.nowm || d.video?.wm || d.audio?.mp3)) {
          return j(res, 200, { ok: true, source: d.source, ...d });
        }
      } catch (e) { lastErr = e; }
    }
    return j(res, 502, { ok: false, error: "All providers failed", detail: String(lastErr || "") });
  } catch (e) {
    return j(res, 500, { ok: false, error: "Server error", detail: String(e) });
  }
};

function j(res, status, body) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

// ---------- Providers ----------
async function fromTiklyDown(u) {
  const r = await fetch("https://api.tiklydown.eu.org/api/download?url=" + encodeURIComponent(u));
  if (!r.ok) throw new Error("tiklydown " + r.status);
  const j = await r.json();

  const urls = [];
  (function walk(o) {
    if (!o) return;
    if (typeof o === "string") { if (/^https?:\/\//i.test(o)) urls.push(o); return; }
    if (Array.isArray(o)) return o.forEach(walk);
    if (typeof o === "object") for (const k in o) walk(o[k]);
  })(j);

  const mp4s = urls.filter((x) => /\.mp4/i.test(x));
  const mp3s = urls.filter((x) => /\.mp3/i.test(x));
  const imgs = urls.filter((x) => /\.(jpg|jpeg|png|webp)/i.test(x));
  const pickHD = (arr) => arr.find((x) => /no.?wm|nowm|hd|1080/i.test(x)) || arr[0] || null;

  return {
    source: "tiklydown",
    title: first(j, ["title", "desc", "description"]) || "",
    id: first(j, ["id", "video_id", "item_id"]) || "",
    author: { username: first(j, ["author", "uniqueId"]) || "", name: first(j, ["nickname", "author_name"]) || "" },
    cover: imgs[0] || null,
    audio: mp3s.length ? { mp3: mp3s[0] } : null,
    video: { hd: pickHD(mp4s), nowm: pickHD(mp4s), wm: mp4s.find((x) => /wm|watermark/i.test(x)) || null }
  };
}

async function fromTikwm(u) {
  const body = new URLSearchParams({ url: u, hd: "1" });
  const r = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body
  });
  if (!r.ok) throw new Error("tikwm " + r.status);
  const j = await r.json(); const d = j?.data; if (!d) throw new Error("tikwm no data");

  return {
    source: "tikwm",
    title: d.title || "",
    id: d.id || d.aweme_id || "",
    author: { username: d.author?.unique_id || d.author?.uniqueId || "", name: d.author?.nickname || "", avatar: d.author?.avatar || d.author?.avatar_thumb || null },
    cover: d.cover || d.origin_cover || d.dynamic_cover || null,
    audio: d.music ? { mp3: d.music } : null,
    video: { hd: d.hdplay || null, nowm: d.play || null, wm: d.wmplay || null }
  };
}

async function fromVx(u) {
  const vx = u.replace(/https?:\/\/(www\.)?tiktok\.com/i, "https://vxtiktok.com");
  const r = await fetch(vx, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("vx " + r.status);
  const h = await r.text();

  const mp4 =
    h.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)/i)?.[1] ||
    h.match(/"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i)?.[1] ||
    h.match(/https?:\/\/[^"'<>]+\.mp4[^"'<>]*/i)?.[0];

  if (!mp4) throw new Error("vx no mp4");

  const cover = h.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || null;
  const title = h.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)?.[1] || "";

  return { source: "vxtiktok", title, id: u.match(/\/video\/(\d+)/)?.[1] || "", author: {}, cover, audio: null, video: { hd: mp4, nowm: mp4, wm: null } };
}

// helpers
function first(obj, keys) {
  if (!obj) return null;
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k]) return obj[k];
  if (typeof obj === "object") {
    for (const v of Object.values(obj)) {
      const r = typeof v === "object" ? first(v, keys) : null;
      if (r) return r;
    }
  }
  return null;
}
