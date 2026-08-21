/**
 * state.js — État de la partie + logique de jeu + sauvegarde locale.
 *
 * Contient :
 *  - `state` : l'état courant de la partie (source unique de vérité)
 *  - `set()` / `resetGame()` : les seules façons de modifier `state`
 *  - helpers de jeu : shuffle, totalPlayers, normalizeSetup, checkWinner
 *  - persistance localStorage : historique des parties, noms récents,
 *    configuration des rôles (nombre de chaque rôle choisi en configuration)
 *
 * Dépend de : ROLE_INFO (js/roles.js), chargé avant ce fichier — utilisé au
 * chargement pour VALID_VOLEUR_ROLE_KEYS et par computePlayerStats() /
 * pickVoleurExtraRoles() / voleurConfigurableRoles() pour les clés de rôle
 * définies là-bas.
 * Appelle render() (défini dans js/app.js) après chaque changement d'état.
 */

/* ---------- utilitaires ---------- */

// Configuration des rôles (nombre de chaque rôle), sauvegardée en local
// pour être réutilisée d'une partie à l'autre. Ces deux fonctions sont
// utilisées dès l'initialisation de `state` ci-dessous, donc placées
// avant : les déclarations `function` sont hoistées, mais une valeur
// dont l'initialiseur s'exécute avant sa propre déclaration textuelle ne
// l'est pas (cas de STORAGE_KEYS plus bas), d'où ce bloc autonome.
const SETUP_STORAGE_KEY = "lg_setup_v1";

// Toutes les clés de rôle qu'un joueur Voleur peut potentiellement
// recevoir (donc que state.voleurAllowedRoles peut légitimement contenir) :
// tout sauf le Voleur lui-même et le Villageois (redondant, cf.
// pickVoleurExtraRoles). Sert à valider/nettoyer les données persistées —
// pour la liste réellement affichée/cochable dans l'écran ⚙️, voir
// voleurConfigurableRoles() plus bas, qui varie selon la configuration en
// cours.
const VALID_VOLEUR_ROLE_KEYS = Object.keys(ROLE_INFO).filter(
  (r) => r !== "voleur" && r !== "villageois",
);

// Association rôle unique -> champ de state qui compte sa présence en
// configuration (0 = absent de la partie). Utilisée pour savoir si un rôle
// unique (Voyante, Cupidon, Sorcière, L'Ancien) peut être proposé au Voleur :
// seulement s'il n'est pas déjà coché dans la partie, cf.
// voleurConfigurableRoles() et pickVoleurExtraRoles() plus bas.
const UNIQUE_ROLE_SETUP_FIELDS = {
  voyante: "numVoyantes",
  cupidon: "numCupidons",
  sorciere: "numSorcieres",
  ancien: "numAnciens",
};

const DEFAULT_SETUP = {
  numVillageois: 4,
  numWolves: 1,
  numVoyantes: 0,
  numChasseurs: 0,
  numFilles: 0,
  numCupidons: 0,
  numSorcieres: 0,
  numAnciens: 0,
  numVoleurs: 0,
  // Tout activé par défaut (avec les compteurs ci-dessus tous à 0, les
  // rôles uniques sont de toute façon tous disponibles au départ).
  voleurAllowedRoles: [...VALID_VOLEUR_ROLE_KEYS],
};

function loadSetup() {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    const merged = raw
      ? { ...DEFAULT_SETUP, ...JSON.parse(raw) }
      : { ...DEFAULT_SETUP };
    // Filtre les clés de rôle obsolètes qui auraient pu être sauvegardées
    // par une version antérieure de ROLE_INFO.
    merged.voleurAllowedRoles = (merged.voleurAllowedRoles || []).filter(
      (r) => VALID_VOLEUR_ROLE_KEYS.includes(r),
    );
    return merged;
  } catch (e) {
    return { ...DEFAULT_SETUP };
  }
}

function saveSetup(setup) {
  try {
    localStorage.setItem(
      SETUP_STORAGE_KEY,
      JSON.stringify({
        numVillageois: setup.numVillageois,
        numWolves: setup.numWolves,
        numVoyantes: setup.numVoyantes,
        numChasseurs: setup.numChasseurs,
        numFilles: setup.numFilles,
        numCupidons: setup.numCupidons,
        numSorcieres: setup.numSorcieres,
        numAnciens: setup.numAnciens,
        numVoleurs: setup.numVoleurs,
        voleurAllowedRoles: setup.voleurAllowedRoles,
      }),
    );
  } catch (e) {
    /* storage unavailable, ignore */
  }
}

