(function () {
  "use strict";

  var STORAGE_PROFILE = "infos_indispensables_profile_v1";
  var STORAGE_SHORTCUTS = "infos_indispensables_shortcuts_v1";
  var STORAGE_PLACES_CACHE = "infos_indispensables_places_cache_v1";
  var STORAGE_FAVORITES = "infos_indispensables_favorites_v1";
  var STORAGE_TRANSLATIONS = "infos_indispensables_i18n_cache_v1";
  var CACHE_MAX_KM = 45;
  var SOURCE_LANG = "fr";

  var el = {};
  var watchId = null;
  var lastPos = null;
  var deferredInstallPrompt = null;
  var autoGeoAttempted = false;
  var activeProfileSlot = "self";
  var countryCode = null;
  var countryName = null;
  var countryDialCode = null;
  var countrySource = null;
  var countryResolveMode = "geo";
  var nearbyLoaded = false;
  var tabLoaded = {};
  var emergencyRenderToken = 0;

  var EAGER = ["h", "fire", "pol", "ph"];
  var LAZY = ["med", "ve", "def", "emb"];
  var TAB_ORDER = ["h", "fire", "pol", "ph", "med", "ve", "def", "emb"];
  var dialCodeCache = {};

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
    el.btnInstallApp = $("btn-install-app");
    el.urgenceButtons = $("urgence-buttons");
    el.urgenceHint = $("urgence-hint");
    el.urgenceCountry = $("urgence-country");
    el.simCountryIso = $("sim-country-iso");
    el.simCountryInfo = $("sim-country-info");
    el.btnCountrySim = $("btn-country-sim");
    el.btnCountrySimReset = $("btn-country-sim-reset");
    el.sectionFrListen = $("section-fr-listen");
    el.frListenGrid = $("fr-listen-grid");
    el.sectionFrPharmacy = $("section-fr-pharmacy");
    el.networkBanner = $("network-banner");
    el.fallbackBanner = $("fallback-banner");
    el.weatherStrip = $("weather-strip");
    el.tabBtns = document.querySelectorAll("[data-tab]");
    el.tabPanels = document.querySelectorAll("[data-tabpanel]");
    el.formProfile = $("form-profile");
    el.profileSlot = $("profile-slot");
    el.btnSaveProfile = $("btn-save-profile");
    el.btnCopyProfile = $("btn-copy-profile");
    el.btnExportProfile = $("btn-export-profile");
    el.shortcutsList = $("shortcuts-list");
    el.btnAddShortcut = $("btn-add-shortcut");
    el.emergencyMode = $("emergency-mode");
    el.btnOpenEmergency = $("btn-open-emergency");
    el.btnCloseEmergency = $("btn-close-emergency");
    el.sosTelLink = $("sos-tel-link");
    el.sosTelLabel = $("sos-tel-label");
    el.sosTelWarn = $("sos-tel-warn");
    el.btnEmergencyShare = $("btn-emergency-share");
    el.btnEmergencyFiche = $("btn-emergency-fiche");
    el.btnEmergencySafe = $("btn-emergency-safe");
    el.favoritesBox = $("favorites-box");
    el.favoritesList = $("favorites-list");
  }

  var emergencyFocusBack = null;

  function getPrimaryEmergencyLine() {
    if (!window.InfosEmergency) {
      return { num: "112", label: "Urgences (Europe)" };
    }
    var info = window.InfosEmergency.getEmergencyForCountry(countryCode || "");
    var first = info.lines && info.lines[0];
    if (first) return { num: first.num, label: first.label };
    return { num: "112", label: "Urgences" };
  }

  function refreshSosOverlay() {
    if (!el.sosTelLink || !el.sosTelLabel) return;
    var L = getPrimaryEmergencyLine();
    var digits = String(L.num).replace(/\s/g, "");
    el.sosTelLink.href = "tel:" + digits;
    el.sosTelLabel.textContent = L.num;
    if (el.sosTelWarn) {
      el.sosTelWarn.textContent =
        countryCode && countryName
          ? "Pays détecté : " + countryName + " — vérifiez le numéro approprié (police, SAMU, pompiers…)."
          : "Activez la localisation dans l’app pour affiner le pays. Sinon, le 112 couvre souvent l’Europe.";
    }
  }

  function openEmergencyMode() {
    if (!el.emergencyMode) return;
    emergencyFocusBack = document.activeElement;
    refreshSosOverlay();
    el.emergencyMode.classList.remove("hidden");
    el.emergencyMode.setAttribute("aria-hidden", "false");
    document.body.classList.add("emergency-mode-open");
    if (el.sosTelLink) el.sosTelLink.focus();
  }

  function closeEmergencyMode() {
    if (!el.emergencyMode) return;
    el.emergencyMode.classList.add("hidden");
    el.emergencyMode.setAttribute("aria-hidden", "true");
    document.body.classList.remove("emergency-mode-open");
    if (emergencyFocusBack && emergencyFocusBack.focus) {
      try {
        emergencyFocusBack.focus();
      } catch (e) {}
    }
    emergencyFocusBack = null;
  }

  function ensurePositionForShare(done) {
    if (lastPos && lastPos.coords) {
      done(null, lastPos);
      return;
    }
    if (!navigator.geolocation) {
      done(new Error("no-geo"), null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        lastPos = pos;
        done(null, pos);
      },
      function () {
        done(new Error("denied"), null);
      },
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 }
    );
  }

  function shareMyPosition() {
    ensurePositionForShare(function (err, pos) {
      if (err || !pos) {
        showToast(
          "Position indisponible : activez la localisation dans « Autour de moi ».",
          true
        );
        closeEmergencyMode();
        var g = $("section-geo");
        if (g) g.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      var mapsUrl = "https://www.google.com/maps?q=" + lat + "," + lon;
      var text =
        "My location (SOS Emergency)\n" +
        lat.toFixed(5) +
        ", " +
        lon.toFixed(5) +
        "\n" +
        mapsUrl;
      if (
        !window.confirm(
          "Un texte avec vos coordonnées et un lien carte va être préparé. Continuer ?"
        )
      ) {
        return;
      }
      if (navigator.share) {
        navigator
          .share({
            title: "Ma position",
            text: text,
            url: mapsUrl,
          })
          .then(function () {
            showToast("Partage effectué.");
          })
          .catch(function () {
            copyTextFallback(text);
          });
      } else {
        copyTextFallback(text);
      }
    });
  }

  function copyTextFallback(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          showToast("Texte copié — collez-le dans SMS, mail ou messagerie.");
        },
        function () {
          showToast("Copie impossible : sélectionnez et copiez manuellement.", true);
        }
      );
    } else {
      showToast("Copie non supportée sur cet appareil.", true);
    }
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

  function detectPreferredLanguage() {
    var langs = (navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || "en"]) || ["en"];
    var first = String(langs[0] || "en").toLowerCase();
    return first.split("-")[0] || "en";
  }

  function readTranslationCache() {
    try {
      var raw = localStorage.getItem(STORAGE_TRANSLATIONS);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function writeTranslationCache(cache) {
    try {
      localStorage.setItem(STORAGE_TRANSLATIONS, JSON.stringify(cache));
    } catch (e) {}
  }

  function shouldTranslateText(text) {
    if (!text) return false;
    var t = String(text).trim();
    if (!t) return false;
    if (t.length < 2) return false;
    if (/^\d+([.,]\d+)?$/.test(t)) return false;
    if (/^(SOS|PWA|CH|FR|US)$/i.test(t)) return false;
    return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t);
  }

  function translateText(text, targetLang, cache) {
    var key = targetLang + "::" + text;
    if (cache[key]) return Promise.resolve(cache[key]);
    var url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(SOURCE_LANG + "|" + targetLang);
    return fetch(url, { method: "GET", cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        var translated =
          d && d.responseData && d.responseData.translatedText
            ? String(d.responseData.translatedText).trim()
            : "";
        if (!translated) return text;
        cache[key] = translated;
        return translated;
      })
      .catch(function () {
        return text;
      });
  }

  function applyAutoI18n() {
    var targetLang = detectPreferredLanguage();
    document.documentElement.lang = targetLang;
    if (!targetLang || targetLang === SOURCE_LANG) return;

    var cache = readTranslationCache();
    var nodes = [];
    document.querySelectorAll(
      "h1,h2,p,label,button,a,span,li,strong,option"
    ).forEach(function (elNode) {
      if (!elNode || !elNode.childNodes || !elNode.childNodes.length) return;
      if (elNode.id === "urgence-buttons") return;
      Array.prototype.forEach.call(elNode.childNodes, function (n) {
        if (!n || n.nodeType !== 3) return;
        var txt = n.nodeValue;
        if (!shouldTranslateText(txt)) return;
        nodes.push({ node: n, text: txt.trim() });
      });
      ["title", "placeholder", "aria-label"].forEach(function (attr) {
        var val = elNode.getAttribute && elNode.getAttribute(attr);
        if (shouldTranslateText(val)) {
          nodes.push({ node: elNode, attr: attr, text: val.trim() });
        }
      });
    });

    var uniq = {};
    nodes.forEach(function (x) {
      uniq[x.text] = 1;
    });
    var phrases = Object.keys(uniq).slice(0, 220);
    var jobs = phrases.map(function (txt) {
      return translateText(txt, targetLang, cache).then(function (translated) {
        return { src: txt, dst: translated };
      });
    });

    Promise.all(jobs).then(function (results) {
      var map = {};
      results.forEach(function (r) {
        map[r.src] = r.dst;
      });
      nodes.forEach(function (x) {
        var tr = map[x.text];
        if (!tr || tr === x.text) return;
        if (x.attr) {
          x.node.setAttribute(x.attr, tr);
        } else {
          x.node.nodeValue = x.node.nodeValue.replace(x.text, tr);
        }
      });
      writeTranslationCache(cache);
    });
  }

  function isStandaloneApp() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function isIosDevice() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
  }

  function toggleInstallButton(show) {
    if (!el.btnInstallApp) return;
    el.btnInstallApp.classList.toggle("hidden", !show);
  }

  function promptInstallApp() {
    if (isStandaloneApp()) {
      toggleInstallButton(false);
      showToast("L'application est déjà installée.");
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice
        .then(function () {
          deferredInstallPrompt = null;
          toggleInstallButton(false);
        })
        .catch(function () {});
      return;
    }
    if (isIosDevice()) {
      showToast(
        "Sur iPhone : touchez Partager puis « Sur l'écran d'accueil » pour installer l'application."
      );
      return;
    }
    showToast(
      "Installation indisponible pour le moment. Réessayez après quelques secondes sur HTTPS.",
      true
    );
  }

  function setupInstallPrompt() {
    if (!el.btnInstallApp) return;
    toggleInstallButton(!isStandaloneApp() && isIosDevice());
    window.addEventListener("beforeinstallprompt", function (evt) {
      evt.preventDefault();
      deferredInstallPrompt = evt;
      if (!isStandaloneApp()) toggleInstallButton(true);
    });
    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      toggleInstallButton(false);
      showToast("Application installée.");
    });
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

  function activateFallbackMode(reason) {
    countryCode = null;
    countryName = null;
    countryDialCode = null;
    countrySource = null;
    renderEmergency();
    refreshSosOverlay();
    if (!el.fallbackBanner) return;
    el.fallbackBanner.classList.remove("hidden");
    el.fallbackBanner.textContent =
      reason ||
      "Mode de secours activé : numéros génériques affichés (112 en priorité selon zone). Activez la localisation pour adapter au pays.";
  }

  function clearFallbackMode() {
    if (!el.fallbackBanner) return;
    el.fallbackBanner.classList.add("hidden");
    el.fallbackBanner.textContent = "";
  }

  function getFavorites() {
    try {
      var raw = localStorage.getItem(STORAGE_FAVORITES);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveFavorites(arr) {
    try {
      localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(arr.slice(0, 40)));
    } catch (e) {
      showToast("Sauvegarde des favoris impossible.", true);
    }
  }

  function favoriteId(r) {
    return (
      String(r.name || "Lieu") +
      "|" +
      Number(r.lat || 0).toFixed(5) +
      "|" +
      Number(r.lon || 0).toFixed(5)
    );
  }

  function isFavorite(r) {
    var id = favoriteId(r);
    return getFavorites().some(function (f) {
      return f.id === id;
    });
  }

  function toggleFavorite(row) {
    var list = getFavorites();
    var id = favoriteId(row);
    var i = list.findIndex(function (f) {
      return f.id === id;
    });
    if (i >= 0) {
      list.splice(i, 1);
      showToast("Favori retiré.");
    } else {
      list.unshift({
        id: id,
        name: row.name || "Lieu",
        km: row.km || 0,
        lat: row.lat,
        lon: row.lon,
        variant: row.variant || row.kind || "default",
      });
      showToast("Lieu ajouté aux favoris.");
    }
    saveFavorites(list);
    renderFavorites();
  }

  function renderFavorites() {
    if (!el.favoritesBox || !el.favoritesList) return;
    var list = getFavorites();
    if (!list.length) {
      el.favoritesBox.classList.add("hidden");
      el.favoritesList.innerHTML = "";
      return;
    }
    el.favoritesBox.classList.remove("hidden");
    renderPoiList(
      el.favoritesList,
      list,
      "Aucun favori.",
      "default",
      true
    );
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

  function hasThaiChars(text) {
    return /[\u0E00-\u0E7F]/.test(String(text || ""));
  }

  function pickDisplayNameFromTags(tags) {
    if (!tags) return null;
    var preferred = tags["name:fr"] || tags["name:en"] || tags.int_name || tags["name:latin"];
    var local = tags.name || tags["official_name"] || tags["alt_name"];
    if (preferred && local && hasThaiChars(local) && !hasThaiChars(preferred)) {
      return preferred + " (" + local + ")";
    }
    return preferred || local || null;
  }

  function rowNameFromEl(e) {
    var t = e.tags || {};
    var tagKey = t.amenity || (t.emergency === "defibrillator" ? "defibrillator" : t.emergency);
    return (
      pickDisplayNameFromTags(t) ||
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

  function renderPoiList(ul, rows, emptyMsg, variant, skipFav) {
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
      var actions = document.createElement("div");
      actions.className = "poi-actions";
      actions.appendChild(a);
      if (!skipFav) {
        var fav = document.createElement("button");
        fav.type = "button";
        var activeFav = isFavorite(r);
        fav.className = "btn-fav" + (activeFav ? " btn-fav--active" : "");
        fav.textContent = activeFav ? "★" : "☆";
        fav.title = activeFav ? "Retirer des favoris" : "Ajouter aux favoris";
        fav.setAttribute("aria-label", fav.title);
        fav.addEventListener("click", function () {
          toggleFavorite(r);
          renderListFor(activeTabId, rows);
        });
        actions.appendChild(fav);
      }
      li.appendChild(left);
      li.appendChild(actions);
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

  function renderEmergencyWithInfo(info) {
    if (!el.urgenceButtons || !window.InfosEmergency) return;
    if (el.urgenceCountry) {
      if (countryName && countryCode) {
        el.urgenceCountry.textContent =
          countryName +
          (countryDialCode ? " - Indicatif: " + countryDialCode : "");
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

  function renderEmergency() {
    if (!window.InfosEmergency) return;
    var code = countryCode || "";
    var token = ++emergencyRenderToken;
    var quick = window.InfosEmergency.getEmergencyForCountry(code);
    renderEmergencyWithInfo(quick);
    if (!window.InfosEmergency.getEmergencyForCountryDynamic) return;
    window.InfosEmergency
      .getEmergencyForCountryDynamic(code)
      .then(function (resolved) {
        if (token !== emergencyRenderToken) return;
        if (!resolved || !resolved.lines || !resolved.lines.length) return;
        renderEmergencyWithInfo(resolved);
        refreshSosOverlay();
      })
      .catch(function () {});
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
    if (el.emergencyMode && !el.emergencyMode.classList.contains("hidden")) {
      refreshSosOverlay();
    }
  }

  function reverseGeocodePrimary(lat, lon) {
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

  function reverseGeocodeFallback(lat, lon) {
    return fetch(
      "https://nominatim.openstreetmap.org/reverse?lat=" +
        encodeURIComponent(lat) +
        "&lon=" +
        encodeURIComponent(lon) +
        "&format=jsonv2&accept-language=fr",
      { method: "GET", cache: "no-store" }
    )
      .then(function (r) {
        if (!r.ok) throw new Error("Nominatim indisponible");
        return r.json();
      })
      .then(function (d) {
        var cc = d && d.address && d.address.country_code
          ? String(d.address.country_code).toUpperCase()
          : null;
        return {
          countryCode: cc,
          countryName: d && d.address ? d.address.country : null,
        };
      });
  }

  function reverseGeocode(lat, lon) {
    return reverseGeocodePrimary(lat, lon).catch(function () {
      return reverseGeocodeFallback(lat, lon);
    });
  }

  function fetchDialCodeByCountryCode(code) {
    var c = String(code || "").toUpperCase();
    if (!c) return Promise.resolve(null);
    if (dialCodeCache[c] !== undefined) return Promise.resolve(dialCodeCache[c]);
    return fetch("https://restcountries.com/v3.1/alpha/" + encodeURIComponent(c), {
      method: "GET",
      cache: "no-store",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Pays inconnu");
        return r.json();
      })
      .then(function (arr) {
        var row = Array.isArray(arr) ? arr[0] : arr;
        var dial =
          row && row.idd && row.idd.root
            ? row.idd.root + ((row.idd.suffixes && row.idd.suffixes[0]) || "")
            : null;
        dialCodeCache[c] = dial;
        return dial;
      })
      .catch(function () {
        dialCodeCache[c] = null;
        return null;
      });
  }

  function detectCountryCenterByIso(iso) {
    return fetch("https://restcountries.com/v3.1/alpha/" + encodeURIComponent(iso), {
      method: "GET",
      cache: "no-store",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Pays inconnu");
        return r.json();
      })
      .then(function (arr) {
        var row = Array.isArray(arr) ? arr[0] : arr;
        if (!row || !row.latlng || row.latlng.length < 2) {
          throw new Error("Centre pays indisponible");
        }
        return {
          lat: Number(row.latlng[0]),
          lon: Number(row.latlng[1]),
          code: (row.cca2 || iso || "").toUpperCase(),
          dialCode:
            row.idd && row.idd.root
              ? row.idd.root + ((row.idd.suffixes && row.idd.suffixes[0]) || "")
              : null,
          name:
            (row.translations &&
              row.translations.fra &&
              row.translations.fra.common) ||
            (row.name && row.name.common) ||
            iso,
        };
      });
  }

  function useSimulatedCountryMode() {
    var iso = el.simCountryIso ? String(el.simCountryIso.value || "").trim().toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(iso)) {
      showToast("Entrez un code pays ISO-2 valide (ex: CH, FR, US).", true);
      return;
    }
    countryResolveMode = "sim";
    detectCountryCenterByIso(iso)
      .then(function (p) {
        countryCode = p.code;
        countryName = p.name;
        countryDialCode = p.dialCode || null;
        countrySource = "sim";
        lastPos = { coords: { latitude: p.lat, longitude: p.lon } };
        clearFallbackMode();
        if (el.coords) {
          el.coords.classList.remove("hidden");
          el.coords.querySelector("strong").textContent = formatPos(lastPos);
        }
        nearbyLoaded = false;
        resetTabState();
        clearAllPlaceLists();
        renderEmergency();
        loadNearbyData(lastPos, true);
        if (el.simCountryInfo) {
          el.simCountryInfo.classList.remove("hidden");
          el.simCountryInfo.textContent =
            "Test hors ligne actif : " +
            p.name +
            (p.dialCode ? " - Indicatif: " + p.dialCode : "");
        }
        showToast("Simulation active : " + p.name + ".");
      })
      .catch(function () {
        showToast("Impossible de simuler ce pays. Vérifiez le code ISO.", true);
      });
  }

  function resetSimulatedCountryMode() {
    countryResolveMode = "geo";
    countrySource = null;
    if (el.simCountryInfo) {
      el.simCountryInfo.classList.add("hidden");
      el.simCountryInfo.textContent = "";
    }
    showToast("Retour au mode GPS.");
    startGeolocation();
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
        if (countryResolveMode !== "geo") return;
        var nextCode = data.countryCode || null;
        countryCode = nextCode;
        countryName = data.countryName || data.principalSubdivision || null;
        countryDialCode = null;
        countrySource = countryCode ? "geo" : null;
        clearFallbackMode();
        renderEmergency();
        if (nextCode) {
          fetchDialCodeByCountryCode(nextCode).then(function (dial) {
            if (countryCode !== nextCode) return;
            countryDialCode = dial;
            renderEmergency();
          });
        }
      })
      .catch(function () {
        activateFallbackMode("Pays non détecté : mode de secours activé avec numéros génériques.");
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
    clearFallbackMode();
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
    activateFallbackMode(
      "Mode de secours activé : localisation indisponible, numéros génériques affichés immédiatement."
    );
    showToast(err.message || "Erreur de géolocalisation", true);
  }

  function startGeolocation() {
    if (!navigator.geolocation) {
      showToast("Géolocalisation non prise en charge sur cet appareil.", true);
      return;
    }
    setStatus("Recherche de la position…");
    if (el.btnGeo) {
      el.btnGeo.disabled = true;
      el.btnGeo.textContent = "Localisation en cours…";
    }
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

  function requestGeolocationAuto() {
    if (lastPos || autoGeoAttempted) return;
    autoGeoAttempted = true;
    if (!navigator.geolocation) return;

    // Force an immediate permission prompt where the browser supports it.
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        onPos(pos);
      },
      function (err) {
        if (err && err.code === 1) {
          showToast(
            "La localisation est bloquée. Autorisez-la dans les réglages du navigateur pour un mode automatique.",
            true
          );
          return;
        }
        startGeolocation();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function setupAutoGeoRetry() {
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then(function (status) {
        if (status.state === "granted" && !lastPos) {
          startGeolocation();
        }
        status.onchange = function () {
          if (status.state === "granted" && !lastPos) {
            startGeolocation();
          }
        };
      })
      .catch(function () {});
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

  function profileSlotLabel(slot) {
    if (slot === "child") return "Enfant";
    if (slot === "senior") return "Parent / senior";
    return "Moi";
  }

  function getProfilesData() {
    var empty = {
      active: "self",
      profiles: { self: {}, child: {}, senior: {} },
    };
    try {
      var s = localStorage.getItem(STORAGE_PROFILE);
      if (!s) return empty;
      var o = JSON.parse(s);
      if (o && o.profiles) {
        o.active = o.active || "self";
        o.profiles.self = o.profiles.self || {};
        o.profiles.child = o.profiles.child || {};
        o.profiles.senior = o.profiles.senior || {};
        return o;
      }
      if (o && typeof o === "object") {
        empty.profiles.self = o;
      }
      return empty;
    } catch (e) {
      return empty;
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
      var data = getProfilesData();
      data.active = activeProfileSlot;
      data.profiles[activeProfileSlot] = o;
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(data));
      showToast("Fiche enregistrée pour le profil actif.");
    } catch (e) {
      showToast("Stockage indisponible (navigateur privé ?).", true);
    }
  }

  function loadProfile() {
    if (!el.formProfile) return;
    var data = getProfilesData();
    activeProfileSlot = data.active || "self";
    if (el.profileSlot) el.profileSlot.value = activeProfileSlot;
    var o = data.profiles[activeProfileSlot] || {};
    ["name", "blood", "allergies", "meds", "contact", "contactPhone", "notes"].forEach(
      function (f) {
        var inp = el.formProfile.elements.namedItem(f);
        if (inp) inp.value = o[f] || "";
      }
    );
  }

  function onProfileSlotChange() {
    if (!el.profileSlot) return;
    activeProfileSlot = el.profileSlot.value || "self";
    var data = getProfilesData();
    data.active = activeProfileSlot;
    try {
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(data));
    } catch (e) {}
    loadProfile();
  }

  function copyProfileSummary() {
    try {
      var data = getProfilesData();
      var o = data.profiles[activeProfileSlot] || {};
      var lines = [
        "— Emergency profile (SOS Emergency) —",
        "Profil: " + profileSlotLabel(activeProfileSlot),
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

  function exportProfilePdf() {
    try {
      var data = getProfilesData();
      var o = data.profiles[activeProfileSlot] || {};
      var html =
        "<!doctype html><html><head><meta charset='utf-8'><title>Fiche urgence</title>" +
        "<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{margin:0 0 12px}p{margin:6px 0}strong{display:inline-block;min-width:180px}</style>" +
        "</head><body>" +
        "<h1>Emergency profile - SOS Emergency</h1>" +
        "<p><strong>Profil :</strong> " + profileSlotLabel(activeProfileSlot) + "</p>" +
        "<p><strong>Identité :</strong> " + (o.name || "-") + "</p>" +
        "<p><strong>Groupe sanguin :</strong> " + (o.blood || "-") + "</p>" +
        "<p><strong>Allergies :</strong> " + (o.allergies || "-") + "</p>" +
        "<p><strong>Traitements :</strong> " + (o.meds || "-") + "</p>" +
        "<p><strong>Contact urgence :</strong> " + (o.contact || "-") + " " + (o.contactPhone || "") + "</p>" +
        "<p><strong>Notes :</strong> " + (o.notes || "-") + "</p>" +
        "<p style='margin-top:18px;font-size:12px;color:#666'>Document local genere le " +
        new Date().toLocaleString("fr-FR") +
        "</p>" +
        "</body></html>";
      var w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) {
        showToast("Popup bloquee : autorisez les fenetres pour exporter le PDF.", true);
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(function () {
        w.print();
      }, 250);
    } catch (e) {
      showToast("Export PDF impossible.", true);
    }
  }

  function sendSafetyMessage() {
    var data = getProfilesData();
    var p = data.profiles[activeProfileSlot] || {};
    var phone = (p.contactPhone || "").replace(/\s+/g, "");
    var who = p.name || profileSlotLabel(activeProfileSlot);
    var msg =
      "Je suis en securite (" +
      who +
      ") - " +
      new Date().toLocaleString("fr-FR");
    if (lastPos && lastPos.coords) {
      msg +=
        "\nPosition: " +
        lastPos.coords.latitude.toFixed(5) +
        ", " +
        lastPos.coords.longitude.toFixed(5) +
        "\nhttps://www.google.com/maps?q=" +
        lastPos.coords.latitude +
        "," +
        lastPos.coords.longitude;
    }
    if (phone) {
      var smsUrl = "sms:" + encodeURIComponent(phone) + "?body=" + encodeURIComponent(msg);
      if (
        window.confirm(
          "Un message va etre prepare pour le contact d'urgence (" +
            phone +
            "). Continuer ?"
        )
      ) {
        window.location.href = smsUrl;
        return;
      }
    }
    if (navigator.share) {
      navigator
        .share({ title: "Je suis en securite", text: msg })
        .then(function () {
          showToast("Message de securite partage.");
        })
        .catch(function () {
          copyTextFallback(msg);
        });
      return;
    }
    copyTextFallback(msg);
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
    applyAutoI18n();
    setupInstallPrompt();
    loadProfile();
    renderShortcuts();
    renderFavorites();

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
    if (el.btnExportProfile) {
      el.btnExportProfile.addEventListener("click", function () {
        exportProfilePdf();
      });
    }
    if (el.btnAddShortcut) {
      el.btnAddShortcut.addEventListener("click", addShortcut);
    }
    if (el.btnInstallApp) {
      el.btnInstallApp.addEventListener("click", promptInstallApp);
    }
    if (el.profileSlot) {
      el.profileSlot.addEventListener("change", onProfileSlotChange);
    }

    if (el.btnOpenEmergency) {
      el.btnOpenEmergency.addEventListener("click", openEmergencyMode);
    }
    if (el.btnCloseEmergency) {
      el.btnCloseEmergency.addEventListener("click", closeEmergencyMode);
    }
    if (el.btnEmergencyShare) {
      el.btnEmergencyShare.addEventListener("click", shareMyPosition);
    }
    if (el.btnEmergencyFiche) {
      el.btnEmergencyFiche.addEventListener("click", function () {
        closeEmergencyMode();
        var s = $("section-profile");
        if (s) s.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (el.btnEmergencySafe) {
      el.btnEmergencySafe.addEventListener("click", sendSafetyMessage);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && el.emergencyMode && !el.emergencyMode.classList.contains("hidden")) {
        closeEmergencyMode();
      }
    });

    el.tabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-tab");
        if (id) setActiveTab(id);
      });
    });

    if (el.btnGeo) {
      el.btnGeo.addEventListener("click", function () {
        countryResolveMode = "geo";
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        el.btnGeo.textContent = "Localisation en cours…";
        startGeolocation();
      });
    }
    if (el.btnCountrySim) {
      el.btnCountrySim.addEventListener("click", useSimulatedCountryMode);
    }
    if (el.btnCountrySimReset) {
      el.btnCountrySimReset.addEventListener("click", resetSimulatedCountryMode);
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
      activateFallbackMode(
        "Mode de secours activé : vous etes hors ligne, numéros d'urgence génériques disponibles."
      );
      tryRestoreAnyCachedPlaces();
    }

    renderEmergency();
    setActiveTab("h");
    requestGeolocationAuto();
    setupAutoGeoRetry();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && !lastPos) {
        requestGeolocationAuto();
      }
    });

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
