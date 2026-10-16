# Disney+ Watched Marker

Extension Firefox permettant de suivre localement la progression des vidéos Disney+ et de marquer les films et épisodes déjà regardés.

## Fonctionnalités

- suivi automatique de la progression de lecture ;
- marquage automatique **Déjà vu** ;
- seuil configurable de 50 % à 99 %, avec 90 % par défaut ;
- bouton manuel ✓ sur les vignettes ;
- barre de progression optionnelle ;
- possibilité de masquer les contenus déjà vus ;
- compteur de contenus vus et en cours ;
- import JSON d'un historique existant ;
- export de migration vers **Streaming Watched Manager** ;
- outil de test permettant de marquer l'onglet actif comme vu ;
- données enregistrées localement dans Firefox.

## Prérequis

- Firefox 140 ou supérieur.

## Installation temporaire

1. Clonez ou téléchargez le dépôt.
2. Ouvrez `about:debugging#/runtime/this-firefox`.
3. Cliquez sur **Charger un module complémentaire temporaire…**.
4. Sélectionnez `manifest.json`.
5. Ouvrez Disney+ puis rechargez la page avec `Ctrl + F5`.

L'installation temporaire disparaît au redémarrage de Firefox.

Voir également [README_FIREFOX.md](README_FIREFOX.md).

## Fonctionnement

L'extension reconnaît notamment les URL Disney+ de type :

- `/browse/entity-<uuid>` ;
- `/play/<uuid>`.

Pendant la lecture, elle calcule la progression à partir de la vidéo en cours et l'enregistre périodiquement.

Lorsque le seuil défini est atteint, le programme est marqué comme vu et les vignettes correspondantes sont annotées automatiquement.

## Import JSON

Le popup permet d'importer un historique existant via **Importer les contenus déjà vus**.

Les données importées sont fusionnées avec les informations déjà stockées localement.

## Migration vers Streaming Watched Manager

L'extension peut exporter son historique dans un format compatible avec **Streaming Watched Manager** afin de faciliter une migration future vers une extension unifiée.

## Permissions

- `storage` : conservation de l'historique et des préférences ;
- `activeTab` : outil manuel sur l'onglet actif ;
- accès à `disneyplus.com` : détection des contenus et ajout des marqueurs.

## Confidentialité

L'historique de visionnage et les réglages sont enregistrés uniquement dans le stockage local de Firefox.

Aucune donnée n'est envoyée à un serveur appartenant à ce projet.

## Structure du projet

```text
.
├── manifest.json
├── background.js
├── content.js
├── content.css
├── popup.html
├── popup.js
├── popup.css
├── import.html
├── import.js
├── import.css
└── icons/
```

## Débogage

Disney+ est une application web dynamique. Ses URL et sa structure HTML peuvent évoluer.

En cas de problème :

- inspectez le contexte de l'extension avec `about:debugging` ;
- utilisez les DevTools de Disney+ ;
- vérifiez la détection des liens, vignettes et éléments vidéo dans `content.js`.

## Limites

Une évolution importante du DOM de Disney+ peut nécessiter une adaptation du script de contenu.

## Avertissement

Projet indépendant, non affilié à Disney ou Disney+.