let state = {
  phase: "setup",
  ...loadSetup(),
  deck: [],
  players: [], // {id, name, role, alive}
  distributeIndex: 0,
  revealed: false,
  round: 1,
  targetId: null,
  lastVictimId: null,
  showVictimCard: false,
  lovers: [], // ids des deux amoureux désignés par Cupidon la nuit 1
  loverSelection: [], // sélection en cours pendant le tour de Cupidon
  lastLoverVictimId: null, // amoureux mort de chagrin lors de la dernière mort résolue
  voleurExtraRoles: [], // les deux rôles non distribués proposés au Voleur la nuit 1
  voleurSelectedRole: null, // sélection en cours pendant le tour du Voleur ("none" ou une clé de voleurExtraRoles)
  witchLifePotionUsed: false,
  witchDeathPotionUsed: false,
  witchStep: "life", // "life" | "death" — sous-écran affiché pendant le tour de la Sorcière
  witchDeathTargetId: null,
  lastWitchVictimId: null, // joueur empoisonné par la Sorcière la dernière nuit
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
  ancienExtraLifeUsed: false, // l'Ancien a déjà résisté à une attaque des loups
  villagePowersDisabled: false, // l'Ancien est mort par le vote/un pouvoir : plus aucun pouvoir villageois
  ancienPowersJustDisabled: false, // notice transitoire, affichée une fois puis effacée
  showAllCards: false,
  confirmDialog: null, // { message, action } — confirmation en place, pas de window.confirm()
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
    lovers: state.lovers
      .map((id) => players.find((p) => p.id === id)?.name)
      .filter(Boolean),
    players: players.map((p) => ({ name: p.name, role: p.role })),
  });
  saveJSON(STORAGE_KEYS.history, history.slice(0, 200));
}

