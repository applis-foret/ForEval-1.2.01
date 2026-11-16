# 1.2.01 — Fiabilité terrain

Aucun changement du moteur de cubage, des tarifs, des modèles Excel ni des exports.

**Carte hors ligne**
- Leaflet 1.9.4 intégré au dépôt (`vendor/leaflet/`) et mis en cache : la carte s'ouvre sans réseau.
- Les tuiles consultées sont gardées par le service worker (cache `foreval-tuiles`, 25 000 tuiles max).
- Nouveau panneau « Carte hors ligne » : enregistrement de la zone affichée pour IGN Plan, IGN Orthophotos et Cadastre (8 000 tuiles max par opération).
- Nouveau fond IGN Orthophotos.
- OSM, Esri, OpenTopoMap et Carto ne sont pas préchargés (conditions d'usage), mais restent disponibles hors ligne là où on les a déjà consultés.

**Stockage des données**
- Nouveau module `storage.js` : IndexedDB devient le stockage principal, une entrée par session.
- localStorage conservé en miroir. Au démarrage, la version la plus récente de chaque session gagne.
- Migration automatique et transparente des sessions 1.9.x.
- Données illisibles : mises en quarantaine, jamais écrasées, téléchargeables depuis l'onglet Sessions.
- Copies de secours automatiques (au plus une toutes les 5 min par session, 12 gardées), avant chaque suppression et avant chaque mise à jour. Restauration en un clic, comme nouvelle session.
- Demande de stockage persistant (`navigator.storage.persist`).
- Bandeau rouge si un enregistrement échoue vraiment, avec bouton d'export JSON immédiat.
- Panneau « Sécurité des données » dans l'onglet Sessions.

**Mises à jour**
- Nouveau module `pwa-update.js`. La nouvelle version s'installe en arrière-plan et un bandeau propose « Mettre à jour ». Rien n'est rechargé sans accord.
- Vérification au démarrage, au retour dans l'appli, au retour du réseau et toutes les 30 min.
- Installation avec `cache: 'reload'` pour contourner le cache HTTP de GitHub Pages.
- Données enregistrées et copie de secours créée avant le rechargement.

**Trace GPS et veille**
- Nouveau module `veille.js` : écran maintenu allumé pendant la trace (Wake Lock, plus vidéo muette sur iPad/iPhone pour les versions d'iOS où Wake Lock ne marche pas dans l'appli installée).
- La trace reprend seule après une mise en veille, une fermeture de l'appli ou une mise à jour.
- Découpage en segments : une coupure de plus de 20 s ne trace plus de ligne droite à travers la forêt et ne fausse plus la distance.
- Export GPX avec un `<trkseg>` par segment ; GeoJSON en `MultiLineString` s'il y a plusieurs segments.
- Le GPS par arbre est aussi relancé au retour de veille.

**Divers**
- Correction de deux autotests internes qui échouaient à tort depuis 1.9.x (données de test incomplètes, moteur non concerné).
- Mode d'emploi complété (préparation hors ligne, trace, données).

# 1.9.6 — Accès direct hors ligne

- Suppression du module de connexion Supabase et du contrôle de licence.
- Démarrage automatique de l’application sans connexion internet.
- Conservation du même schéma de session (`17`) et des mêmes clés de stockage local.
- Conservation intégrale de la trace GPS, du moteur de cubage, des tarifs et des exports.
- Retrait de `auth.js` et `config.js` du projet et du cache PWA.
- Cache PWA renommé en `foreval-cubage-v1-9-6-direct`.

# 1.9.5 — Trace de parcours GPS

- Ajout d’un module `trace.js` indépendant.
- Ajout de la trace de parcours dans l’onglet Carte.
- Boutons : démarrer, arrêter, effacer.
- Distance entre deux points : 3, 5 ou 10 m.
- Export de la trace en GeoJSON et GPX.
- Aucun changement du moteur de cubage, des exports Excel, des tarifs ou des modèles Excel.

# 1.9.2 — Correction lien de réinitialisation expiré

- Gestion explicite des liens Supabase expirés ou invalides (`otp_expired`).
- Affichage d’un message clair au lieu d’une page blanche.
- Nettoyage automatique du fragment d’URL après erreur.
- Cache PWA renommé pour forcer le rechargement des fichiers.

# Changelog

## 1.9.1 — Mots de passe

- Ajout du lien “Mot de passe oublié ?” sur l’écran de connexion.
- Envoi d’un email Supabase de réinitialisation du mot de passe.
- Ajout d’un formulaire de nouveau mot de passe après ouverture du lien de réinitialisation.
- Ajout d’un bouton “Mot de passe” pour modifier son mot de passe lorsque l’utilisateur est connecté.
- Aucun changement du moteur de cubage, des exports, des tarifs ou des modèles Excel.

## 1.9.0 — Authentification et licences

- Ajout de la connexion obligatoire Supabase.
- Vérification de licence active.
- Limitation à trois appareils par utilisateur.
- Autorisation hors ligne pendant 30 jours après vérification.
- Aucun changement du moteur de cubage, des exports, des tarifs ou des modèles Excel.

## 1.8.1 — Fonds cartographiques et surcouches

- Ajout du choix de fond dans l’onglet Carte : OpenStreetMap, orthophoto/satellite, OpenTopoMap, Carto clair, IGN Plan.
- Ajout des surcouches : arbres, numéros, position GPS, cadastre.
- Mémorisation du dernier fond choisi.
- Aucun changement du moteur de cubage, des exports, des tarifs ou des modèles Excel.

# 1.7.0 — Ergonomie terrain

- Ajout d’une option de saisie rapide : conserver diamètre et hauteur après ajout.
- Champ commentaire arbre rendu plus compact.
- Moteur de cubage, exports et carte inchangés.

# CHANGELOG — ForEval Cubage

## 1.6.5 — Audit et stabilisation

- Audit de la version 1.6.4.
- Mise à jour du numéro de version applicatif.
- Cache PWA renommé en `foreval-cubage-v1-6-5`.
- Documentation réécrite et clarifiée.
- Ajout de `ARCHITECTURE.md`.
- Ajout de `TODO.md`.
- Ajout de `version.json`.
- Neutralisation du bouton PDF expérimental dans l’interface.
- Aucun changement du moteur de cubage.
- Aucun changement des exports Excel, CSV ou SIG.
- Aucun changement des tables Adrian / Chaudé / Schaeffer.

## 1.6.4 — Commentaire repositionné

- Déplacement du commentaire arbre en fin de parcours de saisie.
- Si essence = Chêne : commentaire sous Chêne supérieur.
- Sinon : commentaire sous Hauteur bois d’œuvre.
- Bandeau conservé comme dans la version 1.6.1.

## 1.6.1 — Identité ForEval finalisée

- Texte blanc sur les deux boutons demandés.
- Nettoyage de l’identité visuelle.
- Cache PWA ForEval.

## 1.5.1e — Essences terrain

- Essences visibles au démarrage limitées à Chêne, Frêne, Châtaignier.
- Ajout des autres essences via le bouton +.
- Liste complète d’essences forestières stabilisée.

## 1.5.0 — Cartographie interactive

- Ajout de l’onglet Carte.
- Affichage des arbres GPS.
- Couleur automatique par essence.
- Numéro visible sur chaque point.
