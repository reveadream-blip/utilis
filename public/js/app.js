(function () {
  "use strict";

  var STORAGE_PROFILE = "infos_indispensables_profile_v1";
  var STORAGE_SHORTCUTS = "infos_indispensables_shortcuts_v1";
  var STORAGE_PLACES_CACHE = "infos_indispensables_places_cache_v1";
  var CACHE_MAX_KM = 45;

  var el = {};
  var watchId = null;
  var lastPos = null;
  var countryCode = null;
  var countryName = null;
  var nearbyLoaded = false;
  var tabLoaded = {};

  var EAGER = ["h", "fire", "pol", "ph"];
  var LAZY = ["med", "ve", "def", "emb"];
  var TAB_ORDER = ["h", "fire", "pol", "ph", "med", "ve", "def", "emb"];

  function $(id) {
    return document.getElementById(id);
  }

  function initEls() {
    el.geoStatus = $("geo-status");
    el.btnGeo = $("btn-geo");
    el.coords = $("geo-coords");
    el.placesCard = $("section-places");
    el.placesStatus = $("places-status");
    el.btnRefreshPlaces = $("btn-refresh-places");
    el.urgenceButtons = $("urgence-buttons");
    el.urgenceHint = $("urgence-hint");
    el.urgenceCountry = $("urgence-country");
    el.sectionFrListen = $("section-fr-listen");
    el.frListenGrid = $("fr-listen-grid");
    el.sectionFrPharmacy = $("section-fr-pharmacy");
    el.networkBanner = $("network-banner");
    el.weatherStrip = $("weather-strip");
    el.tabBtns = document.querySelectorAll("[data-tab]");
    el.tabPanels = document.querySelectorAll("[data-tabpanel]");
    el.formProfile = $("form-profile");
    el.btnSaveProfile = $("btn-save-profile");
    el.btnCopyProfile = $("btn-copy-profile");
    el.shortcutsList = $("shortcuts-list");
    el.btnAddShortcut = $("btn-add-shortcut");
  }

  var UL = {
    h: "hospitals-list",
    fire: "fire-list",
    pol: "police-list",
    ph: "pharmacies-list",
    med: "med-list",
    ve: "vet-list",
    def: "def-list",
    emb: "emb-list",
  };

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
      pos.coords.latitude.toFixed(5) + "°, " + pos.coords.longitude.toFixed(5) + "°"
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
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function telHref(num) {
    return "tel:" + String(num).replace(/\s/g, "");
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

  function updateNetworkBanner() {
    if (!el.networkBanner) return;
    if (navigator.onLine) {
      el.networkBanner.classList.add("hidden");
      el.networkBanner.textContent = "";
      el.networkBanner.classList.remove("network-banner--offline");
    } else {
      el.networkBanner.classList.remove("hidden");
      el.networkBanner.classList.add("network-banner--offline");
      el.networkBanner.textContent =
        "Hors ligne — listes possibles depuis le cache (non à jour). Connexion requise pour actualiser.";
    }
  }

  function readPlacesCache() {
    try {
      var raw = localStorage.getItem(STORAGE_PLACES_CACHE);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !data.tabs) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function persistTabRows(key, rows, lat, lon) {
    try {
      var data = readPlacesCache() || { tabs: {} };
      data.tabs = data.tabs || {};
      data.lat = lat;
      data.lon = lon;
      data.ts = Date.now();
      if (countryCode) data.countryCode = countryCode;
      data.tabs[key] = (rows || []).map(function (r) {
        return {
          name: r.name,
          km: r.km,
          lat: r.lat,
          lon: r.lon,
          kind: r.kind,
          policeKind: r.policeKind,
          variant: r.variant,
        };
      });
      localStorage.setItem(STORAGE_PLACES_CACHE, JSON.stringify(data));
    } catch (e) {}
  }

  function getCachedRowsForTab(key) {
    var data = readPlacesCache();
    if (!data || !data.tabs || !data.tabs[key]) return null;
    return data.tabs[key];
  }

  function tryRestorePlacesFromCache(lat, lon, showUi) {
    var data = readPlacesCache();
    if (!data || data.lat == null || data.lon == null || !data.tabs) return false;
    var d = haversineKm(lat, lon, data.lat, data.lon);
    if (d > CACHE_MAX_KM) return false;
    lastPos = { coords: { latitude: data.lat, longitude: data.lon } };
    if (data.countryCode) countryCode = data.countryCode;
    renderEmergency();
    TAB_ORDER.forEach(function (k) {
      var rows = data.tabs[k];
      if (!rows || !rows.length) return;
      tabLoaded[k] = true;
      renderListFor(k, rows);
    });
    if (showUi && el.placesCard) el.placesCard.classList.remove("hidden");
    if (showUi && el.placesStatus) {
      el.placesStatus.textContent =
        "Données mémorisées sur cet appareil (dernière session à proximité).";
    }
    return true;
  }

  function tryRestoreAnyCachedPlaces() {
    var data = readPlacesCache();
    if (!data || !data.tabs) return false;
    var has = false;
    TAB_ORDER.forEach(function (k) {
      if (data.tabs[k] && data.tabs[k].length) has = true;
    });
    if (!has) return false;
    if (data.lat != null && data.lon != null) {
      lastPos = { coords: { latitude: data.lat, longitude: data.lon } };
    }
    if (data.countryCode) countryCode = data.countryCode;
    renderEmergency();
    TAB_ORDER.forEach(function (k) {
      var rows = data.tabs[k];
      if (!rows || !rows.length) return;
      tabLoaded[k] = true;
      renderListFor(k, rows);
    });
    if (el.placesCard) el.placesCard.classList.remove("hidden");
    if (el.placesStatus) {
      el.placesStatus.textContent =
        "Hors ligne — affichage du dernier cache enregistré sur cet appareil.";
    }
    if (lastPos && el.coords) {
      el.coords.classList.remove("hidden");
      el.coords.querySelector("strong").textContent = formatPos(lastPos);
    }
    return true;
  }

  function fetchWeather(lat, lon) {
    if (!el.weatherStrip || !navigator.onLine) return;
    var url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lon) +
      "&current_weather=true&timezone=auto";
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d || !d.current_weather || !el.weatherStrip) return;
        var cw = d.current_weather;
        el.weatherStrip.classList.remove("hidden");
        el.weatherStrip.textContent =
          "Météo à proximité : " +
          cw.temperature +
          " °C, vent ~" +
          cw.windspeed +
          " km/h (Open-Meteo, indicatif).";
      })
      .catch(function () {});
  }

  function runOverpass(q) {
    if (!window.InfosOverpass) {
      return Promise.reject(new Error("Overpass non chargé"));
    }
    return window.InfosOverpass.run(q);
  }

  var QUERY_KEY = {
    h: "hospital",
    fire: "fire",
    pol: "police",
    ph: "pharmacy",
    med: "med",
    ve: "vet",
    def: "defib",
    emb: "emb",
  };

  function getQueryFn(tabKey) {
    var P = window.InfosPlaceQueries;
    if (!P) return null;
    var n = QUERY_KEY[tabKey];
    return n ? P[n] : null;
  }

  function defaultName(amenity) {
    var m = {
      hospital: "Hôpital / clinique",
      fire_station: "Caserne / secours",
      police: "Poste de police",
      pharmacy: "Pharmacie",
      doctors: "Médecin (cabinet)",
      clinic: "Clinique / centre de santé",
      veterinary: "Vétérinaire",
      embassy: "Ambassade / consulat",
      defibrillator: "Défibrillateur",
    };
    return m[amenity] || "Lieu";
  }

  function rowNameFromEl(e) {
    var t = e.tags || {};
    var tagKey = t.amenity || (t.emergency === "defibrillator" ? "defibrillator" : t.emergency);
    return (
      t.name ||
      t["name:fr"] ||
      t["operator"] ||
      t["brand"] ||
      defaultName(tagKey)
    );
  }

  function policeKindFromTags(tags) {
    if (!tags) return "police";
    var s =
      (tags["police:type"] || "") +
      (tags.operator || "") +
      (tags.name || "");
    if (/gendarmerie/i.test(s)) return "gendarmerie";
    return "police";
  }

  function parseAmenityArray(json, lat, lon, allowed, max) {
    var al = {};
    allowed.forEach(function (a) {
      al[a] = 1;
    });
    var rows = [];
    (json.elements || []).forEach(function (e) {
      var a = e.tags && e.tags.amenity;
      if (!a || !al[a]) return;
      var plat = e.lat;
      var plon = e.lon;
      if (e.type === "way" && e.center) {
        plat = e.center.lat;
        plon = e.center.lon;
      }
      if (plat == null || plon == null) return;
      rows.push({
        kind: a,
        name: rowNameFromEl(e),
        km: haversineKm(lat, lon, plat, plon),
        lat: plat,
        lon: plon,
        tags: e.tags,
      });
    });
    return dedupeSort(rows, max);
  }

  function parseOnlyAmenity(json, lat, lon, only, max) {
    return parseAmenityArray(json, lat, lon, [only], max);
  }

  function parsePoliceRows(json, lat, lon, max) {
    var rows = [];
    (json.elements || []).forEach(function (e) {
      var a = e.tags && e.tags.amenity;
      if (a !== "police") return;
      var plat = e.lat;
      var plon = e.lon;
      if (e.type === "way" && e.center) {
        plat = e.center.lat;
        plon = e.center.lon;
      }
      if (plat == null || plon == null) return;
      var pk = policeKindFromTags(e.tags);
      rows.push({
        variant: "police",
        policeKind: pk,
        name: rowNameFromEl(e),
        km: haversineKm(lat, lon, plat, plon),
        lat: plat,
        lon: plon,
      });
    });
    return dedupeSort(rows, max);
  }

  function parseFireRows(json, lat, lon, max) {
    return parseOnlyAmenity(json, lat, lon, "fire_station", max);
  }

  function parseDefibRows(json, lat, lon, max) {
    var rows = [];
    (json.elements || []).forEach(function (e) {
      if (!e.tags || e.tags.emergency !== "defibrillator") return;
      var plat = e.lat;
      var plon = e.lon;
      if (e.type === "way" && e.center) {
        plat = e.center.lat;
        plon = e.center.lon;
      }
      if (plat == null || plon == null) return;
      var name = rowNameFromEl(e) || "Défibrillateur";
      rows.push({
        variant: "defib",
        name: name,
        km: haversineKm(lat, lon, plat, plon),
        lat: plat,
        lon: plon,
      });
    });
    return dedupeSort(rows, max);
  }

  function dedupeSort(rows, max) {
    rows.sort(function (a, b) {
      return a.km - b.km;
    });
    var seen = {};
    var out = [];
    rows.forEach(function (r) {
      var k = r.name + "|" + r.lat.toFixed(4) + "|" + r.lon.toFixed(4);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(r);
    });
    return out.slice(0, max);
  }

  function formatKm(km) {
    return km < 1 ? (km * 1000).toFixed(0) + " m" : km.toFixed(1) + " km";
  }

  function renderPoiList(ul, rows, emptyMsg, variant) {
    if (!ul) return;
    ul.innerHTML = "";
    if (!rows || !rows.length) {
      ul.innerHTML = '<li class="poi-empty">' + emptyMsg + "</li>";
      return;
    }
    rows.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "poi-item";
      var left = document.createElement("div");
      left.className = "poi-item-main";
      if (variant === "police" || r.variant === "police") {
        var badge = document.createElement("span");
        var isG = r.policeKind === "gendarmerie";
        badge.className = "poi-badge " + (isG ? "poi-badge--gend" : "poi-badge--police");
        badge.textContent = isG ? "Gendarmerie" : "Police";
        left.appendChild(badge);
      } else if (variant === "fire" || (r.kind === "fire_station" && variant !== "defib")) {
        var b2 = document.createElement("span");
        b2.className = "poi-badge poi-badge--fire";
        b2.textContent = "Pompiers / secours";
        left.appendChild(b2);
      } else if (variant === "defib" || r.variant === "defib") {
        var b3 = document.createElement("span");
        b3.className = "poi-badge poi-badge--defib";
        b3.textContent = "Défibrillateur";
        left.appendChild(b3);
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

  function fetchTab(key, lat, lon) {
    var qf = getQueryFn(key);
    if (!qf) return Promise.reject();
    return runOverpass(qf(lat, lon));
  }

  function parseForTab(key, json, lat, lon) {
    if (key === "h")
      return parseOnlyAmenity(json, lat, lon, "hospital", 10);
    if (key === "fire")
      return parseFireRows(json, lat, lon, 14).map(function (r) {
        return { name: r.name, km: r.km, lat: r.lat, lon: r.lon, kind: "fire_station" };
      });
    if (key === "pol") return parsePoliceRows(json, lat, lon, 20);
    if (key === "ph") return parseOnlyAmenity(json, lat, lon, "pharmacy", 14);
    if (key === "med")
      return parseAmenityArray(json, lat, lon, ["doctors", "clinic"], 12);
    if (key === "ve")
      return parseOnlyAmenity(json, lat, lon, "veterinary", 12);
    if (key === "def") return parseDefibRows(json, lat, lon, 18);
    if (key === "emb")
      return parseAmenityArray(json, lat, lon, ["embassy"], 15);
    return [];
  }

  function emptyMsgFor(key) {
    var m = {
      h: "Aucun hôpital cartographié dans ~18 km.",
      fire: "Aucune caserne / secours (pompiers) cartographié dans ~14 km.",
      pol: "Aucun poste police ou gendarmerie cartographié dans ~14 km.",
      ph: "Aucune pharmacie cartographiée dans ~10 km.",
      med: "Aucun cabinet médecin / clinique cartographié dans ~12 km.",
      ve: "Aucun vétérinaire cartographié dans ~20 km.",
      def: "Aucun défibrillateur enregistré dans ~8 km (OSM).",
      emb: "Aucune ambassade / consulat cartographié dans ~50 km — utile en voyage.",
    };
    return m[key] || "Aucun résultat.";
  }

  function renderListFor(key, rows) {
    var u = $(UL[key]);
    if (!u) return;
    if (key === "pol")
      return renderPoiList(u, rows, emptyMsgFor(key), "police");
    if (key === "fire")
      return renderPoiList(u, rows, emptyMsgFor(key), "fire");
    if (key === "def")
      return renderPoiList(u, rows, emptyMsgFor(key), "defib");
    if (key === "h" || key === "ph" || key === "med" || key === "ve" || key === "emb")
      return renderPoiList(
        u,
        rows.map(function (r) {
          if (r.name) return r;
          return { name: r.name || "Lieu", km: r.km, lat: r.lat, lon: r.lon };
        }),
        emptyMsgFor(key),
        "default"
      );
  }

  function loadOneTab(key, lat, lon) {
    if (tabLoaded[key]) return Promise.resolve({ key: key, skipped: true });
    var ul = $(UL[key]);
    if (!navigator.onLine) {
      var cached = getCachedRowsForTab(key);
      if (cached && cached.length) {
        tabLoaded[key] = true;
        renderListFor(key, cached);
        return Promise.resolve({ key: key, fromCache: true });
      }
      if (ul) {
        ul.innerHTML =
          '<li class="poi-empty">Hors ligne — aucune donnée mémorisée pour cet onglet.</li>';
      }
      return Promise.resolve({ key: key, offline: true });
    }
    if (ul) ul.innerHTML = '<li class="poi-empty">Chargement…</li>';
    return fetchTab(key, lat, lon)
      .then(function (json) {
        var rows = parseForTab(key, json, lat, lon);
        tabLoaded[key] = true;
        renderListFor(key, rows);
        persistTabRows(key, rows, lat, lon);
        return { key: key, rows: rows };
      })
      .catch(function () {
        if (ul) {
          ul.innerHTML =
            '<li class="poi-empty">Impossible de charger. Réessayez (réseau / Overpass).</li>';
        }
        showToast("Échec : " + key, true);
        return { key: key, error: true };
      });
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
    updateFrSection();
  }

  var FR_LISTEN = [
    { num: "3114", label: "Prévention du suicide (24h/24)" },
    { num: "3919", label: "Violences faites aux femmes" },
    { num: "119", label: "Enfance en danger (Allô 119)" },
    { num: "3018", label: "LGBTI+ / discriminations" },
  ];

  function updateFrSection() {
    if (!el.sectionFrListen || !el.frListenGrid) return;
    if (countryCode === "FR") {
      el.sectionFrListen.classList.remove("hidden");
      el.frListenGrid.innerHTML = "";
      FR_LISTEN.forEach(function (L) {
        var wrap = document.createElement("div");
        wrap.className = "tel-block";
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-tel btn-tel--soft";
        b.textContent = L.num;
        b.title = L.label;
        b.addEventListener("click", function (e) {
          e.preventDefault();
          window.location.href = telHref(L.num);
        });
        var lab = document.createElement("span");
        lab.className = "tel-label";
        lab.textContent = L.label;
        wrap.appendChild(b);
        wrap.appendChild(lab);
        el.frListenGrid.appendChild(wrap);
      });
    } else {
      el.sectionFrListen.classList.add("hidden");
    }
    if (el.sectionFrPharmacy) {
      el.sectionFrPharmacy.classList.toggle("hidden", countryCode !== "FR");
    }
  }

  function reverseGeocode(lat, lon) {
    return fetch(
      "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
        encodeURIComponent(lat) +
        "&longitude=" +
        encodeURIComponent(lon) +
        "&localityLanguage=fr",
      { method: "GET", cache: "no-store" }
    ).then(function (r) {
      if (!r.ok) throw new Error("Géocodage indisponible");
      return r.json();
    });
  }

  function resetTabState() {
    TAB_ORDER.forEach(function (k) {
      tabLoaded[k] = false;
    });
  }

  function clearAllPlaceLists() {
    TAB_ORDER.forEach(function (k) {
      var u = $(UL[k]);
      if (u) u.innerHTML = "";
    });
  }

  function loadEagerBatches(pos, onAllDone) {
    var lat = pos.coords.latitude;
    var lon = pos.coords.longitude;
    var n = 0;
    var total = EAGER.length;
    function done() {
      n += 1;
      if (n >= total && onAllDone) onAllDone();
    }
    EAGER.forEach(function (key) {
      loadOneTab(key, lat, lon).then(done).catch(done);
    });
  }

  function loadNearbyData(pos, force) {
    if (!pos) return;
    if (nearbyLoaded && !force) return;
    nearbyLoaded = true;
    resetTabState();
    var lat = pos.coords.latitude;
    var lon = pos.coords.longitude;

    if (!navigator.onLine) {
      if (tryRestorePlacesFromCache(lat, lon, true)) {
        if (el.coords) {
          el.coords.classList.remove("hidden");
          el.coords.querySelector("strong").textContent = formatPos(pos);
        }
      } else if (el.placesStatus) {
        el.placesStatus.textContent =
          "Hors ligne — activez le réseau pour charger les lieux, ou déplacez-vous puis réessayez après une session en ligne.";
      }
      if (el.placesCard) el.placesCard.classList.remove("hidden");
      return;
    }

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
        "Chargement hôpitaux, pompiers, police (dont gendarmerie), pharmacies… Autres onglets au premier affichage.";
    }
    if (el.placesCard) el.placesCard.classList.remove("hidden");

    loadEagerBatches(pos, function () {
      if (el.placesStatus) {
        el.placesStatus.textContent =
          "OSM : ouvrez un onglet (médecins, vétos, défibrillateurs, ambassades) pour le charger. Vérifiez sur place.";
      }
    });
  }

  function onPos(pos) {
    lastPos = pos;
    setStatus(
      "<strong>Position reçue.</strong> Urgence, fiche perso, raccourcis + lieux à proximité."
    );
    if (el.coords) {
      el.coords.classList.remove("hidden");
      el.coords.querySelector("strong").textContent = formatPos(pos);
    }
    loadNearbyData(pos, false);
    fetchWeather(pos.coords.latitude, pos.coords.longitude);
    if (el.btnGeo) {
      el.btnGeo.textContent = "Localisation active";
      el.btnGeo.disabled = false;
    }
  }

  function onErr(err) {
    setStatus(
      "<strong>Impossible d’obtenir la position.</strong> Vérifiez le GPS et les autorisations."
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
    resetTabState();
    clearAllPlaceLists();
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
        if (el.btnGeo) {
          el.btnGeo.disabled = false;
          el.btnGeo.textContent = "Autoriser la localisation";
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 }
    );
  }

  var activeTabId = "h";

  function setActiveTab(tabId) {
    activeTabId = tabId;
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
    if (lastPos && LAZY.indexOf(tabId) >= 0) {
      loadOneTab(
        tabId,
        lastPos.coords.latitude,
        lastPos.coords.longitude
      );
    }
  }

  function saveProfile() {
    if (!el.formProfile) return;
    var fd = new FormData(el.formProfile);
    var o = {
      name: (fd.get("name") || "").toString().trim(),
      blood: (fd.get("blood") || "").toString().trim(),
      allergies: (fd.get("allergies") || "").toString().trim(),
      meds: (fd.get("meds") || "").toString().trim(),
      contact: (fd.get("contact") || "").toString().trim(),
      contactPhone: (fd.get("contactPhone") || "").toString().trim(),
      notes: (fd.get("notes") || "").toString().trim(),
    };
    try {
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(o));
      showToast("Fiche enregistrée sur cet appareil.");
    } catch (e) {
      showToast("Stockage indisponible (navigateur privé ?).", true);
    }
  }

  function loadProfile() {
    try {
      var s = localStorage.getItem(STORAGE_PROFILE);
      if (!s || !el.formProfile) return;
      var o = JSON.parse(s);
      ["name", "blood", "allergies", "meds", "contact", "contactPhone", "notes"].forEach(
        function (f) {
          var inp = el.formProfile.elements.namedItem(f);
          if (inp && o[f]) inp.value = o[f];
        }
      );
    } catch (e) {}
  }

  function copyProfileSummary() {
    try {
      var s = localStorage.getItem(STORAGE_PROFILE);
      var o = s ? JSON.parse(s) : {};
      var lines = [
        "— Fiche urgence (Infos Indispensables) —",
        "Identité: " + (o.name || "—"),
        "Groupe sanguin: " + (o.blood || "—"),
        "Allergies: " + (o.allergies || "—"),
        "Traitements: " + (o.meds || "—"),
        "Contact: " + (o.contact || "—") + " " + (o.contactPhone || ""),
        "Notes: " + (o.notes || "—"),
      ];
      var text = lines.join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            showToast("Résumé copié dans le presse-papiers.");
          },
          function () {
            showToast("Copie impossible sur cet appareil.", true);
          }
        );
      } else {
        showToast("Copie non supportée ici — sélectionnez les champs manuellement.", true);
      }
    } catch (e) {
      showToast("Erreur de copie.", true);
    }
  }

  function getShortcuts() {
    try {
      var s = localStorage.getItem(STORAGE_SHORTCUTS);
      if (!s) return [];
      var a = JSON.parse(s);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  function saveShortcuts(arr) {
    try {
      localStorage.setItem(STORAGE_SHORTCUTS, JSON.stringify(arr.slice(0, 20)));
    } catch (e) {
      showToast("Sauvegarde des raccourcis impossible.", true);
    }
  }

  function renderShortcuts() {
    if (!el.shortcutsList) return;
    el.shortcutsList.innerHTML = "";
    var list = getShortcuts();
    if (!list.length) {
      el.shortcutsList.innerHTML =
        '<li class="poi-empty">Ajoutez des liens (travail, outils, intranets) — restent sur cet appareil.</li>';
      return;
    }
    list.forEach(function (item, idx) {
      var li = document.createElement("li");
      li.className = "shortcut-row";
      var a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "shortcut-link";
      a.textContent = item.label || item.url;
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-mini";
      del.textContent = "Retirer";
      del.setAttribute("data-idx", String(idx));
      del.addEventListener("click", function () {
        var next = getShortcuts();
        next.splice(idx, 1);
        saveShortcuts(next);
        renderShortcuts();
      });
      li.appendChild(a);
      li.appendChild(del);
      el.shortcutsList.appendChild(li);
    });
  }

  function addShortcut() {
    var label = (prompt("Nom du raccourci (ex. : Intranet, Messagerie) :", "") || "").trim();
    if (!label) return;
    var url = (prompt("Adresse (https://...)", "https://") || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      showToast("URL invalide (commencez par http).", true);
      return;
    }
    var list = getShortcuts();
    list.push({ label: label, url: url });
    saveShortcuts(list);
    renderShortcuts();
  }

  function init() {
    initEls();
    loadProfile();
    renderShortcuts();

    if (el.btnSaveProfile) {
      el.btnSaveProfile.addEventListener("click", function (e) {
        e.preventDefault();
        saveProfile();
      });
    }
    if (el.btnCopyProfile) {
      el.btnCopyProfile.addEventListener("click", function () {
        copyProfileSummary();
      });
    }
    if (el.btnAddShortcut) {
      el.btnAddShortcut.addEventListener("click", addShortcut);
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
      if (!navigator.onLine) {
        showToast("Connexion requise pour actualiser les lieux.", true);
        return;
      }
      nearbyLoaded = false;
        resetTabState();
        clearAllPlaceLists();
        if (el.placesStatus) el.placesStatus.textContent = "Actualisation en cours…";
        loadNearbyData(lastPos, true);
      });
    }

    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var h = a.getAttribute("href");
        if (h && h.length > 1) {
          var t = document.querySelector(h);
          if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    window.addEventListener("online", function () {
      updateNetworkBanner();
      showToast("Connexion rétablie.");
    });
    window.addEventListener("offline", function () {
      updateNetworkBanner();
    });
    updateNetworkBanner();

    if (!navigator.onLine) {
      tryRestoreAnyCachedPlaces();
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
