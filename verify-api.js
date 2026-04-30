// api/verify.js — Novigen Peptides verification endpoint
// Deployed as a Vercel serverless function
// Reads codes.json from GitHub, checks the code, updates scan count via GitHub API

const GITHUB_OWNER = 'Scottomus0';
const GITHUB_REPO  = 'Novigen-Peptides';
const GITHUB_FILE  = 'codes.json';
const GITHUB_BRANCH = 'main';

export default async function handler(req, res) {
  // CORS — allow requests from your domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing code' });
  }

  const cleanCode = code.trim().toUpperCase();
  const token     = process.env.GITHUB_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'Server configuration error — missing token' });
  }

  try {
    // ── 1. Fetch current codes.json from GitHub ──
    const fileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;
    const fileRes = await fetch(fileUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept:        'application/vnd.github.v3+json',
        'User-Agent':  'novigen-verify'
      }
    });

    if (!fileRes.ok) {
      return res.status(502).json({ error: 'Could not fetch code database' });
    }

    const fileData = await fileRes.json();
    const sha      = fileData.sha;
    const codes    = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    // ── 2. Look up the code ──
    const entry = codes[cleanCode];

    if (!entry) {
      return res.status(200).json({ status: 'invalid', code: cleanCode });
    }

    const now       = new Date().toISOString();
    const scanCount = (entry.scan_count || 0) + 1;
    const isFirst   = entry.scan_count === 0;

    // ── 3. Update the entry ──
    codes[cleanCode] = {
      ...entry,
      scan_count:    scanCount,
      first_scanned: entry.first_scanned || now,
      last_scanned:  now
    };

    // ── 4. Write updated codes.json back to GitHub ──
    const updateRes = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept:        'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent':   'novigen-verify'
      },
      body: JSON.stringify({
        message:  `Verify: ${cleanCode} scan #${scanCount}`,
        content:  Buffer.from(JSON.stringify(codes, null, 2)).toString('base64'),
        sha:      sha,
        branch:   GITHUB_BRANCH
      })
    });

    if (!updateRes.ok) {
      // Still return a result even if write fails — better than leaving user hanging
      console.error('GitHub write failed:', await updateRes.text());
    }

    // ── 5. Return result ──
    return res.status(200).json({
      status:        isFirst ? 'genuine' : 'warning',
      code:          cleanCode,
      scan_count:    scanCount,
      first_scanned: codes[cleanCode].first_scanned
    });

  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: 'Verification service error' });
  }
}
