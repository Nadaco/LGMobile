/**
 * templates.js — Génération du HTML pour chaque écran du jeu.
 *
 * Chaque fonction tplXxx() retourne une chaîne HTML pour une phase du jeu
 * (state.phase). Ces fonctions sont pures : elles lisent `state` et
 * ROLE_INFO mais ne modifient rien — la mise à jour se fait via set()
 * dans js/state.js, et le rendu réel (innerHTML + attache des événements)
 * se fait dans js/app.js.
 *
 * Dépend de : state (js/state.js), ROLE_INFO (js/roles.js),
 * escapeHtml() (js/state.js).
 */

/* ---------- moon ---------- */

function moonSvg(mode) {
  // mode: calm | night | blood | gold
  const colors = {
    calm: "#c7cbea",
    night: "#f4f4ff",
    blood: "#e0574d",
    gold: "#f0c878",
  };
  const glowClass = {
    calm: "moon-glow-calm",
    night: "moon-glow-night",
    blood: "moon-glow-blood",
    gold: "moon-glow-gold",
  }[mode];
  return `<div class="moon-wrap">
    <svg class="moon-svg ${glowClass}" viewBox="0 0 100 100">
<circle class="moon-body" cx="50" cy="50" r="34" fill="${colors[mode]}"/>
    </svg>
  </div>`;
}

/* ---------- templates per phase ---------- */

// Rôles optionnels proposés sous forme de puces dans la configuration.
// Ajouter un rôle spécial ici (+ sa case dans SPECIAL_ROLE_FIELDS côté
// app.js) suffit pour qu'il apparaisse, sans toucher au reste de l'écran.
const SPECIAL_ROLES = [
  { key: "voyante", count: () => state.numVoyantes },
  { key: "chasseur", count: () => state.numChasseurs },
  { key: "petite-fille", count: () => state.numFilles },
];

function tplSetup() {
  const total = totalPlayers();
  return `
    ${moonSvg("calm")}
    <div class="eyebrow">Partie locale · 1 téléphone</div>
    <h1 class="title">Loup-Garou</h1>

    <div class="progress">${total} joueur${total > 1 ? "s" : ""} autour de la table</div>

    <div class="panel">
<div class="row">
  <div>
    <div class="label">Villageois</div>
    <div class="sub">Aucun pouvoir particulier</div>
  </div>
  <div class="stepper">
    <button data-act="villageois-">−</button>
    <div class="val">${state.numVillageois}</div>
    <button data-act="villageois+">+</button>
  </div>
</div>
<div class="row">
  <div>
    <div class="label">Loups-garous</div>
    <div class="sub">Élimine un joueur chaque nuit</div>
  </div>
  <div class="stepper">
    <button data-act="wolves-">−</button>
    <div class="val">${state.numWolves}</div>
    <button data-act="wolves+">+</button>
  </div>
</div>
    </div>

    <label class="field-label">Rôles spéciaux</label>
    <div class="role-chip-grid">
${SPECIAL_ROLES.map((r) => {
  const info = ROLE_INFO[r.key];
  const count = r.count();
  if (count === 0) {
    return `
  <button class="role-chip" data-role-add="${r.key}">
    <span class="chip-glyph">${info.glyph}</span>
    <span class="chip-label">${info.label}</span>
  </button>
`;
  }
  return `
  <div class="role-chip active ${info.cls}">
    <button class="chip-step" data-role-dec="${r.key}">−</button>
    <span class="chip-glyph">${info.glyph}</span>
    <span class="chip-label">${info.label}</span>
    <span class="chip-count">${count}</span>
    <button class="chip-step" data-role-inc="${r.key}">+</button>
  </div>
`;
})
  .join("")}
    </div>

    <div class="subtitle">Chaque joueur passera le téléphone à son tour pour piocher sa carte et inscrire son nom.</div>

    <button class="btn btn-primary" id="start-distribute">Commencer la distribution des rôles</button>
    <button class="btn btn-ghost" id="view-rules" style="margin-top:12px;">Voir tous les rôles</button>
    ${getHistory().length > 0 ? `<button class="btn btn-ghost" id="view-stats" style="margin-top:12px;">Statistiques &amp; historique</button>` : ""}
  `;
}

