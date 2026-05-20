// api/discount-admin.js — Admin endpoint to create/deactivate discount codes
// POST { action: 'create', code, type, value, maxUses, note }
// POST { action: 'deactivate', code }

const GITHUB_OWNER  = 'Scottomus0';
const GITHUB_REPO   = 'Novigen-Peptides';
const GITHUB_FILE   = 'discount-codes.json';
const GITHUB_BRANCH = 'main';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Simple admin key check
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { action, code, type, value, maxUses, note } = req.body || {};
  const token = process.env.GITHUB_TOKEN;

  try {
    const fileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;
    const fileRes = await fetch(fileUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'novigen-admin' }
    });
    const fileData = await fileRes.json();
    const sha = fileData.sha;
    const codes = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    if (action === 'create') {
      const cleanCode = code.trim().toUpperCase();
      codes[cleanCode] = { type: type || 'pct', value: Number(value), maxUses: maxUses || 1, uses: 0, active: true, note: note || '', created: new Date().toISOString() };
      await fetch(fileUrl, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'novigen-admin' },
        body: JSON.stringify({ message: `Add discount: ${cleanCode}`, content: Buffer.from(JSON.stringify(codes, null, 2)).toString('base64'), sha, branch: GITHUB_BRANCH })
      });
      return res.status(200).json({ status: 'created', code: cleanCode });
    }

    if (action === 'deactivate') {
      const cleanCode = code.trim().toUpperCase();
      if (codes[cleanCode]) { codes[cleanCode].active = false; }
      await fetch(fileUrl, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'novigen-admin' },
        body: JSON.stringify({ message: `Deactivate discount: ${cleanCode}`, content: Buffer.from(JSON.stringify(codes, null, 2)).toString('base64'), sha, branch: GITHUB_BRANCH })
      });
      return res.status(200).json({ status: 'deactivated', code: cleanCode });
    }

    if (action === 'list') {
      return res.status(200).json({ codes });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Admin error:', err);
    return res.status(500).json({ error: 'Admin service error' });
  }
};
