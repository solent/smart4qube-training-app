# Smart4Qube

Visionneuse de revue de code : des issues (vulnérabilités, violations de quality gate, commentaires)
ancrées sur une ligne d'un fichier. Démarrage et opérations de l'API : `README.md`.

## Commandes (depuis la racine)

- `npm test` : tests API puis web. C'est la preuve attendue avant de déclarer une tâche terminée.
- `npm run build:api`, `npm run build:web` : typage et build.
- `npm run contract:check` : compare seulement les enums d'issue (type, sévérité, statut) entre contrat,
  API et web. Un succès ne prouve pas que l'API respecte le contrat : lancer aussi `npm test`.
- Les scripts `issues:*` et l'écran web ont besoin de l'API lancée (`npm run dev:api`).

## API (`apps/api/src`)

- Projets connus : `KNOWN_PROJECT_IDS` (`seed.ts`) ; tout autre id renvoie `404 PROJECT_NOT_FOUND`.
  Un nouveau projet s'ajoute aussi à `PROJECT_NAMES` côté web (`infrastructure/fixtures/projects.ts`).
- Chaque appel à `createApp()` crée son propre store : un `createApp()` neuf pour chaque test qui écrit.

## Web (`apps/web/src`)

- Couches : `domain` ne dépend de rien ; `application` et `infrastructure` dépendent seulement de
  `domain` ; `presentation` les assemble. Ni React, ni fetch, ni API Vite dans `domain` et `application`.
- L'écran charge toutes les issues du projet et filtre lui-même : un nouveau filtre se fait localement,
  sans nouvel appel à l'API.
- La logique de filtre ou de calcul va dans `application/use-cases/`, en fonction pure, avec un test.
  `ProjectPage.tsx` filtre aujourd'hui dans le composant : ne pas recopier ce modèle.
- Le `filePath` d'une issue est relatif au dépôt, en POSIX, sans `/` initial, et correspond au chemin
  du fichier de fixture.

## Règle : le contrat d'abord

- `contracts/openapi.yaml` est la référence du modèle d'issue et de l'API. Ordre de modification :
  le contrat, puis l'API (`apps/api`) avec ses tests, puis le modèle et l'écran web (`apps/web`).
- Toute modification du contrat figure dans le plan et est validée avant d'être faite.
- Un comportement (filtre, tri, validation) est le même dans l'API et dans l'écran. Par défaut,
  correspondance exacte : pas de recherche partielle ni insensible à la casse sans demande explicite.
- Erreurs de l'API : toujours `{ code, message, details? }`, avec un code défini dans le contrat.

## Périmètre

- Les scripts `issues:*` transmettent déjà la query string telle quelle : ne pas les modifier pour un
  nouveau paramètre de l'API.
- `rocketnouilles/` est une application autonome, revue par Smart4Qube : ne pas la toucher pendant une
  tâche Smart4Qube, et inversement. Pour une tâche RocketNouilles, suivre `rocketnouilles/CLAUDE.md` et
  lancer ses commandes depuis ce dossier.
- Demander avant d'ajouter une dépendance npm.
- Ne pas modifier `.claude/settings.json`, les hooks ni la CI.

## Sécurité

- Ne jamais lire, afficher ni committer un fichier `.env`. Une variable manque : demander.
- Aucun secret, mot de passe, jeton ni donnée client dans le code, les tests, les fixtures ou les commits.