function computePlayerStats() {
  const history = getHistory();
  const stats = {}; // name -> {games, winsVillage, winsLoup, winsAmoureux}
  history.forEach((g) => {
    g.players.forEach((p) => {
      if (!stats[p.name])
        stats[p.name] = {
          games: 0,
          winsVillage: 0,
          winsLoup: 0,
          winsAmoureux: 0,
        };
      stats[p.name].games++;
      const team = ROLE_INFO[p.role].team;
      if (g.winner === "villageois" && team === "village")
        stats[p.name].winsVillage++;
      if (g.winner === "loups-garous" && team === "loups")
        stats[p.name].winsLoup++;
      if (g.winner === "amoureux" && g.lovers && g.lovers.includes(p.name))
        stats[p.name].winsAmoureux++;
    });
  });
  return Object.entries(stats)
    .map(([name, s]) => ({
      name,
      ...s,
      wins: s.winsVillage + s.winsLoup + s.winsAmoureux,
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins);
}

// Vue d'ensemble de l'historique : durée des parties et répartition des
// victoires par camp. `null` si aucune partie n'est enregistrée.
function computeOverviewStats() {
  const history = getHistory();
  const totalGames = history.length;
  if (totalGames === 0) return null;
  const rounds = history.map((g) => g.round);
  const longestRound = Math.max(...rounds);
  const avgRound =
    Math.round((rounds.reduce((a, b) => a + b, 0) / totalGames) * 10) / 10;
  const pct = (winner) =>
    Math.round(
      (history.filter((g) => g.winner === winner).length / totalGames) * 100,
    );
  return {
    totalGames,
    longestRound,
    avgRound,
    villagePct: pct("villageois"),
    loupsPct: pct("loups-garous"),
    amoureuxPct: pct("amoureux"),
  };
}

// Taux de victoire par rôle, toutes parties confondues : pour un rôle
// donné, proportion des parties où le camp de ce rôle (ou les amoureux,
// pour un joueur y ayant figuré) l'a emporté. Triés par nombre
// d'apparitions décroissant.
function computeRoleStats() {
  const history = getHistory();
  const stats = {}; // role -> {games, wins}
  history.forEach((g) => {
    g.players.forEach((p) => {
      if (!stats[p.role]) stats[p.role] = { games: 0, wins: 0 };
      stats[p.role].games++;
      const team = ROLE_INFO[p.role].team;
      const won =
        (g.winner === "villageois" && team === "village") ||
        (g.winner === "loups-garous" && team === "loups") ||
        (g.winner === "amoureux" && g.lovers && g.lovers.includes(p.name));
      if (won) stats[p.role].wins++;
    });
  });
  return Object.entries(stats)
    .map(([role, s]) => ({
      role,
      ...s,
      rate: s.games ? Math.round((s.wins / s.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.rate - a.rate);
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
    state.numVillageois +
    state.numWolves +
    state.numVoyantes +
    state.numChasseurs +
    state.numFilles +
    state.numCupidons +
    state.numSorcieres +
    state.numAnciens +
    state.numVoleurs
  );
}

// Ajuste numVillageois/numWolves/numVoyantes/numChasseurs/numFilles/
// numCupidons/numSorcieres pour rester cohérents entre eux : entre 3 et
// 20 joueurs au total, et les loups ne doivent jamais être aussi ou plus
// nombreux que le reste du village. Les villageois absorbent les
// ajustements (comme le faisait numPlayers), les autres rôles spéciaux
// en dernier recours.
function normalizeSetup(next) {
  let numVillageois = Math.max(
    0,
    next.numVillageois ?? state.numVillageois,
  );
  let numWolves = Math.max(1, next.numWolves ?? state.numWolves);
  // Voyante, Cupidon et Sorcière n'ont de sens qu'en un seul exemplaire
  // (un couple, une seule réserve de potions) : plafonnés à 1. Chasseur
  // et Petite Fille restent libres, chaque instance agissant de façon
  // indépendante.
  let numVoyantes = Math.max(
    0,
    Math.min(1, next.numVoyantes ?? state.numVoyantes),
  );
  let numChasseurs = Math.max(0, next.numChasseurs ?? state.numChasseurs);
  let numFilles = Math.max(0, next.numFilles ?? state.numFilles);
  let numCupidons = Math.max(
    0,
    Math.min(1, next.numCupidons ?? state.numCupidons),
  );
  let numSorcieres = Math.max(
    0,
    Math.min(1, next.numSorcieres ?? state.numSorcieres),
  );
  let numAnciens = Math.max(
    0,
    Math.min(1, next.numAnciens ?? state.numAnciens),
  );
  let numVoleurs = Math.max(
    0,
    Math.min(1, next.numVoleurs ?? state.numVoleurs),
  );

  const villageTeam = () =>
    numVillageois +
    numVoyantes +
    numChasseurs +
    numFilles +
    numCupidons +
    numSorcieres +
    numAnciens +
    numVoleurs;

  let total = villageTeam() + numWolves;
  if (total > 20) numVillageois = Math.max(0, numVillageois - (total - 20));
  if (total < 3) numVillageois += 3 - total;

  // Si les villageois seuls (déjà à 0) ne suffisent pas à revenir sous la
  // limite, c'est qu'il y a trop de rôles spéciaux : on les réduit en
  // dernier recours plutôt que de dépasser 20 joueurs.
  total = villageTeam() + numWolves;
  if (total > 20) {
    let overflow = total - 20;
    const cutVoleurs = Math.min(numVoleurs, overflow);
    numVoleurs -= cutVoleurs;
    overflow -= cutVoleurs;
    const cutAnciens = Math.min(numAnciens, overflow);
    numAnciens -= cutAnciens;
    overflow -= cutAnciens;
    const cutSorcieres = Math.min(numSorcieres, overflow);
    numSorcieres -= cutSorcieres;
    overflow -= cutSorcieres;
    const cutCupidons = Math.min(numCupidons, overflow);
    numCupidons -= cutCupidons;
    overflow -= cutCupidons;
    const cutFilles = Math.min(numFilles, overflow);
    numFilles -= cutFilles;
    overflow -= cutFilles;
    const cutChasseurs = Math.min(numChasseurs, overflow);
    numChasseurs -= cutChasseurs;
    overflow -= cutChasseurs;
    const cutVoyantes = Math.min(numVoyantes, overflow);
    numVoyantes -= cutVoyantes;
  }

  numWolves = Math.min(numWolves, Math.max(1, villageTeam()));

  total = villageTeam() + numWolves;
  if (total < 3) numVillageois += 3 - total;

  const voleurAllowedRoles = (
    next.voleurAllowedRoles ?? state.voleurAllowedRoles
  ).filter((r) => VALID_VOLEUR_ROLE_KEYS.includes(r));

  const result = {
    numVillageois,
    numWolves,
    numVoyantes,
    numChasseurs,
    numFilles,
    numCupidons,
    numSorcieres,
    numAnciens,
    numVoleurs,
    voleurAllowedRoles,
  };
  saveSetup(result);
  return result;
}

// Rôles que l'écran ⚙️ propose de cocher/décocher pour le Voleur : les
// rôles non uniques (Loup-Garou, Chasseur, Petite Fille...), toujours
// affichés qu'ils soient en jeu ou non, + les rôles uniques (Voyante,
// Cupidon, Sorcière, L'Ancien) mais SEULEMENT s'ils ne sont pas déjà
// cochés dans la configuration de la partie (sinon ils seront de toute
// façon distribués à un joueur, donc automatiquement exclus par
// pickVoleurExtraRoles — aucun choix à faire ici pour eux).
function voleurConfigurableRoles() {
  const nonUnique = Object.keys(ROLE_INFO).filter(
    (r) => r !== "voleur" && r !== "villageois" && !ROLE_INFO[r].unique,
  );
  const availableUnique = Object.keys(UNIQUE_ROLE_SETUP_FIELDS).filter(
    (r) => state[UNIQUE_ROLE_SETUP_FIELDS[r]] === 0,
  );
  return [...nonUnique, ...availableUnique];
}

// Tire au hasard deux rôles non distribués à personne dans cette partie,
// proposés au Voleur la première nuit. Exclut toujours le Voleur lui-même
// (déjà distribué s'il est en jeu) et le Villageois (redondant : c'est déjà
// ce qu'il devient s'il ne choisit aucune des deux cartes). Un rôle marqué
// `unique: true` (Voyante, Cupidon, Sorcière, Ancien) n'est jamais candidat
// s'il est déjà en jeu, même coché dans voleurAllowedRoles — sinon le
// Voleur en créerait un second alors que le reste du code (potions de la
// Sorcière, résistance de l'Ancien...) suppose un seul détenteur ; cette
// exclusion-là n'est pas configurable. Au-delà de ça, tout rôle (unique ou
// non) ne reste candidat que si le meneur l'a coché dans
// state.voleurAllowedRoles (écran ⚙️ à côté de la puce Voleur). Si cette
// sélection ne laisse pas deux rôles distincts, les cases manquantes sont
// complétées par Villageois plutôt que d'ignorer le choix du meneur — un
// choix neutre, équivalent à décliner.
function pickVoleurExtraRoles(players) {
  const usedRoles = new Set(players.map((p) => p.role));
  const allowed = new Set(state.voleurAllowedRoles);
  const notInPlayIfUnique = (r) => !ROLE_INFO[r].unique || !usedRoles.has(r);
  const isCandidate = (r) =>
    r !== "voleur" &&
    r !== "villageois" &&
    notInPlayIfUnique(r) &&
    allowed.has(r);
  const candidates = shuffle(Object.keys(ROLE_INFO).filter(isCandidate));
  const picked = candidates.slice(0, 2);
  while (picked.length < 2) picked.push("villageois");
  return picked;
}

function checkWinner(players) {
  // Si les deux amoureux désignés par Cupidon sont de camps opposés et
  // sont les deux seuls survivants, ils gagnent ensemble avant tout autre
  // calcul de camp.
  if (state.lovers.length === 2) {
    const alive = players.filter((p) => p.alive);
    const [a, b] = state.lovers.map((id) => players.find((p) => p.id === id));
    if (
      alive.length === 2 &&
      a &&
      b &&
      a.alive &&
      b.alive &&
      ROLE_INFO[a.role].team !== ROLE_INFO[b.role].team
    ) {
      return "amoureux";
    }
  }
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

// Si l'un des deux amoureux désignés par Cupidon vient de mourir alors
// que l'autre est toujours vivant, ce dernier meurt aussitôt de chagrin.
// Renvoie { players, extraDeathId } — extraDeathId est l'id de l'amoureux
// mort de chagrin, ou null si aucune cascade ne s'est produite.
function applyLoverCascade(players) {
  if (state.lovers.length !== 2) return { players, extraDeathId: null };
  const [aId, bId] = state.lovers;
  const a = players.find((p) => p.id === aId);
  const b = players.find((p) => p.id === bId);
  if (!a || !b) return { players, extraDeathId: null };
  if (!a.alive && b.alive) {
    return {
      players: players.map((p) => (p.id === bId ? { ...p, alive: false } : p)),
      extraDeathId: bId,
    };
  }
  if (!b.alive && a.alive) {
    return {
      players: players.map((p) => (p.id === aId ? { ...p, alive: false } : p)),
      extraDeathId: aId,
    };
  }
  return { players, extraDeathId: null };
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
    ...loadSetup(),
    deck: [],
    players: [],
    distributeIndex: 0,
    revealed: false,
    round: 1,
    targetId: null,
    lastVictimId: null,
    showVictimCard: false,
    lovers: [],
    loverSelection: [],
    lastLoverVictimId: null,
    voleurExtraRoles: [],
    voleurSelectedRole: null,
    witchLifePotionUsed: false,
    witchDeathPotionUsed: false,
    witchStep: "life",
    witchDeathTargetId: null,
    lastWitchVictimId: null,
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
    ancienExtraLifeUsed: false,
    villagePowersDisabled: false,
    ancienPowersJustDisabled: false,
    showAllCards: false,
    confirmDialog: null,
    winner: null,
  };
  render();
}

