/**
 * state.js — État de la partie + logique de jeu + sauvegarde locale.
 *
 * Contient :
 *  - `state` : l'état courant de la partie (source unique de vérité)
 *  - `set()` / `resetGame()` : les seules façons de modifier `state`
 *  - helpers de jeu : shuffle, totalPlayers, normalizeSetup, checkWinner
 *  - persistance localStorage : historique des parties, noms récents
 *
 * Dépend de : ROLE_INFO (js/roles.js) — pas de dépendance directe ici,
 * mais computePlayerStats() se base sur les clés de rôle définies là-bas.
 * Appelle render() (défini dans js/app.js) après chaque changement d'état.
 */

/* ---------- utilitaires ---------- */

let state = {
  phase: "setup",
  numVillageois: 4,
  numWolves: 1,
  numVoyantes: 0,
  numChasseurs: 0,
  deck: [],
  players: [], // {id, name, role, alive}
  distributeIndex: 0,
  revealed: false,
  round: 1,
  targetId: null,
  lastVictimId: null,
  showVictimCard: false,
  voyanteQueue: [], // ids des voyantes qui n'ont pas encore regardé une carte cette nuit
  voyanteTargetId: null,
  voyanteRevealed: false,
  dayTargetId: undefined,
  lastDayVictimId: null,
  showDayVictimCard: false,
  hunterQueue: [], // ids de Chasseurs morts qui doivent encore riposter
  hunterTargetId: null,
  hunterContext: null, // "night" | "day" — où renvoyer une fois la riposte résolue
  lastHunterVictimId: null,
  showHunterVictimCard: false,
  showAllCards: false,
  winner: null,
};

function normalizeName(name) {
  return (name || "").trim().toLowerCase();
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}


/* ---------- persistence (localStorage) ---------- */
const STORAGE_KEYS = {
  history: "lg_history_v1",
  names: "lg_recent_names_v1",
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable, ignore */
  }
}

function getHistory() {
  return loadJSON(STORAGE_KEYS.history, []);
}
function getRecentNames() {
  return loadJSON(STORAGE_KEYS.names, []);
}

function rememberNames(players) {
  const existing = getRecentNames();
  const merged = [...players.map((p) => p.name), ...existing];
  const seen = new Set();
  const deduped = merged.filter((n) => {
    const key = normalizeName(n);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  saveJSON(STORAGE_KEYS.names, deduped.slice(0, 40));
}

function recordGameResult(players, winner, round) {
  const history = getHistory();
  history.unshift({
    date: new Date().toISOString(),
    round,
    winner,
    players: players.map((p) => ({ name: p.name, role: p.role })),
  });
  saveJSON(STORAGE_KEYS.history, history.slice(0, 200));
}

function computePlayerStats() {
  const history = getHistory();
  const stats = {}; // name -> {games, winsVillage, winsLoup}
  history.forEach((g) => {
    g.players.forEach((p) => {
      if (!stats[p.name])
        stats[p.name] = { games: 0, winsVillage: 0, winsLoup: 0 };
      stats[p.name].games++;
      const team = ROLE_INFO[p.role].team;
      if (g.winner === "villageois" && team === "village")
        stats[p.name].winsVillage++;
      if (g.winner === "loups-garous" && team === "loups")
        stats[p.name].winsLoup++;
    });
  });
  return Object.entries(stats)
    .map(([name, s]) => ({
      name,
      ...s,
      wins: s.winsVillage + s.winsLoup,
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins);
}

function clearHistory() {
  saveJSON(STORAGE_KEYS.history, []);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Nombre total de joueurs autour de la table, déduit des compteurs de rôles
// (le nombre de villageois est la variable réglée directement en configuration).
function totalPlayers() {
  return (
    state.numVillageois + state.numWolves + state.numVoyantes + state.numChasseurs
  );
}

// Ajuste numVillageois/numWolves/numVoyantes/numChasseurs pour rester
// cohérents entre eux : entre 3 et 20 joueurs au total, et les loups ne
// doivent jamais être aussi ou plus nombreux que le reste du village.
// Les villageois absorbent les ajustements (comme le faisait numPlayers).
function normalizeSetup(next) {
  let numVillageois = Math.max(
    0,
    next.numVillageois ?? state.numVillageois,
  );
  let numWolves = Math.max(1, next.numWolves ?? state.numWolves);
  let numVoyantes = Math.max(0, next.numVoyantes ?? state.numVoyantes);
  let numChasseurs = Math.max(0, next.numChasseurs ?? state.numChasseurs);

  const villageTeam = () => numVillageois + numVoyantes + numChasseurs;

  let total = villageTeam() + numWolves;
  if (total > 20) numVillageois = Math.max(0, numVillageois - (total - 20));
  if (total < 3) numVillageois += 3 - total;

  // Si les villageois seuls (déjà à 0) ne suffisent pas à revenir sous la
  // limite, c'est qu'il y a trop de rôles spéciaux : on les réduit en
  // dernier recours plutôt que de dépasser 20 joueurs.
  total = villageTeam() + numWolves;
  if (total > 20) {
    let overflow = total - 20;
    const cutChasseurs = Math.min(numChasseurs, overflow);
    numChasseurs -= cutChasseurs;
    overflow -= cutChasseurs;
    const cutVoyantes = Math.min(numVoyantes, overflow);
    numVoyantes -= cutVoyantes;
  }

  numWolves = Math.min(numWolves, Math.max(1, villageTeam()));

  total = villageTeam() + numWolves;
  if (total < 3) numVillageois += 3 - total;

  return { numVillageois, numWolves, numVoyantes, numChasseurs };
}

function checkWinner(players) {
  const aliveWolves = players.filter(
    (p) => p.alive && ROLE_INFO[p.role].team === "loups",
  ).length;
  const aliveVillage = players.filter(
    (p) => p.alive && ROLE_INFO[p.role].team === "village",
  ).length;
  if (aliveWolves === 0) return "villageois";
  if (aliveWolves >= aliveVillage) return "loups-garous";
  return null;
}

// Ids des joueurs d'un rôle qui peuvent encore agir cette nuit : vivants,
// ou tués cette nuit-même par les loups (leur mort n'est révélée au
// village qu'au petit matin, ils jouent donc quand même leur tour).
function actingRoleIds(role) {
  return state.players
    .filter((p) => p.role === role && (p.alive || p.id === state.lastVictimId))
    .map((p) => p.id);
}

function set(partial) {
  state = { ...state, ...partial };
  render();
}

function resetGame() {
  state = {
    phase: "setup",
    numVillageois: 4,
    numWolves: 1,
    numVoyantes: 0,
    numChasseurs: 0,
    deck: [],
    players: [],
    distributeIndex: 0,
    revealed: false,
    round: 1,
    targetId: null,
    lastVictimId: null,
    showVictimCard: false,
    voyanteQueue: [],
    voyanteTargetId: null,
    voyanteRevealed: false,
    dayTargetId: undefined,
    lastDayVictimId: null,
    showDayVictimCard: false,
    hunterQueue: [],
    hunterTargetId: null,
    hunterContext: null,
    lastHunterVictimId: null,
    showHunterVictimCard: false,
    showAllCards: false,
    winner: null,
  };
  render();
}

