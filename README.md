# Catalogue Dynasty 8

Site du catalogue (visites 360°), hébergé gratuitement avec GitHub Pages :
https://nilowoff.github.io/dynasty8/

- **Espace employé** (bouton en haut à droite) : connexion des employés.
  - **Admin** : a droit à tout (biens, pièces, prix, suppression, comptes des employés).
  - **Gérant** : crée des biens, ajoute des pièces dans tous les biens, choisit la pièce de départ des visites ; modifie ce qu'il a créé ; ne supprime rien.
- Les comptes, le catalogue et les images des nouvelles pièces sont gardés par le serveur gratuit Cloudflare
  `https://dynasty8-api.phares-al01.workers.dev` (code dans `worker/worker.js`, stockage Workers KV « dynasty8 »).
- `data.json` et les images à la racine sont la version de départ (Bureau #1), utilisée si le serveur ne répond pas.
