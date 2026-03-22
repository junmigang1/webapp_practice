const FetchAgent = (() => {
  // 1순위: 로컬 서버 프록시 (server.py가 직접 요청, 가장 안정적)
  async function fetchViaLocalServer(url) {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`로컬 프록시 오류: ${err.error || res.status}`);
    }
    const html = await res.text();
    if (!html || html.length < 500) throw new Error('응답이 너무 짧음');
    return html;
  }

  // 2순위: 외부 CORS 프록시 폴백
  const FALLBACK_PROXIES = [
    {
      name: 'allorigins',
      transform: url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      parse: res => res.json().then(data => data.contents)
    },
    {
      name: 'corsproxy.io',
      transform: url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      parse: res => res.text()
    }
  ];

  function isProxyOwnPage(content) {
    return content.includes('CORSPROXY') || content.includes('allorigins.win') || content.includes('codetabs.com');
  }

  async function fetchWithFallback(targetUrl, proxy) {
    const res = await fetch(proxy.transform(targetUrl), {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = await proxy.parse(res);
    if (!content || content.length < 500) throw new Error(`응답 너무 짧음`);
    if (isProxyOwnPage(content)) throw new Error('프록시 자체 페이지 반환');
    return content;
  }

  async function fetchUrl(url) {
    // 1순위: 로컬 서버 프록시
    try {
      const html = await fetchViaLocalServer(url);
      console.log(`[FetchAgent] Success via local server for ${url}`);
      return html;
    } catch (err) {
      console.warn(`[FetchAgent] Local server failed:`, err.message);
    }

    // 2순위: 외부 프록시 폴백
    const errors = [];
    for (const proxy of FALLBACK_PROXIES) {
      try {
        const html = await fetchWithFallback(url, proxy);
        console.log(`[FetchAgent] Success via "${proxy.name}" for ${url}`);
        return html;
      } catch (err) {
        console.warn(`[FetchAgent] Proxy "${proxy.name}" failed:`, err.message);
        errors.push(`${proxy.name}: ${err.message}`);
      }
    }
    throw new Error(`모든 프록시 실패:\n${errors.join('\n')}`);
  }

  return { fetch: fetchUrl };
})();

window.FetchAgent = FetchAgent;
