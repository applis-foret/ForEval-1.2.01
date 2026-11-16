# ARCHITECTURE — ForEval Cubage

## Objectif du logiciel

ForEval Cubage est une application terrain de cubage forestier. Elle doit rester rapide, robuste et utilisable sur téléphone, tablette et iPad en conditions de terrain.

## Principe directeur

Le moteur de cubage doit rester séparé de l’interface. Les nouvelles fonctionnalités doivent être ajoutées sans modifier les calculs existants, sauf correction explicite ou ajout validé de tables.

## Architecture logique

```text
UI → STATE → ENGINE → EXPORT
```

## 1. UI

L’interface est organisée par onglets :

- Mode d’emploi
- Sessions
- Paramétrages
- Tarifs
- Saisie
- Liste
- Carte
- Synthèse

L’onglet Saisie est prioritaire pour l’usage terrain. Les évolutions ergonomiques doivent être testées avec prudence, notamment sur iPad.

## 2. STATE

La session active contient notamment :

- nom du chantier ;
- parcelles ;
- arbres ;
- qualités ;
- essences visibles ;
- choix de tarifs feuillus ;
- paramètres résineux ;
- coordonnées GPS ;
- historique d’export.

Chaque arbre doit rester une ligne individuelle dans `state.trees`, même lorsqu’il est créé par ajout par lot.

## 3. ENGINE

Le moteur calcule les volumes à partir des données de l’arbre et du tarif choisi.

### Feuillus

- Tables Adrian / Chaudé dans `tarifs.js`.
- Adrian II par défaut.
- Chêne supérieur traité séparément via Adrian I partiel.

### Résineux

- Schaeffer rapide possible.
- Adrian / Chaudé possible avec hauteur bois d’œuvre.

## 4. EXPORT

Les exports doivent lire directement les données de session, sans modifier les arbres.

### Exports actuels

- Excel feuillus.
- Excel résineux Schaeffer.
- CSV listing.
- GeoJSON.
- KML.
- GPX.
- CSV XY.

L’export PDF cartographique est neutralisé dans la 1.6.5, car le rendu n’est pas satisfaisant.

## 5. GPS et carte

Le GPS est optionnel. La saisie doit continuer même si le GPS est absent ou imprécis.

Chaque point GPS est relié au numéro de l’arbre.

## Règles de développement

1. Une version = un objectif.
2. Ne pas modifier le moteur si l’évolution est ergonomique.
3. Ne pas modifier les modèles Excel si l’évolution ne concerne pas l’export.
4. Toute modification du header, du layout global ou de la navigation doit être considérée comme risquée.
5. Les versions expérimentales ne doivent pas remplacer la version stable.


## 6. Trace GPS de parcours

La trace GPS est gérée par `trace.js`. Elle est indépendante des arbres et du moteur de cubage.

La session peut contenir :

```text
traceGps
  ├── points[]
  ├── minDistance
  ├── startedAt
  └── stoppedAt
```

La trace ne modifie jamais `state.trees`. Elle peut être affichée sur la carte et exportée en GPX ou GeoJSON.

## Accès à l’application — version 1.9.6

L’application démarre directement et ne dépend plus d’un service d’authentification ou de licence en ligne. Les données restent stockées localement sur l’appareil. Le moteur de cubage, les exports et la trace GPS sont indépendants de ce mode d’accès.


## Version 1.2.01 — modules de fiabilité

```text
storage.js ──(sessions prêtes)──▶ app.js → veille.js → trace.js → carte-hors-ligne.js → pwa-update.js
     │                                 │
     └── IndexedDB : sessions / meta / backups      service-worker.js : cache appli + cache tuiles
```

- `storage.js` se charge en premier. Il lit IndexedDB et localStorage, fusionne (la session la plus récente gagne), met de côté les données illisibles, puis injecte les autres scripts dans l'ordre et lance `startForEvalCubage()`.
- `save()` dans `app.js` ne change pas de rôle : il délègue à `FEStore.saveSessions()`, qui écrit le miroir localStorage (synchrone) puis IndexedDB (regroupé, seules les sessions modifiées).
- Les sessions supprimées sont notées (« tombstones ») pour qu'un miroir localStorage périmé ne les fasse pas réapparaître.
- `traceGps` gagne trois champs : `recording`, `segment`, `interruptions`. Chaque point porte `seg`. Les traces 1.9.x (sans `seg`) sont lues comme un segment unique.
- Le service worker ne fait plus `skipWaiting()` à l'installation : la nouvelle version attend l'accord de l'utilisateur.
- Aucun de ces modules ne lit ni n'écrit les volumes, tarifs ou exports.
