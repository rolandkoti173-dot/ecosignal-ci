// ===== EcoSignal CI - app.js =====

// 1. Réglages
const FICHIER = "data/signalements.csv";
const CENTRE = [5.36, -4.0083];   // Abidjan
const ZOOM = 11;

const TYPES = {
  eau_stagnante:    { label: "Eau stagnante",    couleur: "#1f77b4" },
  depot_de_dechets: { label: "Dépôt de déchets", couleur: "#8c564b" },
  eau_polluee:      { label: "Eau polluée",      couleur: "#2ca02c" },
  inondation:       { label: "Inondation",       couleur: "#d62728" },
  fumee:            { label: "Fumée",            couleur: "#7f7f7f" },
  autre:            { label: "Autre",            couleur: "#9467bd" }
};

// 2. La carte
const carte = L.map("carte").setView(CENTRE, ZOOM);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; contributeurs OpenStreetMap"
}).addTo(carte);

// Une "couche" où l'on posera et effacera les points
const couche = L.layerGroup().addTo(carte);

// 3. Petits outils
let signalements = [];

// Transforme "Dépôt de déchets" en "depot_de_dechets"
function cle(texte) {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Protège la page contre du texte "piégé" saisi par quelqu'un
function echapper(texte) {
  const div = document.createElement("div");
  div.textContent = texte;
  return div.innerHTML;
}
function majuscule(texte) {
  return texte.replace(/\b\w/g, l => l.toUpperCase());
}

function joli(texte) {
  return String(texte || "").replace(/_/g, " ");
}

function afficherMessage(texte) {
  const zone = document.getElementById("message");
  zone.textContent = texte;
  zone.style.display = texte ? "block" : "none";
}

const GRAVITES = { faible: "Faible", moyenne: "Moyenne", elevee: "Élevée" };

function infosType(type) {
  return TYPES[type] || { label: joli(type), couleur: "#555555" };
}

// 4. Lire le fichier CSV
function chargerDonnees() {
  Papa.parse(FICHIER, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (resultat) {
      const colonnes = resultat.meta.fields || [];
      const colLat = colonnes.find(c => /latitude/i.test(c));
      const colLon = colonnes.find(c => /longitude/i.test(c));
      if (!colLat || !colLon) {
        afficherMessage("Colonnes latitude / longitude introuvables dans " + FICHIER);
        return;
      }
      signalements = resultat.data.map(function (ligne) {
        return {
          type: cle(ligne.type_signal) || "autre",
          date: ligne.date_signal || "",
      commune: majuscule(joli(ligne.commune)) || "Non précisée",         
          repere: ligne.repere || "",
          gravite: cle(ligne.gravite),
          description: ligne.description || "",
          lat: parseFloat(String(ligne[colLat]).replace(",", ".")),
          lon: parseFloat(String(ligne[colLon]).replace(",", "."))
        };
      }).filter(s => !isNaN(s.lat) && !isNaN(s.lon));

      remplirFiltres();
      ajouterLegende();
      afficher();
    },
    error: function () {
      afficherMessage("Impossible de lire " + FICHIER + ". Vérifie son nom et son emplacement.");
    }
  });
}

// 5. Filtrer et dessiner les points
function filtrer() {
  const typeChoisi = document.getElementById("filtre-type").value;
  const communeChoisie = document.getElementById("filtre-commune").value;
  return signalements.filter(function (s) {
    return (!typeChoisi || s.type === typeChoisi) &&
           (!communeChoisie || s.commune === communeChoisie);
  });
}

function afficher() {
  const liste = filtrer();
  couche.clearLayers();

  liste.forEach(function (s) {
    const t = infosType(s.type);
    const popup =
      "<strong>" + echapper(t.label) + "</strong><br>" +
      echapper(s.commune) + (s.repere ? " - " + echapper(s.repere) : "") + "<br>" +
      "Date : " + echapper(s.date) + "<br>" +
      "Gravité : " + echapper(GRAVITES[s.gravite] || "Non précisée") +
      (s.description ? "<br><em>" + echapper(s.description) + "</em>" : "");

    L.circleMarker([s.lat, s.lon], {
      radius: 8,
      color: "#ffffff",
      weight: 1.5,
      fillColor: t.couleur,
      fillOpacity: 0.9
    }).bindPopup(popup).addTo(couche);
  });

  if (liste.length > 0) {
    const bornes = L.latLngBounds(liste.map(s => [s.lat, s.lon]));
    carte.fitBounds(bornes, { padding: [40, 40], maxZoom: 15 });
  }

  majStats(liste);
  majGraphique(liste);
}

