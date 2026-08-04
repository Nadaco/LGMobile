/**
 * roles.js — Définition des rôles du jeu.
 *
 * Pour ajouter un rôle plus tard (Voyante, Chasseur, Cupidon...) :
 *  1. Ajoutez une entrée ici avec sa clé, son libellé, son émoji (glyph)
 *     et une classe CSS (cls) pour sa couleur de badge (à définir dans
 *     css/style.css, ex: .rolebadge.voyante { ... }).
 *  2. La logique de tirage/victoire se trouve dans js/state.js.
 */
const ROLE_INFO = {
  "loup-garou": { label: "Loup-Garou", glyph: "🐺", cls: "loup" },
  villageois: { label: "Villageois", glyph: "🌾", cls: "villageois" },
};