function tplRules() {
  const roles = Object.values(ROLE_INFO);
  return `
    ${moonSvg("calm")}
    <div class="eyebrow">Aide-mémoire</div>
    <h2 class="stitle">Les rôles</h2>
    <div class="subtitle">Comment fonctionne chaque rôle du jeu.</div>

    <div class="rule-list">
${roles
  .map(
    (r) => `
  <div class="rule-card">
    <div class="rule-head">
      <span class="rule-glyph">${r.glyph}</span>
      <span class="rule-name">${r.label}</span>
      <span class="rolebadge ${r.cls}">${r.team === "loups" ? "Loups" : "Village"}</span>
    </div>
    <div class="rule-desc">${r.description}</div>
  </div>
`,
  )
  .join("")}
    </div>

    <button class="btn btn-primary" id="back-from-rules">Retour</button>
  `;
}

function tplStats() {
  const stats = computePlayerStats();
  const history = getHistory();
  return `
    ${moonSvg("calm")}
    <div class="eyebrow">Sur cet appareil</div>
    <h2 class="stitle">Statistiques</h2>
    <div class="subtitle">${history.length} partie${history.length > 1 ? "s" : ""} enregistrée${history.length > 1 ? "s" : ""} localement.</div>

    <label class="field-label">Classement des joueurs</label>
    <div class="roster">
${
  stats.length
    ? stats
        .map(
          (s) => `
  <div class="ritem">
    <span>${escapeHtml(s.name)}</span>
    <span class="sub" style="margin-top:0;">${s.games} partie${s.games > 1 ? "s" : ""} · ${s.wins} victoire${s.wins > 1 ? "s" : ""}</span>
  </div>
`,
        )
        .join("")
    : `<div class="ritem"><span class="sub" style="margin-top:0;">Aucune donnée pour le moment</span></div>`
}
    </div>

    <label class="field-label">Dernières parties</label>
    <div class="roster">
${history
  .slice(0, 10)
  .map((g) => {
    const d = new Date(g.date);
    const dateStr = d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    });
    return `
  <div class="ritem">
    <span>${dateStr} · ${g.players.length} joueurs · ${g.round} nuit${g.round > 1 ? "s" : ""}</span>
    <span class="rolebadge ${g.winner === "loups-garous" ? "loup" : "villageois"}">${g.winner === "loups-garous" ? "Loups" : "Village"}</span>
  </div>
`;
  })
  .join("")}
    </div>

    <button class="btn btn-ghost" id="clear-history">Effacer l'historique</button>
    <div style="height:10px"></div>
    <button class="btn btn-primary" id="back-to-setup">Retour</button>
  `;
}

