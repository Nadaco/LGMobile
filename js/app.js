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

function render() {
  let html = "";
  switch (state.phase) {
    case "setup":
      html = tplSetup();
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
    case "night_cupidon":
      html = tplCupidon();
      break;
    case "night_wolves":
      html = tplNightWolves();
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
  const overlay = state.showAllCards ? tplRevealAllOverlay() : "";
  app.innerHTML = `<div class="fade-in">${html}</div>${fab}${overlay}`;
  wire();
}

// Calcule (sans l'appliquer) la transition à effectuer une fois toutes
// les morts de la manche résolues : victoire, ou passage au vote (nuit)
// / à la nuit suivante (jour). Renvoyé sous forme de partiel pour pouvoir
// être fusionné dans un unique set() par l'appelant.
function finishRoundPartial(context, players) {
  const winner = checkWinner(players);
  if (winner) {
    recordGameResult(players, winner, state.round);
    return { players, phase: "gameover", winner };
  }
  if (context === "night") {
    return { players, phase: "day_vote", dayTargetId: undefined };
  }
  return {
    players,
    phase: "night_sleep",
    round: state.round + 1,
    targetId: null,
  };
}

// Une fois la mort (ou les morts, si l'amoureux d'une victime meurt de
// chagrin) annoncée(s), chaque Chasseur parmi elles rétorque aussitôt ;
// sinon la manche se termine.
function seedHunterOrFinish(victims, context, players) {
  const hunterIds = victims
    .filter((v) => v && v.role === "chasseur")
    .map((v) => v.id);
  if (hunterIds.length > 0) {
    set({
      players,
      hunterQueue: hunterIds,
      hunterContext: context,
      hunterTargetId: null,
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
  const cascade = applyLoverCascade(players);
  players = cascade.players;
  const shotPlayer = players.find((p) => p.id === targetId);
  const cascadeVictim = cascade.extraDeathId
    ? players.find((p) => p.id === cascade.extraDeathId)
    : null;
  let newQueue = state.hunterQueue.slice(1);
  if (shotPlayer.role === "chasseur") newQueue = [...newQueue, shotPlayer.id];
  if (cascadeVictim && cascadeVictim.role === "chasseur")
    newQueue = [...newQueue, cascadeVictim.id];
  set({
    players,
    hunterQueue: newQueue,
    hunterTargetId: null,
    lastHunterVictimId: targetId,
    lastLoverVictimId: cascade.extraDeathId,
    showHunterVictimCard: false,
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
    clearHistoryBtn.onclick = () => {
      if (
        confirm(
          "Effacer tout l'historique des parties sur cet appareil ?",
        )
      ) {
        clearHistory();
        render();
      }
    };
  const startDistribute = app.querySelector("#start-distribute");
  if (startDistribute)
    startDistribute.onclick = () => {
      const roles = shuffle([
        ...Array(state.numWolves).fill("loup-garou"),
        ...Array(state.numVoyantes).fill("voyante"),
        ...Array(state.numChasseurs).fill("chasseur"),
        ...Array(state.numFilles).fill("petite-fille"),
        ...Array(state.numCupidons).fill("cupidon"),
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
        set({
          players: newPlayers,
          phase: "night_sleep",
          round: 1,
          distributeIndex: nextIndex,
          revealed: false,
          nameInputVal: "",
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
      const cupidonFirst =
        state.round === 1 &&
        state.lovers.length === 0 &&
        state.players.some((p) => p.role === "cupidon");
      set({
        targetId: null,
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
      let players = state.players.map((p) =>
        p.id === state.targetId ? { ...p, alive: false } : p,
      );
      const cascade = applyLoverCascade(players);
      players = cascade.players;
      set({
        players,
        lastVictimId: state.targetId,
        lastLoverVictimId: cascade.extraDeathId,
        phase: "night_transition",
      });
    };

  // night transition (after wolves)
  const transitionContinue = app.querySelector("#night-transition-continue");
  if (transitionContinue)
    transitionContinue.onclick = () => {
      const voyantes = actingRoleIds("voyante");
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
      const deadIds = [state.lastVictimId, state.lastLoverVictimId].filter(
        (id) => id !== null,
      );
      const players = state.players.map((p) =>
        deadIds.includes(p.id) ? { ...p, roleRevealed: true } : p,
      );
      const victims = deadIds.map((id) => players.find((p) => p.id === id));
      seedHunterOrFinish(victims, "night", players);
    };

  // day vote
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
          showDayVictimCard: false,
          phase: "day_reveal",
        });
      } else {
        let players = state.players.map((p) =>
          p.id === state.dayTargetId ? { ...p, alive: false } : p,
        );
        const cascade = applyLoverCascade(players);
        players = cascade.players;
        set({
          players,
          lastDayVictimId: state.dayTargetId,
          lastLoverVictimId: cascade.extraDeathId,
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline support unavailable, app still works online */
    });
  });
}
