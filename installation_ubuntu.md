# Déploiement ABCLIV sous Docker sur Ubuntu Server

Ce guide décrit l’installation et le déploiement de **ABCLIV** (convertisseur d’images) dans Docker sur **Ubuntu Server**.

---

## 1. Prérequis

- **Ubuntu Server** 22.04 LTS ou 24.04 LTS (recommandé)
- Accès **root** ou utilisateur avec `sudo`
- Connexion réseau pour télécharger les images Docker et les paquets

---

### 3.1 Cloner le dépôt

```bash
cd /opt   # ou un autre répertoire de votre choix
sudo git clone https://github.com/Sailendrasingh/imageconverter.git
cd imageconverter
```

Si vous n’utilisez pas Git, téléchargez et extrayez l’archive du projet dans un dossier (ex. `/opt/imageconverter`).

### 3.2 Vérifier les fichiers

À la racine du projet vous devez avoir au minimum :

- `Dockerfile`
- `docker-compose.yml`
- `package.json`
- `server.js`
- `public/` (avec `index.html` et éventuellement `logo.png`)

---

## 4. Configuration

### 4.1 Port d’écoute

Avec le `docker-compose.yml` actuel, le conteneur écoute sur le **port 3000** et le port publié sur l’hôte est **3005** (`3005:3000`).

L’application est donc accessible sur :

- `http://<IP-du-serveur>:3005`

Pour changer le port exposé sur l’hôte, modifiez la section `ports` de `docker-compose.yml` :

```yaml
services:
  app:
    ports:
      - 8080:3000
```

Puis relancez : `sudo docker compose up -d`

### 4.2 Variables d’environnement (optionnel)

| Variable        | Défaut | Description                                      |
|----------------|--------|--------------------------------------------------|
| `PORT`         | `3000` | Port d’écoute de l’application dans le conteneur. Avec le compose actuel, le mapping hôte reste `3005:3000`. |
| `NODE_ENV`     | `production` | Déjà défini dans le Dockerfile.          |
| `IMAGEMAGICK_CMD` | (aucune) | Sous Linux généralement inutile ; prévu pour Windows. |

Pour les définir dans Compose, vous pouvez utiliser la section `environment` de `docker-compose.yml`.

---

## 5. Build et lancement

### 5.1 Premier déploiement

À la racine du projet (`/opt/imageconverter` ou votre chemin) :

```bash
sudo docker compose up -d --build
```

- `--build` : construit l’image (Node 20, ImageMagick, libheif).
- `-d` : exécution en arrière-plan.
- Si le réseau Docker externe `proxy` n’existe pas encore, créez-le avant le premier lancement : `sudo docker network create proxy`

Le premier lancement peut prendre quelques minutes (téléchargement de l’image de base et construction).

### 5.2 Vérifier que le conteneur tourne

```bash
sudo docker compose ps
```

Vous devez voir le service `app` avec le statut `Up`. L’application est accessible sur :

- **http://&lt;IP-du-serveur&gt;:3005**

### 5.3 Démarrer au boot (redémarrage automatique)

Par défaut, Docker Compose peut recréer les conteneurs au redémarrage du serveur si vous relancez `docker compose up -d` (par exemple via un script ou un service systemd). Pour que le conteneur redémarre tout seul après un reboot, ajoutez une politique de redémarrage.

Éditez `docker-compose.yml` et ajoutez `restart: unless-stopped` au service `app` :

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "3005:3000"
    # ... reste inchangé
```

Puis :

```bash
sudo docker compose up -d
```

---

## 6. Volumes et données

Les fichiers uploadés et convertis sont stockés dans des **volumes Docker** :

| Volume Docker   | Montage dans le conteneur | Rôle                          |
|-----------------|---------------------------|-------------------------------|
| `uploads_data`  | `/app/uploads`            | Fichiers reçus avant conversion |
| `converted_data`| `/app/converted`          | Fichiers convertis servis par l’app |

- Les données survivent aux redémarrages du conteneur et aux `docker compose down` (sans `-v`).
- Pour **vider** les dossiers sans recréer les volumes : utiliser l’API (voir section 7) ou supprimer les volumes (section 8).

---

## 7. Nettoyage des fichiers (API)

L’application expose deux routes pour vider les dossiers :

- **Supprimer les fichiers de plus d’1 heure** :

  ```bash
  curl -X POST http://localhost:3005/api/cleanup
  ```

- **Tout vider** (uploads + converted) :

  ```bash
  curl -X POST http://localhost:3005/api/cleanup/all
  ```

Remplacez `localhost` par l’IP du serveur si vous appelez depuis une autre machine.

Pour vérifier rapidement l’état du service :

```bash
curl http://localhost:3005/health
```

Réponse attendue :

```json
{"status":"ok","version":"1.0"}
```

---

## 8. Commandes utiles

| Action | Commande |
|--------|----------|
| Voir les logs | `sudo docker compose logs -f` |
| Vérifier la santé HTTP | `curl http://localhost:3005/health` |
| Arrêter l’app | `sudo docker compose down` |
| Redémarrer | `sudo docker compose restart` |
| Reconstruire après modification du code | `sudo docker compose up -d --build` |
| Lister les volumes | `sudo docker volume ls` |
| Supprimer les volumes (efface toutes les données) | `sudo docker compose down -v` |

---

## 9. Pare-feu (UFW)

Si vous utilisez UFW et que le port 3005 (ou celui choisi dans `docker-compose.yml`) est bloqué :

```bash
sudo ufw allow 3005/tcp
sudo ufw reload
sudo ufw status
```

Adaptez le numéro de port si vous avez modifié le mapping dans `docker-compose.yml`.

---

## 10. Accès depuis Internet (optionnel)

- Pour exposer l’app sur Internet, configurez la **redirection de port** sur votre box/routeur vers l’IP du serveur et le port publié (ex. 3005).
- Pour **HTTPS** et un nom de domaine, mettez un reverse proxy (Nginx ou Caddy) devant l’app et configurez un certificat (ex. Let’s Encrypt). Ceci sort du cadre de ce guide mais est recommandé en production.

---

## 11. Dépannage

- **Le conteneur ne démarre pas**  
  Vérifiez les logs : `sudo docker compose logs`. Vérifiez que les fichiers `Dockerfile`, `docker-compose.yml`, `server.js` et `public/` sont bien présents.

- **Port déjà utilisé**  
  Modifiez le mapping `ports` dans `docker-compose.yml` (ex. `8080:3000`) puis relancez `docker compose up -d --build`.

- **Impossible d’accéder à l’app**  
  Vérifiez UFW, l’IP du serveur, et que le conteneur est bien `Up` avec `docker compose ps`.

- **Conversions HEIC qui échouent**  
  L’image Docker inclut `libheif-examples` ; si des erreurs persistent, consultez les messages dans l’interface (résultats par fichier) et les logs du conteneur.

---

## Résumé rapide

```bash
# Installation Docker (Ubuntu)
sudo apt update && sudo apt install -y ca-certificates curl gnupg
# ... (étapes 2.2 à 2.3 ci-dessus)

# Déploiement
cd /opt && sudo git clone https://github.com/Sailendrasingh/imageconverter.git
cd imageconverter
sudo docker network create proxy
sudo docker compose up -d --build

# Accès
# http://<IP-du-serveur>:3005
```

*Document rédigé pour ABCLIV (Image Converter) — déploiement Docker sur Ubuntu Server.*
