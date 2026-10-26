# Design system « Vitelotte »

Référence visuelle d'OpenPatatoes. Toute nouvelle vue part de ces règles.
Maquette de référence : [`explorations/a3-vitelotte-ouvert.html`](explorations/a3-vitelotte-ouvert.html).

## Principes

- **L'outil d'abord.** L'écran sert à parcourir de gros arbres de tâches et à les modifier vite. La densité et la lisibilité passent avant la décoration.
- **Une seule touche d'identité.** Le violet de la pomme de terre vitelotte, et les traits de l'arbre dessinés comme des racines. Tout le reste reste calme.
- **Pas de cadre autour des listes.** Les lignes sont posées sur le fond de la page. L'air vient du retrait et des marges, pas des bordures.
- **La couleur a un sens.** Le violet signale la marque, l'action et la sélection. Les autres couleurs sont réservées aux états et aux messages.

## Code

Tout est dans `apps/web/src/theme/` :

| Fichier | Rôle |
| --- | --- |
| `tokens.css` | Palettes brutes `vitelotte` et `terre`, puis les rôles clair et sombre, et les jetons propres à l'app (`--p-app-…`). Aucun composant n'utilise les palettes directement. |
| `main.css` | Point d'entrée CSS : Tailwind, `tokens.css`, `base.css`, et les noms de couleurs attendus par shadcn-vue (`bg-primary`, `border-input`…) reliés à nos rôles. |
| `status-families.ts` | Familles d'état et classement des statuts OP. |
| `theme-mode.ts` | Choix du thème : Système, Clair, Sombre. Pose la classe `op-dark` sur `<html>`. |
| `base.css` | Police, échelle typographique, espacements, focus, mouvement réduit. |
| `index.ts` | Point d'entrée : importe la police et `main.css`. |

Branchement dans `main.ts` :

```ts
import { applyThemeMode } from './theme'

applyThemeMode() // avant le montage, pour éviter un flash du mauvais thème
createApp(App).mount('#app')
```

Les rôles sont des variables CSS `--p-…`. Dans un composant, utilisez toujours les rôles (`--p-text-muted-color`, `--p-app-line`) ou leur nom Tailwind (`text-muted-foreground`, `border-border`), jamais une valeur hexadécimale. Le mode sombre passe par `color-scheme` : la classe `op-dark` le met à `dark`, et chaque `light-dark()` prend sa seconde valeur.

### Composants

