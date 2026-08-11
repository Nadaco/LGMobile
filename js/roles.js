/**
 * roles.js — Définition des rôles du jeu.
 *
 * Pour ajouter un rôle plus tard (Cupidon, Sorcière...) :
 *  1. Ajoutez une entrée ici avec sa clé, son libellé, son émoji (glyph),
 *     une classe CSS (cls) pour sa couleur de badge/carte (à définir dans
 *     css/style.css, ex: .rolebadge.xxx / .card-back.role-xxx), son
 *     équipe (team: "village" ou "loups") utilisée par checkWinner(), et
 *     une description (affichée dans l'écran "Voir tous les rôles").
 *  2. La logique de tirage/victoire se trouve dans js/state.js.
 */
const ROLE_INFO = {
  "loup-garou": {
    label: "Loup-Garou",
    glyph: "🐺",
    cls: "loup",
    team: "loups",
    description:
      "Chaque nuit, les loups-garous se concertent en secret pour désigner une victime à dévorer. Le camp des loups gagne dès qu'il est aussi nombreux ou plus nombreux que le reste du village.",
  },
  villageois: {
    label: "Villageois",
    glyph: "🌾",
    cls: "villageois",
    team: "village",
    description:
      "Aucun pouvoir particulier. Le jour, participe au débat et au vote pour tenter d'éliminer un loup-garou.",
  },
  voyante: {
    label: "Voyante",
    glyph: "🔮",
    cls: "voyante",
    team: "village",
    description:
      "Chaque nuit, regarde en secret la carte d'un joueur de son choix pour découvrir son rôle. S'il y a plusieurs Voyantes, chacune regarde une carte à son tour, sans que son identité soit révélée.",
  },
  chasseur: {
    label: "Chasseur",
    glyph: "🏹",
    cls: "chasseur",
    team: "village",
    description:
      "Quand il meurt, de nuit ou après un vote, abat aussitôt un autre joueur de son choix avant que la partie ne continue.",
  },
  "petite-fille": {
    label: "Petite Fille",
    glyph: "👧",
    cls: "fille",
    team: "village",
    description:
      "Pendant que les loups-garous choisissent leur victime, elle peut risquer un œil pour tenter de les identifier. Si elle se fait repérer, les loups pourront la choisir comme cible lors de leur vote.",
  },
  cupidon: {
    label: "Cupidon",
    glyph: "💘",
    cls: "cupidon",
    team: "village",
    description:
      "La première nuit uniquement, désigne deux joueurs (lui y compris s'il le souhaite) qui tombent amoureux l'un de l'autre. Si l'un des deux meurt, l'autre meurt aussitôt de chagrin. S'ils sont de camps opposés et sont les deux derniers survivants, les amoureux gagnent ensemble.",
  },
  sorciere: {
    label: "Sorcière",
    glyph: "🧪",
    cls: "sorciere",
    team: "village",
    description:
      "Possède deux potions à usage unique pour toute la partie. Chaque nuit, après l'attaque des loups-garous, elle peut utiliser sa potion de vie pour sauver leur victime, et/ou sa potion de mort pour empoisonner un joueur de son choix.",
  },
};
