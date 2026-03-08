# PRD — ABCLIV · Convertisseur d'images web
**Version** : 1.6  
**Date** : 2026-03-08  
**Statut** : En cours de développement  
**Owner** : À définir

---

## ⚠️ INSTRUCTIONS POUR L'IA — LIRE EN PREMIER

> Ce document est le contrat de développement. Toute décision technique, UX ou fonctionnelle **non explicitement décrite ici doit faire l'objet d'une question à l'utilisateur avant toute implémentation**.

**Règles absolues pour l'IA :**

1. **Ne jamais supposer.** Si une information manque (librairie, comportement, design, route API, nom de variable), poser la question avant d'écrire du code.
2. **Ne jamais remplacer une dépendance existante** sans demander (ex : remplacer `multer` par autre chose, `exec` par `spawn`, etc.).
3. **Ne jamais modifier l'architecture des fichiers** sans demander (ex : diviser `server.js` en modules, ajouter un dossier `src/`, etc.).
4. **Ne jamais ajouter de dépendance npm** non listée dans ce PRD sans demander.
5. **Ne jamais modifier le design ou les variables CSS** sans demander.
6. **Ne jamais créer de nouveaux fichiers** (routes, composants, configs) sans demander.
7. **Ne jamais modifier le `Dockerfile` ou `docker-compose.yml`** sans demander.
8. **Signaler toute ambiguïté** dans le PRD avant d'écrire du code, pas après.
9. **Ne pas "améliorer" le code existant** de sa propre initiative — uniquement implémenter ce qui est demandé.
10. **Toujours montrer le diff ou le code modifié** avant de proposer de l'appliquer, sauf demande contraire.

---

## 1. Vue d'ensemble

### 1.1 Nom du projet
**ABCLIV**

### 1.2 Description
Application web locale de conversion d'images. L'utilisateur dépose des images dans une interface, choisit un format de sortie et une qualité, puis télécharge les fichiers convertis. Tout est traité en local dans Docker, aucune donnée ne quitte le serveur.

### 1.3 Objectif principal
Permettre la conversion de formats d'images courants **et** du format Apple HEIC vers JPEG, PNG, WebP ou AVIF, via une interface web simple et sans installation côté utilisateur.

### 1.4 Utilisateurs cibles
Usage personnel / interne. Pas d'authentification. Pas de multi-tenant. Pas de SaaS.

---

## 2. Stack technique — IMMUABLE

> ⚠️ Ne pas modifier ces choix sans accord explicite.

### 2.1 Backend
| Élément | Valeur fixée |
|---|---|
| Runtime | Node.js 20 (image `node:20-bookworm-slim`) |
| Framework | Express 4.x |
| Upload | `multer` 1.4.5-lts.1 |
| UUID | `uuid` 9.x |
| Conversion HEIC | Binaire système `heif-convert` (package `libheif-examples`) ; image Docker avec `libheif1`/`libheif-examples` via **Debian bookworm-backports** pour meilleure compatibilité HEIC |
| Conversion autres formats | Binaire système `convert` (ImageMagick 6.x) ; sous Windows `magick` (ImageMagick 7), configurable via `IMAGEMAGICK_CMD` |
| Appels système | `child_process.exec` (pas `spawn`, pas `execFile`) |
| Port | `3000` (configurable via `process.env.PORT`) |

### 2.2 Frontend
| Élément | Valeur fixée |
|---|---|
| Technologie | HTML/CSS/JS **vanilla** — pas de framework (pas React, pas Vue) |
| Fichier unique (UI applicative) | `public/index.html` — tout le CSS et le JS principal de l'interface sont dans ce fichier |
| Preview HEIC (client) | `heic2any` (script local `public/heic2any.min.js`, chargé à la demande) |
| Fonts | `Syne` (Google Fonts) pour le texte, `DM Mono` (Google Fonts) pour le code/mono |
| Pas de bundler | Pas de Webpack, Vite, etc. |

### 2.3 Infrastructure
| Élément | Valeur fixée |
|---|---|
| Conteneurisation | Docker + Docker Compose v3.8 |
| Fichier Compose | `docker-compose.yml` à la racine |
| Dockerfile | `Dockerfile` à la racine |
| Volumes | `uploads_data` et `converted_data` (Docker named volumes) |
| Port publié (compose actuel) | `3005:3000` (hôte → conteneur) |
| Réseau Docker (compose actuel) | Réseau externe `proxy` (intégration reverse proxy type NPM) |
| Reverse proxy | Hors stack applicative ; intégration possible via le réseau `proxy` |
| Healthcheck Docker | `HEALTHCHECK` dans le `Dockerfile`, basé sur `GET /health` |