function tplDistribute() {
  const i = state.distributeIndex;
  const role = state.deck[i];
  const info = ROLE_INFO[role];
  const isLast = i === state.deck.length - 1;

  if (!state.revealed) {
    return `
${moonSvg("calm")}
<div class="progress">Joueur ${i + 1} / ${state.deck.length}</div>
<h2 class="stitle">Passez le téléphone</h2>
<div class="subtitle">Au joueur suivant. Il touche la carte pour découvrir son rôle en secret.</div>
<div class="card-zone">
  <div class="card-flip" id="cardFlip">
    <div class="card-inner">
      <div class="card-face card-front">
        <div class="glyph">🌒</div>
        <div class="hint">Toucher pour piocher</div>
      </div>
      <div class="card-face card-back role-${info.cls}">
        <div class="glyph">${info.glyph}</div>
        <div class="rolename">${info.label}</div>
      </div>
    </div>
  </div>
</div>
    `;
  }

  return `
    ${moonSvg("calm")}
    <div class="progress">Joueur ${i + 1} / ${state.deck.length}</div>
    <h2 class="stitle">Votre carte</h2>
    <div class="subtitle">Retenez votre rôle, puis inscrivez votre nom pour la valider.</div>
    <div class="card-zone">
<div class="card-flip flipped">
  <div class="card-inner">
    <div class="card-face card-front">
      <div class="glyph">🌒</div>
      <div class="hint">Toucher pour piocher</div>
    </div>
    <div class="card-face card-back role-${info.cls}">
      <div class="glyph">${info.glyph}</div>
      <div class="rolename">${info.label}</div>
    </div>
  </div>
</div>
    </div>
    <label class="field-label">Votre nom</label>
    <input type="text" id="nameInput" placeholder="Entrez votre nom" autocomplete="off" value="${state.nameInputVal || ""}" list="recentNames">
    <datalist id="recentNames">
${getRecentNames()
  .map((n) => `<option value="${escapeHtml(n)}"></option>`)
  .join("")}
    </datalist>
    <div class="sub" id="nameError" style="display:none; color:var(--accent-blood-bright); margin-top:8px;">Ce nom est déjà pris dans cette partie, choisissez-en un autre.</div>
    <div style="height:18px"></div>
    <button class="btn btn-primary" id="confirm-name" disabled>${isLast ? "Valider et commencer la nuit" : "Valider et passer au joueur suivant"}</button>
  `;
}

function tplNightSleep() {
  return `
    ${moonSvg("night")}
    <div class="eyebrow">Nuit ${state.round}</div>
    <div class="center-icon">🌙</div>
    <h2 class="stitle">Le village s'endort...</h2>
    <div class="subtitle">Tout le monde ferme les yeux. Le maître du jeu garde le téléphone.</div>
    <button class="btn btn-primary" id="wake-wolves">Les loups-garous se réveillent</button>
  `;
}

function tplNightWolves() {
  const targets = state.players.filter((p) => p.alive);
  return `
    ${moonSvg("night")}
    <div class="eyebrow">Nuit ${state.round}</div>
    <div class="center-icon">🐺</div>
    <h2 class="stitle">Les loups-garous se réveillent</h2>
    <div class="subtitle">Ils désignent en silence leur victime, y compris parmi eux si besoin. Le maître du jeu sélectionne ci-dessous.</div>
    <div class="plist">
${targets
  .map(
    (p) => `
  <div class="pitem ${state.targetId === p.id ? "selected" : ""}" data-target="${p.id}">
    <div class="dot"></div>
    <div class="name">${escapeHtml(p.name)}</div>
  </div>
`,
  )
  .join("")}
    </div>
    <button class="btn btn-primary" id="confirm-target" ${state.targetId === null ? "disabled" : ""}>Confirmer la cible</button>
  `;
}

function tplNightTransition() {
  const voyanteNext = actingRoleIds("voyante").length > 0;
  return `
    ${moonSvg("night")}
    <div class="eyebrow">Nuit ${state.round}</div>
    <div class="center-icon">🌙</div>
    <h2 class="stitle">Les loups-garous se rendorment...</h2>
    <div class="subtitle">${voyanteNext ? "La voyante va se réveiller." : "Le village va se réveiller."}</div>
    <button class="btn btn-primary" id="night-transition-continue">${voyanteNext ? "La voyante se réveille" : "Réveiller le village"}</button>
  `;
}

