# ForEval Cubage

Application terrain de cubage forestier pour inventaires, martelages et estimations rapides.

## Version

**ForEval Cubage 1.2.01 — carte et données hors ligne**

Version de fiabilité terrain construite sur la 1.9.6. Voir `CHANGELOG.md`.

Cette version ne modifie pas le moteur de cubage. Elle consolide la base 1.6.4, nettoie la documentation et retire l’export PDF expérimental de l’interface, car il n’a pas atteint le niveau de qualité attendu.

## Principes de stabilité

- Le moteur de cubage est considéré comme validé.
- Les tables Adrian / Chaudé / Schaeffer ne sont pas modifiées.
- Les exports Excel, CSV et SIG restent inchangés.
- La carte interactive reste inchangée.
- Les évolutions futures devront partir de cette base stable.

## Fonctionnalités principales

- Gestion de sessions de cubage.
- Saisie par parcelle forestière.
- Saisie par essence, diamètre, hauteur et qualité.
- Ajout par lot d’arbres identiques.
- Commentaire individuel par arbre.
- Liste complète des arbres avec modification, duplication et suppression.
- Synthèse par essence avec diamètre et volume unitaire.
- Feuillus multi-tarifs : Adrian I, Adrian II, Adrian IV, Chaudé 8 à 12.
- Résineux multi-tarifs : Schaeffer rapide ou Adrian / Chaudé.
- Export Excel feuillus / résineux.
- Export CSV listing.
- Exports SIG : GeoJSON, KML, GPX, CSV XY.
- GPS optionnel par arbre.
- Carte interactive avec points géoréférencés.
- Mode pluie et mode gros doigts.
- Compatibilité téléphone, tablette et iPad.

## Architecture logique

```text
UI → STATE → ENGINE → EXPORT
```

### UI
Interface utilisateur : onglets, boutons, grilles de saisie, modes terrain, liste, carte et synthèse.

### STATE
Session active, parcelles, arbres, qualités, choix de tarifs, paramètres résineux, GPS et historique d’export.

### ENGINE
Moteur de cubage isolé :

- feuillus : tables Adrian / Chaudé ;
- chêne supérieur : Adrian I partiel ;
- résineux : Schaeffer rapide ou tables Adrian / Chaudé.

### EXPORT
Exports séparés :

- Excel feuillus ;
- Excel résineux Schaeffer ;
- CSV listing ;
- GeoJSON ;
- KML ;
- GPX ;
- CSV XY.

## Versioning technique

- `APP_VERSION = foreval-cubage-1.2.01`
- `SESSION_SCHEMA_VERSION = 17` (inchangé : les sessions 1.9.x se rouvrent telles quelles)
- Cache PWA : `foreval-cubage@<dossier>#v1-2-01` (propre au dossier de publication)
- Cache des tuiles : `foreval-tuiles` (conservé d'une version à l'autre)

### Publier une nouvelle version

1. Changer `APP_VERSION` dans `app.js`.
2. Changer `VERSION` et la fin de `CACHE` dans `service-worker.js` (sinon les iPad ne verront pas la mise à jour).
3. Ajouter tout nouveau fichier à la liste `ASSETS` du service worker.
4. Pousser sur GitHub. Les appareils afficheront le bandeau « Mettre à jour ».

## Fichiers importants

- `index.html` : structure de l’application.
- `styles.css` : charte graphique et ergonomie responsive.
- `storage.js` : stockage durable (IndexedDB + miroir localStorage, copies de secours). Charge les autres modules.
- `app.js` : logique applicative principale.
- `veille.js` : maintien de l'écran allumé.
- `trace.js` : trace GPS de parcours.
- `carte-hors-ligne.js` : préchargement des zones IGN.
- `pwa-update.js` : détection et application des mises à jour.
- `vendor/leaflet/` : Leaflet 1.9.4 (licence BSD-2, voir `vendor/leaflet/LICENSE`).
- `vendor/veille.mp4` : vidéo muette de 3 Ko utilisée pour empêcher la veille sur iOS.
- `tarifs.js` : tables de cubage Adrian / Chaudé.
- `service-worker.js` : cache PWA.
- `manifest.webmanifest` : configuration PWA.
- `modele-cubage-feuillus.xlsx` : modèle export feuillus / double entrée.
- `modele-cubage-resineux.xlsx` : modèle export résineux Schaeffer.

## Tests recommandés avant validation terrain

1. Créer une session.
2. Saisir un chêne avec hauteur et qualité supérieure.
3. Saisir un résineux Schaeffer.
4. Saisir un résineux Adrian / Chaudé.
5. Ajouter un lot d’arbres identiques.
6. Modifier un arbre dans la Liste.
7. Exporter Excel feuillus.
8. Exporter Excel résineux.
9. Exporter CSV listing.
10. Exporter GeoJSON / KML / GPX.
11. Vérifier la carte si des coordonnées GPS existent.
12. Sauvegarder puis importer une session JSON.
13. Carte : enregistrer une zone en Wi-Fi, passer en mode avion, rouvrir l'appli et vérifier le fond IGN.
14. Lancer une trace, laisser l'iPad posé 5 min : l'écran doit rester allumé.
15. Lancer une trace, fermer l'appli depuis le sélecteur d'applis, la rouvrir : la trace doit reprendre (segment 2).
16. Onglet Sessions : vérifier « IndexedDB » et « protégé ».

## Statut

**Version stable de référence.**

Les prochaines versions devront être développées à partir de cette base.


## Version 1.7.0 — Ergonomie terrain

Cette version ajoute uniquement des améliorations d’interface dans l’onglet Saisie :

- option **Conserver Ø / hauteur après ajout** ;
- champ **Commentaire arbre** plus compact ;
- aucune modification du moteur de cubage ;
- aucune modification des exports Excel, CSV, SIG ou de la carte.


## Version 1.9.6 — Accès direct hors ligne

- Suppression de la connexion obligatoire Supabase.
- Suppression du contrôle de licence et de la limite d’appareils.
- Démarrage automatique de l’application, y compris hors ligne.
- Conservation intégrale des sessions locales, du moteur de cubage, des exports, de la carte et de la trace GPS.
- Nouveau cache PWA `foreval-cubage-v1-9-6-direct`.

## Version 1.9.5 — Trace de parcours GPS

Cette version ajoute une trace de parcours dans l’onglet Carte, sous forme de module indépendant.

- Démarrer / arrêter / effacer la trace.
- Distance entre deux points : 3, 5 ou 10 m.
- Affichage de la trace comme surcouche cartographique.
- Export de la trace en GeoJSON et GPX.
- Aucun changement du moteur de cubage, des tarifs ou des exports Excel.
