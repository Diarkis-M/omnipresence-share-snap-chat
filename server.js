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

// ─── Async scouting with status polling ───

let scoutState = {
  running: false,
  startedAt: null,
  completedAt: null,
  results: null,  // { sharechat: {...}, snapchat: {...}, runs: [...] }
  error: null,
  logs: [],       // recent log lines for progress
};

function logScout(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  const line = `[${ts}] ${msg}`;
  console.log(line);
  scoutState.logs.push(line);
  if (scoutState.logs.length > 50) scoutState.logs.shift();
}

function runPipeline(platform) {
  const dir = platform === 'sharechat' ? SHARECHAT_DIR : SNAPCHAT_DIR;
  const skipFlags = platform === 'snapchat' ? '--skip-api' : '';
  const cmd = `node scripts/run-pipeline.js --fresh ${skipFlags}`;

  logScout(`[${platform}] Starting: ${cmd}`);
  logScout(`[${platform}] CWD: ${dir}`);

  return new Promise((resolve) => {
    exec(cmd, { cwd: dir, timeout: 600000, env: { ...process.env } }, (err, stdout, stderr) => {
      if (err) {
        logScout(`[${platform}] FAILED: ${err.message}`);
        if (stderr) logScout(`[${platform}] STDERR: ${stderr.slice(0, 500)}`);
        resolve({ success: false, platform, error: err.message });
      } else {
        // Log the last 5 lines of stdout for evidence
        const lastLines = stdout.trim().split('\n').slice(-5).join(' | ');
        logScout(`[${platform}] SUCCESS: ${lastLines}`);
        resolve({ success: true, platform });
      }
    });
  });
}

// POST /api/scout → starts pipelines in background, returns immediately
app.post('/api/scout', (req, res) => {
  if (scoutState.running) {
    return res.json({ status: 'running', startedAt: scoutState.startedAt, logs: scoutState.logs });
  }

  // Reset state and start
  scoutState = {
    running: true,
    startedAt: new Date().toISOString(),
    completedAt: null,
    results: null,
    error: null,
    logs: [],
  };

  logScout('Scouting started');

  const platforms = (req.body.platforms || ['sharechat', 'snapchat']);

  // Fire and forget — don't await
  Promise.all(platforms.map(p => runPipeline(p)))
    .then(runs => {
      const data = {
        sharechat: readResults('sharechat'),
        snapchat: readResults('snapchat'),
        runs: runs.map(r => ({ platform: r.platform, success: r.success, error: r.error })),
      };
      scoutState.results = data;
      scoutState.completedAt = new Date().toISOString();
      logScout(`Scouting complete. ShareChat: ${data.sharechat.report?.candidates?.length || 0} creators, Snapchat: ${data.snapchat.report?.candidates?.length || 0} creators`);
    })
    .catch(err => {
      scoutState.error = err.message;
      logScout(`Scouting FAILED: ${err.message}`);
    })
    .finally(() => {
      scoutState.running = false;
    });

  // Return immediately
  res.json({ status: 'started', startedAt: scoutState.startedAt });
});

// GET /api/scout/status → poll for progress
app.get('/api/scout/status', (req, res) => {
  if (scoutState.running) {
    return res.json({
      status: 'running',
      startedAt: scoutState.startedAt,
      logs: scoutState.logs,
    });
  }

  if (scoutState.results) {
    return res.json({
      status: 'complete',
      startedAt: scoutState.startedAt,
      completedAt: scoutState.completedAt,
      data: scoutState.results,
      logs: scoutState.logs,
    });
  }

  if (scoutState.error) {
    return res.json({
      status: 'error',
      error: scoutState.error,
      logs: scoutState.logs,
    });
  }

  res.json({ status: 'idle' });
});

// ─── Start ───

const PORT = process.env.PORT || 3847;
app.listen(PORT, () => {
  console.log(`\n  Omnipresence v2.1 running on port ${PORT}\n`);
});
