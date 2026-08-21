/**
 * app.js — Point d'entrée : rendu, câblage des événements, démarrage.
 *
 * - render() : reconstruit le HTML de l'écran courant et rappelle wire()
 * - wire()   : attache les gestionnaires de clic/saisie aux éléments
 *              générés par les templates (js/templates.js)
 * - Enregistre le service worker (hors-ligne) et lance le premier rendu.
 *
 * Dépend de : state (js/state.js), tpl*() (js/templates.js).
 * Doit être chargé en dernier (après roles.js, state.js, templates.js).
 */

const app = document.getElementById("app");

// Mis à true quand un nouveau service worker vient de prendre la main
// (voir l'enregistrement en bas de fichier). On ne recharge que depuis
// l'accueil, jamais en pleine partie, pour ne pas effacer une partie en
// cours — sinon on reste en attente et render() rechargera dès que
// state.phase repassera à "setup" (fin de partie, ou bouton arrêter).
let swUpdateReady = false;

function render() {
  if (swUpdateReady && state.phase === "setup") {
    window.location.reload();
    return;
  }
  let html = "";
  switch (state.phase) {
    case "setup":
      html = tplSetup();
      break;
    case "voleur_config":
      html = tplVoleurConfig();
      break;
    case "stats":
      html = tplStats();
      break;
    case "rules":
      html = tplRules();
      break;
    case "distribute":
      html = tplDistribute();
      break;
    case "night_sleep":
      html = tplNightSleep();
      break;
    case "night_voleur":
      html = tplVoleur();
      break;
    case "night_cupidon":
      html = tplCupidon();
      break;
    case "night_wolves":
      html = tplNightWolves();
      break;
    case "night_sorciere":
      html = tplSorciere();
      break;
    case "night_transition":
      html = tplNightTransition();
      break;
    case "night_voyante":
      html = tplNightVoyante();
      break;
    case "night_voyante_sleep":
      html = tplNightVoyanteSleep();
      break;
    case "night_hunter":
      html = tplHunterShot("night");
      break;
    case "night_hunter_reveal":
      html = tplHunterVictimReveal("night");
      break;
    case "night_reveal":
      html = tplNightReveal();
      break;
    case "day_hunter":
      html = tplHunterShot("day");
      break;
    case "day_hunter_reveal":
      html = tplHunterVictimReveal("day");
      break;
    case "day_vote":
      html = tplDayVote();
      break;
    case "day_reveal":
      html = tplDayReveal();
      break;
    case "gameover":
      html = tplGameOver();
      break;
  }
  const showFab =
    state.players.length > 0 && state.phase !== "distribute";
  const fab = showFab
    ? `<button class="reveal-fab" id="revealFab" title="Voir toutes les cartes">🃏</button>`
    : "";
  const showQuit = ![
    "setup",
    "voleur_config",
    "stats",
    "rules",
    "gameover",
  ].includes(state.phase);
  const quitFab = showQuit
    ? `<button class="quit-fab" id="quitGameFab" title="Arrêter la partie">✕</button>`
    : "";
  const overlay = state.showAllCards ? tplRevealAllOverlay() : "";
  const confirmDialog = tplConfirmDialog();
  app.innerHTML = `<div class="fade-in">${html}</div>${fab}${quitFab}${overlay}${confirmDialog}`;
  wire();
}

// Une fois la potion de vie utilisée (ou passée), enchaîne sur la potion
// de mort si elle est encore disponible, sinon termine le tour de la
// Sorcière directement.
function advanceFromWitchLife(players, lifePotionUsed) {
  if (!state.witchDeathPotionUsed) {
    set({
      players,
      witchLifePotionUsed: lifePotionUsed,
      witchStep: "death",
      witchDeathTargetId: null,
    });
  } else {
    set({
      players,
      witchLifePotionUsed: lifePotionUsed,
      phase: "night_transition",
    });
  }
}

