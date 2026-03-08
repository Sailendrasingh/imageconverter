const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const packageJson = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CONVERTED_DIR = path.join(__dirname, 'converted');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.tiff', '.bmp', '.gif'];
const OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif'];
const MAX_FILES = 20;
// Sous Windows, "convert" désigne l'outil système (volumes), pas ImageMagick → utiliser "magick"
// Pour forcer un binaire précis (ex. chemin complet sous Windows) : IMAGEMAGICK_CMD
const IMG_CMD = process.env.IMAGEMAGICK_CMD || (process.platform === 'win32' ? 'magick' : 'convert');
// Guillemets autour de l'exécutable si le chemin contient un espace (ex. "C:\Program Files\...")
const IMG_CMD_QUOTED = (process.platform === 'win32' && IMG_CMD.includes(' ')) ? `"${IMG_CMD}"` : IMG_CMD;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;   // 15 min
const FILE_MAX_AGE_MS = 60 * 60 * 1000;       // 1 hour
const APP_VERSION = packageJson.version;
const HEALTH_VERSION = APP_VERSION.split('.').slice(0, 2).join('.');

function log(level, message, extra = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...extra
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

function serializeError(err) {
  if (!err) return null;
  return {
    message: err.message,
    stack: err.stack
  };
}

[UPLOADS_DIR, CONVERTED_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXT.includes(ext)) return cb(null, true);
  if (!Array.isArray(req.fileValidationErrors)) req.fileValidationErrors = [];
  req.fileValidationErrors.push({
    file: decodeOriginalName(file.originalname),
    error: `Format de fichier invalide: ${ext || 'sans extension'}`
  });
  cb(null, false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES }
});

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// Chemins normalisés pour la ligne de commande (évite les problèmes de backslashes sous Windows)
function cmdPath(p) {
  return path.resolve(p).replace(/\\/g, '/');
}

function isHeic(pathName) {
  const ext = path.extname(pathName).toLowerCase();
  return ext === '.heic';
}

function decodeOriginalName(name) {
  if (typeof name !== 'string') return '';
  // Multer/Busboy may expose UTF-8 filenames decoded as latin1 ("Ã©" instead of "é").
  if (!/[ÃÂâð]/.test(name)) return name;
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (!decoded || decoded.includes('\uFFFD')) return name;
    return decoded;
  } catch (_) {
    return name;
  }
}

function getOutputExt(format) {
  return format === 'jpeg' ? '.jpg' : `.${format}`;
}

function normalizeQuality(value) {
  const qRaw = Number(value);
  return Number.isNaN(qRaw) ? 85 : Math.min(100, Math.max(0, qRaw));
}

function normalizePngScale(value) {
  const qRaw = Number(value);
  return Number.isNaN(qRaw) ? 100 : Math.min(100, Math.max(5, qRaw));
}

async function convertFile(inputPath, outputPath, format, quality) {
  const inP = cmdPath(inputPath);
  const outP = cmdPath(outputPath);
  if (format === 'png') {
    const scale = normalizePngScale(quality);
    return execAsync(`${IMG_CMD_QUOTED} "${inP}" -strip -resize ${scale}% -define png:compression-level=9 "${outP}"`);
  }
  if (format === 'jpeg' || format === 'webp' || format === 'avif') {
    const q = normalizeQuality(quality);
    return execAsync(`${IMG_CMD_QUOTED} "${inP}" -strip -quality ${q} "${outP}"`);
  }
  throw new Error(`Format non supporté: ${format}`);
}

app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log('info', 'request_completed', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start
    });
  });
  next();
});

