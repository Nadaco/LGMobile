/**
 * tests.js — Mini suite de tests, sans dépendance ni build.
 *
 * Chargé après js/roles.js et js/state.js (voir index.html) : les
 * fonctions testées sont les vraies fonctions de l'app, pas une copie.
 * `state` étant un objet global mutable, chaque test remet lui-même les
 * champs dont il a besoin avant de s'exécuter (voir baseSetup() /
 * withLovers() plus bas) pour rester indépendant des autres.
 */

const results = [];

function test(group, name, fn) {
  try {
    fn();
    results.push({ group, name, pass: true });
  } catch (e) {
    results.push({ group, name, pass: false, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion échouée");
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg || "assertEqual"} — attendu ${e}, obtenu ${a}`);
  }
}

// Remet les compteurs de configuration à une base connue (4 villageois,
// 1 loup, aucun rôle spécial) avant chaque test de normalizeSetup(), pour
// ne pas hériter de l'état laissé par un test précédent.
function baseSetup(overrides) {
  Object.assign(
    state,
    {
      numVillageois: 4,
      numWolves: 1,
      numVoyantes: 0,
      numChasseurs: 0,
      numFilles: 0,
      numCupidons: 0,
      numSorcieres: 0,
      numAnciens: 0,
      numVoleurs: 0,
      voleurAllowedRoles: [...VALID_VOLEUR_ROLE_KEYS],
      debateDuration: 0,
    },
    overrides || {},
  );
}

function totalOf(setup) {
  return (
    setup.numVillageois +
    setup.numWolves +
    setup.numVoyantes +
    setup.numChasseurs +
    setup.numFilles +
    setup.numCupidons +
    setup.numSorcieres +
    setup.numAnciens +
    setup.numVoleurs
  );
}

function villageTeamOf(setup) {
  return totalOf(setup) - setup.numWolves;
}

/* ---------- checkWinner ---------- */

test("checkWinner", "village gagne quand tous les loups sont morts", () => {
  state.lovers = [];
  const winner = checkWinner([
    { id: 1, role: "loup-garou", alive: false },
    { id: 2, role: "villageois", alive: true },
  ]);
  assertEqual(winner, "villageois");
});

test("checkWinner", "loups gagnent dès qu'ils sont majoritaires ou à égalité", () => {
  state.lovers = [];
  const winner = checkWinner([
    { id: 1, role: "loup-garou", alive: true },
    { id: 2, role: "villageois", alive: true },
  ]);
  assertEqual(winner, "loups-garous");
});

test("checkWinner", "partie continue tant que les loups sont minoritaires", () => {
  state.lovers = [];
  const winner = checkWinner([
    { id: 1, role: "loup-garou", alive: true },
    { id: 2, role: "villageois", alive: true },
    { id: 3, role: "villageois", alive: true },
  ]);
  assertEqual(winner, null);
});

test(
  "checkWinner",
  "amoureux de camps opposés, derniers survivants, gagnent avant le calcul normal",
  () => {
    // Sans la règle des amoureux, ceci donnerait "loups-garous" (1 loup
    // >= 1 villageois) : ce test vérifie que la priorité est respectée.
    state.lovers = [1, 2];
    const winner = checkWinner([
      { id: 1, role: "loup-garou", alive: true },
      { id: 2, role: "villageois", alive: true },
      { id: 3, role: "villageois", alive: false },
    ]);
    assertEqual(winner, "amoureux");
  },
);

test(
  "checkWinner",
  "amoureux du même camp : pas de victoire spéciale, calcul normal appliqué",
  () => {
    state.lovers = [1, 2];
    const winner = checkWinner([
      { id: 1, role: "villageois", alive: true },
      { id: 2, role: "villageois", alive: true },
    ]);
    assertEqual(winner, "villageois");
  },
);

test(
  "checkWinner",
  "amoureux définis mais plus de deux survivants : pas de court-circuit",
  () => {
    state.lovers = [1, 2];
    const winner = checkWinner([
      { id: 1, role: "loup-garou", alive: true },
      { id: 2, role: "villageois", alive: true },
      { id: 3, role: "villageois", alive: true },
    ]);
    assertEqual(winner, null);
  },
);

/* ---------- pickVoleurExtraRoles ---------- */

test("pickVoleurExtraRoles", "renvoie toujours exactement deux rôles", () => {
  state.voleurAllowedRoles = [...VALID_VOLEUR_ROLE_KEYS];
  const players = [{ id: 1, role: "voleur" }, { id: 2, role: "villageois" }];
  for (let i = 0; i < 20; i++) {
    assertEqual(pickVoleurExtraRoles(players).length, 2);
  }
});

test(
  "pickVoleurExtraRoles",
  "un rôle unique déjà distribué n'est jamais reproposé, même autorisé",
  () => {
    state.voleurAllowedRoles = [...VALID_VOLEUR_ROLE_KEYS];
    const players = [
      { id: 1, role: "cupidon" },
      { id: 2, role: "loup-garou" },
      { id: 3, role: "villageois" },
      { id: 4, role: "voleur" },
    ];
    for (let i = 0; i < 30; i++) {
      const picked = pickVoleurExtraRoles(players);
      assert(!picked.includes("cupidon"), "cupidon déjà en jeu proposé à tort");
      assert(!picked.includes("voleur"), "voleur ne doit jamais être candidat");
      assert(!picked.includes("villageois"), "villageois ne doit pas sortir alors qu'il y a assez de candidats");
    }
  },
);

test(
  "pickVoleurExtraRoles",
  "un rôle non unique (Loup-Garou) reste candidat même déjà distribué",
  () => {
    state.voleurAllowedRoles = [...VALID_VOLEUR_ROLE_KEYS];
    const players = [
      { id: 1, role: "cupidon" },
      { id: 2, role: "loup-garou" },
      { id: 3, role: "villageois" },
      { id: 4, role: "voleur" },
    ];
    let seenLoup = false;
    for (let i = 0; i < 40; i++) {
      if (pickVoleurExtraRoles(players).includes("loup-garou")) seenLoup = true;
    }
    assert(seenLoup, "loup-garou n'est jamais sorti sur 40 tirages, probablement exclu à tort");
  },
);

test(
  "pickVoleurExtraRoles",
  "respecte un rôle non unique décoché par le meneur",
  () => {
    state.voleurAllowedRoles = VALID_VOLEUR_ROLE_KEYS.filter((r) => r !== "loup-garou");
    const players = [{ id: 1, role: "villageois" }, { id: 2, role: "voleur" }];
    for (let i = 0; i < 40; i++) {
      assert(!pickVoleurExtraRoles(players).includes("loup-garou"), "loup-garou décoché mais proposé");
    }
  },
);

test(
  "pickVoleurExtraRoles",
  "un rôle unique redevient candidat quand il est décoché de la partie",
  () => {
    // "ancien" n'est en jeu chez aucun joueur ici : doit pouvoir sortir.
    state.voleurAllowedRoles = ["ancien"];
    const players = [{ id: 1, role: "villageois" }, { id: 2, role: "voleur" }];
    let seenAncien = false;
    for (let i = 0; i < 20; i++) {
      if (pickVoleurExtraRoles(players).includes("ancien")) seenAncien = true;
    }
    assert(seenAncien, "ancien autorisé et absent de la partie, jamais proposé");
  },
);

test(
  "pickVoleurExtraRoles",
  "repli Villageois si la sélection ne laisse qu'un seul rôle distinct",
  () => {
    // Régression : ceci ignorait autrefois complètement la sélection du
    // meneur (ex : proposait Petite Fille alors que seul Loup-Garou était
    // coché) au lieu de compléter avec Villageois.
    state.voleurAllowedRoles = ["loup-garou"];
    const players = [
      { id: 1, role: "loup-garou" },
      { id: 2, role: "villageois" },
      { id: 3, role: "voleur" },
    ];
    for (let i = 0; i < 20; i++) {
      const picked = pickVoleurExtraRoles(players).slice().sort();
      assertEqual(picked, ["loup-garou", "villageois"]);
    }
  },
);

test(
  "pickVoleurExtraRoles",
  "repli Villageois x2 si aucun rôle n'est autorisé",
  () => {
    state.voleurAllowedRoles = [];
    const players = [{ id: 1, role: "villageois" }, { id: 2, role: "voleur" }];
    assertEqual(pickVoleurExtraRoles(players), ["villageois", "villageois"]);
  },
);

/* ---------- normalizeSetup ---------- */

test("normalizeSetup", "au moins un loup, jamais zéro", () => {
  baseSetup();
  const r = normalizeSetup({ numWolves: 0 });
  assertEqual(r.numWolves, 1);
});

test("normalizeSetup", "au moins 3 joueurs, complété par des villageois", () => {
  baseSetup({ numVillageois: 0, numWolves: 1 });
  const r = normalizeSetup({});
  assert(totalOf(r) >= 3, "moins de 3 joueurs au total");
  assertEqual(r.numVillageois, 2);
});

test("normalizeSetup", "au plus 20 joueurs, les villageois absorbent le dépassement", () => {
  baseSetup({ numVillageois: 25, numWolves: 1 });
  const r = normalizeSetup({});
  assert(totalOf(r) <= 20, "plus de 20 joueurs au total");
});

test(
  "normalizeSetup",
  "les loups restent toujours minoritaires par rapport au reste du village",
  () => {
    baseSetup({ numVillageois: 3, numWolves: 1 });
    const r = normalizeSetup({ numWolves: 10 });
    assert(r.numWolves < villageTeamOf(r), "les loups sont majoritaires ou à égalité");
  },
);

test("normalizeSetup", "les rôles à exemplaire unique sont plafonnés à 1", () => {
  baseSetup();
  const r = normalizeSetup({ numCupidons: 5 });
  assertEqual(r.numCupidons, 1);
});

test(
  "normalizeSetup",
  "trop de rôles spéciaux en configuration extrême : réduits plutôt que de dépasser 20 joueurs",
  () => {
    baseSetup({
      numVillageois: 0,
      numWolves: 1,
      numChasseurs: 20,
      numFilles: 20,
    });
    const r = normalizeSetup({});
    assert(totalOf(r) <= 20, "plus de 20 joueurs malgré la réduction des rôles spéciaux");
  },
);

test(
  "normalizeSetup",
  "voleurAllowedRoles filtre les clés invalides (voleur, villageois, inconnues)",
  () => {
    baseSetup();
    const r = normalizeSetup({
      voleurAllowedRoles: ["loup-garou", "villageois", "voleur", "clef-inconnue", "chasseur"],
    });
    assertEqual([...r.voleurAllowedRoles].sort(), ["chasseur", "loup-garou"]);
  },
);

test("normalizeSetup", "persiste le résultat en localStorage", () => {
  baseSetup();
  const r = normalizeSetup({ numVillageois: 6 });
  const stored = JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY));
  assertEqual(stored.numVillageois, r.numVillageois);
});

test("normalizeSetup", "durée du minuteur de débat jamais négative", () => {
  baseSetup();
  const r = normalizeSetup({ debateDuration: -30 });
  assertEqual(r.debateDuration, 0);
});

test("normalizeSetup", "durée du minuteur de débat conservée telle quelle sinon", () => {
  baseSetup();
  const r = normalizeSetup({ debateDuration: 180 });
  assertEqual(r.debateDuration, 180);
});

/* ---------- rendu des résultats ---------- */

const summaryEl = document.getElementById("summary");
const listEl = document.getElementById("results");
const failed = results.filter((r) => !r.pass);

summaryEl.textContent = `${results.length - failed.length} / ${results.length} tests réussis`;
summaryEl.className = "summary " + (failed.length === 0 ? "ok" : "fail");

listEl.innerHTML = results
  .map(
    (r) => `
<li class="${r.pass ? "pass" : "fail"}">
  <span class="group">[${r.group}]</span>${r.pass ? "✓" : "✗"} ${r.name}
  ${r.pass ? "" : `<span class="err">${r.error}</span>`}
</li>
`,
  )
  .join("");

console.log(summaryEl.textContent);
if (failed.length > 0) {
  console.error(
    "Tests échoués :",
    failed.map((r) => `[${r.group}] ${r.name}: ${r.error}`),
  );
}
