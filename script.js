// Initialisation de la carte centrée sur la France
const map = L.map('map').setView([46.603354, 1.888334], 6);

// Ajout du fond OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
  maxZoom: 18,
}).addTo(map);

// Chargement du fichier GeoJSON
fetch('departements.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      onEachFeature: function (feature, layer) {
        if (feature.properties && feature.properties.nom) {
          layer.bindPopup('<strong>' + feature.properties.nom + '</strong>');
        }
      },
      style: {
        color: "#3388ff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.2
      }
    }).addTo(map);
  })
  .catch(error => {
    console.error("Erreur lors du chargement du GeoJSON :", error);
  });