app.post('/api/convert', upload.array('images', MAX_FILES), async (req, res) => {
  const format = (req.body.format || 'jpeg').toLowerCase();
  const quality = req.body.quality !== undefined ? Number(req.body.quality) : 85;
  const rejectedFiles = Array.isArray(req.fileValidationErrors) ? req.fileValidationErrors : [];

  if (!OUTPUT_FORMATS.includes(format)) {
    return res.status(400).json({ error: `Format de sortie invalide: ${format}` });
  }

  const files = req.files || [];
  if (files.length === 0) {
    if (rejectedFiles.length > 0) {
      return res.status(400).json({ results: [], errors: rejectedFiles });
    }
    return res.status(400).json({ error: 'Aucun fichier uploadé' });
  }

  const results = [];
  const errors = rejectedFiles.slice();

  for (const file of files) {
    const inputPath = file.path;
    const originalName = decodeOriginalName(file.originalname);
    const baseName = path.basename(originalName, path.extname(originalName));
    const outExt = getOutputExt(format);
    const outputId = uuidv4();
    const outputPath = path.join(CONVERTED_DIR, `${outputId}${outExt}`);
    const downloadName = `${baseName}${outExt}`;

    try {
      if (isHeic(originalName)) {
        const tempJpg = path.join(UPLOADS_DIR, `${outputId}_temp.jpg`);
        try {
          await execAsync(`heif-convert "${cmdPath(inputPath)}" "${cmdPath(tempJpg)}"`);
        } catch (heicErr) {
          try {
            await convertFile(inputPath, outputPath, format, quality);
          } catch (magickErr) {
            throw new Error(`Conversion HEIC échouée: ${heicErr.message}`);
          }
          const stat = fs.statSync(outputPath);
          results.push({
            originalName,
            downloadName,
            url: `/converted/${outputId}${outExt}`,
            size: stat.size,
            format
          });
          fs.unlinkSync(inputPath);
          if (fs.existsSync(tempJpg)) fs.unlinkSync(tempJpg);
          continue;
        }
        try {
          if (format === 'jpeg') {
            await execAsync(`${IMG_CMD_QUOTED} "${cmdPath(tempJpg)}" -strip -quality ${normalizeQuality(quality)} "${cmdPath(outputPath)}"`);
          } else {
            await convertFile(tempJpg, outputPath, format, quality);
          }
        } finally {
          if (fs.existsSync(tempJpg)) fs.unlinkSync(tempJpg);
        }
      } else {
        await convertFile(inputPath, outputPath, format, quality);
      }

      const stat = fs.statSync(outputPath);
      results.push({
        originalName,
        downloadName,
        url: `/converted/${outputId}${outExt}`,
        size: stat.size,
        format
      });
    } catch (err) {
      errors.push({ file: originalName, error: err.message });
    } finally {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      } catch (_) {}
    }
  }

  res.status(200).json({ results, errors });
});

app.get('/converted/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename.includes('..')) return res.status(404).send('Fichier non trouvé');
  const filePath = path.join(CONVERTED_DIR, filename);
  const resolved = path.resolve(filePath);
  if (resolved.indexOf(path.resolve(CONVERTED_DIR)) !== 0 || !fs.existsSync(filePath)) {
    return res.status(404).send('Fichier non trouvé');
  }
  res.sendFile(filePath);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: HEALTH_VERSION });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function cleanup() {
  const now = Date.now();
  let deletedCount = 0;
  [UPLOADS_DIR, CONVERTED_DIR].forEach(dir => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        const full = path.join(dir, ent.name);
        try {
          const stat = fs.statSync(full);
          if (now - stat.mtimeMs > FILE_MAX_AGE_MS) {
            fs.unlinkSync(full);
            deletedCount += 1;
          }
        } catch (_) {}
      }
    } catch (_) {}
  });
  return deletedCount;
}

function cleanupAll() {
  let deletedCount = 0;
  [UPLOADS_DIR, CONVERTED_DIR].forEach(dir => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        const full = path.join(dir, ent.name);
        try {
          fs.unlinkSync(full);
          deletedCount += 1;
        } catch (_) {}
      }
    } catch (_) {}
  });
  return deletedCount;
}

setInterval(() => {
  const deleted = cleanup();
  if (deleted > 0) {
    log('info', 'cleanup_completed', { scope: 'expired', deleted });
  }
}, CLEANUP_INTERVAL_MS);

app.post('/api/cleanup', (req, res) => {
  const deleted = cleanup();
  log('info', 'cleanup_requested', { scope: 'expired', deleted });
  res.json({ ok: true, message: 'Nettoyage effectué (fichiers de plus d’1 h supprimés).' });
});

app.post('/api/cleanup/all', (req, res) => {
  const deleted = cleanupAll();
  log('info', 'cleanup_requested', { scope: 'all', deleted });
  res.json({ ok: true, message: 'Dossiers uploads et converted vidés.' });
});

app.use((err, req, res, next) => {
  if (!err) return next();
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const errorMessages = {
      LIMIT_FILE_COUNT: `Trop de fichiers: maximum ${MAX_FILES}.`,
      LIMIT_FILE_SIZE: 'Fichier trop volumineux: maximum 100 MB.',
      LIMIT_UNEXPECTED_FILE: 'Champ de fichier invalide.'
    };
    log('error', 'multer_error', {
      method: req.method,
      path: req.originalUrl,
      code: err.code,
      error: serializeError(err)
    });
    return res.status(400).json({ error: errorMessages[err.code] || err.message });
  }

  log('error', 'unhandled_error', {
    method: req.method,
    path: req.originalUrl,
    error: serializeError(err)
  });
  return res.status(500).json({ error: 'Erreur serveur interne.' });
});

app.listen(PORT, () => {
  log('info', 'server_started', { port: Number(PORT), version: APP_VERSION });
});