// Remplit les deux menus déroulants avec les valeurs présentes dans le fichier
function remplirFiltres() {
  const selType = document.getElementById("filtre-type");
  const selCommune = document.getElementById("filtre-commune");

  const types = [...new Set(signalements.map(s => s.type))];
  types.forEach(function (t) {
    selType.add(new Option(infosType(t).label, t));
  });

  const communes = [...new Set(signalements.map(s => s.commune))].sort();
  communes.forEach(function (c) {
    selCommune.add(new Option(c, c));
  });
}

// Les trois chiffres clés
function majStats(liste) {
  document.getElementById("stat-total").textContent = liste.length;

  const comptes = {};
  liste.forEach(function (s) {
    comptes[s.commune] = (comptes[s.commune] || 0) + 1;
  });
  let top = "-";
  let max = 0;
  for (const c in comptes) {
    if (comptes[c] > max) { max = comptes[c]; top = c; }
  }
  document.getElementById("stat-commune").textContent = top;

  const graves = liste.filter(s => s.gravite === "elevee").length;
  document.getElementById("stat-graves").textContent = graves;
}

let graphique = null;

// Diagramme en barres : nombre de signalements par type
function majGraphique(liste) {
  const comptes = {};
  liste.forEach(function (s) {
    comptes[s.type] = (comptes[s.type] || 0) + 1;
  });
  const types = Object.keys(comptes);

  if (graphique) graphique.destroy();
  graphique = new Chart(document.getElementById("graphique"), {
    type: "bar",
    data: {
      labels: types.map(t => infosType(t).label),
      datasets: [{
        label: "Nombre de signalements",
        data: types.map(t => comptes[t]),
        backgroundColor: types.map(t => infosType(t).couleur)
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

// Légende des couleurs, en bas à droite de la carte
function ajouterLegende() {
  const legende = L.control({ position: "bottomright" });
  legende.onAdd = function () {
    const div = L.DomUtil.create("div", "legende");
    div.innerHTML = Object.keys(TYPES).map(function (k) {
      return '<div><span style="background:' + TYPES[k].couleur + '"></span>' +
             TYPES[k].label + "</div>";
    }).join("");
    return div;
  };
  legende.addTo(carte);
}

// Réagir quand on change un filtre
document.getElementById("filtre-type").addEventListener("change", afficher);
document.getElementById("filtre-commune").addEventListener("change", afficher);

document.getElementById("bouton-reset").addEventListener("click", function () {
  document.getElementById("filtre-type").value = "";
  document.getElementById("filtre-commune").value = "";
  afficher();
});

// Adresse de ton relais (voir Module 11)
const URL_ASSISTANT = "COLLE-ICI-L-ADRESSE-DE-TON-RELAIS";

// Résumé chiffré envoyé à l'IA : aucune coordonnée, aucun texte libre
function construireResume(liste) {
  if (liste.length === 0) return "Aucun signalement affiché.";
  const parType = {};
  const parCommune = {};
  const dates = [];
  let graves = 0;
  liste.forEach(function (s) {
    const lt = infosType(s.type).label;
    parType[lt] = (parType[lt] || 0) + 1;
    parCommune[s.commune] = (parCommune[s.commune] || 0) + 1;
    if (s.gravite === "elevee") graves++;
    if (s.date) dates.push(s.date);
  });
  dates.sort();
  const ligne = obj => Object.keys(obj).map(k => k + " : " + obj[k]).join("; ");
  return "Nombre de signalements : " + liste.length + "\n" +
    "Période : " + (dates[0] || "?") + " au " + (dates[dates.length - 1] || "?") + "\n" +
    "Par type : " + ligne(parType) + "\n" +
    "Par commune : " + ligne(parCommune) + "\n" +
    "Gravité élevée : " + graves;
}

async function demanderAssistant(question) {
  const zone = document.getElementById("reponse-ia");
  if (URL_ASSISTANT.indexOf("COLLE-ICI") === 0) {
    zone.textContent = "L'assistant n'est pas encore configuré (voir Module 11).";
    return;
  }
  zone.textContent = "Réflexion en cours...";
  try {
    const reponse = await fetch(URL_ASSISTANT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question, resume: construireResume(filtrer()) })
    });
    const data = await reponse.json();
    zone.textContent = data.reponse || data.erreur || "Pas de réponse.";
  } catch (e) {
    zone.textContent = "Impossible de joindre l'assistant. Réessaie plus tard.";
  }
}

document.getElementById("bouton-resume").addEventListener("click", function () {
  demanderAssistant("Fais une synthèse de la situation en 5 phrases maximum " +
                    "et propose 3 actions de prévention prioritaires.");
});

document.getElementById("bouton-question").addEventListener("click", function () {
  const q = document.getElementById("question").value.trim();
  if (q) demanderAssistant(q);
});

// 6. C'est parti
chargerDonnees();
