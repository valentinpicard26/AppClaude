# Cahier des charges – Pousse-pièces interactif TikTok LIVE

Nov 23, 2026 · @Val

## Objectif

Un jeu de pousse-pièces joué en direct sur le live TikTok du créateur, au tour par tour : chaque viewer joue ses pièces, gagne ses propres points et apparaît dans un classement. Le jeu réagit aux arrivées, commentaires, likes et cadeaux du live.

Le jeu est entièrement original : aucun personnage, nom ou décor tiré d'un jeu existant. Il n'y a pas de prix réels, uniquement des points, des classements et de la reconnaissance à l'écran.

Le créateur développe, met en place et pilote tout depuis son téléphone : aucune installation sur PC n'est requise.

Le document distingue les règles **validées** par le créateur (section 2) des règles **proposées par défaut** (section 3), à confirmer avant ou pendant le développement.

## Règles validées

Ces règles viennent directement du créateur.

- **Participation** : tout viewer qui rejoint le live participe automatiquement et reçoit 5 jetons.
- **Le jeton** : c'est la pièce du jeu, que les viewers lancent dans la machine (jeton doré au logo TikTok, choix confirmé par le créateur ; voir Contraintes et risques).
- **Identité du joueur** : le jeu reconnaît chaque viewer par son identifiant TikTok. Seul le viewer dont c'est le tour peut lancer son jeton, et son commentaire joue directement.
- **Placement** : le viewer lance son jeton à gauche, au centre ou à droite en écrivant `1`, `2` ou `3` dans le chat. Les commandes des autres viewers sont ignorées pendant ce tour.
- **Tour par tour** : un seul viewer joue à la fois, et chacun a ses propres points.
- **Durée du tour** : 8 à 10 secondes. Sans réponse du viewer, le jeu choisit un emplacement automatiquement, pour que les autres ne perdent pas de temps.
- **Stock de jetons** : 20 jetons au maximum par viewer.
- **Gagner des jetons** : en tapotant (100 likes rendent 5 jetons, même pendant l'attente de son tour) ou en s'abonnant au compte (5 jetons par abonnement).
- **Tout se convertit en points** : ce qui tombe de la machine pendant le tour d'un joueur lui rapporte des points. Il ne récupère jamais de jetons. Par exemple, un jeton qui tombe vaut 10 points (valeur d'exemple, réglable).
- **Objets à faire tomber** : des tickets de points sont présents sur le plateau. Les objets bonus et le coffre mystère apparaissent quand un viewer envoie une récompense assez haute, le coffre étant le plus cher à faire apparaître. L'objet atterrit sur le plateau fixe et revient au joueur qui le fait tomber, pas forcément à celui qui l'a payé. Valeurs dans le tableau ci-dessous.
- **Roses** : une rose provoque une petite secousse de la machine.
- **File d'attente** : certains cadeaux font passer le viewer devant les autres.
- **Pouvoirs qui gênent** : des dons activent des pouvoirs qui gênent le joueur dont c'est le tour : secousse de la machine pendant qu'il lance son jeton, jeton envoyé au hasard dans une autre fente, perte de 2 ou 3 jetons, ou vol de jetons.
- **Bouclier** : un don permet de se protéger de ces pouvoirs.
- **Équilibre par le prix** : pas de plafond sur le nombre d'utilisations d'un pouvoir. Les pouvoirs qui gênent, le bouclier et les objets bonus sont liés à de hautes récompenses (cadeaux chers), et les effets doux à de petites récompenses comme la rose.
- **But** : marquer le plus de points, avec un classement des joueurs.

