(function () {
  "use strict";

  var el = {
    geoStatus: document.getElementById("geo-status"),
    btnGeo: document.getElementById("btn-geo"),
    coords: document.getElementById("geo-coords"),
    hospitalsList: document.getElementById("hospitals-list"),
    hospitalsCard: document.getElementById("section-hospitals"),
    hospitalsStatus: document.getElementById("hospitals-status"),
    btnRefreshHospitals: document.getElementById("btn-refresh-hospitals"),
    urgenceButtons: document.getElementById("urgence-buttons"),
    urgenceHint: document.getElementById("urgence-hint"),
    urgenceCountry: document.getElementById("urgence-country"),
  };

  var watchId = null;
  var lastPos = null;
  var countryCode = null;
  var countryName = null;
  var nearbyLoaded = false;

  function setStatus(html) {
    if (el.geoStatus) el.geoStatus.innerHTML = html;
  }

  function showToast(message, isError) {
    var t = document.createElement("div");
    t.className = "toast" + (isError ? " toast--err" : "");
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 5000);
  }

  function formatPos(pos) {
    return (
      pos.coords.latitude.toFixed(5) +
      "°, " +
      pos.coords.longitude.toFixed(5) +
      "°"
    );
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLon = ((lon2 - lon1) * Math.PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function telHref(num) {
    var digits = String(num).replace(/\s/g, "");
    return "tel:" + digits;
  }

  function renderEmergency() {
    if (!el.urgenceButtons || !window.InfosEmergency) return;
    var info = window.InfosEmergency.getEmergencyForCountry(countryCode || "");
    if (el.urgenceCountry) {
      if (countryName && countryCode) {
        el.urgenceCountry.textContent = countryName + " (" + countryCode + ")";
      } else if (lastPos && !countryCode) {
        el.urgenceCountry.textContent =
          "Pays non identifié automatiquement — numéros génériques ci-dessous.";
      } else {
        el.urgenceCountry.textContent =
          "Localisation requise pour adapter les numéros au pays détecté.";
      }
    }
    el.urgenceButtons.innerHTML = "";
    info.lines.forEach(function (line) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-tel";
      b.textContent = line.num;
      b.title = line.label;
      b.addEventListener("click", function (e) {
        e.preventDefault();
        window.location.href = telHref(line.num);
      });
      var wrap = document.createElement("div");
      wrap.className = "tel-block";
      var lab = document.createElement("span");
      lab.className = "tel-label";
      lab.textContent = line.label;
      wrap.appendChild(b);
      wrap.appendChild(lab);
      el.urgenceButtons.appendChild(wrap);
    });
    if (el.urgenceHint) {
      el.urgenceHint.textContent = info.hint || "";
      el.urgenceHint.classList.toggle("hidden", !info.hint);
    }
  }

  function reverseGeocode(lat, lon) {
    var url =
      "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lon) +
      "&localityLanguage=fr";
    return fetch(url, { method: "GET", cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("Géocodage indisponible");
      return r.json();
    });
  }

  function fetchHospitals(lat, lon) {
    var q =
      "[out:json][timeout:25];(" +
      'node["amenity"="hospital"](around:18000,' +
      lat +
      "," +
      lon +
      ');' +
      'way["amenity"="hospital"](around:18000,' +
      lat +
      "," +
      lon +
      ');' +
      ");out center 24;";
    return fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "data=" + encodeURIComponent(q),
    }).then(function (r) {
      if (!r.ok) throw new Error("Carte des hôpitaux indisponible");
      return r.json();
    });
  }

  function parseHospitalElements(json, lat, lon) {
    var els = json.elements || [];
    var rows = [];
    els.forEach(function (e) {
      var plat = e.lat;
      var plon = e.lon;
      if (e.type === "way" && e.center) {
        plat = e.center.lat;
        plon = e.center.lon;
      }
      if (plat == null || plon == null) return;
      var name = (e.tags && e.tags.name) || "Établissement hospitalier";
      var d = haversineKm(lat, lon, plat, plon);
      rows.push({
        name: name,
        km: d,
        lat: plat,
        lon: plon,
      });
    });
    rows.sort(function (a, b) {
      return a.km - b.km;
    });
    var seen = {};
    var uniq = [];
    rows.forEach(function (r) {
      var k = r.name + "|" + r.lat.toFixed(4) + "|" + r.lon.toFixed(4);
      if (seen[k]) return;
      seen[k] = 1;
      uniq.push(r);
    });
    return uniq.slice(0, 10);
  }

  function renderHospitals(rows) {
    if (!el.hospitalsList) return;
    el.hospitalsList.innerHTML = "";
    if (!rows.length) {
      el.hospitalsList.innerHTML =
        '<li class="poi-empty">Aucun hôpital cartographié dans ~18 km (données OpenStreetMap).</li>';
      return;
    }
    rows.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "poi-item";
      var left = document.createElement("div");
      left.className = "poi-item-main";
      var title = document.createElement("strong");
      title.textContent = r.name;
      var sub = document.createElement("span");
      sub.className = "poi-km";
      sub.textContent = "≈ " + (r.km < 1 ? (r.km * 1000).toFixed(0) + " m" : r.km.toFixed(1) + " km");
      left.appendChild(title);
      left.appendChild(sub);
      var a = document.createElement("a");
      a.className = "poi-link";
      a.href =
        "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" +
        encodeURIComponent(
          lastPos.coords.latitude + "," + lastPos.coords.longitude
        ) +
        "&destination=" +
        encodeURIComponent(r.lat + "," + r.lon);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Itinéraire";
      li.appendChild(left);
      li.appendChild(a);
      el.hospitalsList.appendChild(li);
    });
  }

  function loadNearbyData(pos) {
    if (!pos || nearbyLoaded) return;
    nearbyLoaded = true;
    var lat = pos.coords.latitude;
    var lon = pos.coords.longitude;

    reverseGeocode(lat, lon)
      .then(function (data) {
        countryCode = data.countryCode || null;
        countryName = data.countryName || data.principalSubdivision || null;
        renderEmergency();
      })
      .catch(function () {
        countryCode = null;
        countryName = null;
        renderEmergency();
      });

    if (el.hospitalsStatus) el.hospitalsStatus.textContent = "Chargement des hôpitaux à proximité…";
    if (el.hospitalsCard) el.hospitalsCard.classList.remove("hidden");

    fetchHospitals(lat, lon)
      .then(function (json) {
        var rows = parseHospitalElements(json, lat, lon);
        renderHospitals(rows);
        if (el.hospitalsStatus) {
          el.hospitalsStatus.textContent =
            "Données © contributeurs OpenStreetMap — vérifier sur place / auprès des services.";
        }
      })
      .catch(function () {
        if (el.hospitalsStatus) {
          el.hospitalsStatus.textContent =
            "Impossible de charger les hôpitaux (réseau ou serveur Overpass). Réessayez plus tard.";
        }
        showToast("Échec du chargement des hôpitaux.", true);
      });
  }

  function onPos(pos) {
    lastPos = pos;
    setStatus(
      "<strong>Position reçue.</strong> Numéros adaptés au pays (si détecté) et hôpitaux à proximité."
    );
    if (el.coords) {
      el.coords.classList.remove("hidden");
      el.coords.querySelector("strong").textContent = formatPos(pos);
    }
    loadNearbyData(pos);
    if (el.btnGeo) {
      el.btnGeo.textContent = "Localisation active";
      el.btnGeo.disabled = false;
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
    nearbyLoaded = false;
    if (el.hospitalsList) el.hospitalsList.innerHTML = "";
    if (el.hospitalsCard) el.hospitalsCard.classList.add("hidden");
    if (el.hospitalsStatus) el.hospitalsStatus.textContent = "";

    watchId = navigator.geolocation.watchPosition(
      function (pos) {
        onPos(pos);
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
      },
      function (err) {
        onErr(err);
        if (el.btnGeo) el.btnGeo.disabled = false;
        if (el.btnGeo) el.btnGeo.textContent = "Autoriser la localisation";
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 }
    );
  }

  if (el.btnGeo) {
    el.btnGeo.addEventListener("click", function () {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      el.btnGeo.textContent = "Localisation en cours…";
      startGeolocation();
    });
  }

  if (el.btnRefreshHospitals) {
    el.btnRefreshHospitals.addEventListener("click", function () {
      if (!lastPos) {
        showToast("Activez d’abord la localisation.", true);
        return;
      }
      nearbyLoaded = false;
      if (el.hospitalsList) el.hospitalsList.innerHTML = "";
      if (el.hospitalsStatus) {
        el.hospitalsStatus.textContent = "Actualisation des hôpitaux…";
      }
      loadNearbyData(lastPos);
    });
  }

  renderEmergency();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("./sw.js", { scope: "./" })
        .then(function (reg) {
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        })
        .catch(function () {});
    });
  }
})();
