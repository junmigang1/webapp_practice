const SYSTEM_PROMPT = `You are a notice extraction AI for Korean university students and job seekers.
Extract notice items from the given text and return ONLY valid JSON.

Your task:
- Extract only REAL notice items (exclude pinned/notice/fixed posts)
- Return only the latest 5 notices sorted by CREATED DATE (not position in HTML)

Output format (JSON only, no other text):
{
  "notices": [
    {
      "title": "원문 그대로의 공지 제목 (수정/요약 금지)",
      "summary": "핵심 내용 2~3문장 요약",
      "category": "창업|취업|장학금|교내행사|공모전|기타 중 하나",
      "postedAt": "YYYY-MM-DD or null",
      "deadline": "YYYY-MM-DD or null",
      "link": "URL or null"
    }
  ]
}

Category rules:
- 창업: 창업 지원, 스타트업, 창업 경진대회, BI센터
- 취업: 채용, 인턴십, 취업 공고, 리크루팅
- 장학금: 장학금, 생활비 지원, 학비 감면
- 교내행사: 학교 행사, 강연, 세미나, 워크샵, 설명회
- 공모전: 공모전, 대회, 챌린지, 해커톤
- 기타: 위에 해당하지 않는 모든 공지

Rules:
1. IGNORE pinned notices — any row where the number/index cell contains: 공지, 필독, 상단고정, notice, fixed, 중요 (or any non-numeric label). Only extract rows with a numeric index.
2. Extract ALL actual posts (up to 20). Do NOT pre-select or reduce count yourself.
3. Convert all dates to YYYY-MM-DD. Examples: "2025.03.20" → "2025-03-20", "25.03.20" → "2025-03-20".
4. If a date is unclear or missing → null.
5. postedAt: post creation/registration date (작성일, 등록일, 게시일).
6. deadline: submission/application deadline (마감일, 접수마감, 신청기간 종료일).
7. title: copy the exact original title. Do NOT modify or summarize.
8. link: extract URL from [URL] suffix on titles. Example: "title[/path]" → "/path". null if absent.
9. Return items in HTML order (do NOT sort). Sorting is done externally.
10. If content is not a notice list → return empty notices array.`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  const { text, siteName, siteUrl } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/notice-dashboard',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        max_tokens: 2048,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `다음 웹페이지 텍스트에서 최근 공지사항을 추출해주세요 (사이트: ${siteName || ''}):\n\n${text}` }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return res.status(502).json({ error: `LLM API error ${response.status}: ${body}` });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