// Calcule (sans l'appliquer) la transition à effectuer une fois toutes
// les morts de la manche résolues : victoire, ou passage au vote (nuit)
// / à la nuit suivante (jour). Renvoyé sous forme de partiel pour pouvoir
// être fusionné dans un unique set() par l'appelant.
function finishRoundPartial(context, players) {
  const winner = checkWinner(players);
  if (winner) {
    recordGameResult(players, winner, state.round);
    return {
      players,
      phase: "gameover",
      winner,
      ancienPowersJustDisabled: false,
    };
  }
  if (context === "night") {
    return {
      players,
      phase: "day_vote",
      dayTargetId: undefined,
      ancienPowersJustDisabled: false,
      // Minuteur de débat optionnel (0 = désactivé, voir setup) : démarre
      // automatiquement à chaque nouveau vote de jour.
      debateRemaining: state.debateDuration > 0 ? state.debateDuration : null,
      debateRunning: state.debateDuration > 0,
    };
  }
  return {
    players,
    phase: "night_sleep",
    round: state.round + 1,
    targetId: null,
    ancienPowersJustDisabled: false,
  };
}

// Une fois la mort (ou les morts, si l'amoureux d'une victime meurt de
// chagrin) annoncée(s), chaque Chasseur parmi elles rétorque aussitôt ;
// sinon la manche se termine. Aucune riposte si les pouvoirs villageois
// sont désactivés (l'Ancien a été tué par le vote ou un pouvoir).
function seedHunterOrFinish(victims, context, players) {
  const hunterIds = state.villagePowersDisabled
    ? []
    : victims.filter((v) => v && v.role === "chasseur").map((v) => v.id);
  if (hunterIds.length > 0) {
    set({
      players,
      hunterQueue: hunterIds,
      hunterContext: context,
      hunterTargetId: null,
      ancienPowersJustDisabled: false,
      phase: context === "night" ? "night_hunter" : "day_hunter",
    });
  } else {
    set(finishRoundPartial(context, players));
  }
}

// Résout le tir de riposte du Chasseur en tête de hunterQueue et bascule
// vers l'écran qui annonce le rôle de la victime abattue. La chaîne
// (Chasseur qui abat un autre Chasseur, y compris via la cascade des
// amoureux) ou la suite de la manche sont décidées depuis cet écran de
// révélation, pas ici.
function resolveHunterShot(context) {
  const targetId = state.hunterTargetId;
  let players = state.players.map((p) =>
    p.id === targetId ? { ...p, alive: false } : p,
  );
  const shotPlayer = players.find((p) => p.id === targetId);
  const disablesPowers = shotPlayer.role === "ancien";
  const cascade = applyLoverCascade(players);
  players = cascade.players;
  const cascadeVictim = cascade.extraDeathId
    ? players.find((p) => p.id === cascade.extraDeathId)
    : null;
  let newQueue = state.hunterQueue.slice(1);
  // Si ce tir vient de tuer l'Ancien, les pouvoirs villageois (dont la
  // riposte du Chasseur) sont désactivés : pas de nouvelle chaîne.
  if (!disablesPowers && !state.villagePowersDisabled) {
    if (shotPlayer.role === "chasseur")
      newQueue = [...newQueue, shotPlayer.id];
    if (cascadeVictim && cascadeVictim.role === "chasseur")
      newQueue = [...newQueue, cascadeVictim.id];
  }
  set({
    players,
    hunterQueue: newQueue,
    hunterTargetId: null,
    lastHunterVictimId: targetId,
    lastLoverVictimId: cascade.extraDeathId,
    showHunterVictimCard: false,
    villagePowersDisabled: state.villagePowersDisabled || disablesPowers,
    ancienPowersJustDisabled: disablesPowers,
    phase: context === "night" ? "night_hunter_reveal" : "day_hunter_reveal",
  });
}

