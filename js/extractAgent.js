const ExtractAgent = (() => {
  function preprocessHtml(html) {
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    // Preserve href before stripping tags: <a href="URL">text</a> → text[URL]
    cleaned = cleaned.replace(/<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, text) => `${text.replace(/<[^>]+>/g, '').trim()}[${href}]`);
    // Collapse existing newlines to spaces so each row stays on one line
    cleaned = cleaned.replace(/\n/g, ' ');
    // Mark row/cell boundaries
    // For list-based pages (no <tr>) use </li> and </div> as separators
    // For table-based pages use </tr>, </td>, </th> only (avoids nav menu bloat)
    const isTableBased = /<\/tr>/i.test(cleaned);
    cleaned = cleaned.replace(/<\/tr>/gi, '\n');
    cleaned = cleaned.replace(/<\/td>/gi, '\t');
    cleaned = cleaned.replace(/<\/th>/gi, '\t');
    if (!isTableBased) {
      cleaned = cleaned.replace(/<\/li>/gi, '\n');
      cleaned = cleaned.replace(/<\/div>/gi, '\t');
    }
    // Strip remaining tags
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    // Decode entities
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
    // Clean up per line, and strip pinned-notice rows
    cleaned = cleaned.split('\n')
      .map(l => l.replace(/\t+/g, '\t').replace(/[ ]{2,}/g, ' ').trim())
      .filter(l => {
        if (l.length <= 2) return false;
        const firstCell = l.split('\t')[0].trim().replace(/[\[\]]/g, '');
        if (/공지|필독|상단고정|중요/i.test(firstCell)) return false;
        if (/^(notice|fixed|important)$/i.test(firstCell)) return false;
        return true;
      })
      .join('\n');
    return cleaned;
  }

  function resolveUrl(link, siteUrl) {
    if (!link) return null;
    try {
      if (link.startsWith('http')) return link;
      const base = new URL(siteUrl);
      return new URL(link, base.origin).href;
    } catch {
      return link;
    }
  }

  async function extract(html, site) {
    const processed = preprocessHtml(html);
    console.log(`[ExtractAgent] 전처리 후 길이: ${processed.length}자 (원본: ${html.length}자)`);
    const truncatedText = processed.slice(0, 40000);

    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: truncatedText,
        siteName: site.name,
        siteUrl: site.url,
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`추출 오류 ${res.status}: ${err.error}`);
    }

    const parsed = await res.json();
    console.log('[ExtractAgent] 서버 응답:', JSON.stringify(parsed).slice(0, 300));

    const fetchedAt = new Date().toISOString();

    return (parsed.notices || [])
      .map(raw => ({
        id: crypto.randomUUID(),
        sourceId: site.id,
        sourceName: site.name,
        sourceUrl: site.url,
        title: raw.title,
        summary: raw.summary,
        category: raw.category,
        postedAt: raw.postedAt || null,
        deadline: raw.deadline || null,
        link: resolveUrl(raw.link, site.url),
        fetchedAt,
        isNew: true
      }))
      .sort((a, b) => {
        if (a.postedAt && b.postedAt) return b.postedAt.localeCompare(a.postedAt);
        if (a.postedAt) return -1;
        if (b.postedAt) return 1;
        return 0;
      })
      .slice(0, 5);
  }

  return { extract };
})();

window.ExtractAgent = ExtractAgent;
