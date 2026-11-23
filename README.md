# TikTok Pièces – pousse-pièces interactif pour TikTok LIVE

Le cahier des charges complet est dans [`CLAUDE.md`](CLAUDE.md). Ce fichier résume ce qui est fait et comment s'en servir.

## Lancer

```bash
npm install
npm start          # http://localhost:3000  (jeu)  et  /control  (application de contrôle)
npm test           # tests automatiques des règles et de la physique
```

Variables d'environnement :

| Variable | Rôle |
| --- | --- |
| `PORT` | Port HTTP (fourni automatiquement par la plupart des hébergeurs) |
| `ADMIN_PASSWORD` | Mot de passe de `/control`. **À définir dès que le serveur est en ligne**, sinon n'importe qui peut piloter le jeu. |
| `TIKTOK_SIGN_API_KEY` | Clé du service de signature (Euler Stream) utilisée par TikTok-Live-Connector. Optionnelle, l'offre gratuite est limitée. |
| `DATA_DIR` | Dossier de sauvegarde (réglages + état de la partie). Par défaut `./data`. |

## Mise en ligne (Render, offre gratuite)

Le fichier `render.yaml` décrit le service. Depuis le navigateur du téléphone :

1. Créer un compte sur render.com avec « Sign in with GitHub ».
2. **New → Blueprint**, choisir le dépôt `AppClaude`, puis la branche `claude/app-fonctionnelle-initiale-1v3pxk`.
3. Render demande `ADMIN_PASSWORD` : choisir un mot de passe (c'est celui de `/control`).
4. Valider (« Apply »). Après le premier déploiement, l'adresse est du type `https://tiktok-pieces-xxxx.onrender.com`.

Limites de l'offre gratuite (à revérifier sur render.com/docs/free) :
- le serveur s'endort après environ 15 min sans visite et met environ 1 min à se réveiller ;
- 0,1 processeur et 512 Mo de mémoire : suffisant pour tester (le serveur consomme environ 5 % d'un processeur en simulation), à surveiller en vrai live ;
- les fichiers ne sont pas conservés : réglages et parties sont perdus à chaque redémarrage ou nouveau déploiement.

## Utilisation depuis le téléphone

1. Ouvrir `https://<ton-serveur>/control`, entrer le mot de passe.
2. Onglet **Simulateur** : ajouter des faux viewers, cocher « Simulation automatique » pour voir le jeu tourner sans live.
3. Ouvrir `https://<ton-serveur>/` dans un autre onglet, toucher l'écran pour passer en plein écran : c'est cette page qu'on partage dans le live.
4. Onglet **Live** : saisir le pseudo TikTok et « Lier le live » une fois en direct.

## Ce que fait cette première version (étape 3 du plan + une partie des étapes 5, 6 et 8)

- Machine à trois fentes sur le visuel fourni, poussoir qui avance et recule, physique 2D (Matter.js) calculée **sur le serveur** : une seule simulation fait foi, les points sont crédités une seule fois.
- Jetons, tickets (20 et 40 avec tes images ; 60 à 200 dessinés en attendant les tiennes), gemmes et coffre (dessinés en attendant les visuels).
- Tour par tour : bandeau « À toi, @pseudo » + compte à rebours, seul le joueur du tour peut jouer, placement automatique au bout du temps, délai de grâce.
- 5 jetons à l'arrivée, 100 likes = 5 jetons, abonnement = 5 jetons, stock max 20, pas de nouveaux jetons en revenant dans le même live.
- Cadeaux configurables : rose = secousse, et par valeur en diamants : passer devant, pluie de jetons, gemmes, coffre (valeurs **proposées**, à trancher).
- Classement du live, file d'attente, gains affichés « +200 @pseudo », écran d'attente quand personne ne joue.
- Application de contrôle : Live, Réglages, Cadeaux, Simulateur, Aperçu, statistiques, journal.
- Sauvegarde continue (toutes les 5 s) et reprise en pause après un plantage.
- Connecteur TikTok (TikTok-Live-Connector 2.5) branché mais **non testé sur un vrai live**.

## Pas encore fait

- Pouvoirs qui gênent (secousse ciblée, jeton dévié, perte/vol de jetons) et bouclier : en attente des décisions « À trancher » du cahier des charges.
- Classement hebdomadaire, modération automatique des pseudos (seule la liste de blocage manuelle existe), onglet Mise en page.
- Empilement réel des jetons : la physique est en 2D vue de dessus, les jetons glissent et se poussent mais ne montent pas les uns sur les autres.

## Arborescence

```
server.js            serveur HTTP + Socket.IO + boucle de jeu (60 pas/s)
src/game.js          règles : joueurs, jetons, file, tours, points, cadeaux
src/machine.js       physique du plateau (Matter.js)
src/config.js        réglages par défaut et validation
src/tiktok.js        connecteur TikTok LIVE
src/simulator.js     faux viewers
public/              page du jeu (index.html) et application de contrôle (control.html)
test/                tests automatiques (node --test)
```
