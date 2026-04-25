/**
 * Requêtes Overpass avec bascule de serveur si le premier échoue.
 */
(function (root) {
  var ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  function postQuery(url, query) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "data=" + encodeURIComponent(query),
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /**
   * @param {string} query corps Overpass QL
   * @returns {Promise<object>}
   */
  function run(query) {
    function attempt(i) {
      if (i >= ENDPOINTS.length) {
        return Promise.reject(new Error("Tous les serveurs Overpass ont échoué."));
      }
      return postQuery(ENDPOINTS[i], query).catch(function () {
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  root.InfosOverpass = { run: run };
})(typeof self !== "undefined" ? self : window);
