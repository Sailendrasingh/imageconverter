# ABCLIV

Convertisseur d'images web. Conversion de formats courants et HEIC/HEICF vers JPEG, PNG, WebP ou AVIF. Tout est traité en local (Docker), aucune donnée ne quitte le serveur.

## Prérequis

- Docker et Docker Compose
- Node.js 20+ (pour développement local sans Docker)

## Lancement avec Docker

```bash
docker compose up --build
```

L'application est accessible sur **http://localhost:3000**.

## Développement local (sans Docker)

Sur une machine avec Node.js 20, il faut en plus installer **ImageMagick** et **libheif** : ce sont des programmes (exécutables) ou des bibliothèques système (DLL sous Windows), pas des paquets npm.

```bash
npm install
npm start
```

- **ImageMagick** : programme fournissant le binaire `convert` (à mettre dans le PATH).
- **libheif** : bibliothèque + outils (sous Windows : programmes/DLL à installer séparément) fournissant `heif-convert` pour la conversion HEIC/HEICF.

Sous Linux (Debian/Ubuntu) : `apt install imagemagick libheif-examples`.

### Installation sous Windows

1. **Node.js 20**  
   Télécharger l’installeur LTS depuis [nodejs.org](https://nodejs.org) et l’installer. Vérifier dans PowerShell : `node -v`.

2. **ImageMagick**  
   - Aller sur [imagemagick.org/script/download.php](https://imagemagick.org/script/download.php).  
   - Télécharger l’installeur Windows (ex. `ImageMagick-7.x.x-Q16-HDRI-x64-dll.exe`).  
   - Lancer l’installeur et **cocher l’option « Add application directory to your system path »** (ajouter au PATH).  
   - Redémarrer le terminal, puis vérifier : `magick -version`.  
   - L’application attend la commande `convert`. Avec ImageMagick 7, l’installeur peut ne fournir que `magick`. Si `convert` n’est pas reconnu dans un terminal : créer un fichier `convert.bat` dans un dossier déjà dans le PATH (ex. le dossier d’ImageMagick), contenant `@magick %*`, pour que les appels à `convert` fonctionnent.

3. **libheif (heif-convert)**  
   - **Option A – Binaires précompilés** : aller sur [GitHub : libheif-Windowsbinary](https://github.com/pphh77/libheif-Windowsbinary/releases), télécharger l’archive (ex. `.zip`) des binaires pour Windows, l’extraire dans un dossier (ex. `C:\Programmes\libheif`), puis ajouter ce dossier au **PATH** système (Paramètres Windows → Système → À propos → Paramètres système avancés → Variables d’environnement → Path → Modifier → Nouveau).  
   - **Option B – MSYS2** : installer [MSYS2](https://www.msys2.org/), ouvrir le terminal MSYS2 et lancer `pacman -S mingw-w64-x86_64-libheif`. Les exécutables sont dans le répertoire MSYS2 (ex. `C:\msys64\mingw64\bin`) ; ajouter ce dossier au PATH Windows si vous lancez l’app depuis PowerShell/CMD.  
   - Vérifier dans un nouveau terminal : `heif-convert --help` (ou `heif-convert.exe`).

4. **Lancer ABCLIV**  
   Dans PowerShell, à la racine du projet :
   ```powershell
   cd "d:\DEV\IMAGE-CONVERTER"
   npm install
   npm start
   ```
   Puis ouvrir **http://localhost:3000** dans le navigateur.

> **Remarque** : Si vous n’avez pas besoin de convertir des HEIC/HEICF, vous pouvez lancer l’app sans libheif ; les autres formats fonctionneront avec ImageMagick seul. Les HEIC échoueront avec une erreur de conversion.

**Si vous voyez « Paramètre non valide --quality »** : le serveur appelle la commande `magick` sous Windows. Vérifiez que c’est bien ImageMagick qui répond (`magick -version` dans un terminal). Si un autre programme porte le même nom ou si ImageMagick est dans un dossier précis, vous pouvez forcer le binaire avec la variable d’environnement :  
`set IMAGEMAGICK_CMD=C:\Chemin\vers\ImageMagick\magick.exe`  
puis relancer `npm start`.

## Fonctionnalités

- Drag & drop ou sélection de fichiers (max 20, 100 Mo par fichier)
- Formats d'entrée : JPG, PNG, WebP, AVIF, HEIC, HEICF, TIFF, BMP, GIF
- Formats de sortie : JPEG, PNG, WebP, AVIF
- Réglage de la qualité (10–100)
- Téléchargement individuel ou groupé (tous les fichiers)
- Nettoyage automatique des fichiers temporaires (toutes les 15 min, fichiers de plus d’1 h)

## Structure

- `server.js` — backend Express (upload, conversion, service des fichiers)
- `public/index.html` — frontend unique (HTML/CSS/JS vanilla)
- `uploads/` et `converted/` — créés au démarrage (ou montés en volumes Docker)

Voir **ProductRequirementDocuments.md** pour le cahier des charges complet.
