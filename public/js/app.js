(function () {
  "use strict";

  var el = {
    geoStatus: document.getElementById("geo-status"),
    btnGeo: document.getElementById("btn-geo"),
    coords: document.getElementById("geo-coords"),
    placesCard: document.getElementById("section-places"),
    placesStatus: document.getElementById("places-status"),
    btnRefreshPlaces: document.getElementById("btn-refresh-places"),
    hospitalsList: document.getElementById("hospitals-list"),
    policeFireList: document.getElementById("police-fire-list"),
    pharmaciesList: document.getElementById("pharmacies-list"),
    urgenceButtons: document.getElementById("urgence-buttons"),
    urgenceHint: document.getElementById("urgence-hint"),
    urgenceCountry: document.getElementById("urgence-country"),
    tabBtns: document.querySelectorAll("[data-tab]"),
    tabPanels: document.querySelectorAll("[data-tabpanel]"),
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

  function mapsDirUrl(destLat, destLon) {
    if (!lastPos) return "#";
    return (
      "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" +
      encodeURIComponent(
        lastPos.coords.latitude + "," + lastPos.coords.longitude
      ) +
      "&destination=" +
      encodeURIComponent(destLat + "," + destLon)
    );
  }

  function defaultNameForAmenity(amenity) {
    if (amenity === "hospital") return "Établissement hospitalier";
    if (amenity === "police") return "Poste de police";
    if (amenity === "fire_station") return "Caserne / poste de secours";
    if (amenity === "pharmacy") return "Pharmacie";
    return "Lieu";
  }

  function rowName(e) {
    var t = e.tags || {};
    return (
      t.name ||
      t["name:fr"] ||
      t["operator"] ||
      t["brand"] ||
      defaultNameForAmenity(t.amenity)
    );
  }

  function parseElements(json, lat, lon, allowedAmenities, maxRows) {
    var allow = {};
    allowedAmenities.forEach(function (a) {
      allow[a] = 1;
    });
    var rows = [];
    (json.elements || []).forEach(function (e) {
      var amenity = e.tags && e.tags.amenity;
      if (!amenity || !allow[amenity]) return;
      var plat = e.lat;
      var plon = e.lon;
      if (e.type === "way" && e.center) {
        plat = e.center.lat;
        plon = e.center.lon;
      }
      if (plat == null || plon == null) return;
      rows.push({
        amenity: amenity,
        name: rowName(e),
        km: haversineKm(lat, lon, plat, plon),
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
      var k = r.amenity + "|" + r.name + "|" + r.lat.toFixed(4) + "|" + r.lon.toFixed(4);
      if (seen[k]) return;
      seen[k] = 1;
      uniq.push(r);
    });
    return uniq.slice(0, maxRows);
  }

  function formatKm(km) {
    return km < 1 ? (km * 1000).toFixed(0) + " m" : km.toFixed(1) + " km";
  }

  function renderPoiList(ul, rows, options) {
    if (!ul) return;
    ul.innerHTML = "";
    var emptyMsg = options.emptyMsg;
    var showKind = options.showKind;
    if (!rows.length) {
      ul.innerHTML = '<li class="poi-empty">' + emptyMsg + "</li>";
      return;
    }
    rows.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "poi-item";
      var left = document.createElement("div");
      left.className = "poi-item-main";
      if (showKind) {
        var badge = document.createElement("span");
        badge.className =
          "poi-badge poi-badge--" +
          (r.amenity === "fire_station" ? "fire" : r.amenity === "police" ? "police" : "def");
        badge.textContent =
          r.amenity === "fire_station" ? "Pompiers" : r.amenity === "police" ? "Police" : r.amenity;
        left.appendChild(badge);
      }
      var title = document.createElement("strong");
      title.textContent = r.name;
      var sub = document.createElement("span");
      sub.className = "poi-km";
      sub.textContent = "≈ " + formatKm(r.km);
      left.appendChild(title);
      left.appendChild(sub);
      var a = document.createElement("a");
      a.className = "poi-link";
      a.href = mapsDirUrl(r.lat, r.lon);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Itinéraire";
      li.appendChild(left);
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  function runOverpass(q) {
    if (!window.InfosOverpass) {
      return Promise.reject(new Error("Overpass non chargé"));
    }
    return window.InfosOverpass.run(q);
  }

  function loadNearbyData(pos, force) {
    if (!pos) return;
    if (nearbyLoaded && !force) return;
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

    if (el.placesStatus) {
      el.placesStatus.textContent =
        "Chargement des lieux (hôpitaux, police / pompiers, pharmacies)…";
    }
    if (el.placesCard) el.placesCard.classList.remove("hidden");

    var qh =
      "[out:json][timeout:28];(" +
      'node["amenity"="hospital"](around:18000,' +
      lat +
      "," +
      lon +
      ');way["amenity"="hospital"](around:18000,' +
      lat +
      "," +
      lon +
      '););out center 26;';

    var qpf =
      "[out:json][timeout:28];(" +
      'node["amenity"="police"](around:14000,' +
      lat +
      "," +
      lon +
      ');way["amenity"="police"](around:14000,' +
      lat +
      "," +
      lon +
      ');node["amenity"="fire_station"](around:14000,' +
      lat +
      "," +
      lon +
      ');way["amenity"="fire_station"](around:14000,' +
      lat +
      "," +
      lon +
      '););out center 32;';

    var qph =
      "[out:json][timeout:22];node[\"amenity\"=\"pharmacy\"](around:10000," +
      lat +
      "," +
      lon +
      ");out 28;";

    var done = { h: false, pf: false, ph: false };
    function checkAll() {
      if (!done.h || !done.pf || !done.ph) return;
      if (el.placesStatus) {
        el.placesStatus.textContent =
          "Données © contributeurs OpenStreetMap — à vérifier sur place.";
      }
    }

    function failOne(which, msg) {
      if (which === "h" && el.hospitalsList) {
        el.hospitalsList.innerHTML =
          '<li class="poi-empty">' + msg + "</li>";
      }
      if (which === "pf" && el.policeFireList) {
        el.policeFireList.innerHTML = '<li class="poi-empty">' + msg + "</li>";
      }
      if (which === "ph" && el.pharmaciesList) {
        el.pharmaciesList.innerHTML = '<li class="poi-empty">' + msg + "</li>";
      }
      done[which] = true;
      checkAll();
    }

    runOverpass(qh)
      .then(function (json) {
        var rows = parseElements(json, lat, lon, ["hospital"], 10);
        renderPoiList(el.hospitalsList, rows, {
          emptyMsg: "Aucun hôpital cartographié dans ~18 km.",
          showKind: false,
        });
        done.h = true;
        checkAll();
      })
      .catch(function () {
        failOne("h", "Impossible de charger les hôpitaux (réseau / Overpass).");
        showToast("Échec : hôpitaux.", true);
      });

    runOverpass(qpf)
      .then(function (json) {
        var rows = parseElements(json, lat, lon, ["police", "fire_station"], 18);
        renderPoiList(el.policeFireList, rows, {
          emptyMsg: "Aucun poste police / pompiers cartographié dans ~14 km.",
          showKind: true,
        });
        done.pf = true;
        checkAll();
      })
      .catch(function () {
        failOne("pf", "Impossible de charger police / pompiers.");
        showToast("Échec : police / pompiers.", true);
      });

    runOverpass(qph)
      .then(function (json) {
        var rows = parseElements(json, lat, lon, ["pharmacy"], 14);
        renderPoiList(el.pharmaciesList, rows, {
          emptyMsg: "Aucune pharmacie cartographiée dans ~10 km.",
          showKind: false,
        });
        done.ph = true;
        checkAll();
      })
      .catch(function () {
        failOne("ph", "Impossible de charger les pharmacies.");
        showToast("Échec : pharmacies.", true);
      });
  }

  function onPos(pos) {
    lastPos = pos;
    setStatus(
      "<strong>Position reçue.</strong> Numéros du pays (si détecté) et lieux utiles à proximité."
    );
    if (el.coords) {
      el.coords.classList.remove("hidden");
      el.coords.querySelector("strong").textContent = formatPos(pos);
    }
    loadNearbyData(pos, false);
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
    if (el.policeFireList) el.policeFireList.innerHTML = "";
    if (el.pharmaciesList) el.pharmaciesList.innerHTML = "";
    if (el.placesCard) el.placesCard.classList.add("hidden");
    if (el.placesStatus) el.placesStatus.textContent = "";

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

  function setActiveTab(tabId) {
    el.tabBtns.forEach(function (btn) {
      var id = btn.getAttribute("data-tab");
      var active = id === tabId;
      btn.classList.toggle("tabs__btn--active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    el.tabPanels.forEach(function (panel) {
      var id = panel.getAttribute("data-tabpanel");
      panel.classList.toggle("hidden", id !== tabId);
    });
  }

  el.tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-tab");
      if (id) setActiveTab(id);
    });
  });

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

  if (el.btnRefreshPlaces) {
    el.btnRefreshPlaces.addEventListener("click", function () {
      if (!lastPos) {
        showToast("Activez d’abord la localisation.", true);
        return;
      }
      nearbyLoaded = false;
      if (el.hospitalsList) el.hospitalsList.innerHTML = "";
      if (el.policeFireList) el.policeFireList.innerHTML = "";
      if (el.pharmaciesList) el.pharmaciesList.innerHTML = "";
      if (el.placesStatus) {
        el.placesStatus.textContent = "Actualisation des listes…";
      }
      loadNearbyData(lastPos, true);
    });
  }

  renderEmergency();
  setActiveTab("h");

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