### 2.4 Structure des fichiers — FIGÉE
```
image-converter/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js          ← Backend (fichier unique, pas de split)
├── ProductRequirementDocuments.md  ← PRD
├── README.md
├── uploads/           ← Créé automatiquement au runtime
└── public/
    ├── index.html     ← Frontend (fichier principal)
    ├── heic2any.min.js ← Lib locale de preview HEIC (chargée à la demande)
    └── logo.png       ← Logo du header (optionnel)
```

> **Interdiction** de créer `src/`, `routes/`, `controllers/`, `middleware/`, ou tout autre sous-dossier sans accord.

---

## 3. Fonctionnalités implémentées (v1.0)

Ces fonctionnalités existent et **ne doivent pas être modifiées** sauf demande explicite.

### 3.1 Upload de fichiers
- Drag & drop sur la zone dédiée
- Clic pour ouvrir le sélecteur de fichiers natif
- Activation clavier de la drop zone via **Entrée** / **Espace**
- Maximum **20 fichiers** par batch
- Taille maximale par fichier : **100 MB**
- Dédoublonnage par nom + taille (côté frontend)
- Rejet explicite des extensions invalides côté backend, avec message d'erreur par fichier

### 3.2 Formats d'entrée acceptés
`.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.heic`, `.tiff`, `.bmp`, `.gif`

### 3.3 Formats de sortie disponibles
`jpeg`, `png`, `webp`, `avif`

### 3.4 Paramètres de conversion
- **Format** : sélecteur `<select>` avec les 4 options ci-dessus, défaut `webp`
- **Curseur (Qualité / Résolution)** : slider `<input type="range">` de **0 à 100**, défaut `85`
  - **PNG** : le curseur contrôle la **résolution** (pourcentage des dimensions). 100 % = taille d’origine, 50 % = moitié des dimensions, 5 % minimum. PNG généré **sans perte** (pas de réduction de couleurs).
  - **JPEG, WebP, AVIF** : le curseur contrôle la **qualité** de compression (0 = plus petit / plus compressé, 100 = meilleure qualité).

### 3.5 Logique de conversion (backend)
Pipeline exact — **ne pas modifier** :

```
HEIC → heif-convert → temp.jpg → [si format ≠ jpeg] ImageMagick → output
Autres → ImageMagick directement → output
```

- Fallback HEIC : si `heif-convert` échoue, tentative ImageMagick direct
- **Métadonnées** : `-strip` appliqué à toutes les conversions (suppression EXIF, profils ICC, etc.).
- **PNG** : réduction de résolution en % selon le curseur (5–100 %), compression PNG niveau 9, sans perte de qualité des couleurs.
- Les fichiers uploadés sont supprimés immédiatement après conversion
- Les fichiers convertis sont stockés dans `converted/` avec un nom UUID
- **Noms de fichiers accents/UTF-8** : décodage défensif côté backend des noms `multipart` pour éviter le mojibake (`Ã©`) dans `originalName` / `downloadName`
- **Image Docker** : `libheif` chargé depuis `bookworm-backports` pour corriger certains échecs HEIC liés aux métadonnées (ex. erreurs `Metadata not correctly assigned to image`)

### 3.6 Nettoyage automatique
- Interval : toutes les **15 minutes**
- Supprime les fichiers de `uploads/` et `converted/` de plus de **1 heure**
- Ne supprime que des **fichiers réguliers** (pas les sous-dossiers éventuels)
- Nettoyage manuel disponible via `POST /api/cleanup` et `POST /api/cleanup/all`

### 3.7 Téléchargement et visualisation
- Bouton **Visualiser** par fichier converti : ouvre l'image dans un nouvel onglet
- Bouton **Télécharger** individuel par fichier converti
- Bouton "Tout télécharger" visible si ≥ 2 fichiers convertis avec succès
- Le "Tout télécharger" déclenche les téléchargements en séquence avec un délai de **300ms** entre chaque
- Les noms de fichiers avec accents sont conservés pour `downloadName` (UTF-8) côté API / téléchargement

