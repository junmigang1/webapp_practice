const ExtractAgent = (() => {
  const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  const MODEL = 'openai/gpt-4o-mini';

  const NOTICE_SCHEMA = {
    type: 'object',
    properties: {
      notices: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            category: {
              type: 'string',
              enum: ['창업', '취업', '장학금', '교내행사', '공모전', '기타']
            },
            deadline: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
            link: { type: ['string', 'null'] }
          },
          required: ['title', 'summary', 'category', 'deadline', 'link']
        },
        maxItems: 5
      }
    },
    required: ['notices']
  };

  const SYSTEM_PROMPT = `당신은 한국 대학생과 취준생을 위한 공지 수집 AI입니다.
주어진 HTML에서 최근 공지사항 최대 5개를 추출하여 아래 JSON 형식으로만 반환하세요.

출력 형식 (JSON만, 다른 텍스트 없이):
{
  "notices": [
    {
      "title": "원문 그대로의 공지 제목 (수정/요약 금지)",
      "summary": "핵심 내용 2~3문장 요약",
      "category": "창업|취업|장학금|교내행사|공모전|기타 중 하나",
      "deadline": "YYYY-MM-DD 또는 null",
      "link": "원문 URL 또는 null"
    }
  ]
}

분류 기준:
- 창업: 창업 지원, 스타트업, 창업 경진대회, BI센터
- 취업: 채용, 인턴십, 취업 공고, 리크루팅
- 장학금: 장학금, 생활비 지원, 학비 감면
- 교내행사: 학교 행사, 강연, 세미나, 워크샵, 설명회
- 공모전: 공모전, 대회, 챌린지, 해커톤
- 기타: 위에 해당하지 않는 모든 공지

규칙:
- title: 웹페이지에 표시된 공지 제목을 그대로 복사. 절대 수정하거나 요약하지 말 것
- deadline: 마감/접수 날짜를 YYYY-MM-DD로 추출. 없으면 null
- link: 제목 뒤에 붙어 있는 [URL] 형식의 경로를 추출. 예: "제목[/path/to/notice]" → link: "/path/to/notice". 없으면 null
- 한국 대학 게시판에서 번호 열에 숫자 대신 "공지"라고 표시된 행은 고정 공지(pinned)이므로 반드시 제외
- 번호가 숫자인 일반 게시글만 선택하고, 그 중 게시 날짜가 최신인 5개를 선택
- 날짜 형식 예: "2025.03.20", "25.03.20", "2025-03-20" 등 → YYYY-MM-DD로 변환
- 날짜 정보가 없는 항목보다 날짜가 있는 최신 항목을 우선
- HTML 콘텐츠가 공지 목록이 아닌 경우 notices를 빈 배열로 반환`;

  function preprocessHtml(html) {
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    // Preserve href before stripping tags: <a href="URL">text</a> → text[URL]
    cleaned = cleaned.replace(/<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, text) => `${text.replace(/<[^>]+>/g, '').trim()}[${href}]`);
    // Collapse existing newlines to spaces so each <tr> stays on one line
    cleaned = cleaned.replace(/\n/g, ' ');
    // Mark row/cell boundaries
    cleaned = cleaned.replace(/<\/tr>/gi, '\n');
    cleaned = cleaned.replace(/<\/td>/gi, '\t');
    cleaned = cleaned.replace(/<\/th>/gi, '\t');
    // Strip remaining tags
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    // Decode entities
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
    // Clean up per line
    cleaned = cleaned.split('\n')
      .map(l => l.replace(/\t+/g, '\t').replace(/[ ]{2,}/g, ' ').trim())
      .filter(l => l.length > 2)
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

  async function extract(html, site, apiKey) {
    const processed = preprocessHtml(html);
    console.log(`[ExtractAgent] 전처리 후 길이: ${processed.length}자 (원본: ${html.length}자)`);
    const truncatedHtml = processed.slice(0, 20000);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/notice-dashboard'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `다음 웹페이지 텍스트에서 최근 공지사항 최대 5개를 추출해주세요:\n\n${truncatedHtml}` }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(응답 읽기 실패)');
      throw new Error(`API 오류 ${res.status}: ${body}`);
    }

    const data = await res.json();
    console.log('[ExtractAgent] API 응답 전체:', JSON.stringify(data).slice(0, 500));
    const content = data.choices[0].message.content;
    console.log('[ExtractAgent] content:', content.slice(0, 300));

    // JSON 파싱 (마크다운 코드블록 감싸진 경우 처리)
    let parsed;
    try {
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[ExtractAgent] JSON 파싱 실패:', content);
      throw new Error(`JSON 파싱 실패: ${e.message}`);
    }

    const fetchedAt = new Date().toISOString();

    return (parsed.notices || []).map(raw => ({
      id: crypto.randomUUID(),
      sourceId: site.id,
      sourceName: site.name,
      sourceUrl: site.url,
      title: raw.title,
      summary: raw.summary,
      category: raw.category,
      deadline: raw.deadline || null,
      link: resolveUrl(raw.link, site.url),
      fetchedAt,
      isNew: true
    }));
  }

  return { extract };
})();

window.ExtractAgent = ExtractAgent;
