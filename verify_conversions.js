const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Blob } = require('buffer');

const DEFAULT_INPUT_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'tiff', 'bmp', 'gif'];
const DEFAULT_OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif'];
const DEFAULT_PORT = 3111;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_QUALITY = 85;

function resolveList(envName, defaults, allowed) {
  const raw = process.env[envName];
  const values = raw
    ? raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    : defaults.slice();

  const invalid = values.filter((value) => !allowed.includes(value));
  if (invalid.length > 0) {
    throw new Error(`${envName} contient des valeurs invalides: ${invalid.join(', ')}`);
  }

  return values;
}

function getImageMagickCommand() {
  if (process.env.IMAGEMAGICK_CMD) return process.env.IMAGEMAGICK_CMD;
  return process.platform === 'win32' ? 'magick' : 'convert';
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}

async function waitForHealth(port, timeoutMs) {
  const startedAt = Date.now();
  const url = `http://127.0.0.1:${port}/health`;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_) {}

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Le serveur n'a pas répondu sur ${url} avant ${timeoutMs} ms.`);
}

async function parseResponse(res) {
  const text = await res.text();
  try {
    return { text, data: JSON.parse(text) };
  } catch (_) {
    return { text, data: null };
  }
}

async function generateFixtures(tmpDir, inputExts, imageMagickCmd) {
  const baseSource = path.join(tmpDir, 'base-source.png');
  await runCommand(imageMagickCmd, [
    '-size', '160x100',
    'gradient:#1144aa-#f2c14e',
    '-gravity', 'center',
    '-font', 'Arial',
    '-pointsize', '20',
    '-fill', 'white',
    '-annotate', '+0+0',
    'ABCLIV',
    baseSource
  ], tmpDir);

  const fixtures = [];
  for (const ext of inputExts) {
    const diskName = `sample.${ext}`;
    const uploadName = `sample-échantillon.${ext}`;
    const fixturePath = path.join(tmpDir, diskName);

    await runCommand(imageMagickCmd, [baseSource, fixturePath], tmpDir);
    fixtures.push({ ext, filePath: fixturePath, uploadName });
  }

  return fixtures;
}

async function main() {
  const port = Number(process.env.VERIFY_PORT || DEFAULT_PORT);
  const timeoutMs = Number(process.env.VERIFY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const quality = Number(process.env.VERIFY_QUALITY || DEFAULT_QUALITY);
  const inputExts = resolveList('VERIFY_INPUTS', DEFAULT_INPUT_EXTS, DEFAULT_INPUT_EXTS);
  const outputFormats = resolveList('VERIFY_OUTPUTS', DEFAULT_OUTPUT_FORMATS, DEFAULT_OUTPUT_FORMATS);
  const imageMagickCmd = getImageMagickCommand();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abcliv-verify-'));

  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (chunk) => process.stdout.write(chunk.toString()));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk.toString()));

  try {
    console.log(`Fixtures temporaires: ${tmpDir}`);
    console.log(`Entrées testées: ${inputExts.join(', ')}`);
    console.log(`Sorties testées: ${outputFormats.join(', ')}`);

    const fixtures = await generateFixtures(tmpDir, inputExts, imageMagickCmd);
    await waitForHealth(port, timeoutMs);

    const results = [];
    for (const fixture of fixtures) {
      const fileBuffer = fs.readFileSync(fixture.filePath);

      for (const outputFormat of outputFormats) {
        const form = new FormData();
        form.append('images', new Blob([fileBuffer]), fixture.uploadName);
        form.append('format', outputFormat);
        form.append('quality', String(quality));

        const res = await fetch(`http://127.0.0.1:${port}/api/convert`, {
          method: 'POST',
          body: form
        });

        const parsed = await parseResponse(res);
        const result = {
          input: fixture.ext,
          output: outputFormat,
          status: res.status,
          ok: false,
          downloadName: null,
          error: null
        };

        const payload = parsed.data;
        const converted = payload && Array.isArray(payload.results) ? payload.results[0] : null;

        if (res.ok && converted) {
          result.downloadName = converted.downloadName;
          const expectedExt = outputFormat === 'jpeg' ? '.jpg' : `.${outputFormat}`;

          if (!converted.downloadName.endsWith(expectedExt)) {
            result.error = `downloadName invalide: ${converted.downloadName}`;
          } else if (!converted.downloadName.startsWith('sample-échantillon')) {
            result.error = `downloadName accentué non conservé: ${converted.downloadName}`;
          } else {
            const downloadRes = await fetch(`http://127.0.0.1:${port}${converted.url}`);
            if (!downloadRes.ok) {
              result.error = `Téléchargement échoué: ${downloadRes.status}`;
            } else {
              result.ok = true;
            }
          }
        } else {
          result.error = payload?.error || payload?.errors?.[0]?.error || parsed.text || 'Erreur inconnue';
        }

        results.push(result);
        console.log(`${fixture.ext} -> ${outputFormat}: ${result.ok ? 'OK' : 'FAIL'}${result.error ? ` | ${result.error}` : ''}`);
      }
    }

    const failures = results.filter((result) => !result.ok);
    console.log('\nSUMMARY');
    console.log(JSON.stringify({
      total: results.length,
      passed: results.length - failures.length,
      failed: failures.length,
      failures
    }, null, 2));

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