Les composants viennent de [shadcn-vue](https://www.shadcn-vue.com), construit sur Reka UI (accessibilité, clavier, ARIA) et Tailwind. Ce n'est pas une dépendance : la commande copie le code dans `apps/web/src/shared/components/ui/`, et ce code est à nous.

```sh
cd apps/web
pnpm dlx shadcn-vue@latest add <composant>
```

Après l'ajout, vérifiez le fichier copié : la commande peut importer `cn` depuis un paquet npm `cn` au lieu de `@/shared/lib/utils`, et ajouter des paquets d'icônes. Adaptez ensuite le style à Vitelotte : taille `sm` (32 px) pour rester dense, et pas de `outline-none` ni d'anneau `ring` au focus, pour garder le contour défini dans `base.css`.

## Couleurs

Chaque rôle a une valeur claire et une valeur sombre, écrites avec `light-dark()`. Le contraste est mesuré par rapport au fond de la page.

| Rôle | Variable | Clair | Sombre | Contraste (clair / sombre) |
| --- | --- | --- | --- | --- |
| Fond de page | `--p-app-background` | `#FAF9FB` | `#1B1720` | |
| Surface (cartes, champs) | `--p-content-background` | `#FFFFFF` | `#221D28` | |
| Texte | `--p-text-color` | `#2A2530` | `#ECE7F1` | 14,2 / 14,5 |
| Texte secondaire | `--p-text-muted-color` | `#6B6375` | `#A79EB3` | 5,5 / 6,9 |
| Marque, action, focus | `--p-primary-color` | `#4A2B5E` | `#C7A8E0` | 11,1 / 8,5 |
| Sélection | `--p-highlight-background` | `#EFE7F5` | `#33263F` | texte 12,4 / 11,6 |
| Survol | `--p-app-hover` | `#F4F0F7` | `#28222E` | |
| Séparateur | `--p-app-line` | `#E7E2EC` | `#332C3B` | décoratif |
| Bordure de champ | `--p-form-field-border-color` | `#8E8599` | `#766C80` | 3,5 / 3,3 |
| Trait de racine | `--p-app-tree-guide` | `#CDBDDA` | `#4E4258` | décoratif |

Le texte vise WCAG AA (4,5:1). Les bordures de champ visent 3:1, pour qu'un champ se voie sans le survoler. Les séparateurs et les traits de racine sont décoratifs : le retrait suffit à montrer la hiérarchie.

Le mode sombre n'est pas un gris neutre : c'est un violet très foncé, pour rester dans l'univers vitelotte.

## États

Les couleurs des statuts viennent de nos cinq familles, jamais des couleurs configurées dans OP. Le badge affiche toujours le nom du statut OP (« En test », « Spécifié »). Seule la couleur vient de la famille.

| Famille | Pictogramme | Statuts OP par défaut |
| --- | --- | --- |
| Nouveau | cercle vide | Nouveau |
| Prévu | quart plein | En spécification, Spécifié, Confirmé, À planifier, Planifié |
| En cours | moitié pleine | En cours, Développé, En test, Testé |
| En attente | cercle en pointillés | En attente, Test échoué |
| Fermé | cercle plein | Fermé, Rejeté |

Un statut inconnu, ajouté par un administrateur OP, va dans Fermé s'il est marqué fermé dans OP, sinon dans Nouveau (`statusFamilyOf`).

Le pictogramme rend l'état lisible sans distinguer les couleurs. Variables : `--p-app-status-<famille>-background` et `-color`, avec les familles `new`, `planned`, `active`, `on-hold`, `closed`. Tous les couples passent 4,5:1, en clair comme en sombre.

Les badges ont un fond teinté, jamais un fond plein : avec des centaines de lignes « En cours » à l'écran, des pastilles pleines deviendraient du bruit.

## Messages

Le composant `Alert` (`@/shared/components/ui/alert`) a un fond teinté, sans bordure visible. Le texte va dans `AlertDescription`. Variantes :

- `warn` pour les conflits avec OP, avec un fond ambré ;
- `error` pour les refus et OP indisponible, avec un fond rosé ;
- `success` reprend la famille Fermé, et `info` la famille Prévu ;
- `neutral` pour une attente sans enjeu.

`Alert` porte `role="alert"`. Passez `role="status"` pour un message qui ne doit pas interrompre le lecteur d'écran.

## Typographie

Une seule famille : **Atkinson Hyperlegible Next**, hébergée avec l'app (`@fontsource-variable`). Elle est conçue pour la lisibilité. Ses zéros barrés évitent de confondre 0 et O dans les heures.

| Variable | Taille | Usage |
| --- | --- | --- |
| `--op-text-xs` | 12 px | Compteurs, notes |
| `--op-text-sm` | 13 px | En-têtes de colonnes, badges |
| `--op-text-md` | 14 px | Texte courant, lignes de l'arbre |
| `--op-text-lg` | 16 px | Intertitres |
| `--op-text-xl` | 20 px | Titre de page |
| `--op-text-2xl` | 26 px | Écran de connexion |

Graisses : 400 pour le texte, 500 pour les libellés, 700 pour les titres et les tâches de premier niveau. Interligne 1,5 pour le texte, 1,3 pour les titres.

Les heures et les compteurs utilisent des chiffres de même largeur (classe `.op-num`), alignés à droite.

## Espacements, rayons, ombres

- **Espacements**, base 4 px : de `--op-space-1` (4 px) à `--op-space-10` (40 px).
- **Rayons** : 4 px pour les badges carrés, 6 px pour les champs, les boutons et les lignes survolées, 8 px pour les cartes, 10 px pour les grands panneaux, et la forme pilule (999 px) pour les badges d'état.
- **Ombre** : une seule, `--p-app-shadow-lift`, pour ce qui flotte au-dessus de la page (menus, fenêtres, élément déplacé). Les cartes posées n'ont pas d'ombre.
- **Mouvement** : 150 ms, uniquement en réponse à une action (ouvrir, déplier, confirmer). Rien ne bouge tout seul. `prefers-reduced-motion` coupe les animations.

## Arbre des tâches

La maquette de référence est `explorations/a3-vitelotte-ouvert.html`.

- **Ligne** : 32 px de haut (`--p-app-tree-row-height`), texte 14 px.
- **Retrait** : 20 px par niveau (`--p-app-tree-indent`).
- **Colonnes** : titre, état, assigné, heures restantes. 24 px entre les colonnes. Le titre prend toute la place qui reste.
- **Traits de racine** : chaque ligne dessine ses propres traits à partir de sa profondeur, et de la présence ou non de frères plus bas. Rien ne casse quand la virtualisation recycle les lignes. Le dernier enfant d'un nœud a un coude arrondi.
- **Nœud replié** : son nombre d'enfants s'affiche en texte secondaire après le titre.
- **Survol** : fond `--p-app-hover`. **Sélection** : fond `--p-highlight-background`, sans barre latérale. Le survol et la sélection débordent de 8 px de chaque côté, pour que le texte reste aligné sur le titre de la page.
- **Titres longs** : coupés sur une ligne, titre complet au survol et au focus.
- **Tâches de premier niveau** : en gras.

## Détail d'une tâche

La maquette de référence est `explorations/detail-tache-panneau-droite.html`.

- **Place** : un panneau à droite de l'arbre. L'arbre garde sa place à gauche. Sur petit écran, le panneau recouvre l'arbre.
- **En-tête** : la tâche parente, reliée au titre par un coude comme dans l'arbre, puis l'état, l'assigné et le numéro OP.
- **Heures** : estimé, restant et passé sur une seule ligne. Une heure vide affiche « Non renseigné » : un libellé seul ferait croire à un oubli de l'app. Le temps passé disparaît quand OP ne le donne pas au jeton.
- **Propriétés** : une par ligne de 28 px, libellé et valeur côte à côte. Les valeurs courtes, type et priorité, vont par deux. Une propriété vide n'est pas affichée.
- **Dates** : début et échéance sur une ligne (« 6 oct. → 31 oct. »), suivies de l'échéance relative (« dans 6 jours »). Un retard s'affiche en rouge, sauf si la tâche est fermée. Un jalon n'affiche que son échéance.
- **Sous-tâches** : tirées de l'arbre déjà chargé, avec les traits de racine et leur état.
- **Modification** : le temps estimé, le temps restant et l'assigné se modifient sur place. Le nombre devient un champ de même taille, sans que rien ne bouge autour. Entrée ou la sortie du champ enregistrent, Échap annule. Une saisie invalide affiche son message dans une bulle sous le champ ; quitter le champ l'abandonne et rend la valeur d'origine. L'assigné se choisit dans une liste avec recherche, sous son nom.
- **Attente et refus d'OP** : la nouvelle valeur s'affiche tout de suite, soulignée en pointillé violet jusqu'à la réponse d'OP. Si OP refuse ou ne répond pas, la valeur revient à l'état réel, prend la teinte d'erreur, et une alerte `error` sous les heures donne la raison : le message d'OP pour un refus.
- **Description** : sous les propriétés, l'aperçu du markdown, coupé à six lignes ; « Afficher toute la description » montre la suite sur place. « Modifier la description » ouvre md-editor-v3 à la place de l'aperçu, avec un bouton Aperçu et un agrandissement à la taille de la page. Enregistrer ferme l'éditeur et affiche la nouvelle description, soulignée en pointillé jusqu'à la réponse d'OP. Sur un refus, l'éditeur rouvre avec le texte saisi, et l'alerte va sous la description. Échap ne ferme ni l'éditeur ni le détail : la saisie serait perdue. Le HTML de l'aperçu est assaini (DOMPurify) : ni script, ni attribut d'événement, ni feuille de style.
- **À venir** : un onglet Activité (#13). Dans ce fil, les commentaires sont mis en avant et les modifications tiennent sur une ligne, avec le détail au survol.

## Thème

Trois choix, dans la barre du haut : **Système** (par défaut), **Clair**, **Sombre**. Le choix est gardé dans le navigateur. Avec Système, l'app suit le réglage du système en direct.

## Écriture

- Phrases courtes, à la voix active, sans formule de politesse.
- Un bouton dit ce qu'il fait (« Enregistrer à nouveau », pas « Valider »), et le message qui suit reprend le même verbe.
- Une erreur dit ce qui s'est passé et quoi faire. Elle précise si le problème vient d'OP ou de l'app.
- Pas de libellés en capitales, pas de tiret pour une valeur vide : on n'affiche rien.

## Explorations

Dans [`explorations/`](explorations/), gardées pour y revenir :

- `a3-vitelotte-ouvert.html` : **version retenue**.
- `a2-vitelotte.html` : version précédente, avec un cadre autour du tableau, jugée trop étroite.
- `a-b-c-directions.html` : les trois directions de départ (Vitelotte, Établi, Carnet).
- `kanban-vitelotte.html` : vue kanban faite pour mettre le design à l'épreuve. Ce n'est pas une fonctionnalité prévue.
- `detail-tache-panneau-droite.html` : **détail d'une tâche retenu**. Panneau à droite de l'arbre, temps et propriétés compacts, activité dans un onglet à part.
- `detail-tache.html`, `detail-tache-panneau-gauche.html`, `detail-tache-panneau-continu.html` : pistes écartées pour le détail (inspecteur, lignée, grand détail ; panneau à gauche, avec et sans onglets).
