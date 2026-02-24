# Déploiement ABCLIV sous Docker sur Ubuntu Server

Ce guide décrit l’installation et le déploiement de **ABCLIV** (convertisseur d’images) dans Docker sur **Ubuntu Server**.

---

## 1. Prérequis

- **Ubuntu Server** 22.04 LTS ou 24.04 LTS (recommandé)
- Accès **root** ou utilisateur avec `sudo`
- Connexion réseau pour télécharger les images Docker et les paquets

---

## 2. Installer Docker sur Ubuntu

### 2.1 Mise à jour et paquets utiles

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
```

### 2.2 Clé et dépôt Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 2.3 Installation de Docker Engine

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 2.4 Vérification

```bash
sudo docker run hello-world
sudo docker compose version
```

### 2.5 (Optionnel) Exécuter Docker sans sudo

Pour lancer Docker sans `sudo` avec votre utilisateur :

```bash
sudo usermod -aG docker $USER
```

Puis se déconnecter et se reconnecter (ou exécuter `newgrp docker`).

---

## 3. Récupérer le projet

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

Par défaut l’application écoute sur le **port 3000**. Pour changer le port exposé sur l’hôte :

- **Méthode 1 – variable d’environnement** (avant de lancer `docker compose`) :

  ```bash
  export PORT=8080
  docker compose up -d --build
  ```

- **Méthode 2 – fichier `.env`** à la racine du projet :

  ```
  PORT=8080
  ```

  Puis : `docker compose up -d --build`

L’application sera alors accessible sur `http://<IP-du-serveur>:8080`.

### 4.2 Variables d’environnement (optionnel)

| Variable        | Défaut | Description                                      |
|----------------|--------|--------------------------------------------------|
| `PORT`         | `3000` | Port exposé sur l’hôte (mapping dans Compose).   |
| `NODE_ENV`     | `production` | Déjà défini dans le Dockerfile.          |
| `IMAGEMAGICK_CMD` | (aucune) | Sous Linux généralement inutile ; prévu pour Windows. |

Pour les définir dans Compose, vous pouvez ajouter une section `environment` dans `docker-compose.yml` ou utiliser un fichier `.env`.

---

## 5. Build et lancement

### 5.1 Premier déploiement

À la racine du projet (`/opt/imageconverter` ou votre chemin) :

```bash
sudo docker compose up -d --build
```

- `--build` : construit l’image (Node 20, ImageMagick, libheif).
- `-d` : exécution en arrière-plan.

Le premier lancement peut prendre quelques minutes (téléchargement de l’image de base et construction).

### 5.2 Vérifier que le conteneur tourne

```bash
sudo docker compose ps
```

Vous devez voir le service `app` avec le statut `Up`. L’application est accessible sur :

- **http://&lt;IP-du-serveur&gt;:3000** (ou le port défini par `PORT`).

### 5.3 Démarrer au boot (redémarrage automatique)

Par défaut, Docker Compose peut recréer les conteneurs au redémarrage du serveur si vous relancez `docker compose up -d` (par exemple via un script ou un service systemd). Pour que le conteneur redémarre tout seul après un reboot, ajoutez une politique de redémarrage.

Éditez `docker-compose.yml` et ajoutez `restart: unless-stopped` au service `app` :

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
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
  curl -X POST http://localhost:3000/api/cleanup
  ```

- **Tout vider** (uploads + converted) :

  ```bash
  curl -X POST http://localhost:3000/api/cleanup/all
  ```

Remplacez `localhost` par l’IP du serveur si vous appelez depuis une autre machine.

---

## 8. Commandes utiles

| Action | Commande |
|--------|----------|
| Voir les logs | `sudo docker compose logs -f` |
| Arrêter l’app | `sudo docker compose down` |
| Redémarrer | `sudo docker compose restart` |
| Reconstruire après modification du code | `sudo docker compose up -d --build` |
| Lister les volumes | `sudo docker volume ls` |
| Supprimer les volumes (efface toutes les données) | `sudo docker compose down -v` |

---

## 9. Pare-feu (UFW)

Si vous utilisez UFW et que le port 3000 (ou celui choisi) est bloqué :

```bash
sudo ufw allow 3000/tcp
sudo ufw reload
sudo ufw status
```

Adaptez le numéro de port si vous avez défini `PORT` différemment.

---

## 10. Accès depuis Internet (optionnel)

- Pour exposer l’app sur Internet, configurez la **redirection de port** sur votre box/routeur vers l’IP du serveur et le port (ex. 3000).
- Pour **HTTPS** et un nom de domaine, mettez un reverse proxy (Nginx ou Caddy) devant l’app et configurez un certificat (ex. Let’s Encrypt). Ceci sort du cadre de ce guide mais est recommandé en production.

---

## 11. Dépannage

- **Le conteneur ne démarre pas**  
  Vérifiez les logs : `sudo docker compose logs`. Vérifiez que les fichiers `Dockerfile`, `docker-compose.yml`, `server.js` et `public/` sont bien présents.

- **Port déjà utilisé**  
  Choisissez un autre port avec `PORT=8080` (ou autre) avant `docker compose up -d --build`.

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
sudo docker compose up -d --build

# Accès
# http://<IP-du-serveur>:3000
```

*Document rédigé pour ABCLIV (Image Converter) — déploiement Docker sur Ubuntu Server.*
