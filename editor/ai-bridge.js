(function () {
  "use strict";

  const CONFIG_URL_KEY = "forge3d-ai-backend-url";
  const ACCESS_KEY = "forge3d-ai-access-key";
  const POLL_MS = 5000;

  function $(id) { return document.getElementById(id); }

  function message(text, kind) {
    const el = $("aiBridgeMessage");
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind || "info";
  }

  function setProgress(value, text) {
    const wrap = $("aiProgressWrap");
    const bar = $("aiProgressBar");
    const label = $("aiProgressText");
    if (!wrap || !bar || !label) return;
    wrap.classList.remove("hidden");
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    bar.style.width = pct + "%";
    label.textContent = text || (Math.round(pct) + "%");
  }

  function setBusy(busy) {
    const btn = document.querySelector('[data-action="ai-generate"]');
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? "Generazione in corso…" : "Genera 3D";
  }

  function normalizedBackendUrl() {
    let url = ($("aiBackendUrl")?.value || localStorage.getItem(CONFIG_URL_KEY) || "").trim();
    url = url.replace(/\/+$/, "");
    return url;
  }

  function accessKey() {
    return ($("aiAccessKey")?.value || sessionStorage.getItem(ACCESS_KEY) || "").trim();
  }

  function saveConfig() {
    const url = normalizedBackendUrl();
    const key = ($("aiAccessKey")?.value || "").trim();
    if (url) localStorage.setItem(CONFIG_URL_KEY, url);
    else localStorage.removeItem(CONFIG_URL_KEY);
    if (key) sessionStorage.setItem(ACCESS_KEY, key);
    else sessionStorage.removeItem(ACCESS_KEY);
    message(url ? "Configurazione backend salvata su questo browser." : "Inserisci l'URL del backend.", url ? "ok" : "warn");
  }

  function hydrateConfig() {
    if ($("aiBackendUrl")) $("aiBackendUrl").value = localStorage.getItem(CONFIG_URL_KEY) || "";
    if ($("aiAccessKey")) $("aiAccessKey").value = sessionStorage.getItem(ACCESS_KEY) || "";
  }

  async function api(path, options) {
    const base = normalizedBackendUrl();
    const key = accessKey();
    if (!base) throw new Error("Manca l'URL del backend FORGE3D.");
    if (!key) throw new Error("Manca la chiave di accesso FORGE3D.");

    const response = await fetch(base + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Forge-Key": key,
        ...(options && options.headers ? options.headers : {})
      }
    });

    let data;
    try { data = await response.json(); }
    catch { data = null; }

    if (!response.ok || !data?.ok) {
      throw new Error(data?.details || data?.error || ("Errore backend HTTP " + response.status));
    }
    return data;
  }

  function fileToCompressedJpeg(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Impossibile leggere " + file.name));
      };
      img.src = url;
    });
  }

  async function prepareImages(files) {
    const list = Array.from(files || []).slice(0, 4);
    if (!list.length) throw new Error("Carica almeno una fotografia.");
    message("Ottimizzo le immagini prima dell'invio…", "info");
    const result = [];
    for (const file of list) {
      result.push(await fileToCompressedJpeg(file, 1280, 0.82));
    }
    return result;
  }

  function selectedAiType() {
    return document.querySelector("[data-ai-type].active")?.dataset.aiType || "object";
  }

  function selectedQuality() {
    return document.querySelector('input[name="quality"]:checked')?.value || "rapid";
  }

  async function importGlbFromUrl(url, type) {
    message("Scarico il GLB generato e lo inserisco nella scena…", "info");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Download GLB non riuscito.");
    const blob = await response.blob();
    const filename =
      type === "person" ? "personaggio-ai.glb" :
      type === "room" ? "stanza-ai.glb" :
      "oggetto-ai.glb";

    const file = new File([blob], filename, { type: "model/gltf-binary" });
    const input = $("importFile");
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function pollTask(id, kind, type) {
    let failures = 0;
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
      let task;
      try {
        task = await api(
          "?action=status&id=" + encodeURIComponent(id) + "&kind=" + encodeURIComponent(kind),
          { method: "GET" }
        );
        failures = 0;
      } catch (error) {
        failures++;
        if (failures >= 3) throw error;
        message("Connessione momentaneamente interrotta; riprovo…", "warn");
        continue;
      }

      const pct = Number(task.progress) || 0;
      setProgress(pct, "Generazione 3D · " + Math.round(pct) + "%");
      const status = String(task.status || "").toUpperCase();

      if (status === "SUCCEEDED") {
        if (!task.modelUrl) throw new Error("Generazione completata ma GLB non disponibile.");
        setProgress(100, "Completato · importazione nella scena");
        await importGlbFromUrl(task.modelUrl, type);
        message("Modello 3D generato e importato nella scena.", "ok");
        return;
      }

      if (status === "FAILED" || status === "CANCELED") {
        throw new Error(task.error || ("Generazione " + status.toLowerCase() + "."));
      }

      message("Meshy sta creando il modello 3D… " + Math.round(pct) + "%", "info");
    }
  }

  async function generate() {
    const files = $("aiImages")?.files;
    const type = selectedAiType();
    const quality = selectedQuality();

    if (!files || !files.length) throw new Error("Carica almeno una fotografia.");
    if (quality === "precision" && files.length < 2) {
      throw new Error("Per Alta precisione carica almeno 2 fotografie.");
    }

    saveConfig();
    setBusy(true);
    setProgress(2, "Preparazione immagini");

    try {
      const images = await prepareImages(files);
      setProgress(5, "Invio al motore AI");
      message(
        images.length > 1
          ? "Avvio ricostruzione multi‑immagine…"
          : "Avvio ricostruzione da fotografia…",
        "info"
      );

      const task = await api("?action=start", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          images,
          type,
          quality
        })
      });

      setProgress(8, "Task creato");
      message("Task avviato. FORGE3D seguirà automaticamente l'avanzamento.", "info");
      await pollTask(task.id, task.kind, type);
    } finally {
      setBusy(false);
    }
  }

  async function testBackend() {
    saveConfig();
    try {
      message("Verifico il backend…", "info");
      await api("?action=health", { method: "GET" });
      message("Backend collegato e pronto.", "ok");
    } catch (error) {
      message(error.message, "error");
    }
  }

  function interceptActions(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    if (actionEl.dataset.action !== "ai-generate") return;

    // Capture phase prevents the placeholder handler in app.js from running.
    event.preventDefault();
    event.stopImmediatePropagation();

    generate().catch(function (error) {
      console.error("FORGE3D AI:", error);
      message(error.message || "Generazione non riuscita.", "error");
      setProgress(0, "Errore");
      setBusy(false);
    });
  }

  document.addEventListener("click", interceptActions, true);

  document.addEventListener("DOMContentLoaded", function () {
    hydrateConfig();

    $("aiSaveBackend")?.addEventListener("click", saveConfig);
    $("aiTestBackend")?.addEventListener("click", testBackend);

    const modalButton = document.querySelector('[data-action="ai-photo"]');
    modalButton?.addEventListener("click", function () {
      hydrateConfig();
    });
  });
})();