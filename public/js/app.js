(function () {
  "use strict";

  const el = {
    geoStatus: document.getElementById("geo-status"),
    btnGeo: document.getElementById("btn-geo"),
    coords: document.getElementById("geo-coords"),
    poi: document.getElementById("poi-placeholder"),
    call112: document.getElementById("call-112"),
  };

  let watchId = null;
  let lastPos = null;

  function setStatus(html) {
    if (el.geoStatus) el.geoStatus.innerHTML = html;
  }

  function showToast(message, isError) {
    const t = document.createElement("div");
    t.className = "toast" + (isError ? " toast--err" : "");
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  function formatPos(pos) {
    return (
      pos.coords.latitude.toFixed(5) +
      "°, " +
      pos.coords.longitude.toFixed(5) +
      "°"
    );
  }

  function onPos(pos) {
    lastPos = pos;
    setStatus(
      "<strong>Position reçue.</strong> Les fiches d’hôpitaux proches, etc. seront connectées ici (données + carte)."
    );
    if (el.coords) {
      el.coords.classList.remove("hidden");
      el.coords.querySelector("strong").textContent = formatPos(pos);
    }
    if (el.poi) {
      el.poi.classList.remove("hidden");
    }
  }

  function onErr(err) {
    setStatus(
      "<strong>Impossible d’obtenir la position.</strong> Vérifiez le GPS et les autorisations du site."
    );
    showToast(err.message || "Erreur de géolocalisation", true);
  }

  function startGeolocation() {
    if (!navigator.geolocation) {
      showToast("Géolocalisation non prise en charge sur cet appareil.", true);
      return;
    }
    setStatus("Recherche de la position…");
    if (el.btnGeo) el.btnGeo.disabled = true;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onPos(pos);
        if (el.btnGeo) {
          el.btnGeo.textContent = "Localisation active";
          el.btnGeo.disabled = false;
        }
      },
      (err) => {
        onErr(err);
        if (el.btnGeo) el.btnGeo.disabled = false;
        if (el.btnGeo) el.btnGeo.textContent = "Autoriser la localisation";
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }

  if (el.btnGeo) {
    el.btnGeo.addEventListener("click", () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      el.btnGeo.textContent = "Localisation en cours…";
      startGeolocation();
    });
  }

  if (el.call112) {
    el.call112.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "tel:112";
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js", { scope: "./" })
        .then((reg) => {
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        })
        .catch(() => {});
    });
  }
})();