function wire() {
  // setup
  const villMinus = app.querySelector('[data-act="villageois-"]');
  const villPlus = app.querySelector('[data-act="villageois+"]');
  const wMinus = app.querySelector('[data-act="wolves-"]');
  const wPlus = app.querySelector('[data-act="wolves+"]');
  if (villMinus)
    villMinus.onclick = () => {
      set(normalizeSetup({ numVillageois: state.numVillageois - 1 }));
    };
  if (villPlus)
    villPlus.onclick = () => {
      set(normalizeSetup({ numVillageois: state.numVillageois + 1 }));
    };
  if (wMinus)
    wMinus.onclick = () => {
      set(normalizeSetup({ numWolves: state.numWolves - 1 }));
    };
  if (wPlus)
    wPlus.onclick = () => {
      set(normalizeSetup({ numWolves: state.numWolves + 1 }));
    };
  // Rôles spéciaux : une puce = un rôle, en nombre libre. Ajouter un rôle
  // spécial ici + dans SPECIAL_ROLES (js/templates.js) suffit à le faire
  // apparaître dans la configuration.
  const SPECIAL_ROLE_FIELDS = {
    voyante: "numVoyantes",
    chasseur: "numChasseurs",
    "petite-fille": "numFilles",
    cupidon: "numCupidons",
    sorciere: "numSorcieres",
    ancien: "numAnciens",
    voleur: "numVoleurs",
  };
  app.querySelectorAll("[data-role-add]").forEach((el) => {
    el.onclick = () => {
      const field = SPECIAL_ROLE_FIELDS[el.getAttribute("data-role-add")];
      set(normalizeSetup({ [field]: 1 }));
    };
  });
  app.querySelectorAll("[data-role-inc]").forEach((el) => {
    el.onclick = () => {
      const field = SPECIAL_ROLE_FIELDS[el.getAttribute("data-role-inc")];
      set(normalizeSetup({ [field]: state[field] + 1 }));
    };
  });
  app.querySelectorAll("[data-role-dec]").forEach((el) => {
    el.onclick = () => {
      const field = SPECIAL_ROLE_FIELDS[el.getAttribute("data-role-dec")];
      set(normalizeSetup({ [field]: state[field] - 1 }));
    };
  });
  app.querySelectorAll("[data-role-remove]").forEach((el) => {
    el.onclick = () => {
      const field = SPECIAL_ROLE_FIELDS[el.getAttribute("data-role-remove")];
      set(normalizeSetup({ [field]: 0 }));
    };
  });

  // minuteur de débat (durée choisie en configuration parmi des préréglages)
  app.querySelectorAll("[data-debate-duration]").forEach((el) => {
    el.onclick = () => {
      const seconds = Number(el.getAttribute("data-debate-duration"));
      set(normalizeSetup({ debateDuration: seconds }));
    };
  });

  // configuration des rôles piochables par le Voleur (écran ⚙️)
  const voleurConfigOpen = app.querySelector("[data-voleur-config]");
  if (voleurConfigOpen)
    voleurConfigOpen.onclick = () => set({ phase: "voleur_config" });
  app.querySelectorAll("[data-voleur-role-toggle]").forEach((el) => {
    el.onclick = () => {
      const role = el.getAttribute("data-voleur-role-toggle");
      const voleurAllowedRoles = state.voleurAllowedRoles.includes(role)
        ? state.voleurAllowedRoles.filter((r) => r !== role)
        : [...state.voleurAllowedRoles, role];
      set(normalizeSetup({ voleurAllowedRoles }));
    };
  });
  const backFromVoleurConfig = app.querySelector("#back-from-voleur-config");
  if (backFromVoleurConfig)
    backFromVoleurConfig.onclick = () => set({ phase: "setup" });

  const viewStats = app.querySelector("#view-stats");
  if (viewStats) viewStats.onclick = () => set({ phase: "stats" });
  const backToSetup = app.querySelector("#back-to-setup");
  if (backToSetup) backToSetup.onclick = () => set({ phase: "setup" });
  const viewRules = app.querySelector("#view-rules");
  if (viewRules) viewRules.onclick = () => set({ phase: "rules" });
  const backFromRules = app.querySelector("#back-from-rules");
  if (backFromRules) backFromRules.onclick = () => set({ phase: "setup" });
  const clearHistoryBtn = app.querySelector("#clear-history");
  if (clearHistoryBtn)
    clearHistoryBtn.onclick = () =>
      set({
        confirmDialog: {
          message: "Effacer tout l'historique des parties sur cet appareil ?",
          action: "clear-history",
        },
      });
  const startDistribute = app.querySelector("#start-distribute");
  if (startDistribute)
    startDistribute.onclick = () => {
      const roles = shuffle([
        ...Array(state.numWolves).fill("loup-garou"),
        ...Array(state.numVoyantes).fill("voyante"),
        ...Array(state.numChasseurs).fill("chasseur"),
        ...Array(state.numFilles).fill("petite-fille"),
        ...Array(state.numCupidons).fill("cupidon"),
        ...Array(state.numSorcieres).fill("sorciere"),
        ...Array(state.numAnciens).fill("ancien"),
        ...Array(state.numVoleurs).fill("voleur"),
        ...Array(state.numVillageois).fill("villageois"),
      ]);
      set({
        deck: roles,
        phase: "distribute",
        distributeIndex: 0,
        revealed: false,
        players: [],
      });
    };

  // distribute
  const cardFlip = app.querySelector("#cardFlip");
  if (cardFlip) cardFlip.onclick = () => set({ revealed: true });
  const nameInput = app.querySelector("#nameInput");
  const confirmName = app.querySelector("#confirm-name");
  const nameError = app.querySelector("#nameError");
  const isNameTaken = (name) => {
    const norm = normalizeName(name);
    return (
      norm.length > 0 &&
      state.players.some((p) => normalizeName(p.name) === norm)
    );
  };
  if (nameInput) {
    nameInput.oninput = () => {
      const trimmed = nameInput.value.trim();
      const taken = isNameTaken(trimmed);
      confirmName.disabled = trimmed.length === 0 || taken;
      if (nameError) nameError.style.display = taken ? "block" : "none";
      state.nameInputVal = nameInput.value;
    };
    nameInput.focus();
  }
  if (confirmName)
    confirmName.onclick = () => {
      const name = (nameInput.value || "").trim();
      if (!name) return;
      if (isNameTaken(name)) {
        if (nameError) nameError.style.display = "block";
        return;
      }
      const role = state.deck[state.distributeIndex];
      const newPlayers = [
        ...state.players,
        {
          id: state.distributeIndex,
          name,
          role,
          alive: true,
          roleRevealed: false,
        },
      ];
      const nextIndex = state.distributeIndex + 1;
      if (nextIndex >= state.deck.length) {
        rememberNames(newPlayers);
        const hasVoleur = newPlayers.some((p) => p.role === "voleur");
        set({
          players: newPlayers,
          phase: "night_sleep",
          round: 1,
          distributeIndex: nextIndex,
          revealed: false,
          nameInputVal: "",
          voleurExtraRoles: hasVoleur
            ? pickVoleurExtraRoles(newPlayers)
            : [],
        });
      } else {
        set({
          players: newPlayers,
          distributeIndex: nextIndex,
          revealed: false,
          nameInputVal: "",
        });
      }
    };

  // night sleep
  const wakeWolves = app.querySelector("#wake-wolves");
  if (wakeWolves)
    wakeWolves.onclick = () => {
      const voleurFirst =
        state.round === 1 && state.players.some((p) => p.role === "voleur");
      const cupidonFirst =
        !voleurFirst &&
        state.round === 1 &&
        state.lovers.length === 0 &&
        state.players.some((p) => p.role === "cupidon");
      set({
        targetId: null,
        loverSelection: [],
        voleurSelectedRole: null,
        phase: voleurFirst
          ? "night_voleur"
          : cupidonFirst
            ? "night_cupidon"
            : "night_wolves",
      });
    };

  // night voleur (nuit 1 uniquement) — échange sa carte contre l'un des
  // deux rôles non distribués, ou reste Simple Villageois. Réévalue
  // ensuite si Cupidon doit se réveiller (au cas où le Voleur devient
  // Cupidon), sinon passe directement aux loups-garous.
  app.querySelectorAll("[data-voleur-select]").forEach((el) => {
    el.onclick = () => {
      set({ voleurSelectedRole: el.getAttribute("data-voleur-select") });
    };
  });
  const confirmVoleur = app.querySelector("#confirm-voleur");
  if (confirmVoleur)
    confirmVoleur.onclick = () => {
      const voleurPlayer = state.players.find((p) => p.role === "voleur");
      const chosenRole =
        state.voleurSelectedRole === "none" ? null : state.voleurSelectedRole;
      const players = chosenRole
        ? state.players.map((p) =>
            p.id === voleurPlayer.id ? { ...p, role: chosenRole } : p,
          )
        : state.players;
      const cupidonFirst =
        state.lovers.length === 0 &&
        players.some((p) => p.role === "cupidon");
      set({
        players,
        voleurSelectedRole: null,
        loverSelection: [],
        phase: cupidonFirst ? "night_cupidon" : "night_wolves",
      });
    };

  // night cupidon (nuit 1 uniquement)
  app.querySelectorAll("[data-lover-select]").forEach((el) => {
    el.onclick = () => {
      const id = Number(el.getAttribute("data-lover-select"));
      let sel = state.loverSelection;
      if (sel.includes(id)) {
        sel = sel.filter((x) => x !== id);
      } else if (sel.length < 2) {
        sel = [...sel, id];
      }
      set({ loverSelection: sel });
    };
  });
  const confirmLovers = app.querySelector("#confirm-lovers");
  if (confirmLovers)
    confirmLovers.onclick = () =>
      set({
        lovers: state.loverSelection,
        loverSelection: [],
        phase: "night_wolves",
      });

  // night wolves - target selection
  app.querySelectorAll("[data-target]").forEach((el) => {
    el.onclick = () =>
      set({ targetId: Number(el.getAttribute("data-target")) });
  });
  const confirmTarget = app.querySelector("#confirm-target");
  if (confirmTarget)
    confirmTarget.onclick = () => {
      const target = state.players.find((p) => p.id === state.targetId);
      // L'Ancien résiste silencieusement à sa première attaque des
      // loups-garous : personne (y compris lui) n'en est averti.
      const ancienAbsorbs =
        target.role === "ancien" && !state.ancienExtraLifeUsed;
      let players = ancienAbsorbs
        ? state.players
        : state.players.map((p) =>
            p.id === state.targetId ? { ...p, alive: false } : p,
          );
      const cascade = applyLoverCascade(players);
      players = cascade.players;
      // Si l'Ancien vient d'absorber le coup, il n'y a rien à sauver :
      // la Sorcière ne se voit proposer que la potion de mort le cas
      // échéant.
      const witchLifeRelevant = !ancienAbsorbs && !state.witchLifePotionUsed;
      const witchCanAct =
        !state.villagePowersDisabled &&
        (witchLifeRelevant || !state.witchDeathPotionUsed) &&
        players.some(
          (p) =>
            p.role === "sorciere" && (p.alive || p.id === state.targetId),
        );
      set({
        players,
        lastVictimId: state.targetId,
        lastLoverVictimId: cascade.extraDeathId,
        lastWitchVictimId: null,
        ancienExtraLifeUsed: ancienAbsorbs || state.ancienExtraLifeUsed,
        ancienPowersJustDisabled: false,
        witchStep: witchLifeRelevant ? "life" : "death",
        witchDeathTargetId: null,
        phase: witchCanAct ? "night_sorciere" : "night_transition",
      });
    };

  // night sorcière — potion de vie (sauver la victime des loups), puis
  // potion de mort (empoisonner un autre joueur), chacune à usage unique
  // pour toute la partie.
  const witchSave = app.querySelector("#witch-save");
  if (witchSave)
    witchSave.onclick = () => {
      const players = state.players.map((p) =>
        p.id === state.lastVictimId ? { ...p, alive: true } : p,
      );
      advanceFromWitchLife(players, true);
    };
  const witchSkipLife = app.querySelector("#witch-skip-life");
  if (witchSkipLife)
    witchSkipLife.onclick = () => advanceFromWitchLife(state.players, false);

  app.querySelectorAll("[data-witch-death-target]").forEach((el) => {
    el.onclick = () => {
      const v = el.getAttribute("data-witch-death-target");
      set({ witchDeathTargetId: v === "none" ? "none" : Number(v) });
    };
  });
  const confirmWitchDeath = app.querySelector("#confirm-witch-death");
  if (confirmWitchDeath)
    confirmWitchDeath.onclick = () => {
      if (state.witchDeathTargetId === "none") {
        set({ phase: "night_transition" });
        return;
      }
      let players = state.players.map((p) =>
        p.id === state.witchDeathTargetId ? { ...p, alive: false } : p,
      );
      const poisoned = players.find(
        (p) => p.id === state.witchDeathTargetId,
      );
      const disablesPowers = poisoned.role === "ancien";
      const cascade = applyLoverCascade(players);
      players = cascade.players;
      set({
        players,
        witchDeathPotionUsed: true,
        lastWitchVictimId: state.witchDeathTargetId,
        lastLoverVictimId: cascade.extraDeathId ?? state.lastLoverVictimId,
        villagePowersDisabled: state.villagePowersDisabled || disablesPowers,
        ancienPowersJustDisabled: disablesPowers,
        phase: "night_transition",
      });
    };

  // night transition (after wolves)
  const transitionContinue = app.querySelector("#night-transition-continue");
  if (transitionContinue)
    transitionContinue.onclick = () => {
      const voyantes = state.villagePowersDisabled
        ? []
        : actingRoleIds("voyante");
      if (voyantes.length > 0) {
        set({
          phase: "night_voyante",
          voyanteQueue: voyantes,
          voyanteTargetId: null,
          voyanteRevealed: false,
        });
      } else {
        set({ phase: "night_reveal", showVictimCard: false });
      }
    };

  // night voyante
  app.querySelectorAll("[data-voyante-target]").forEach((el) => {
    el.onclick = () =>
      set({
        voyanteTargetId: Number(el.getAttribute("data-voyante-target")),
      });
  });
  const confirmVoyanteTarget = app.querySelector("#confirm-voyante-target");
  if (confirmVoyanteTarget)
    confirmVoyanteTarget.onclick = () => set({ voyanteRevealed: true });
  const voyanteDone = app.querySelector("#voyante-done");
  if (voyanteDone)
    voyanteDone.onclick = () => {
      const restQueue = state.voyanteQueue.slice(1);
      if (restQueue.length > 0) {
        set({
          voyanteQueue: restQueue,
          voyanteTargetId: null,
          voyanteRevealed: false,
          phase: "night_voyante",
        });
      } else {
        set({ voyanteQueue: restQueue, phase: "night_voyante_sleep" });
      }
    };

  // night voyante sleep
  const wakeVillage = app.querySelector("#wake-village");
  if (wakeVillage)
    wakeVillage.onclick = () =>
      set({ phase: "night_reveal", showVictimCard: false });

  // hunter (chasseur) shot — nuit ou jour, déclenché quand un Chasseur meurt
  app.querySelectorAll("[data-hunter-target]").forEach((el) => {
    el.onclick = () =>
      set({ hunterTargetId: Number(el.getAttribute("data-hunter-target")) });
  });
  const confirmHunterTarget = app.querySelector("#confirm-hunter-target");
  if (confirmHunterTarget)
    confirmHunterTarget.onclick = () => resolveHunterShot(state.hunterContext);

  // hunter victim reveal — annonce le rôle de la personne abattue, puis
  // enchaîne sur le Chasseur suivant (chaîne) ou termine la manche.
  const toggleHunterVictimCard = app.querySelector(
    "#toggle-hunter-victim-card",
  );
  if (toggleHunterVictimCard)
    toggleHunterVictimCard.onclick = () =>
      set({ showHunterVictimCard: !state.showHunterVictimCard });
  const continueAfterHunterReveal = app.querySelector(
    "#continue-after-hunter-reveal",
  );
  if (continueAfterHunterReveal)
    continueAfterHunterReveal.onclick = () => {
      const deadIds = [
        state.lastHunterVictimId,
        state.lastLoverVictimId,
      ].filter((id) => id !== null);
      const players = state.players.map((p) =>
        deadIds.includes(p.id) ? { ...p, roleRevealed: true } : p,
      );
      if (state.hunterQueue.length > 0) {
        set({
          players,
          ancienPowersJustDisabled: false,
          phase:
            state.hunterContext === "night" ? "night_hunter" : "day_hunter",
        });
      } else {
        set(finishRoundPartial(state.hunterContext, players));
      }
    };

  // night reveal
  const toggleCard = app.querySelector("#toggle-victim-card");
  if (toggleCard)
    toggleCard.onclick = () =>
      set({ showVictimCard: !state.showVictimCard });
  const continueBtn = app.querySelector("#continue-after-reveal");
  if (continueBtn)
    continueBtn.onclick = () => {
      const wolfTarget = state.players.find(
        (p) => p.id === state.lastVictimId,
      );
      const deadIds = [
        wolfTarget.alive ? null : state.lastVictimId,
        state.lastLoverVictimId,
        state.lastWitchVictimId,
      ].filter((id) => id !== null);
      const players = state.players.map((p) =>
        deadIds.includes(p.id) ? { ...p, roleRevealed: true } : p,
      );
      const victims = deadIds.map((id) => players.find((p) => p.id === id));
      seedHunterOrFinish(victims, "night", players);
    };

  // day vote
  const debateToggle = app.querySelector("#debate-toggle");
  if (debateToggle)
    debateToggle.onclick = () => set({ debateRunning: !state.debateRunning });
  const debateAddMinute = app.querySelector("#debate-add-minute");
  if (debateAddMinute)
    debateAddMinute.onclick = () =>
      set({
        debateRemaining: (state.debateRemaining || 0) + 60,
        debateRunning: true,
      });
  app.querySelectorAll("[data-dayvote]").forEach((el) => {
    el.onclick = () => {
      const v = el.getAttribute("data-dayvote");
      set({ dayTargetId: v === "none" ? "none" : Number(v) });
    };
  });
  const confirmDayVote = app.querySelector("#confirm-day-vote");
  if (confirmDayVote)
    confirmDayVote.onclick = () => {
      if (state.dayTargetId === "none") {
        set({
          lastDayVictimId: null,
          lastLoverVictimId: null,
          ancienPowersJustDisabled: false,
          showDayVictimCard: false,
          phase: "day_reveal",
        });
      } else {
        let players = state.players.map((p) =>
          p.id === state.dayTargetId ? { ...p, alive: false } : p,
        );
        const votedOut = players.find((p) => p.id === state.dayTargetId);
        const disablesPowers = votedOut.role === "ancien";
        const cascade = applyLoverCascade(players);
        players = cascade.players;
        set({
          players,
          lastDayVictimId: state.dayTargetId,
          lastLoverVictimId: cascade.extraDeathId,
          villagePowersDisabled: state.villagePowersDisabled || disablesPowers,
          ancienPowersJustDisabled: disablesPowers,
          showDayVictimCard: false,
          phase: "day_reveal",
        });
      }
    };

  // day reveal
  const toggleDayCard = app.querySelector("#toggle-day-victim-card");
  if (toggleDayCard)
    toggleDayCard.onclick = () =>
      set({ showDayVictimCard: !state.showDayVictimCard });
  const continueAfterDay = app.querySelector("#continue-after-day");
  if (continueAfterDay)
    continueAfterDay.onclick = () => {
      if (state.lastDayVictimId === null) {
        set(finishRoundPartial("day", state.players));
        return;
      }
      const deadIds = [
        state.lastDayVictimId,
        state.lastLoverVictimId,
      ].filter((id) => id !== null);
      const players = state.players.map((p) =>
        deadIds.includes(p.id) ? { ...p, roleRevealed: true } : p,
      );
      const victims = deadIds.map((id) => players.find((p) => p.id === id));
      seedHunterOrFinish(victims, "day", players);
    };

  // gameover
  const newGame = app.querySelector("#new-game");
  if (newGame) newGame.onclick = resetGame;

  // quit game fab — abandonne la partie en cours, revient à l'accueil
  const quitGameFab = app.querySelector("#quitGameFab");
  if (quitGameFab)
    quitGameFab.onclick = () =>
      set({
        confirmDialog: {
          message: "Arrêter la partie en cours et revenir à l'accueil ?",
          action: "quit-game",
        },
      });

  // confirmation en place (remplace window.confirm())
  const confirmDialogCancel = app.querySelector("#confirmDialogCancel");
  if (confirmDialogCancel)
    confirmDialogCancel.onclick = () => set({ confirmDialog: null });
  const confirmDialogOk = app.querySelector("#confirmDialogOk");
  if (confirmDialogOk)
    confirmDialogOk.onclick = () => {
      const action = state.confirmDialog && state.confirmDialog.action;
      if (action === "quit-game") {
        resetGame();
      } else if (action === "clear-history") {
        clearHistory();
        set({ confirmDialog: null });
      }
    };
  const confirmOverlay = app.querySelector("#confirmOverlay");
  if (confirmOverlay)
    confirmOverlay.onclick = (e) => {
      if (e.target === confirmOverlay) set({ confirmDialog: null });
    };

  // reveal-all fab
  const revealFab = app.querySelector("#revealFab");
  if (revealFab) revealFab.onclick = () => set({ showAllCards: true });
  const closeReveal = app.querySelector("#closeRevealOverlay");
  if (closeReveal)
    closeReveal.onclick = () => set({ showAllCards: false });
  const revealOverlay = app.querySelector("#revealOverlay");
  if (revealOverlay)
    revealOverlay.onclick = (e) => {
      if (e.target === revealOverlay) set({ showAllCards: false });
    };
}

