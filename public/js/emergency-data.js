/**
 * Numéros indicatifs — vérifier auprès des sources officielles du pays.
 * 112 = numéro d'urgence harmonisé dans l'UE (et plusieurs pays voisins).
 */
(function (root) {
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
  };

  root.InfosEmergency = {
    getEmergencyForCountry: getEmergencyForCountry,
    isEu: function (cc) {
      return !!EU[(cc || "").toUpperCase()];
    },
  };
})(typeof self !== "undefined" ? self : window);
