(function () {
  "use strict";

  const SPACE_URL = "https://huggingface.co/spaces/stabilityai/stable-fast-3d";
  const SIGNUP_URL = "https://huggingface.co/join";

  function openExternal(url) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = url;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const openGenerator = document.getElementById("openFreeGenerator");
    const importResult = document.getElementById("importFreeResult");
    const openAccount = document.getElementById("openHFAccount");
    const importFile = document.getElementById("importFile");

    openGenerator?.addEventListener("click", function () {
      openExternal(SPACE_URL);
    });

    openAccount?.addEventListener("click", function () {
      openExternal(SIGNUP_URL);
    });

    importResult?.addEventListener("click", function () {
      if (!importFile) return;
      importFile.accept = ".glb,.gltf";
      importFile.click();
    });
  });
})();