| Objet | Points | Comment il arrive sur le plateau |
| --- | --- | --- |
| Jeton | 10 (exemple) | Lancé par les joueurs |
| Tickets de points (5 couleurs) | 20, 40, 60, 80, 100 (décision du créateur : pas de ticket au-delà de 100) | Présents sur le plateau |
| Diamant | 500 | Haute récompense d'un viewer |
| Rubis | 800 | Haute récompense d'un viewer |
| Émeraude | 1 000 | Haute récompense d'un viewer |
| Améthyste | 1 200 | Haute récompense d'un viewer |
| Topaze | 1 500 | Haute récompense d'un viewer |
| Cristal arc-en-ciel | 2 000 | Haute récompense d'un viewer |
| Coffre mystère (rare) | 2 000 à 5 000, au hasard | Récompense la plus chère |

Toutes ces valeurs viennent du visuel fourni et restent réglables dans l'application de contrôle.

## Règles proposées par défaut

Ces règles ont été suggérées pendant la conception et le créateur a accepté de les intégrer. Leurs valeurs exactes restent à confirmer.

- **Régulation des pouvoirs** : si la cible vient d'être touchée, l'effet est mis en attente et s'applique à son tour suivant, pour que le donateur ne perde rien. On ne peut jamais lui prendre ses jetons en dessous de 1. Un interrupteur « mode paisible » coupe les pouvoirs qui gênent d'un clic.
- **Délai de grâce** : un objet qui tombe dans les quelques secondes après la fin d'un tour revient encore au joueur de ce tour, puisque la machine continue de pousser.
- **Classements** : un classement du live et un classement hebdomadaire, sauvegardé par identifiant de viewer. Le classement « sans pouvoirs » est abandonné, puisque le sabotage fausse de toute façon les résultats.
- **Paliers de cadeaux** : petit cadeau = secousse, cadeau moyen = pluie de jetons, gros cadeau = objet bonus, cadeau le plus cher = coffre mystère.
- **Jetons d'arrivée et follow** : option consistant à ne donner les 5 jetons d'arrivée qu'aux viewers qui suivent le compte, pour éviter la création de comptes à répétition et aider à atteindre le seuil d'abonnés du live.
- **Écran d'attente** : sans joueur dans la file, une animation de démonstration et un message invitent à rejoindre le live, pour éviter un écran mort.
- **Reprise après plantage** : l'état du jeu est sauvegardé en continu pour repartir où il s'était arrêté.
- **Modération des pseudos** : masquage automatique des pseudos inappropriés, plus une liste de blocage tenue par le créateur.
- **Sons et musiques** : uniquement originaux ou libres de droits.
- **Commencer petit** : la version 1 propose 2 ou 3 pouvoirs qui gênent (secousse, jeton dévié, perte ou vol de jetons) et 1 bouclier, tous réglables, pour tester l'équilibre avant d'en ajouter.

### À trancher

