/**
 * Numéros indicatifs — vérifier auprès des sources officielles du pays.
 * 112 = numéro d'urgence harmonisé dans l'UE (et plusieurs pays voisins).
 */
(function (root) {
  var API_ALL = "https://emergencynumberapi.com/api/data/all";
  var CACHE_KEY = "infos_indispensables_emergency_all_v1";
  var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var WORLD_DATA = null;

  var EU = {
    AT: 1,
    BE: 1,
    BG: 1,
    HR: 1,
    CY: 1,
    CZ: 1,
    DK: 1,
    EE: 1,
    FI: 1,
    FR: 1,
    DE: 1,
    GR: 1,
    HU: 1,
    IE: 1,
    IT: 1,
    LV: 1,
    LT: 1,
    LU: 1,
    MT: 1,
    NL: 1,
    PL: 1,
    PT: 1,
    RO: 1,
    SK: 1,
    SI: 1,
    ES: 1,
    SE: 1,
    IS: 1,
    LI: 1,
    NO: 1,
  };

  /** @typedef {{ num: string, label: string }} EmergLine */

  /**
   * @param {string} cc
   * @returns {{ countryLabel: string, lines: EmergLine[], hint?: string }}
   */
  function getEmergencyForCountry(cc) {
    if (!cc || !String(cc).trim()) {
      return {
        countryLabel: "—",
        lines: [{ num: "112", label: "Urgences (Europe)" }],
        hint:
          "Activez la localisation pour afficher le pays détecté, les numéros adaptés et les hôpitaux à proximité.",
      };
    }
    var c = String(cc).toUpperCase();
    var spec = SPECIAL[c];
    if (spec) return spec;
    if (EU[c]) {
      return {
        countryLabel: c,
        lines: [{ num: "112", label: "Urgences (Europe)" }],
        hint:
          "Dans l’UE, le 112 fonctionne partout. Des numéros nationaux existent souvent (police, SAMU, pompiers) — renseignez-vous localement.",
      };
    }
    if (c === "GB" || c === "UK") {
      return {
        countryLabel: "Royaume-Uni",
        lines: [
          { num: "999", label: "Urgences" },
          { num: "112", label: "Urgences (compatible)" },
        ],
      };
    }
    if (c === "CH") {
      return {
        countryLabel: "Suisse",
        lines: [
          { num: "112", label: "Urgences générales" },
          { num: "117", label: "Police" },
          { num: "144", label: "Secours / ambulance" },
          { num: "145", label: "Poison / santé" },
        ],
      };
    }
    if (c === "US" || c === "CA") {
      return {
        countryLabel: c === "US" ? "États-Unis" : "Canada",
        lines: [{ num: "911", label: "Urgences" }],
      };
    }
    if (c === "AU") {
      return {
        countryLabel: "Australie",
        lines: [{ num: "000", label: "Urgences" }],
      };
    }
    if (c === "NZ") {
      return {
        countryLabel: "Nouvelle-Zélande",
        lines: [{ num: "111", label: "Urgences" }],
      };
    }
    if (c === "JP") {
      return {
        countryLabel: "Japon",
        lines: [
          { num: "110", label: "Police" },
          { num: "119", label: "Pompiers / ambulance" },
        ],
      };
    }
    return {
      countryLabel: c || "Inconnu",
      lines: [
        { num: "112", label: "Essayer 112 (Europe / compatible)" },
        { num: "911", label: "Essayer 911 (Amérique du Nord)" },
      ],
      hint:
        "Pays non détaillé dans l’appli : confirmez les numéros auprès des autorités locales.",
    };
  }

  /** @type {Record<string, { countryLabel: string, lines: EmergLine[], hint?: string }>} */
  var SPECIAL = {
    FR: {
      countryLabel: "France",
      lines: [
        { num: "112", label: "Urgences (appel unique)" },
        { num: "15", label: "SAMU (médical)" },
        { num: "17", label: "Police" },
        { num: "18", label: "Pompiers" },
        { num: "114", label: "Urgences — SMS / sourds" },
      ],
    },
    DE: {
      countryLabel: "Allemagne",
      lines: [
        { num: "112", label: "Pompiers / ambulance" },
        { num: "110", label: "Police" },
      ],
    },
    ES: {
      countryLabel: "Espagne",
      lines: [
        { num: "112", label: "Urgences" },
        { num: "091", label: "Police nationale" },
        { num: "062", label: "Guardia civil" },
      ],
    },
    IT: {
      countryLabel: "Italie",
      lines: [
        { num: "112", label: "Carabinieri / urgences" },
        { num: "113", label: "Police" },
        { num: "118", label: "Ambulance médicale" },
        { num: "115", label: "Pompiers" },
      ],
    },
    BE: {
      countryLabel: "Belgique",
      lines: [
        { num: "112", label: "Urgences" },
        { num: "101", label: "Pompiers (régions)" },
        { num: "100", label: "Police (régions)" },
      ],
    },
    NL: {
      countryLabel: "Pays-Bas",
      lines: [{ num: "112", label: "Urgences" }],
    },
    PT: {
      countryLabel: "Portugal",
      lines: [
        { num: "112", label: "Urgences" },
        { num: "117", label: "GNR" },
        { num: "133", label: "Police PSP" },
      ],
    },
    PL: {
      countryLabel: "Pologne",
      lines: [
        { num: "112", label: "Urgences" },
        { num: "997", label: "Police" },
        { num: "998", label: "Pompiers" },
        { num: "999", label: "Ambulance" },
      ],
    },
    IE: {
      countryLabel: "Irlande",
      lines: [
        { num: "112", label: "Urgences" },
        { num: "999", label: "Urgences (classique)" },
      ],
    },
    TH: {
      countryLabel: "Thaïlande",
      lines: [
        { num: "191", label: "Police / urgence générale" },
        { num: "1669", label: "Urgence médicale / ambulance" },
        { num: "199", label: "Pompiers" },
        { num: "1155", label: "Tourist Police (anglais)" },
      ],
      hint:
        "En Thaïlande, privilégiez 191 (urgence générale), 1669 (médical) et 199 (incendie).",
    },
  };

  function readCachedWorldData() {
    try {
      if (!root.localStorage) return null;
      var raw = root.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.ts || !Array.isArray(p.data)) return null;
      if (Date.now() - p.ts > CACHE_TTL_MS) return null;
      return p.data;
    } catch (e) {
      return null;
    }
  }

  function writeCachedWorldData(data) {
    try {
      if (!root.localStorage) return;
      root.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data: data })
      );
    } catch (e) {}
  }

  function indexWorldData(arr) {
    var out = {};
    (arr || []).forEach(function (row) {
      if (!row || !row.Country || !row.Country.ISOCode) return;
      out[String(row.Country.ISOCode).toUpperCase()] = row;
    });
    return out;
  }

  function loadWorldData() {
    if (WORLD_DATA) return Promise.resolve(WORLD_DATA);
    var cached = readCachedWorldData();
    if (cached && cached.length) {
      WORLD_DATA = indexWorldData(cached);
      return Promise.resolve(WORLD_DATA);
    }
    return fetch(API_ALL, { method: "GET", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("Emergency API indisponible");
        return r.json();
      })
      .then(function (arr) {
        if (!Array.isArray(arr)) throw new Error("Format API invalide");
        writeCachedWorldData(arr);
        WORLD_DATA = indexWorldData(arr);
        return WORLD_DATA;
      });
  }

  function addLines(lines, nums, label) {
    if (!nums || !nums.length) return;
    nums.forEach(function (n) {
      var num = String(n || "").trim();
      if (!num) return;
      if (
        !lines.some(function (x) {
          return x.num === num && x.label === label;
        })
      ) {
        lines.push({ num: num, label: label });
      }
    });
  }

  function parseApiCountry(apiCountry, isoCode) {
    if (!apiCountry) return null;
    var lines = [];
    addLines(lines, apiCountry.Dispatch && apiCountry.Dispatch.All, "Urgences (dispatch)");
    addLines(lines, apiCountry.Police && apiCountry.Police.All, "Police");
    addLines(lines, apiCountry.Ambulance && apiCountry.Ambulance.All, "Ambulance");
    addLines(lines, apiCountry.Fire && apiCountry.Fire.All, "Pompiers");

    if (!lines.length && apiCountry.Member_112) {
      lines.push({ num: "112", label: "Urgences (112)" });
    }

    if (!lines.length) return null;

    var hint = null;
    if (apiCountry.LocalOnly) {
      hint =
        "Des numéros locaux peuvent être requis selon la zone : vérifiez la disponibilité régionale.";
    } else if (apiCountry.Member_112) {
      hint = "Le 112 peut aussi fonctionner dans ce pays.";
    }

    return {
      countryLabel:
        (apiCountry.Country && apiCountry.Country.Name) || isoCode || "Inconnu",
      lines: lines,
      hint: hint,
    };
  }

  function getEmergencyForCountryDynamic(cc) {
    var base = getEmergencyForCountry(cc);
    var code = (cc || "").toUpperCase();
    if (!code) return Promise.resolve(base);
    return loadWorldData()
      .then(function (world) {
        var row = world && world[code];
        var parsed = parseApiCountry(row, code);
        return parsed || base;
      })
      .catch(function () {
        return base;
      });
  }

  root.InfosEmergency = {
    getEmergencyForCountry: getEmergencyForCountry,
    getEmergencyForCountryDynamic: getEmergencyForCountryDynamic,
    isEu: function (cc) {
      return !!EU[(cc || "").toUpperCase()];
    },
  };
})(typeof self !== "undefined" ? self : window);
