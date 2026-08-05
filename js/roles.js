/**
 * roles.js — Définition des rôles du jeu.
 *
 * Pour ajouter un rôle plus tard (Chasseur, Cupidon...) :
 *  1. Ajoutez une entrée ici avec sa clé, son libellé, son émoji (glyph),
 *     une classe CSS (cls) pour sa couleur de badge/carte (à définir dans
 *     css/style.css, ex: .rolebadge.xxx / .card-back.role-xxx) et son
 *     équipe (team: "village" ou "loups") utilisée par checkWinner().
 *  2. La logique de tirage/victoire se trouve dans js/state.js.
 */
const ROLE_INFO = {
  "loup-garou": { label: "Loup-Garou", glyph: "🐺", cls: "loup", team: "loups" },
  villageois: { label: "Villageois", glyph: "🌾", cls: "villageois", team: "village" },
  voyante: { label: "Voyante", glyph: "🔮", cls: "voyante", team: "village" },
};
