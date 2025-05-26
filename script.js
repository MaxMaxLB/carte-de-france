let map = L.map('map').setView([46.6, 1.88], 6);

function getDistinctColor(index, total) {
  // Génère une couleur HSL bien distincte et vive pour chaque index
  const hue = (index * 360 / total) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function getDeptCodeFromPostal(cp) {
  cp = String(cp).padStart(5, '0');
  if (cp.startsWith('20')) {
    // Gestion spéciale Corse
    if (
      cp.startsWith('201') ||
      cp.startsWith('20220') ||
      cp.startsWith('20221') ||
      cp.startsWith('20222') ||
      cp.startsWith('20223') ||
      cp.startsWith('20224')
    ) {
      return '2A';
    } else {
      return '2B';
    }
  }
  return cp.substring(0, 2);
}

// Fond OSM
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap',
  maxZoom: 18,
}).addTo(map);

let departementData; // Contiendra les données GeoJSON
let repByDept = {};  // Dictionnaire { '75': 'Jean', '13': 'Alice' }
let colorByRep = {}; // Dictionnaire { 'Jean': '#ff0000', 'Alice': '#00ff00' }
let deptInfo = {}; // Ex: { "75": { rep: "Jean", douz: 14, unit: 5 } }
let selectedLayer = null;
let repStats = {}; // { "Dupont": { nbClients: 0 } }


function getRandomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

// Charger GeoJSON des départements
fetch('departements.geojson')
  .then(res => res.json())
  .then(data => {
    departementData = data;
  });

function updateLegend(colorByRep, repStats) {
  const legendDiv = document.getElementById('legend-content');
  legendDiv.innerHTML = ''; // Vide l'ancienne légende
  for (const [rep, color] of Object.entries(colorByRep)) {
    const nbClients = repStats && repStats[rep] ? repStats[rep].nbClients : 0;
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.marginBottom = '4px';
    item.innerHTML = `
      <span style="display:inline-block;width:18px;height:18px;background:${color};border:1px solid #666;border-radius:3px;margin-right:8px;"></span>
      <span>${rep}</span>
      <span style="margin-left:8px; color:#888;">(<b>${nbClients}</b> clients)</span>
    `;
    legendDiv.appendChild(item);
  }
}


function updateDeptInfo(nom, numero, info) {
  const container = document.getElementById('dept-info');
  if (info) {
    container.innerHTML = `
      <b>${numero} - ${nom}</b><br>
      <b>Représentant :</b> ${info.rep}<br>
      <b>Base imposable :</b> ${info.base.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €<br>
      <b>Douzaines :</b> ${info.douz}<br>
      <b>Unités :</b> ${info.unit}<br>
      <b>Nombre de clients :</b> ${info.nbClients}
    `;
  } else {
    container.innerHTML = `
      <b>${numero} - ${nom}</b><br>
      <i style="color:#999">Aucune donnée</i>
    `;
  }
}


// Lorsqu’un fichier Excel est chargé
document.getElementById('file-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    // Création du mapping département -> représentant
    // 1. Extraire la liste des représentants uniques
    const repSet = new Set();
    json.forEach(row => {
      if (row.CODI && row.REPRES) {
        repSet.add(row.REPRES);
      }
    });
    const repList = Array.from(repSet);

    // 2. Générer des couleurs distinctes pour chaque représentant
    colorByRep = {};
    repList.forEach((rep, i) => {
      colorByRep[rep] = getDistinctColor(i, repList.length);
    });

    // Parcours les lignes
    deptInfo = {};
    json.forEach(row => {
      if (row.CODI && row.REPRES) {
        const deptCode = getDeptCodeFromPostal(row.CODI);
        if (!deptInfo[deptCode]) {
          deptInfo[deptCode] = { rep: row.REPRES, douz: 0, unit: 0, nbClients: 0, base: 0 };
        }
        deptInfo[deptCode].douz += Number(row.DOTZENES) || 0;
        deptInfo[deptCode].unit += Number(row.UNITATS) || 0;
        deptInfo[deptCode].nbClients += 1;
        const rep = row.REPRES;
        if (rep) {
          if (!repStats[rep]) repStats[rep] = { nbClients: 0 };
          repStats[rep].nbClients += 1;
        }

        // Correction du champ BASE (format européen accepté)
        let baseVal = row.BASE;
        if (typeof baseVal === 'string') {
          baseVal = baseVal.replace(/\s/g, '').replace(',', '.');
        }
        baseVal = parseFloat(baseVal) || 0;
        deptInfo[deptCode].base += baseVal;
      }
    });


    // 4. Mettre à jour la légende
    updateLegend(colorByRep, repStats);

    // Affichage des départements avec styles
    L.geoJSON(departementData, {
      style: feature => {
        const code = feature.properties.code;
        const info = deptInfo[code];
        return {
          color: "#333",
          weight: 1,
          fillOpacity: 0.4,
          fillColor: info ? colorByRep[info.rep] : "#ccc"
        };
      },
      onEachFeature: (feature, layer) => {
        const code = feature.properties.code;           // numéro (ex: 75, 2A, 2B)
        const nom = feature.properties.nom || "Inconnu";
        const info = deptInfo[code];
        layer.on('click', function () {
          // Optionnel : gestion surbrillance si besoin
          if (selectedLayer) selectedLayer.setStyle({ weight: 1, color: '#333' });
          layer.setStyle({ weight: 3, color: '#111' });
          selectedLayer = layer;

          updateDeptInfo(nom, code, info);  // <---- on passe le numéro ici
        });
      }

    }).addTo(map);
  };

  reader.readAsArrayBuffer(file);
});
