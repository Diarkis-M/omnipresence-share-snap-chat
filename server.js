import express from 'express';
import { exec } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARECHAT_DIR = join(__dirname, 'pipelines', 'ShareChat');
const SNAPCHAT_DIR = join(__dirname, 'pipelines', 'Snapchat');

// Ensure output/data dirs exist
for (const dir of [SHARECHAT_DIR, SNAPCHAT_DIR]) {
  for (const sub of ['output', 'data']) {
    const p = join(dir, sub);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
}

const app = express();
app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

// ─── Read existing results ───

function readResults(platform) {
  const dir = platform === 'sharechat' ? SHARECHAT_DIR : SNAPCHAT_DIR;
  const reportPath = join(dir, 'output', 'scouting_report.json');
  const healthPath = join(dir, 'output', 'health_report.json');

  let report = null;
  let health = null;

  if (existsSync(reportPath)) {
    try { report = JSON.parse(readFileSync(reportPath, 'utf-8')); } catch { }
  }
  if (existsSync(healthPath)) {
    try { health = JSON.parse(readFileSync(healthPath, 'utf-8')); } catch { }
  }

  return { report, health };
}

app.get('/api/results', (req, res) => {
  res.json({
    sharechat: readResults('sharechat'),
    snapchat: readResults('snapchat'),
  });
});

// ─── Run pipelines ───

let scouting = false;

function runPipeline(platform) {
  const dir = platform === 'sharechat' ? SHARECHAT_DIR : SNAPCHAT_DIR;
  const skipFlags = platform === 'snapchat' ? '--skip-api --skip-google' : '--skip-google';
  const cmd = `node scripts/run-pipeline.js --fresh ${skipFlags}`;

  return new Promise((resolve) => {
    exec(cmd, { cwd: dir, timeout: 600000, env: { ...process.env } }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, platform, error: err.message, stdout, stderr });
      } else {
        resolve({ success: true, platform, stdout });
      }
    });
  });
}

app.post('/api/scout', async (req, res) => {
  if (scouting) {
    return res.status(429).json({ error: 'A scouting run is already in progress. Wait for it to finish.' });
  }

  scouting = true;
  const platforms = req.body.platforms || ['sharechat', 'snapchat'];

  try {
    const results = await Promise.all(platforms.map(p => runPipeline(p)));
    const data = {
      sharechat: readResults('sharechat'),
      snapchat: readResults('snapchat'),
      runs: results.map(r => ({ platform: r.platform, success: r.success, error: r.error })),
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    scouting = false;
  }
});

// ─── Start ───

const PORT = process.env.PORT || 3847;
app.listen(PORT, () => {
  console.log(`\n  Omnipresence v2.1 running on port ${PORT}\n`);
});