function tplNightVoyante() {
  if (!state.voyanteRevealed) {
    const targets = state.players.filter(
      (p) => p.alive || p.id === state.lastVictimId,
    );
    return `
      ${moonSvg("night")}
      <div class="eyebrow">Nuit ${state.round}</div>
      <div class="center-icon">🔮</div>
      <h2 class="stitle">La voyante se réveille</h2>
      <div class="subtitle">Elle désigne en silence un joueur dont elle veut connaître le rôle. Le maître du jeu sélectionne ci-dessous.</div>
      <div class="plist">
${targets
  .map(
    (p) => `
  <div class="pitem ${state.voyanteTargetId === p.id ? "selected" : ""}" data-voyante-target="${p.id}">
    <div class="dot"></div>
    <div class="name">${escapeHtml(p.name)}</div>
  </div>
`,
  )
  .join("")}
      </div>
      <button class="btn btn-primary" id="confirm-voyante-target" ${state.voyanteTargetId === null ? "disabled" : ""}>Regarder sa carte</button>
    `;
  }

  const target = state.players.find((p) => p.id === state.voyanteTargetId);
  const info = ROLE_INFO[target.role];
  return `
    ${moonSvg("night")}
    <div class="eyebrow">Nuit ${state.round}</div>
    <h2 class="stitle">Le rôle de ${escapeHtml(target.name)}</h2>
    <div class="subtitle">Montrez cette carte à la voyante seule, puis retournez-la avant de continuer.</div>
    <div class="card-zone">
<div class="card-flip flipped">
  <div class="card-inner">
    <div class="card-face card-front">
      <div class="glyph">🌒</div>
      <div class="hint">Toucher pour piocher</div>
    </div>
    <div class="card-face card-back role-${info.cls}">
      <div class="glyph">${info.glyph}</div>
      <div class="rolename">${info.label}</div>
    </div>
  </div>
</div>
    </div>
    <button class="btn btn-primary" id="voyante-done">La voyante se rendort</button>
  `;
}

function tplNightVoyanteSleep() {
  return `
    ${moonSvg("night")}
    <div class="eyebrow">Nuit ${state.round}</div>
    <div class="center-icon">🌙</div>
    <h2 class="stitle">La voyante se rendort...</h2>
    <div class="subtitle">Le village va se réveiller.</div>
    <button class="btn btn-primary" id="wake-village">Réveiller le village</button>
  `;
}

function tplNightReveal() {
  const victim = state.players.find((p) => p.id === state.lastVictimId);
  const info = ROLE_INFO[victim.role];
  // Si la victime est le Chasseur, sa riposte peut encore changer l'issue :
  // ne pas annoncer "Voir le résultat" avant qu'elle ait eu lieu.
  const gameEnds =
    victim.role !== "chasseur" && checkWinner(state.players) !== null;

  return `
    ${moonSvg("blood")}
    <div class="center-icon">☀️</div>
    <h2 class="stitle">Le village se réveille</h2>
    <div class="subtitle">Cette nuit, <strong>${escapeHtml(victim.name)}</strong> a été dévoré(e) par les loups-garous.</div>

    <div class="card-zone">
<div class="card-flip ${state.showVictimCard ? "flipped" : ""}">
  <div class="card-inner">
    <div class="card-face card-front">
      <div class="glyph">🌒</div>
      <div class="hint">Carte de ${escapeHtml(victim.name)}</div>
    </div>
    <div class="card-face card-back role-${info.cls}">
      <div class="glyph">${info.glyph}</div>
      <div class="rolename">${info.label}</div>
    </div>
  </div>
</div>
    </div>
    <button class="btn btn-ghost" id="toggle-victim-card">${state.showVictimCard ? "Cacher la carte" : "Afficher sa carte"}</button>

    <div style="height:8px"></div>
    <button class="btn btn-primary" id="continue-after-reveal">${gameEnds ? "Voir le résultat" : "Passer au vote"}</button>
  `;
}

