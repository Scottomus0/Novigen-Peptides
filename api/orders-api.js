// api/orders.js — Save and retrieve orders
// POST { action: 'save', order: {...} }
// POST { action: 'list', adminKey }

const GITHUB_OWNER  = 'Scottomus0';
const GITHUB_REPO   = 'Novigen-Peptides';
const GITHUB_FILE   = 'orders.json';
const GITHUB_BRANCH = 'main';

async function getFile(token) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'novigen-orders' }
  });
  if (res.status === 404) return { sha: null, data: [] };
  const fileData = await res.json();
  return { sha: fileData.sha, url, data: JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8')) };
}

async function saveFile(token, url, sha, data) {
  const body = { message: `Order saved`, content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  await fetch(url || `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'novigen-orders' },
    body: JSON.stringify(body)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.GITHUB_TOKEN;
  const { action, order } = req.body || {};

  try {
    if (action === 'save') {
      const { sha, url, data } = await getFile(token);
      const fileUrl = url || `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
      data.push({ ...order, savedAt: new Date().toISOString() });
      await saveFile(token, fileUrl, sha, data);
      return res.status(200).json({ status: 'saved' });
    }

    if (action === 'list') {
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorised' });
      const { data } = await getFile(token);
      return res.status(200).json({ orders: data });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Orders error:', err);
    return res.status(500).json({ error: 'Orders service error' });
  }
};
