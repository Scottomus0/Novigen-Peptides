// api/discount.js — Novigen Peptides discount code endpoint
// POST /api/discount { code, action: 'check' | 'redeem' }
// check  — validates code, returns discount value, does NOT mark as used
// redeem — validates AND marks as used (call on order completion)

const GITHUB_OWNER  = 'Scottomus0';
const GITHUB_REPO   = 'Novigen-Peptides';
const GITHUB_FILE   = 'discount-codes.json';
const GITHUB_BRANCH = 'main';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, action } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const cleanCode = code.trim().toUpperCase();
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server configuration error' });

  try {
    // Fetch discount-codes.json from GitHub
    const fileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;
    const fileRes = await fetch(fileUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'novigen-discount'
      }
    });

    if (!fileRes.ok) return res.status(502).json({ error: 'Could not fetch discount database' });

    const fileData = await fileRes.json();
    const sha = fileData.sha;
    const codes = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    const entry = codes[cleanCode];

    // Code not found
    if (!entry) return res.status(200).json({ status: 'invalid' });

    // Code disabled
    if (entry.active === false) return res.status(200).json({ status: 'invalid' });

    // Code already used (single use)
    if (entry.maxUses && entry.uses >= entry.maxUses) {
      return res.status(200).json({ status: 'used' });
    }

    // Code expired
    if (entry.expires && new Date(entry.expires) < new Date()) {
      return res.status(200).json({ status: 'expired' });
    }

    // Valid — if action is redeem, mark as used
    if (action === 'redeem') {
      codes[cleanCode] = {
        ...entry,
        uses: (entry.uses || 0) + 1,
        last_used: new Date().toISOString()
      };

      await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'novigen-discount'
        },
        body: JSON.stringify({
          message: `Redeem: ${cleanCode}`,
          content: Buffer.from(JSON.stringify(codes, null, 2)).toString('base64'),
          sha,
          branch: GITHUB_BRANCH
        })
      });
    }

    return res.status(200).json({
      status: 'valid',
      code: cleanCode,
      type: entry.type || 'pct',
      value: entry.value,
      uses: (entry.uses || 0) + (action === 'redeem' ? 1 : 0),
      maxUses: entry.maxUses || null
    });

  } catch (err) {
    console.error('Discount error:', err);
    return res.status(500).json({ error: 'Discount service error' });
  }
};
