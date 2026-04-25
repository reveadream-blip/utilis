/** Requêtes Overpass par catégorie (rayons en mètres indicatifs). */
(function (root) {
  function q(a) {
    return a.join("");
  }

  root.InfosPlaceQueries = {
    hospital: function (lat, lon) {
      return q([
        "[out:json][timeout:28];(",
        'node["amenity"="hospital"](around:18000,',
        lat,
        ",",
        lon,
        ');way["amenity"="hospital"](around:18000,',
        lat,
        ",",
        lon,
        "););out center 26;",
      ]);
    },
    fire: function (lat, lon) {
      return q([
        "[out:json][timeout:28];(",
        'node["amenity"="fire_station"](around:14000,',
        lat,
        ",",
        lon,
        ');way["amenity"="fire_station"](around:14000,',
        lat,
        ",",
        lon,
        "););out center 28;",
      ]);
    },
    police: function (lat, lon) {
      return q([
        "[out:json][timeout:28];(",
        'node["amenity"="police"](around:14000,',
        lat,
        ",",
        lon,
        ');way["amenity"="police"](around:14000,',
        lat,
        ",",
        lon,
        "););out center 30;",
      ]);
    },
    pharmacy: function (lat, lon) {
      return q([
        "[out:json][timeout:22];node[\"amenity\"=\"pharmacy\"](around:10000,",
        lat,
        ",",
        lon,
        ");out 30;",
      ]);
    },
    med: function (lat, lon) {
      return q([
        "[out:json][timeout:28];(",
        'node["amenity"="doctors"](around:12000,',
        lat,
        ",",
        lon,
        ');way["amenity"="doctors"](around:12000,',
        lat,
        ",",
        lon,
        ');node["amenity"="clinic"](around:12000,',
        lat,
        ",",
        lon,
        ');way["amenity"="clinic"](around:12000,',
        lat,
        ",",
        lon,
        "););out center 24;",
      ]);
    },
    vet: function (lat, lon) {
      return q([
        "[out:json][timeout:26];(",
        'node["amenity"="veterinary"](around:20000,',
        lat,
        ",",
        lon,
        ');way["amenity"="veterinary"](around:20000,',
        lat,
        ",",
        lon,
        "););out center 22;",
      ]);
    },
    defib: function (lat, lon) {
      return q([
        "[out:json][timeout:22];node[\"emergency\"=\"defibrillator\"](around:8000,",
        lat,
        ",",
        lon,
        ");out 28;",
      ]);
    },
    emb: function (lat, lon) {
      return q([
        "[out:json][timeout:28];(",
        'node["amenity"="embassy"](around:50000,',
        lat,
        ",",
        lon,
        ');way["amenity"="embassy"](around:50000,',
        lat,
        ",",
        lon,
        "););out center 18;",
      ]);
    },
  };
})(typeof self !== "undefined" ? self : window);