### 3.8 Interface — composants existants
| Composant | Description |
|---|---|
| Header | Image **logo.png** (public/), hauteur 4rem ; texte **« Image converter »** en Arial 2.25rem, couleur **`#EE743C`** ; description à droite ; bouton **Tout réinitialiser** (reset UI + appel `POST /api/cleanup/all` pour vider `uploads/` et `converted/`) |
| Badges formats | Ligne de badges des formats supportés (HEIC en jaune accent) |
| Drop zone | Zone centrale avec icône, titre, sous-titre ; accessible au clavier via **Entrée** / **Espace** |
| File queue | Liste des fichiers sélectionnés : **miniature** (thumbnail) par image, extension, nom, taille, bouton suppression. Formats classiques via `URL.createObjectURL`; HEIC via preview client `heic2any` (fallback vide si échec) |
| Settings bar | Apparaît après sélection de fichiers : format + qualité + bouton Convertir ; contrôles verrouillés pendant la conversion |
| Progress section | Barre de progression réelle (Conversion 1/N…, 2/N…) ; statut **par image** : En attente → Conversion en cours… → Converti / Erreur |
| Results section | Liste des résultats succès/erreur ; pour chaque succès : bouton **Visualiser** (nouvel onglet) + bouton **Télécharger** ; "Tout télécharger" si ≥ 2 succès |
| Footer | Mention locale + libs utilisées |

### 3.9 Observabilité et santé
- Endpoint `GET /health` retournant `{ "status": "ok", "version": "1.0" }`
- Logs structurés **JSON** sur stdout/stderr (startup, requêtes HTTP, erreurs, nettoyages)
- Image Docker avec `HEALTHCHECK` basé sur `GET /health`

---

## 4. Design system — IMMUABLE

> Ne pas modifier les variables CSS sans accord.

### 4.1 Couleurs
```css
--bg: #0c0c0f;
--surface: #141418;
--surface2: #1c1c22;
--border: #2a2a35;
--accent: #e8ff47;       /* Jaune-vert, couleur principale */
--accent2: #ff6b35;      /* Orange, non encore utilisé en v1 */
--text: #f0f0f5;
--text-muted: #7a7a8c;
--success: #4ade80;
--error: #f87171;
--radius: 12px;
```

### 4.2 Typographie
- **Display / UI** : `Syne` (Google Fonts), weights 400/600/700/800
- **Code / Mono / Labels** : `DM Mono` (Google Fonts), weights 400/500

### 4.3 Fond
Grille CSS via `body::before` avec `background-image` double gradient, `background-size: 40px 40px`, `opacity: 0.3`.

### 4.4 Animations existantes
- `@keyframes slideIn` : apparition des file-items et result-items (translateY -8px → 0, opacity 0 → 1, 0.2s)
- Transition hover drop-zone : scale, border-color, background
- Progress bar : transition width 0.3s ease ; progression réelle (conversion fichier par fichier)

---

## 5. API Backend

### 5.1 Routes existantes
| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | Endpoint de santé pour supervision / Docker healthcheck |
| `GET` | `/*` | Sert les fichiers statiques de `public/` |
| `GET` | `/converted/*` | Sert les fichiers convertis |
| `POST` | `/api/convert` | Conversion (multipart/form-data) |
| `POST` | `/api/cleanup` | Nettoyage des fichiers anciens (> 1 h) dans `uploads/` et `converted/` |
| `POST` | `/api/cleanup/all` | Vide complètement `uploads/` et `converted/` |

### 5.2 POST /api/convert
**Request :**
- `Content-Type: multipart/form-data`
- Champ `images` : tableau de fichiers (max 20)
- Champ `format` : string (`jpeg` | `png` | `webp` | `avif`), défaut `jpeg`
- Champ `quality` : number (0–100), défaut `85`

**Comportement :**
- Si au moins un fichier valide est traité, la route répond `200` avec `results` et `errors`
- Si aucun fichier valide n'est retenu, la route répond `400`
- Les extensions refusées sont remontées dans `errors` avec un message explicite

**Response success (200) :**
```json
{
  "results": [
    {
      "originalName": "photo.heic",
      "downloadName": "photo.jpg",
      "url": "/converted/<uuid>.jpg",
      "size": 204800,
      "format": "jpeg"
    }
  ],
  "errors": [
    {
      "file": "bad.heic",
      "error": "Conversion HEIC échouée: ..."
    }
  ]
}
```

**Erreurs (4xx) :**
```json
{ "error": "Aucun fichier uploadé" }
{ "error": "Format de sortie invalide: xxx" }
{ "results": [], "errors": [{ "file": "bad.txt", "error": "Format de fichier invalide: .txt" }] }
{ "error": "Trop de fichiers: maximum 20." }
{ "error": "Fichier trop volumineux: maximum 100 MB." }
```

### 5.3 POST /api/cleanup
Déclenche un nettoyage immédiat des fichiers de plus d'1 heure dans `uploads/` et `converted/`.

**Response success (200) :**
```json
{ "ok": true, "message": "Nettoyage effectué (fichiers de plus d’1 h supprimés)." }
```

