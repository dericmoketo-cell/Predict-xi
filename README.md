# PREDICT XI v0.4 — TheSportsDB sans inscription

Cette version remplace le connecteur API-Football protégé par une clé privée par TheSportsDB V1 et sa clé publique `123`. Aucun compte, jeton secret ou variable d'environnement n'est requis.

## Déploiement Netlify
1. Décompresser l'archive.
2. Envoyer le dossier dans un dépôt GitHub.
3. Dans Netlify, choisir **Add new site → Import an existing project**, puis connecter le dépôt.
4. Conserver les paramètres de build définis dans `netlify.toml` (publish `.` ; fonctions `netlify/functions`).
5. Déployer. Aucun `API_FOOTBALL_KEY` n'est à ajouter.

La fonction `/.netlify/functions/football?date=AAAA-MM-JJ` appelle `eventsday.php` filtré sur Soccer. Le cache HTTP est de cinq minutes.

## Limites importantes
- TheSportsDB indique 30 requêtes/minute pour l'API gratuite, mais les endpoints ont des limites de résultats propres au forfait gratuit.
- L'endpoint du calendrier journalier est limité à 3 résultats pour la clé gratuite selon la documentation actuelle. La couverture n'est donc ni exhaustive ni mondiale en pratique.
- Les probabilités, xG, compositions, blessures et buteurs ne sont pas fournis de manière fiable par cette intégration gratuite. L'application ne les invente pas.
- Les heures sont affichées telles que fournies par la source ; le fuseau et la disponibilité peuvent varier selon les événements.

Documentation : https://www.thesportsdb.com/docs/api