function tplHunterShot(context) {
  const hunter = state.players.find((p) => p.id === state.hunterQueue[0]);
  const targets = state.players.filter((p) => p.alive);
  return `
    ${moonSvg(context === "night" ? "night" : "gold")}
    <div class="center-icon">🏹</div>
    <h2 class="stitle">${escapeHtml(hunter.name)} était le Chasseur</h2>
    <div class="subtitle">En mourant, il/elle abat aussitôt un autre joueur. Le maître du jeu sélectionne la cible ci-dessous.</div>
    <div class="plist">
${targets
  .map(
    (p) => `
  <div class="pitem ${state.hunterTargetId === p.id ? "selected" : ""}" data-hunter-target="${p.id}">
    <div class="dot"></div>
    <div class="name">${escapeHtml(p.name)}</div>
  </div>
`,
  )
  .join("")}
    </div>
    <button class="btn btn-primary" id="confirm-hunter-target" ${state.hunterTargetId === null ? "disabled" : ""}>Confirmer le tir</button>
  `;
}

function tplHunterVictimReveal(context) {
  const victim = state.players.find((p) => p.id === state.lastHunterVictimId);
  const info = ROLE_INFO[victim.role];
  const hasNext = state.hunterQueue.length > 0;
  const gameEnds = !hasNext && checkWinner(state.players) !== null;
  const continueLabel = hasNext
    ? "Le Chasseur suivant riposte"
    : gameEnds
      ? "Voir le résultat"
      : context === "night"
        ? "Passer au vote"
        : "Nuit suivante";

  return `
    ${moonSvg(context === "night" ? "blood" : "gold")}
    <div class="center-icon">🏹</div>
    <h2 class="stitle">La riposte du Chasseur</h2>
    <div class="subtitle">En mourant, le Chasseur a abattu <strong>${escapeHtml(victim.name)}</strong>.</div>

    <div class="card-zone">
<div class="card-flip ${state.showHunterVictimCard ? "flipped" : ""}">
  <div class="card-inner">
    <div class="card-face card-front">
      <div class="glyph">🌒</div>
      <div class="hint">Carte de ${escapeHtml(victim.name)}</div>
    </div>
    <div class="card-face card-back role-${info.cls}">
      <div class="glyph">${info.glyph}</div>
      <div class="rolename">${info.label}</div>
    </div>
  </div>
</div>
    </div>
    <button class="btn btn-ghost" id="toggle-hunter-victim-card">${state.showHunterVictimCard ? "Cacher la carte" : "Afficher sa carte"}</button>

    <div style="height:8px"></div>
    <button class="btn btn-primary" id="continue-after-hunter-reveal">${continueLabel}</button>
  `;
}

function tplDayVote() {
  const alive = state.players.filter((p) => p.alive);
  return `
    ${moonSvg("gold")}
    <div class="eyebrow">Jour ${state.round}</div>
    <div class="center-icon">🗳️</div>
    <h2 class="stitle">Le village vote</h2>
    <div class="subtitle">Discutez, puis désignez la personne que le village choisit d'éliminer.</div>
    <div class="plist">
${alive
  .map(
    (p) => `
  <div class="pitem ${state.dayTargetId === p.id ? "selected" : ""}" data-dayvote="${p.id}">
    <div class="dot"></div>
    <div class="name">${escapeHtml(p.name)}</div>
  </div>
`,
  )
  .join("")}
<div class="pitem pitem-none ${state.dayTargetId === "none" ? "selected" : ""}" data-dayvote="none">
  <div class="dot"></div>
  <div class="name">Égalité — personne n'est éliminé</div>
</div>
    </div>
    <button class="btn btn-primary" id="confirm-day-vote" ${state.dayTargetId === undefined ? "disabled" : ""}>Confirmer le vote</button>
  `;
}

