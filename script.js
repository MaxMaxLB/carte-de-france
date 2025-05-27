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
let deptLayers = {}; // Stocke chaque layer par code département

let emptyDepts = []; // Stocke les départements vides
let deptExceptionReps = {}; // Ex : { '12': 'Dupont', '21': 'Martin', ... }
try {
  const saved = localStorage.getItem('deptExceptionReps');
  if (saved) deptExceptionReps = JSON.parse(saved);
} catch (e) { deptExceptionReps = {}; }

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

function updateDeptClientsList(deptCode) {
  const dropdown = document.getElementById('client-dropdown');
  const detail = document.getElementById('client-detail');
  dropdown.innerHTML = '<option value="">Sélectionnez un client</option>';
  detail.innerHTML = '';

  if (!deptCode) return;

  // Récupère tous les clients du département sélectionné
  const clients = clientsList.filter(row => getDeptCodeFromPostal(row.CODI) === deptCode);

  clients.forEach((row, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${row.CLIENT} (${row.CODI})`;
    dropdown.appendChild(opt);
  });

  dropdown.onchange = function () {
    if (this.value === "") {
      detail.innerHTML = "";
      return;
    }
    const row = clients[this.value];
    detail.innerHTML = `
      <b>${row.CLIENT}</b><br>
      Code postal : ${row.CODI}<br>
      Représentant : ${row.REPRES}<br>
      Douzaines : ${row.DOTZENES || 0}<br>
      Unités : ${row.UNITATS || 0}<br>
      Base : ${(row.BASE || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
    `;
  };
}

function updateExceptionsPanel() {
  const container = document.getElementById('exceptions-list');
  container.innerHTML = '';

  emptyDepts.forEach(deptCode => {
    // Nom du département
    const feature = departementData.features.find(f => f.properties.code === deptCode);
    const nom = feature ? feature.properties.nom : deptCode;
    // Menu déroulant de représentants
    const select = document.createElement('select');
    select.style.marginLeft = "10px";
    select.innerHTML = `<option value="">Aucun</option>`;
    Object.keys(colorByRep).forEach(rep => {
      select.innerHTML += `<option value="${rep}">${rep}</option>`;
    });

    // Si déjà une affectation d’exception, on la réaffiche
    if (deptExceptionReps[deptCode]) select.value = deptExceptionReps[deptCode];

    select.addEventListener('change', function () {
      // Mets à jour l'exception dans le tableau global
      if (this.value) {
        deptExceptionReps[deptCode] = this.value;
      } else {
        delete deptExceptionReps[deptCode];
      }

      // (Option) Persistance locale :
      localStorage.setItem('deptExceptionReps', JSON.stringify(deptExceptionReps));

      // Ne change deptInfo QUE si aucun client :
      if (!deptInfo[deptCode] || deptInfo[deptCode].nbClients === 0) {
        if (!deptInfo[deptCode]) deptInfo[deptCode] = { rep: null, douz: 0, unit: 0, nbClients: 0, base: 0 };
        deptInfo[deptCode].rep = this.value || null;

        // Met à jour la couleur du département sur la carte
        const layer = deptLayers[deptCode];
        if (layer) {
          let rep = deptExceptionReps[deptCode];
          layer.setStyle({ fillColor: rep ? colorByRep[rep] : "#ccc" });
        }
      }
    });

    const div = document.createElement('div');
    div.style.marginBottom = "8px";
    div.innerHTML = `<b>${deptCode}</b> - ${nom}`;
    div.appendChild(select);
    container.appendChild(div);
  });
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
    clientsList = json;


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
    // Construire le menu des départements sans clients
    const allDepts = departementData.features.map(f => f.properties.code);
    emptyDepts = allDepts.filter(code => !deptInfo[code] || !deptInfo[code].nbClients || deptInfo[code].nbClients === 0);

    updateExceptionsPanel();
    //Pour minimser ce Menu
    const exceptionsHeader = document.getElementById('exceptions-header');
    const exceptionsList = document.getElementById('exceptions-list');
    const exceptionsPanel = document.getElementById('exceptions-panel');
    const exceptionsToggle = document.getElementById('exceptions-toggle');

    let exceptionsMinimized = false;

    exceptionsHeader.addEventListener('click', function () {
      exceptionsMinimized = !exceptionsMinimized;
      if (exceptionsMinimized) {
        exceptionsList.style.display = "none";
        exceptionsToggle.innerHTML = "&#9654;"; // flèche droite
        exceptionsPanel.style.minWidth = "0";
        exceptionsPanel.style.width = "fit-content";
      } else {
        exceptionsList.style.display = "block";
        exceptionsToggle.innerHTML = "&#9660;"; // flèche bas
        exceptionsPanel.style.minWidth = "280px";
        exceptionsPanel.style.width = "";
      }
    });

    // 4. Mettre à jour la légende
    updateLegend(colorByRep, repStats);

    // Affichage des départements avec styles
    L.geoJSON(departementData, {
      style: feature => {
        const code = feature.properties.code;
        const info = deptInfo[code];
        let rep = null;
        if (info && info.nbClients > 0 && info.rep) {
          rep = info.rep; // priorité au client réel
        } else if (deptExceptionReps[code]) {
          rep = deptExceptionReps[code];
        }
        return {
          color: "#333",
          weight: 1,
          fillOpacity: 0.4,
          fillColor: rep ? colorByRep[rep] : "#ccc"
        };
      }
      ,
      onEachFeature: (feature, layer) => {
        const code = feature.properties.code;
        const nom = feature.properties.nom || "Inconnu";
        const info = deptInfo[code];

        // Enregistre chaque layer par code pour y accéder facilement
        deptLayers[code] = layer;

        layer.on('click', function () {
          if (selectedLayer) selectedLayer.setStyle({ weight: 1, color: '#333' });
          layer.setStyle({ weight: 3, color: '#111' });
          selectedLayer = layer;
          updateDeptInfo(nom, code, info);
          updateDeptClientsList(code); // deptCode = ex: "75", "2A"
        });
      }
    }).addTo(map);
  };
  const deptSearchInput = document.getElementById('dept-search');

  deptSearchInput.addEventListener('input', function () {
    const deptCode = this.value.trim().toUpperCase().padStart(2, '0'); // ex "07", "2A"...

    // Vérifie l'existence du département
    if (!deptCode || !(deptCode in deptLayers)) {
      // Enlève le surlignage précédent
      if (selectedLayer) selectedLayer.setStyle({ weight: 1, color: '#333' });
      selectedLayer = null;
      // Vide l'infopanel et le menu client
      updateDeptInfo('', '', null);
      updateDeptClientsList();
      return;
    }

    // Retire la sélection précédente si elle est différente
    if (selectedLayer && selectedLayer !== deptLayers[deptCode]) selectedLayer.setStyle({ weight: 1, color: '#333' });

    // Surligne le nouveau département sélectionné
    const layer = deptLayers[deptCode];
    layer.setStyle({ weight: 4, color: '#F00' });
    selectedLayer = layer;

    // Affiche les infos du département
    const nom = layer.feature.properties.nom || "Inconnu";
    const info = deptInfo[deptCode];
    updateDeptInfo(nom, deptCode, info);

    // Met à jour la liste des clients du département
    updateDeptClientsList(deptCode);

    // Centre la carte sur le département
    map.fitBounds(layer.getBounds());
  });


  reader.readAsArrayBuffer(file);
});
