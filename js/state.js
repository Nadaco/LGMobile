/**
 * state.js — État de la partie + logique de jeu + sauvegarde locale.
 *
 * Contient :
 *  - `state` : l'état courant de la partie (source unique de vérité)
 *  - `set()` / `resetGame()` : les seules façons de modifier `state`
 *  - helpers de jeu : shuffle, maxWolves, checkWinner
 *  - persistance localStorage : historique des parties, noms récents
 *
 * Dépend de : ROLE_INFO (js/roles.js) — pas de dépendance directe ici,
 * mais computePlayerStats() se base sur les clés de rôle définies là-bas.
 * Appelle render() (défini dans js/app.js) après chaque changement d'état.
 */

/* ---------- utilitaires ---------- */

let state = {
  phase: "setup",
  numPlayers: 5,
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
  voyanteTargetId: null,
  voyanteRevealed: false,
  dayTargetId: undefined,
  lastDayVictimId: null,
  showDayVictimCard: false,
  hunterQueue: [], // ids de Chasseurs morts qui doivent encore riposter
  hunterTargetId: null,
  hunterContext: null, // "night" | "day" — où renvoyer une fois la riposte résolue
  extraNightVictims: [], // ids abattus par un Chasseur cette nuit
  extraDayVictims: [], // ids abattus par un Chasseur ce jour
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

function maxWolves(n) {
  return Math.max(1, n - 1);
}

// Ajuste numWolves/numVoyantes/numChasseurs pour qu'ils tiennent toujours
// dans numPlayers (au moins 0 villageois, jamais de compte négatif).
function normalizeSetup(next) {
  const numPlayers = next.numPlayers ?? state.numPlayers;
  let numWolves = next.numWolves ?? state.numWolves;
  let numVoyantes = next.numVoyantes ?? state.numVoyantes;
  let numChasseurs = next.numChasseurs ?? state.numChasseurs;

  numWolves = Math.max(1, Math.min(numWolves, maxWolves(numPlayers)));
  numVoyantes = Math.max(0, Math.min(1, numVoyantes));
  numChasseurs = Math.max(0, Math.min(1, numChasseurs));

  let room = numPlayers - numWolves - numVoyantes - numChasseurs;
  if (room < 0) {
    const cut = Math.min(numChasseurs, -room);
    numChasseurs -= cut;
    room += cut;
  }
  if (room < 0) {
    const cut = Math.min(numVoyantes, -room);
    numVoyantes -= cut;
    room += cut;
  }

  return { numPlayers, numWolves, numVoyantes, numChasseurs };
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

function hasAliveRole(role) {
  return state.players.some((p) => p.alive && p.role === role);
}

// Un joueur tué cette nuit par les loups doit encore jouer son propre tour
// (Voyante, etc.) : sa mort n'est révélée au village qu'au petit matin.
function canActTonight(role) {
  return state.players.some(
    (p) => p.role === role && (p.alive || p.id === state.lastVictimId),
  );
}

function set(partial) {
  state = { ...state, ...partial };
  render();
}

function resetGame() {
  state = {
    phase: "setup",
    numPlayers: 5,
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
    voyanteTargetId: null,
    voyanteRevealed: false,
    dayTargetId: undefined,
    lastDayVictimId: null,
    showDayVictimCard: false,
    hunterQueue: [],
    hunterTargetId: null,
    hunterContext: null,
    extraNightVictims: [],
    extraDayVictims: [],
    showAllCards: false,
    winner: null,
  };
  render();
}