function tplDayReveal() {
  const hasVictim = state.lastDayVictimId !== null;
  const victim = hasVictim
    ? state.players.find((p) => p.id === state.lastDayVictimId)
    : null;
  const info = hasVictim ? ROLE_INFO[victim.role] : null;
  // Si la victime est le Chasseur, sa riposte peut encore changer l'issue :
  // ne pas annoncer "Voir le résultat" avant qu'elle ait eu lieu.
  const gameEnds =
    (!hasVictim || victim.role !== "chasseur") &&
    checkWinner(state.players) !== null;

  return `
    ${moonSvg("gold")}
    <div class="eyebrow">Jour ${state.round}</div>
    <div class="center-icon">${hasVictim ? "⚖️" : "🤝"}</div>
    <h2 class="stitle">${hasVictim ? "Le verdict du village" : "Aucune élimination"}</h2>
    <div class="subtitle">${
hasVictim
  ? `Le village a voté l'élimination de <strong>${escapeHtml(victim.name)}</strong>.`
  : `Le vote se solde par une égalité, personne n'est éliminé aujourd'hui.`
    }</div>

    ${
hasVictim
  ? `
<div class="card-zone">
  <div class="card-flip ${state.showDayVictimCard ? "flipped" : ""}">
    <div class="card-inner">
      <div class="card-face card-front">
        <div class="glyph">🌒</div>
        <div class="hint">Carte de ${escapeHtml(victim.name)}</div>
      </div>
      <div class="card-face card-back role-${info.cls}">
        <div class="glyph">${info.glyph}</div>
        <div class="rolename">${info.label}</div>
      </div>
    </div>
  </div>
</div>
<button class="btn btn-ghost" id="toggle-day-victim-card">${state.showDayVictimCard ? "Cacher la carte" : "Afficher sa carte"}</button>
    `
  : ""
    }

    <label class="field-label">Survivants</label>
    <div class="roster">
${state.players
  .map(
    (p) => `
  <div class="ritem ${p.alive ? "" : "dead"}">
    <span>${escapeHtml(p.name)}</span>
    ${!p.alive && (p.roleRevealed || (p.id === state.lastDayVictimId && state.showDayVictimCard)) ? `<span class="rolebadge ${ROLE_INFO[p.role].cls}">${ROLE_INFO[p.role].label}</span>` : ""}
  </div>
`,
  )
  .join("")}
    </div>

    <button class="btn btn-primary" id="continue-after-day">${gameEnds ? "Voir le résultat" : "Nuit suivante"}</button>
  `;
}

function tplGameOver() {
  const wolvesWon = state.winner === "loups-garous";
  return `
    ${moonSvg(wolvesWon ? "blood" : "gold")}
    <div class="center-icon">${wolvesWon ? "🐺" : "🌞"}</div>
    <div class="winner-banner">${wolvesWon ? "Les loups-garous ont gagné" : "Les villageois ont gagné"}</div>
    <div class="subtitle">Partie terminée après ${state.round} nuit${state.round > 1 ? "s" : ""}.</div>

    <label class="field-label">Tous les rôles</label>
    <div class="roster">
${state.players
  .map(
    (p) => `
  <div class="ritem ${p.alive ? "" : "dead"}">
    <span>${escapeHtml(p.name)}</span>
    <span class="rolebadge ${ROLE_INFO[p.role].cls}">${ROLE_INFO[p.role].label}</span>
  </div>
`,
  )
  .join("")}
    </div>

    <button class="btn btn-gold" id="new-game">Nouvelle partie</button>
  `;
}

function tplRevealAllOverlay() {
  return `
    <div class="reveal-overlay" id="revealOverlay">
<div class="reveal-sheet" id="revealSheet">
  <h2 class="stitle">Toutes les cartes</h2>
  <div class="subtitle">Rôles de tous les joueurs, vivants et morts.</div>
  <div class="roster">
    ${state.players
      .map(
        (p) => `
      <div class="ritem ${p.alive ? "" : "dead"}">
        <span>${escapeHtml(p.name)}</span>
        <span class="rolebadge ${ROLE_INFO[p.role].cls}">${ROLE_INFO[p.role].label}</span>
      </div>
    `,
      )
      .join("")}
  </div>
  <button class="reveal-close" id="closeRevealOverlay">Fermer</button>
</div>
    </div>
  `;
}

/* ---------- render + wire events ---------- */
