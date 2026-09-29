// FORGE3D secure Meshy proxy for Vercel.
// Environment variables required:
// MESHY_API_KEY      = Meshy API key
// FORGE3D_ACCESS_KEY = private password chosen by the owner
// ALLOWED_ORIGIN     = https://klarkmulas.github.io (optional; defaults to this)

const MESHY_BASE = "https://api.meshy.ai/openapi/v1";

function allowedOrigin(req) {
  const configured = process.env.ALLOWED_ORIGIN || "https://klarkmulas.github.io";
  const origin = req.headers.origin || "";
  const allowed = configured.split(",").map(v => v.trim()).filter(Boolean);
  if (!origin) return allowed[0] || "*";
  if (allowed.includes("*") || allowed.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function applyCors(req, res) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Forge-Key");
  res.setHeader("Access-Control-Max-Age", "86400");
  return origin;
}

function fail(res, status, message, details) {
  return res.status(status).json({
    ok: false,
    error: message,
    ...(details ? { details } : {})
  });
}

function authorized(req) {
  const expected = process.env.FORGE3D_ACCESS_KEY;
  if (!expected) return false;
  const provided = req.headers["x-forge-key"];
  return typeof provided === "string" && provided.length > 0 && provided === expected;
}

function validDataUri(value) {
  return typeof value === "string" &&
    /^data:image\/(jpeg|jpg|png);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
}

async function meshyFetch(path, init = {}) {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY_NOT_CONFIGURED");

  const response = await fetch(MESHY_BASE + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text }; }

  if (!response.ok) {
    const err = new Error(
      data?.message ||
      data?.error ||
      data?.task_error?.message ||
      ("Meshy HTTP " + response.status)
    );
    err.status = response.status;
    err.provider = data;
    throw err;
  }
  return data;
}

async function startTask(body) {
  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  const type = ["object", "person", "room"].includes(body.type) ? body.type : "object";
  const quality = body.quality === "precision" ? "precision" : "rapid";

  if (!images.length) {
    const e = new Error("Carica almeno una fotografia.");
    e.status = 400;
    throw e;
  }
  if (!images.every(validDataUri)) {
    const e = new Error("Formato immagine non valido. Sono ammessi JPEG e PNG.");
    e.status = 400;
    throw e;
  }

  // Defensive request-size check after client-side compression.
  const totalChars = images.reduce((sum, img) => sum + img.length, 0);
  if (totalChars > 3_500_000) {
    const e = new Error("Immagini troppo pesanti dopo la compressione.");
    e.status = 413;
    throw e;
  }

  const multi = images.length > 1;
  let endpoint;
  let payload;

  if (multi) {
    endpoint = "/multi-image-to-3d";
    payload = {
      image_urls: images,
      ai_model: "latest",
      geometry_resolution: quality === "precision" ? "2k" : "standard",
      should_texture: true,
      enable_pbr: true,
      target_formats: ["glb"]
    };
  } else {
    endpoint = "/image-to-3d";
    payload = {
      image_url: images[0],
      ai_model: "latest",
      should_texture: true,
      enable_pbr: true,
      should_remesh: true,
      target_polycount: type === "room" ? 150000 : 100000,
      target_formats: ["glb"],
      moderation: true,
      ...(type === "person" ? { pose_mode: "a-pose" } : {})
    };
  }

  const data = await meshyFetch(endpoint, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const id = data?.result || data?.id;
  if (!id) throw new Error("Meshy non ha restituito l'ID del task.");

  return {
    ok: true,
    id,
    kind: multi ? "multi" : "single",
    type,
    quality
  };
}

async function getTask(id, kind) {
  if (!id || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    const e = new Error("Task ID non valido.");
    e.status = 400;
    throw e;
  }

  const path = kind === "multi"
    ? "/multi-image-to-3d/" + encodeURIComponent(id)
    : "/image-to-3d/" + encodeURIComponent(id);

  const data = await meshyFetch(path, { method: "GET" });

  return {
    ok: true,
    id: data.id || id,
    status: data.status || "UNKNOWN",
    progress: Number.isFinite(Number(data.progress)) ? Number(data.progress) : 0,
    modelUrl: data.model_urls?.glb || null,
    thumbnailUrl: data.thumbnail_url || null,
    error: data.task_error?.message || null
  };
}

export default async function handler(req, res) {
  const origin = applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(origin ? 204 : 403).end();
  if (!origin) return fail(res, 403, "Origine non autorizzata.");

  if (!authorized(req)) {
    return fail(res, 401, "Chiave di accesso FORGE3D non valida.");
  }

  if (!process.env.MESHY_API_KEY) {
    return fail(res, 503, "Backend non configurato: manca MESHY_API_KEY.");
  }

  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "health");
      if (action === "health") {
        return res.status(200).json({ ok: true, service: "forge3d-meshy", configured: true });
      }
      if (action === "status") {
        const result = await getTask(String(req.query.id || ""), String(req.query.kind || "single"));
        return res.status(200).json(result);
      }
      return fail(res, 400, "Azione GET non valida.");
    }

    if (req.method === "POST") {
      const action = String(req.query.action || req.body?.action || "start");
      if (action !== "start") return fail(res, 400, "Azione POST non valida.");
      const result = await startTask(req.body || {});
      return res.status(200).json(result);
    }

    return fail(res, 405, "Metodo non supportato.");
  } catch (error) {
    console.error("FORGE3D Meshy proxy:", error);
    const status = Number(error.status) || 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    return fail(
      res,
      safeStatus,
      error.message || "Errore backend.",
      error.provider?.task_error?.message || error.provider?.message || undefined
    );
  }
}
