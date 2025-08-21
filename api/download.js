// api/download.js
export const config = { runtime: "edge" };

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if (!url) return json(400, { ok: false, error: "Missing ?url" });
    if (!/tiktok\.com\/|https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) {
      return json(400, { ok: false, error: "Provide a valid TikTok link" });
    }

    const providers = [fromTiklyDown, fromTikwm, fromVx];
    let lastErr = null;

    for (const get of providers) {
      try {
        const d = await get(url);
        if (d && (d.video?.hd || d.video?.nowm || d.video?.wm || d.audio?.mp3)) {
          return json(200, { ok: true, source: d.source, ...d });
        }
      } catch (e) {
        lastErr = e;
      }
    }

    return json(502, { ok: false, error: "All providers failed", detail: String(lastErr || "") });
  } catch (e) {
    return json(500, { ok: false, error: "Server error", detail: String(e) });
  }
}

// ---------- Providers ----------

async function fromTiklyDown(u) {
  const r = await fetch("https://api.tiklydown.eu.org/api/download?url=" + encodeURIComponent(u));
  if (!r.ok) throw new Error("tiklydown " + r.status);
  const j = await r.json();

  // Collect all URLs found in the response
  const urls = [];
  (function walk(o) {
    if (!o) return;
    if (typeof o === "string") {
      if (/^https?:\/\//i.test(o)) urls.push(o);
      return;
    }
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
    author: {
      username: first(j, ["author", "uniqueId"]) || "",
      name: first(j, ["nickname", "author_name"]) || "",
    },
    cover: imgs[0] || null,
    audio: mp3s.length ? { mp3: mp3s[0] } : null,
    video: {
      hd: pickHD(mp4s),
      nowm: pickHD(mp4s),
      wm: mp4s.find((x) => /wm|watermark/i.test(x)) || null,
    },
  };
}

async function fromTikwm(u) {
  const form = new URLSearchParams({ url: u, hd: "1" });
  const r = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form,
  });
  if (!r.ok) throw new Error("tikwm " + r.status);
  const j = await r.json();
  const d = j?.data;
  if (!d) throw new Error("tikwm no data");

  return {
    source: "tikwm",
    title: d.title || "",
    id: d.id || d.aweme_id || "",
    author: {
      username: d.author?.unique_id || d.author?.uniqueId || "",
      name: d.author?.nickname || "",
      avatar: d.author?.avatar || d.author?.avatar_thumb || null,
    },
    cover: d.cover || d.origin_cover || d.dynamic_cover || null,
    audio: d.music ? { mp3: d.music } : null,
    video: { hd: d.hdplay || null, nowm: d.play || null, wm: d.wmplay || null },
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

  return {
    source: "vxtiktok",
    title,
    id: u.match(/\/video\/(\d+)/)?.[1] || "",
    author: {},
    cover,
    audio: null,
    video: { hd: mp4, nowm: mp4, wm: null },
  };
}

// ---------- helpers ----------
function first(obj, keys) {
  if (!obj) return null;
  for (const k of keys) if (Object.hasOwn(obj, k) && obj[k]) return obj[k];
  if (typeof obj === "object") {
    for (const v of Object.values(obj)) {
      const r = typeof v === "object" ? first(v, keys) : null;
      if (r) return r;
    }
  }
  return null;
}
