# Karthala360

Site public Karthala360 (FR/EN, design de l'aperçu Discovermores) + backend + base SQLite + back office, le tout dans Docker.

## Démarrer avec Docker
```
cp .env.example .env      # puis changer ADMIN_PASSWORD
docker compose up -d --build
```
- Site : http://localhost:3000/ (anglais : /en/) — page d'aperçu « avant-première » : /apercu
- Back office : http://localhost:3000/admin (identifiants de `.env`, utilisés au premier démarrage seulement)
- Données : volume Docker `karthala360-data` (fichier SQLite). Sauvegarde :
  `docker compose cp karthala360:/app/data/karthala360.db ./sauvegarde.db`

Sans Docker : `npm install && npm start`.

## Ce qui est branché
Le site appelle `/api/k360` (renseigné automatiquement dans `assets/js/config.js`) :
- **Réservation** (`reservation.html`, `en/book.html`) → table `reservations`, référence renvoyée à la page de confirmation.
- **Retour d'expérience, contact, fiche participant, groupe** → table `soumissions` ; un retour avec accord de publication devient un avis à valider.
- **K269** : questions journalisées, réponses de l'équipe (`?action=savoirs`), IA si `ANTHROPIC_API_KEY` est définie.
- **Agenda / carte « Activités à la une »** (`?action=evenements`), **avis** (`?action=avis`), **compteur public** (`?action=stats`).

## Back office
Tableau de bord, réservations (statuts, notes, WhatsApp, export CSV), formulaires reçus, avis, agenda, réponses K269, questions posées, paramètres (WhatsApp, e-mail, indicateurs publics), utilisateurs (admin / éditeur).

## Accès à la base de données
La base est un fichier SQLite (`/app/data/karthala360.db`, dans le volume `karthala360-data`).

**1. Dans le navigateur (recommandé)** : http://localhost:8080, mot de passe `DB_UI_PASSWORD` du fichier `.env`.
Tables, recherche, filtres, requêtes SQL (onglet *Query*) et export CSV/JSON. **Lecture seule** : l'application garde
la base en mémoire et réécrit le fichier à chaque changement ; toute modification se fait par le back office (`/admin`).
Cet accès n'est ouvert que sur la machine du serveur (127.0.0.1). Sur un serveur distant, passez par un tunnel SSH :
`ssh -L 8080:localhost:8080 utilisateur@serveur`.

**2. Copie du fichier** (pour DB Browser for SQLite, Excel, sauvegarde) :
```
docker compose cp karthala360:/app/data/karthala360.db ./karthala360.db
```

Tables : `reservations`, `soumissions` (retour, contact, enregistrement, groupe ; champs en JSON dans `data`),
`avis`, `evenements`, `questions` (posées à K269), `savoirs` (réponses de l'équipe), `settings`, `users`, `sessions`.

## Données de test
Le script remplit l'application en passant par son API, comme un visiteur et un administrateur (l'application doit tourner).
Toutes les lignes commencent par `[TEST]`.
```
node scripts/donnees-test.js           # ajoute : 12 réservations, 18 fiches participants, 5 retours, 3 contacts,
                                       # 7 questions K269, 2 événements, 3 avis publiés, 2 réponses K269
node scripts/donnees-test.js --vider   # supprime toutes les lignes [TEST]
```
Identifiants admin lus dans `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

## Ce que gère le back office
| Rubrique | Effet |
|---|---|
| **Sorties & fiches guide** | Une sortie est créée dès qu'un randonneur s'enregistre par QR code (code `SOFT-2026-10-12`). La fiche du guide (Go / Adapter / No Go, météo, terrain, horaires, déchets, observations) alimente « Aujourd'hui au Karthala » et le compteur public. Liste des randonneurs imprimable et exportable (mineurs et santé signalés). |
| **Réservations & paiements** | Montant dû calculé par le serveur (formule + contribution), acompte, solde, mode et dates de paiement ; le statut suit les montants reçus. Filtre « paiement incomplet ». |
| **Tarifs des formules** | Prix, type, supplément, contribution recommandée, âge et nombre minimum. Mettent à jour l'estimation du site, les montants et K269. Les textes descriptifs des pages (liste affichée dans le back office) restent à relire à la main. |
| **Boutique** | Produits (ajout, prix, stock, épuisé) et **panier** du site : le client ajoute des articles, valide nom/téléphone/remise, reçoit une référence (B…) ; prix et stock recalculés par le serveur ; commande annulée = stock rendu. |
| **Partenaires, galerie, agenda, avis, réponses K269** | Contenus affichés sur le site. Logos et photos envoyés depuis le back office (dossier `uploads` du volume). |
| **Paramètres & paiements** | WhatsApp et e-mail (remplacés sur toutes les pages), coordonnées de paiement, textes « À COMPLÉTER », fonds d'action (palier, ajustement), niveau d'alerte volcanique (case de l'accueil + bandeau dès le jaune), e-mail de notification. |
| **Rapports, journal, sauvegarde** | Chiffres par mois / formule / pays, historique des actions, téléchargement de la base. |

Notifications e-mail : renseigner `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (et `SMTP_FROM`) dans `.env`, puis l'adresse destinataire dans *Paramètres*.

## Liens du site
Back office → **Liens du site** :
- **Adresse du site** (domaine seul, ex. `https://karthala360.discovermores.com`) : utilisée pour les liens lus par Google
  (canoniques, français ↔ anglais), les aperçus de partage, le plan du site (`/sitemap.xml`), `robots.txt` et le **QR code
  des sorties**, généré automatiquement. Vide : l'adresse de la visite en cours. À régler avant d'imprimer le QR code.
- **Instagram / Facebook** : remplacent les liens des réseaux sur toutes les pages.
- **Adresses à partager** : aperçu, site FR/EN, réservation, enregistrement (QR), retour d'expérience, plan du site, back office.

Structure : `/` site français (pages sans .html : `/formules`) · `/en/` site anglais · `/apercu` page d'aperçu · `/admin/` back office.
Les adresses en `.html`, les anciennes adresses en `/site/…` et celles de l'ancienne version mènent automatiquement à la bonne page.

## Sécurité
| Protection | Détail |
|---|---|
| En-têtes HTTP | Anti-cadre (X-Frame-Options), nosniff, Referrer-Policy, Permissions-Policy ; HSTS en HTTPS. |
| Scripts autorisés (CSP) | Seuls les fichiers `.js` du site et les scripts intégrés de chaque page, reconnus par leur empreinte exacte, s'exécutent. Polices Google seules ressources externes. |
| Limites d'envoi | Par visiteur et par 10 min : 15 formulaires, 60 fiches participants, 60 questions K269, 30 réponses IA. Au-delà : refus (429), le site propose WhatsApp. |
| Taille des envois | 100 ko maximum ; photos (12 Mo) seulement pour une personne connectée, vérifiée avant lecture. |
| Fichiers envoyés | Servis comme images uniquement : un SVG ouvert seul ne peut exécuter aucun code. |
| Mots de passe | Chiffrés (scrypt). 10 caractères, une lettre et un chiffre ; mot de passe par défaut refusé. Le mot de passe initial doit être changé à la première connexion. 10 essais / 15 min par adresse IP. |
| Sessions | Cookie HttpOnly, SameSite=Lax, Secure en HTTPS ; 7 jours ; sessions expirées effacées. |
| Accès réseau | Application et consultation de la base accessibles seulement depuis le serveur (127.0.0.1) ; en ligne, tout passe par HTTPS. |

## Mise en ligne (HTTPS)
1. Serveur Linux avec Docker ; le domaine (`DOMAINE` dans `.env`) pointe vers son adresse IP ; ports 80 et 443 ouverts.
2. Dans `.env` : `ADMIN_PASSWORD`, `DB_UI_PASSWORD`, `SITE_URL=https://<domaine>`, `DOMAINE=<domaine>`.
3. `docker compose --profile production up -d --build` : Caddy obtient et renouvelle le certificat HTTPS automatiquement.
4. Se connecter au back office : le changement du mot de passe initial est demandé.
5. Consulter la base à distance : `ssh -L 8080:localhost:8080 utilisateur@serveur`, puis http://localhost:8080.

Le script de données de test lit `ADMIN_PASSWORD` dans `.env` : après le changement de mot de passe, mettez-y le nouveau
(ou lancez `ADMIN_PASSWORD=... node scripts/donnees-test.js`).

## Envoi automatique du bon de réservation au client
Dès qu'une réservation est enregistrée (formulaire du site ou ajout dans le back office), le **bon de réservation PDF**
part par e-mail au client, dans sa langue, si le client a donné son e-mail. Réglage : *Paramètres → Notifications*.
Chaque réservation indique l'état de l'envoi (envoyé le…, pas d'e-mail, échec) ; bouton **📧 Envoyer / Renvoyer le bon**.

Il faut un compte d'envoi d'e-mails dans `.env` (par exemple l'adresse de votre messagerie, ou Brevo, Mailjet…) :
```
SMTP_HOST=smtp.exemple.com
SMTP_PORT=587
SMTP_USER=identifiant
SMTP_PASS=mot-de-passe
SMTP_FROM=Discovermores <contact@discovermores.com>
```
Sans ces réglages, rien ne part et la réservation l'indique. Pour un essai sans compte : `EMAIL_FICHIERS=./emails-test`
(les e-mails sont écrits dans ce dossier au lieu d'être envoyés).

## Sécurité et sauvegardes (mise à jour)
- **Sauvegarde automatique** : une copie de la base chaque jour dans le volume Docker (`/app/data/sauvegardes`), les 14 dernières sont gardées. Pour en récupérer une : `docker cp karthala360:/app/data/sauvegardes/karthala360-AAAA-MM-JJ.db .`
- **Envoi des bons depuis le site** : au plus 3 par adresse e-mail et 100 au total sur 24 h (anti-spam). Au-delà, renvoyer depuis le back office.
- **Adresse IP des visiteurs** : prise du proxy HTTPS (service `https`) uniquement ; une adresse transmise par quelqu'un d'autre est ignorée.
- **Jetons de connexion** : la base ne garde que leur empreinte.
- **Images Docker** : versions figées (Node 20.20.2, Caddy 2.8.4, sqlite-web par empreinte).