### 5.4 POST /api/cleanup/all
Vide immédiatement les dossiers `uploads/` et `converted/`.

**Response success (200) :**
```json
{ "ok": true, "message": "Dossiers uploads et converted vidés." }
```

### 5.5 GET /health
Retourne l'état de santé minimal de l'application.

**Response success (200) :**
```json
{ "status": "ok", "version": "1.0" }
```

---

## 6. Variables d'environnement

| Variable | Valeur par défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port d'écoute Express (interne conteneur) |
| `NODE_ENV` | `production` | Environnement Node |
| `MAX_FILE_SIZE` | `100mb` | Non encore utilisé programmatiquement (limite via multer en dur) |
| `IMAGEMAGICK_CMD` | (aucune) | Sous Windows : chemin complet vers `magick.exe` si besoin (ex. `C:\Program Files\ImageMagick-7.x\magick.exe`) pour éviter conflit avec l’outil système `convert` |

---

## 7. Backlog — Fonctionnalités à développer

> Ces éléments sont **planifiés** mais **non implémentés**. Chaque item doit faire l'objet d'une discussion avant développement.

### 7.1 Priorité haute
- [ ] **ZIP download** : télécharger tous les fichiers convertis en une seule archive `.zip` (librairie à choisir avec l'utilisateur)
- [x] **Preview images (avant conversion)** : miniature des images dans la file d'attente (formats standards via `URL.createObjectURL`, HEIC via `heic2any` côté client)
- [x] **Statut par image** : progression réelle et statut par fichier (En attente, Conversion en cours…, Converti/Erreur) ; conversion envoyée fichier par fichier
- [ ] **Conversion par lot avec retry** : réessayer automatiquement les fichiers en erreur

### 7.2 Priorité moyenne
- [ ] **Drag & drop pour réordonner** la file d'attente
- [ ] **Options avancées par format** : ex. effort AVIF
- [x] **Redimensionnement (PNG)** : pour le PNG, le curseur contrôle déjà la résolution (réduction des dimensions en %) ; option width/height explicite possible en backlog
- [x] **Page de santé** : endpoint `GET /health` retournant `{ status: "ok", version: "1.0" }`
- [x] **Logs structurés** : logs JSON sur stdout/stderr, sans dépendance supplémentaire

### 7.3 Priorité basse
- [ ] **Thème clair** : toggle light/dark mode
- [ ] **Historique de session** : conserver les conversions de la session en cours (localStorage)
- [ ] **Support SVG en entrée**
- [x] **Métadonnées** : suppression par défaut (`-strip`) à chaque conversion ; option pour conserver les métadonnées non implémentée

---

## 8. Contraintes non fonctionnelles

### 8.1 Sécurité
- Validation stricte des extensions côté backend (liste blanche dans `fileFilter`)
- Les noms de fichiers utilisateur ne sont **jamais** utilisés en sortie sur le filesystem (UUID uniquement)
- Pas d'exposition du chemin filesystem dans les réponses API
- Commandes shell construites avec les chemins entre guillemets pour éviter l'injection basique
- Côté frontend, les noms de fichiers et messages serveur sont rendus en **texte** (pas d'injection HTML brute)

> ⚠️ **Ce qui N'EST PAS implémenté et nécessite accord avant ajout :** rate limiting, authentification, CSRF protection, helmet.js, sanitisation avancée des inputs.

### 8.2 Performance
- Conversion séquentielle (pas parallèle) dans la boucle `for...of`
- Pas de queue de jobs, pas de worker threads en v1

> ⚠️ **Toute parallélisation ou queue (Bull, BullMQ, etc.) nécessite accord avant implémentation.**

### 8.3 Compatibilité navigateurs
- Cible : Chrome/Firefox/Safari dernières versions
- Pas de support IE ou anciens navigateurs requis

### 8.4 Internationalisation
- Langue de l'interface : **français uniquement** en v1
- Pas de système i18n prévu

---

## 9. Ce qui est HORS SCOPE (v1)

Ne pas implémenter ces éléments sans discussion :

- Authentification / gestion d'utilisateurs
- Base de données (aucune DB en v1)
- Upload vers S3 ou stockage externe
- API publique / clés API
- Conversion vidéo
- OCR ou traitement d'image avancé (recadrage, filtres, etc.)
- Mode multi-instances / clustering
- Tests automatisés (unitaires, e2e)
- CI/CD pipeline
- Monitoring / alerting

---

## 10. Questions ouvertes — À trancher avec l'utilisateur

Ces décisions sont **intentionnellement laissées en suspens**. L'IA doit les poser avant tout développement qui les implique.

| # | Question | Impact |
|---|---|---|
| Q1 | Quelle librairie utiliser pour le ZIP ? (`archiver`, `jszip`, autre ?) | Feature 7.1 |
| Q2 (résolu v1.6) | Logs structurés JSON sur stdout/stderr uniquement ; pas de logs fichier en v1 | 7.2 |
| Q3 (résolu v1.4) | Preview générée côté client (`URL.createObjectURL` + `heic2any` pour HEIC) ; pas de preview serveur en v1 | 7.1 |
| Q4 | La barre de progression réelle doit-elle utiliser SSE ou polling ? | 7.1 |
| Q5 | Faut-il limiter le débit des requêtes (rate limiting) ? Si oui, par IP ou global ? | 8.1 |
| Q6 | Le redimensionnement doit-il conserver le ratio ? Avec quel comportement (crop, letterbox, stretch) ? | 7.2 |
| Q7 (résolu v1.6) | Endpoint `GET /health` ajouté ; utilisé par le `HEALTHCHECK` Docker | 7.2 |
| Q8 | Le nom du fichier téléchargé doit-il inclure un suffixe (ex: `photo_converted.jpg`) ? | UX |

---

## 11. Glossaire technique

| Terme | Définition dans ce projet |
|---|---|
| `uploads/` | Dossier temporaire pour les fichiers reçus avant conversion |
| `converted/` | Dossier des fichiers convertis, servis en statique |
| `heif-convert` | Binaire CLI fourni par `libheif-examples` (apt), utilisé pour décoder HEIC |
| `heic2any` | Librairie JS utilisée côté navigateur pour générer une preview HEIC locale avant conversion |
| `convert` / `magick` | Binaire CLI ImageMagick (6 ou 7) ; sous Windows on utilise `magick` pour éviter le conflit avec l’outil système `convert` |
| `uuid` | Identifiant unique v4 utilisé pour nommer les fichiers sur le filesystem |
| temp file | Fichier intermédiaire `<uuid>_temp.jpg` créé lors de la conversion HEIC vers un format non-JPEG |
| batch | Ensemble de fichiers soumis en une seule requête POST `/api/convert` |

---

## Historique des modifications

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0 | 2026-02-24 | Version initiale (ImageShift → ABCLIV, spécification complète) |
| 1.1 | 2026-02-24 | HEICF retiré des formats d'entrée. Bouton « Tout réinitialiser ». Miniature par image dans la file. Statut par image pendant la conversion. Bouton « Visualiser » (nouvel onglet) par résultat. Variable d'environnement `IMAGEMAGICK_CMD`. Backend Windows : usage de `magick` et chemins entre guillemets. |
| 1.2 | 2026-02-24 | **PNG** : curseur = réduction de résolution (5–100 % des dimensions), sans perte de qualité. **Tous formats** : `-strip` (suppression des métadonnées). Curseur 0–100 ; qualité 0 % prise en compte pour JPEG/WebP/AVIF. |
| 1.3 | 2026-02-24 | **Header** : logo image `public/logo.png` (hauteur 4rem) ; titre remplacé par « Image converter » (Arial, 2.25rem). Routes **POST /api/cleanup** et **POST /api/cleanup/all** pour vider uploads/converted. |
| 1.4 | 2026-02-25 | **Preview HEIC** côté client via `heic2any` local (`public/heic2any.min.js`, chargement à la demande). **Tout réinitialiser** déclenche aussi `POST /api/cleanup/all`. **Téléchargement** : correction des noms de fichiers accentués (UTF-8) dans `originalName` / `downloadName`. Section API mise à jour avec routes cleanup documentées. |
| 1.5 | 2026-02-25 | **Docker** : `libheif` installé via **Debian bookworm-backports** (`libheif1` + `libheif-examples`) pour améliorer la compatibilité HEIC. **Compose** : port publié `3005:3000` et rattachement au réseau Docker externe `proxy` (intégration NPM/reverse proxy). **UI** : couleur du titre « Image converter » = `#EE743C`. |
| 1.6 | 2026-03-08 | **API** : ajout de `GET /health`. **Logs** : logs JSON structurés sur stdout/stderr. **Upload** : rejet explicite des extensions invalides et erreurs 4xx documentées (`LIMIT_FILE_COUNT`, taille max). **UI** : drop zone accessible au clavier, verrouillage des contrôles pendant la conversion, parsing d'erreurs tolérant au non-JSON. **Docker** : ajout d'un `HEALTHCHECK` basé sur `/health`. |

*Toute modification de ce PRD doit être documentée avec la date et la version.*