- [ ] Quels cadeaux (de quelle valeur) font apparaître quels objets bonus, donnent quels pouvoirs ou le bouclier, et lesquels font passer devant ? De combien de places ? *(Pas encore décidé : en attendant, valeurs proposées par défaut, modifiables dans l'onglet Cadeaux.)*
- [x] Les 5 jetons d'arrivée sont-ils donnés à tous, ou réservés aux abonnés (qui reçoivent déjà 5 jetons) ? **Décidé : donnés à tous les viewers qui arrivent.** S'y ajoutent 5 jetons par tranche de 100 likes et 5 jetons à l'abonnement.
- [x] Les jetons volés vont-ils bien à l'attaquant ? **Décidé : oui, les jetons volés vont à l'attaquant.**
- [x] Sauvegarde durable et classement hebdomadaire ? **Décidé (pour l'instant) : non.** Le créateur accepte que tout reparte à zéro à chaque redémarrage ou nouveau live ; seul le classement du live est affiché.

## Événements TikTok et actions du jeu

Le jeu écoute le live du créateur et traduit chaque événement en action. La bibliothèque TikTok-Live-Connector expose notamment les arrivées, commentaires, likes, cadeaux et follows, avec le seul pseudo du créateur et sans mot de passe. Chaque événement indique quel viewer l'a envoyé, par identifiant et par pseudo.

| Événement TikTok | Action dans le jeu | Statut |
| --- | --- | --- |
| Arrivée dans le live | Le viewer reçoit 5 jetons et entre dans la file d'attente | Validé |
| Commentaire `1`, `2` ou `3` | Lance le jeton à gauche, au centre ou à droite, uniquement si le commentaire vient du viewer dont c'est le tour | Validé |
| Likes | 100 likes rendent 5 jetons, dans la limite de 20 en stock | Validé |
| Follow | Donne 5 jetons | Validé |
| Rose | Petite secousse de la machine | Validé |
| Cadeau désigné | Fait passer le viewer devant dans la file d'attente | Validé |
| Haute récompense | Fait apparaître un objet bonus sur le plateau ; le coffre mystère demande la plus chère | Validé |
| Cadeau de haute valeur | Pouvoir qui gêne le joueur (secousse, jeton dévié, perte ou vol de jetons) ou bouclier, selon les réglages | Validé |

Protections proposées :

- Le jeu identifie chaque viewer par son identifiant TikTok, pas par son pseudo affiché, qui peut changer.
- Un commentaire envoyé hors de son tour est ignoré.
- Un viewer qui quitte puis revient pendant le même live ne reçoit pas de nouvelles pièces.
- Si un viewer a quitté le live à son tour, le jeu passe au suivant.
- Un pouvoir visant un viewer qui vient d'être touché est mis en attente pour son tour suivant.

## Affichage à l'écran

Le style cartoon est validé ; le reste est proposé et reste à ajuster avec le créateur. L'écran doit permettre à chaque viewer de voir son action avoir un effet immédiat.

- **Visuels de référence** : le créateur a fourni la machine (façade rouge néon et dorée, couronne, trois fentes, plateau métallique, bac de sortie) et la planche des objets (jeton, tickets, objets bonus, coffre). Le jeu reprend ce style. Le titre de la machine est « TikTok Pièces » (visuel régénéré et intégré).
- **Style** : arcade néon rouge et dorée, soigné et un peu cartoon, sans photoréalisme. Ce style est aussi plus léger à faire tourner sur un téléphone.
- **Machine** : trois fentes (gauche, centre, droite), un poussoir qui avance et recule, des jetons et des objets qui s'empilent, sont poussés et tombent au bord.
- **Jeton et objets** : le jeton doré, les tickets de couleur, les gemmes et le coffre de la planche fournie.
- **Gains visibles** : chaque objet qui tombe affiche ses points (+10, +200, +1 500...) à côté du pseudo du joueur, pour que chacun voie ce qu'il gagne.
- **Bandeau du tour** : « À toi, @pseudo » avec un compte à rebours de 8 à 10 secondes ; le pseudo s'affiche aussi brièvement sur le jeton qu'il vient de lancer.
- **File d'attente** : les prochains joueurs, avec ceux qui sont passés devant grâce à un cadeau.
- **Classements** : le classement du live, puis le classement hebdomadaire.
- **Effets** : secousse visible de la machine pour les roses, apparition marquée d'un objet bonus avec le pseudo du viewer qui l'a offert, animation distincte pour chaque pouvoir.
- **Écran d'attente** : animation de démonstration quand personne n'attend de jouer.
- **Format** : vertical, en plein écran sur le téléphone du créateur.

Pour le jeu, chaque élément doit exister en image séparée, sur fond transparent : le décor de la machine sans plateau rempli, le poussoir, le jeton vu sous l'angle du plateau, chaque ticket, chaque gemme et le coffre. Les visuels actuels sont des planches de référence et ne s'utilisent pas tels quels.

Les personnages, décors et graphismes sont originaux et peuvent être générés par le créateur.

## Application de contrôle

Le créateur pilote le jeu depuis son téléphone avec une application à onglets. Tout se règle sans toucher au code.

- **Live** : lier le live au compte avec son pseudo, démarrer, mettre en pause, arrêter, relancer, redémarrer de zéro.
- **Réglages du jeu** : durée du tour (8 à 10 secondes, 15 secondes ou autre), pièces de départ, stock maximum, likes par recharge, points par pièce, nombre de jetons sur le plateau, intensité et durée des secousses, durée du bouclier, délai entre deux pouvoirs, mots de commande, remise à zéro des classements, sons, mode paisible, liste de pseudos bloqués.
- **Pouvoirs et récompenses** : quel cadeau (de quelle valeur) déclenche quel pouvoir ou le bouclier, activer ou retirer un pouvoir.
- **Objets et points** : types d'objets qui tombent (tickets, diamants, autres), leur valeur et leur fréquence.
- **Statistiques** : viewers présents, likes, messages, cadeaux, meilleurs donateurs, nouveaux abonnés.
- **Aperçu** : le jeu en cours, tel que les viewers le voient.
- **Mise en page** : position du classement, des récompenses et des consignes de likes à l'écran.

Limite : pendant le partage d'écran, tout ce que le téléphone affiche est visible des viewers, y compris cette application. Le créateur met le jeu en pause avant de régler quoi que ce soit, ou utilise un second appareil (voir la section Contraintes et risques).

## Architecture technique

Le jeu se développe et s'utilise depuis le téléphone : un serveur en ligne héberge le moteur et le connecteur, et le téléphone affiche la page du jeu en plein écran pour la partager dans le live.

&#91;embedded content: architecture · 8 composants, 8 liens\]

Le moteur de jeu reçoit les événements du connecteur (ou du simulateur en test), applique les règles, enregistre les points et envoie l'affichage à la page du jeu, que le téléphone partage dans le live. L'application de contrôle règle le moteur et reçoit ses statistiques.

Choix proposés (le développeur peut les adapter) :

- **Hébergement** : un serveur en ligne héberge le moteur, le connecteur, la sauvegarde et l'application de contrôle. Le choix de l'hébergeur et son coût restent à définir.
- **Page du jeu** : page web en HTML5 avec un moteur physique léger, affichée en plein écran sur le téléphone et partagée dans le live avec le partage d'écran de TikTok.
- **Serveur** : Node.js, avec TikTok-Live-Connector pour lire les événements et Socket.IO pour les envoyer à la page du jeu et à l'application de contrôle.
- **Sauvegarde** : une petite base de données indexée par identifiant TikTok de viewer, pour les classements hebdomadaires.
- **Réglages** : un fichier de configuration modifiable depuis l'application de contrôle (durée du tour, stock, paliers, pouvoirs).
- **Simulateur d'événements** : un outil qui envoie de faux viewers, commentaires, likes et cadeaux au moteur de jeu, pour tester sans être en live.
- **Option de secours** : un PC avec TikTok LIVE Studio (capture de fenêtre ou d'écran) ou OBS (qui accepte aussi une source navigateur) peut afficher la page du jeu si le partage d'écran du téléphone pose problème.

## Contraintes et risques

- **Logo TikTok** : le jeton, le coffre et le titre « TikTok Pièces » des visuels fournis utilisent le logo et le nom de TikTok. TikTok demande aux tiers de respecter ses règles de marque ([TikTok for Developers](https://developers.tiktok.com/doc/getting-started-design-guidelines)), et selon Shopify une autorisation écrite est nécessaire pour utiliser son logo ([Shopify](https://www.shopify.com/au/blog/tiktok-logo)). Le créateur a choisi de garder le logo et le titre « TikTok Pièces » ; un jeton et un titre maison restent une solution de repli si TikTok le demande.
- **Accès au live** : il faut avoir 18 ans et, selon la plupart des sources, environ 1 000 abonnés, avec des seuils qui varient selon la région. Les cadeaux sont réservés aux comptes de 18 ans et plus ([Hotmart](https://hotmart.com/en/blog/how-to-go-live-on-tiktok)). Le simulateur sert à développer et tester sans live.
- **Partage d'écran du téléphone** : le mode Mobile Gaming de TikTok enregistre l'écran du téléphone après autorisation, donc tout ce qui s'affiche est partagé, notifications comprises ([Insta360](https://www.insta360.com/blog/tips/how-to-stream-games-on-tiktok.html), [Buffer](https://buffer.com/library/tiktok-live/)). Un guide évoque un seuil de 18 000 abonnés pour partager l'écran, ce que d'autres sources ne disent pas : à vérifier dans l'application TikTok ([Eklipse](https://blog.eklipse.gg/streaming-tips/how-to-screen-share-tiktok-live.html)). L'application de contrôle devient visible si elle s'ouvre pendant le partage : pause du jeu avant de régler, ou second appareil.
- **Charge du téléphone** : afficher un jeu animé pendant un partage d'écran peut ralentir ou chauffer le téléphone, et la physique de nombreux objets est coûteuse. Sur un forum de pousse-pièces, un appareil Android moins puissant tombait à 20 images par seconde avec 40 jetons ([forum PlayCanvas](https://forum.playcanvas.com/t/performance-physics-webgl-low/4793)). À tester dès la version 1 ; un nombre d'objets réglable limite le risque.
- **Visuels** : Claude Code assemble et anime les images, mais ne produit pas ce style d'illustration lui-même. Les éléments séparés (section Affichage) sont à générer avec un outil d'images, puis à intégrer.
- **Bibliothèque non officielle** : TikTok ne propose pas d'API publique officielle pour lire les événements d'un live. TikTok-Live-Connector est un projet de reverse engineering, qui s'appuie sur un service de signature tiers dont l'offre gratuite est très limitée : un usage réel demande une clé payante, au coût non vérifié ([Packagist, port PHP](https://packagist.org/packages/nargor/tiktok-live-connector-php)). Des pannes de connexion ont été signalées en septembre 2026 par un éditeur concurrent ([tik.tools](https://tik.tools/guides/troubleshooting)). Il n'a pas été vérifié si cet usage respecte les conditions d'utilisation de TikTok.
- **Hébergement en ligne** : le téléphone ne peut pas faire tourner le connecteur, donc un serveur est nécessaire. Des guides décrivent des connexions qui marchent en VPN ou en données mobiles mais échouent depuis un réseau de serveur ([tik.tools](https://tik.tools/guides/troubleshooting/only-works-with-vpn)) : à tester tôt.
- **Développement sur téléphone** : l'application Claude pour iOS et Android permet de lancer et suivre des sessions Claude Code, qui tournent dans le cloud d'Anthropic ([documentation Claude Code](https://code.claude.com/docs/en/mobile)). Un abonnement payant est nécessaire, le plan gratuit n'incluant pas Claude Code ([DataCamp](https://www.datacamp.com/tutorial/how-to-use-claude-code-for-free)).
- **Jeux d'argent** : TikTok définit le jeu d'argent comme le fait de payer pour avoir une chance de gagner quelque chose de valeur, et classe les jeux de casino sociaux à part ([TikTok, Gambling and Games](https://ads.tiktok.com/resources/help/article/tiktok-ads-policy-gambling-and-games)). Aucune règle précise sur un pousse-pièces virtuel en live n'a été trouvée. Le coffre mystère, payé par un cadeau et à valeur tirée au hasard, est l'élément le plus proche de ce schéma. Pour rester prudent : points et objets purement virtuels, aucun prix réel, aucun gain échangeable.
- **Droits** : aucun personnage, son ni élément d'un jeu existant. Un thème Brawl Stars a été écarté parce que la politique de Supercell interdit de créer des jeux avec ses personnages ([Supercell](https://www.supercell.com/fan-content-policy/en)).
- **Concurrence** : des pousse-pièces pour TikTok LIVE existent déjà ([itch.io](https://coolgamesdev.itch.io/tiktoklive-coinpusher)). Ce qui doit différencier celui-ci : le tour par tour, les pouvoirs entre joueurs, les objets bonus offerts par les viewers et le classement hebdomadaire.

## Plan de développement

Le développement commence par une version jouable sans live, puis ajoute les liens avec TikTok. Les points de la section 3 sont à trancher avant de coder les pouvoirs.

1. **Mise en place sur téléphone** : abonnement payant pour Claude Code, compte chez un hébergeur en ligne, dépôt du projet.
2. **Préparation des visuels** : choix du logo du jeton (TikTok ou maison), puis génération des éléments séparés sur fond transparent : décor de la machine, poussoir, jeton, tickets, gemmes, coffre.
3. **Version 1 sans live** : machine à trois fentes avec ces visuels, jetons, tickets, objets bonus, conversion en points, file d'attente, tour de 8 à 10 secondes avec placement automatique, identification des viewers et classement du live, le tout piloté par le simulateur. Première application de contrôle avec les onglets Live, Réglages et Aperçu.
4. **Essai sur le téléphone** : affichage plein écran, partage d'écran TikTok en privé, mesure de la fluidité et de la chauffe.
5. **Connexion au vrai live** : connecteur pour les arrivées, les follows, les commentaires `1`, `2`, `3`, les likes, les roses et les cadeaux. Test de la connexion depuis le serveur et de la clé de signature.
6. **Pouvoirs et objets bonus** : secousse, jeton dévié, perte et vol de jetons, bouclier, apparition des gemmes et du coffre, régulation (effets en attente, plancher de jetons, mode paisible), avec les valeurs choisies dans la section 3.
7. **Version 2** : sauvegarde par viewer, classement hebdomadaire, onglets Pouvoirs, Objets, Statistiques et Mise en page.
8. **Stabilité** : essais de plusieurs heures de live simulé, reprise après plantage, modération des pseudos.

### Critères de réussite

- [ ] Chaque règle validée de la section 2 est vérifiée avec le simulateur.
- [ ] Seul le viewer dont c'est le tour peut jouer, vérifié avec plusieurs faux viewers qui écrivent en même temps.
- [ ] Le jeu reste fluide en plein écran sur le téléphone pendant un partage d'écran.
- [ ] Le jeu tourne plusieurs heures sans plantage avec de nombreux viewers simulés.
- [ ] Le créateur modifie les réglages et les pouvoirs depuis son téléphone, sans toucher au code.
- [ ] Les classements restent justes quand un viewer quitte et revient.

## Consignes pour Claude Code

Ce document est la référence du projet. Claude Code le lit en entier avant de coder et le suit. En cas de doute ou de contradiction, il pose la question au créateur au lieu d'inventer une règle.

Pour le transmettre : exporter ce document en Markdown, le placer dans le dépôt du projet sous le nom `CLAUDE.md` (fichier que Claude Code lit à chaque session), puis avancer une étape du plan de développement à la fois.

### Mécanique de la machine

Le jeu reproduit un vrai pousse-pièces de fête foraine, vu de face comme sur le visuel fourni.

1. **Deux niveaux** : un étage mobile à l'arrière, qui avance et recule en continu à vitesse régulière, et un plateau fixe devant lui.
2. **Lancer** : le jeton tombe par la fente choisie (gauche, centre ou droite) sur l'étage mobile ou juste devant.
3. **Pousser** : en avançant, le bord avant de l'étage mobile pousse la pile de jetons et d'objets du plateau fixe vers l'avant. En reculant, il laisse de la place pour les jetons suivants.
4. **Tomber** : ce qui dépasse le bord avant du plateau tombe dans le bac de sortie et rapporte ses points au joueur du tour (avec le délai de grâce). Ce qui tombe par les côtés est perdu (proposé, comme dans les vraies machines).
5. **Physique crédible** : les objets glissent, frottent, s'empilent et se bousculent sans traverser les parois ni s'envoler. Un jeton seul ne fait généralement pas tomber grand-chose : c'est l'accumulation qui finit par faire basculer le bord, ce qui crée le suspense.
6. **Plateau pré-rempli** : au démarrage, le plateau fixe est déjà couvert de jetons et de quelques tickets, pour que chaque lancer puisse faire tomber quelque chose (proposé).
7. **Secousse** : une rose ou un pouvoir déplace brièvement tout le plateau, ce qui peut faire tomber ou décaler des objets.
8. **Limite d'objets** : le nombre maximal d'objets sur le plateau est réglable, pour garder le jeu fluide sur téléphone.

### Exigences de fonctionnement

- **Un tour, un joueur** : seul le viewer dont c'est le tour, identifié par son identifiant TikTok, peut lancer un jeton. Toute autre commande `1`, `2` ou `3` est ignorée, même envoyée au même moment.
- **Un cadeau, son effet** : chaque cadeau déclenche exactement l'effet configuré dans l'onglet Pouvoirs et récompenses, autant de fois qu'il est envoyé (3 roses = 3 secousses). Les cadeaux envoyés en série (combo) sont comptés une seule fois chacun, sans doublon.
- **Points justes** : chaque objet tombé crédite une seule fois le bon joueur, selon le tableau des valeurs.
- **Réglages sans code** : toute valeur citée dans ce document se change depuis l'application de contrôle.
- **Tests** : chaque règle est couverte par un test automatique et vérifiable avec le simulateur.

### Scénarios de test

1. Pendant le tour de A, A et B écrivent `1` au même moment : seul le jeton de A est lancé.
2. B envoie 3 roses : la machine tremble 3 fois.
3. B envoie la récompense du coffre : le coffre apparaît sur le plateau. Au tour suivant, C le fait tomber : C gagne entre 2 000 et 5 000 points, B rien.
4. A n'a plus de jetons et envoie 100 likes : il reçoit 5 jetons, sans jamais dépasser 20.
5. D s'abonne : il reçoit 5 jetons.
6. A ne répond pas en 10 secondes : son jeton part dans une fente au hasard, puis le tour passe au suivant.
7. A a un bouclier actif et B envoie un pouvoir qui gêne : le pouvoir est bloqué.
8. B vole des jetons à A : A garde au moins 1 jeton.
9. Un ticket de 100 points (le plus gros ticket) tombe 2 secondes après la fin du tour de A : les 100 points vont à A.

## Sources

- [TikTok for Developers, règles de marque](https://developers.tiktok.com/doc/getting-started-design-guidelines)
- [Shopify, logo TikTok](https://www.shopify.com/au/blog/tiktok-logo)
- [Hotmart, aller en live sur TikTok](https://hotmart.com/en/blog/how-to-go-live-on-tiktok)
- [Insta360, streamer un jeu sur TikTok](https://www.insta360.com/blog/tips/how-to-stream-games-on-tiktok.html)
- [Buffer, TikTok LIVE](https://buffer.com/library/tiktok-live/)
- [Eklipse, partage d'écran TikTok LIVE](https://blog.eklipse.gg/streaming-tips/how-to-screen-share-tiktok-live.html)
- [Forum PlayCanvas, pousse-pièces](https://forum.playcanvas.com/t/performance-physics-webgl-low/4793)
- [TikTok-Live-Connector](https://github.com/khoama/TikTok-Live-Connector-Electron)
- [TikTokLive, PyPI](https://pypi.org/project/TikTokLive/7.0.1/)
- [Port PHP du connecteur, Packagist](https://packagist.org/packages/nargor/tiktok-live-connector-php)
- [tik.tools, dépannage des connecteurs](https://tik.tools/guides/troubleshooting)
- [EulerStream, SDK](https://github.com/eulerstream/euler-api-sdk)
- [Claude Code sur mobile](https://code.claude.com/docs/en/mobile)
- [DataCamp, Claude Code sans abonnement](https://www.datacamp.com/tutorial/how-to-use-claude-code-for-free)
- [TikTok, Gambling and Games](https://ads.tiktok.com/resources/help/article/tiktok-ads-policy-gambling-and-games)
- [Supercell, Fan Content Policy](https://www.supercell.com/fan-content-policy/en)
- [Coin Pusher pour TikTok LIVE, itch.io](https://coolgamesdev.itch.io/tiktoklive-coinpusher)
