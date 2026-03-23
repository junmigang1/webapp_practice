const iconv = require('iconv-lite');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    // Detect encoding
    let charset = 'utf-8';
    const ct = response.headers.get('content-type') || '';
    if (/euc-kr|euckr/i.test(ct)) {
      charset = 'euc-kr';
    } else if (/ms949|cp949/i.test(ct)) {
      charset = 'ms949';
    } else {
      const peek = buffer.slice(0, 2000).toString('ascii');
      if (/euc-kr|euckr/i.test(peek)) charset = 'euc-kr';
      else if (/ms949|ks_c_5601/i.test(peek)) charset = 'ms949';
      else {
        try {
          Buffer.from(buffer).toString('utf-8');
          charset = 'utf-8';
        } catch {
          charset = 'euc-kr';
        }
      }
    }

    const html = iconv.decode(buffer, charset);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