render();

// Minuteur de débat (vote de jour) : une seule minuterie globale, démarrée
// une fois au chargement. Elle ne fait quelque chose que pendant la phase
// day_vote, quand debateRunning est vrai et qu'il reste du temps — sinon
// ce tick ne coûte qu'une comparaison, pas besoin de la démarrer/arrêter
// à chaque changement de phase.
//
// Exception délibérée à la règle "set() est la seule façon de modifier
// state" (voir en-tête de state.js) : passer par set() ici reconstruirait
// tout l'écran (app.innerHTML = ...) chaque seconde, ce qui se voit comme
// un clignotement/rafraîchissement de la page. On modifie donc
// state.debateRemaining directement et on ne patch que le texte du
// minuteur dans le DOM ; state reste la source de vérité pour tout rendu
// complet déclenché par ailleurs (n'importe quelle autre interaction).
// Un rendu complet reste utilisé quand la structure de l'écran doit
// changer (le bouton Pause disparaît une fois le temps écoulé).
setInterval(() => {
  if (
    state.phase !== "day_vote" ||
    !state.debateRunning ||
    state.debateRemaining <= 0
  ) {
    return;
  }
  state.debateRemaining -= 1;
  if (state.debateRemaining <= 0) {
    set({ debateRemaining: 0, debateRunning: false });
    return;
  }
  const timeEl = document.getElementById("debate-time-value");
  if (!timeEl) {
    render();
    return;
  }
  const m = Math.floor(state.debateRemaining / 60);
  const s = state.debateRemaining % 60;
  timeEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
}, 1000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline support unavailable, app still works online */
    });
  });
  // Dès qu'une nouvelle version du service worker prend la main (mise à
  // jour déployée), on recharge automatiquement — plus besoin de Ctrl+F5 —
  // mais seulement quand c'est sans risque (voir swUpdateReady ci-dessus).
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    swUpdateReady = true;
    if (state.phase === "setup") window.location.reload();
  });
}
