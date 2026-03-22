document.addEventListener('DOMContentLoaded', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  let currentCategory = '전체';
  let currentDetailNotice = null;

  // ── DOM helpers ─────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');

  // ── Load API key from server (.env) ─────────────────────────────────────────
  async function loadApiKeyFromServer() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return null;
      const data = await res.json();
      if (data.apiKey) {
        NoticeStore.setApiKey(data.apiKey);
        return data.apiKey;
      }
    } catch (e) {
      // 서버에서 못 불러오면 UI 입력으로 fallback
    }
    return null;
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    // .env에서 API 키 우선 로드
    await loadApiKeyFromServer();

    const apiKey = NoticeStore.getApiKey();
    const sites = NoticeStore.getSites();

    if (!apiKey) {
      show($('setup-screen'));
      hide($('app-screen'));
      hide($('setup-site-step'));
    } else if (sites.length === 0) {
      show($('setup-screen'));
      hide($('app-screen'));
      show($('setup-site-step'));
    } else {
      hide($('setup-screen'));
      show($('app-screen'));
      renderSiteChips();
      renderSidebarSites();
      renderCategoryTabs();
      renderNotices();
    }

    bindEvents();
  }

  // ── Events ──────────────────────────────────────────────────────────────────
  function bindEvents() {
    // Setup: save API key
    $('btn-save-apikey').addEventListener('click', () => {
      const key = $('setup-apikey').value.trim();
      if (!key) return showInlineError('setup-apikey', 'API 키를 입력하세요');
      NoticeStore.setApiKey(key);
      show($('setup-site-step'));
      showStatus('API 키가 저장되었습니다', 'success');
    });

    // Setup: add site
    $('btn-add-setup-site').addEventListener('click', () => {
      addSiteFromInputs('setup-url', 'setup-name');
    });

    // Setup: start
    $('btn-start').addEventListener('click', () => {
      const apiKey = NoticeStore.getApiKey();
      const sites = NoticeStore.getSites();
      if (!apiKey) return showInlineError('setup-apikey', 'API 키를 먼저 저장하세요');
      if (sites.length === 0) return showInlineError('setup-url', '사이트를 먼저 추가하세요');
      hide($('setup-screen'));
      show($('app-screen'));
      renderSiteChips();
      renderCategoryTabs();
      renderNotices();
      refreshAll();
    });

    // Nav: refresh
    $('btn-refresh').addEventListener('click', refreshAll);

    // Nav: settings
    $('btn-settings').addEventListener('click', openSettings);

    // Sidebar: add site button
    const sidebarAddBtn = $('btn-sidebar-add');
    if (sidebarAddBtn) sidebarAddBtn.addEventListener('click', openSettings);

    // Settings modal
    $('btn-close-settings').addEventListener('click', closeSettings);
    $('settings-modal').addEventListener('click', e => {
      if (e.target === $('settings-modal')) closeSettings();
    });

    // Settings: add site
    $('btn-add-settings-site').addEventListener('click', () => {
      const added = addSiteFromInputs('settings-url', 'settings-name');
      if (added) {
        renderSettingsSiteList();
        renderSiteChips();
        renderSidebarSites();
        renderCategoryTabs();
      }
    });

    // Settings: clear notices
    $('btn-clear-notices').addEventListener('click', () => {
      if (confirm('모든 공지를 삭제하시겠습니까?')) {
        NoticeStore.clearNotices();
        renderNotices();
        renderCategoryTabs();
        showStatus('공지가 초기화되었습니다', 'success');
      }
    });

    // Detail modal
    $('btn-close-detail').addEventListener('click', closeDetail);
    $('notice-detail-modal').addEventListener('click', e => {
      if (e.target === $('notice-detail-modal')) closeDetail();
    });
    $('btn-detail-calendar').addEventListener('click', () => {
      if (currentDetailNotice) CalendarAgent.addToCalendar(currentDetailNotice);
    });
    $('btn-detail-link').addEventListener('click', () => {
      if (currentDetailNotice && currentDetailNotice.link) {
        window.open(currentDetailNotice.link, '_blank');
      }
    });
  }

  // ── Site helpers ────────────────────────────────────────────────────────────
  function addSiteFromInputs(urlId, nameId) {
    const urlEl = $(urlId);
    const nameEl = $(nameId);
    const url = urlEl.value.trim();
    const name = nameEl.value.trim();

    if (!url) return showInlineError(urlId, 'URL을 입력하세요');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return showInlineError(urlId, 'http:// 또는 https:// 로 시작해야 합니다');
    }
    if (!name) return showInlineError(nameId, '사이트 이름을 입력하세요');

    NoticeStore.addSite(url, name);
    urlEl.value = '';
    nameEl.value = '';
    return true;
  }

  // ── Render: sidebar sites ────────────────────────────────────────────────────
  function renderSidebarSites() {
    const list = $('sidebar-sites-list');
    if (!list) return;
    const sites = NoticeStore.getSites();
    if (sites.length === 0) {
      list.innerHTML = '<div class="sidebar-empty">등록된 사이트 없음</div>';
      return;
    }
    list.innerHTML = '';
    sites.forEach(site => {
      const item = document.createElement('div');
      item.className = 'sidebar-site-item';
      const lastChecked = site.lastChecked
        ? formatDate(site.lastChecked)
        : '미확인';
      item.innerHTML = `
        <div class="sidebar-site-name">${escapeHtml(site.name)}</div>
        <div class="sidebar-site-url">${escapeHtml(site.url)}</div>
        <div class="sidebar-site-meta">마지막 확인: ${lastChecked}</div>
      `;
      list.appendChild(item);
    });
  }

  // ── Render: site chips ───────────────────────────────────────────────────────
  function renderSiteChips() {
    const container = $('site-chips-container');
    const sites = NoticeStore.getSites();
    container.innerHTML = '';

    sites.forEach(site => {
      const chip = document.createElement('span');
      chip.className = 'site-chip';
      chip.dataset.id = site.id;
      chip.innerHTML = `${escapeHtml(site.name)} <button class="chip-remove" data-id="${site.id}" title="삭제">×</button>`;
      container.appendChild(chip);
    });

    const addChip = document.createElement('span');
    addChip.className = 'site-chip add-chip';
    addChip.id = 'btn-add-chip';
    addChip.textContent = '+ 추가';
    addChip.addEventListener('click', openSettings);
    container.appendChild(addChip);

    container.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        NoticeStore.removeSite(id);
        renderSiteChips();
        renderSidebarSites();
        renderCategoryTabs();
        renderNotices();
      });
    });
  }

  // ── Render: category tabs ────────────────────────────────────────────────────
  function renderCategoryTabs() {
    const container = $('category-tabs-container');
    const notices = NoticeStore.getNotices();
    const categories = ['전체', '창업', '취업', '장학금', '교내행사', '공모전', '기타'];

    const counts = { '전체': notices.length };
    categories.slice(1).forEach(cat => {
      counts[cat] = notices.filter(n => n.category === cat).length;
    });

    container.innerHTML = '';
    categories.forEach(cat => {
      const tab = document.createElement('button');
      tab.className = `cat-tab${cat === currentCategory ? ' active' : ''}`;
      tab.dataset.cat = cat;
      tab.innerHTML = `${cat} <span class="tab-count">${counts[cat]}</span>`;
      tab.addEventListener('click', () => {
        currentCategory = cat;
        renderCategoryTabs();
        renderNotices();
      });
      container.appendChild(tab);
    });
  }

  // ── Render: notices ──────────────────────────────────────────────────────────
  function renderNotices() {
    const grid = $('notices-grid');
    const emptyState = $('empty-state');
    const loadingState = $('loading-state');

    let notices = NoticeStore.getNotices();
    if (currentCategory !== '전체') {
      notices = notices.filter(n => n.category === currentCategory);
    }

    // Sort: NEW first, then by fetchedAt desc
    notices.sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return new Date(b.fetchedAt) - new Date(a.fetchedAt);
    });

    // Remove old cards (keep empty/loading states)
    grid.querySelectorAll('.notice-card').forEach(el => el.remove());

    if (notices.length === 0) {
      show(emptyState);
    } else {
      hide(emptyState);
      notices.forEach(notice => {
        const card = buildNoticeCard(notice);
        grid.appendChild(card);
      });
    }

    // Update count
    const newCount = notices.filter(n => n.isNew).length;
    $('notice-count').textContent = newCount > 0
      ? `${notices.length}개 공지 (${newCount}개 신규)`
      : `${notices.length}개 공지`;
  }

  function buildNoticeCard(notice) {
    const card = document.createElement('div');
    card.className = 'notice-card';
    card.dataset.id = notice.id;

    const urgent = notice.deadline && isUrgent(notice.deadline);

    card.innerHTML = `
      <div class="card-top">
        ${notice.isNew ? '<span class="badge-new">NEW</span>' : ''}
        <span class="cat-tag cat-${notice.category}">${notice.category}</span>
        <span class="card-source">${escapeHtml(notice.sourceName)}</span>
      </div>
      <div class="card-title">${escapeHtml(notice.title)}</div>
      <div class="card-summary">${escapeHtml(notice.summary)}</div>
      <div class="card-bottom">
        <span class="card-deadline${urgent ? ' urgent' : ''}">
          ${notice.deadline ? `📅 ${notice.deadline}` : ''}
        </span>
        <div class="card-actions">
          <button class="btn-cal" data-id="${notice.id}">📅 캘린더</button>
          ${notice.link ? `<button class="btn-link" data-id="${notice.id}">🔗 원문</button>` : ''}
        </div>
      </div>
    `;

    // Card click → detail modal
    card.addEventListener('click', e => {
      if (!e.target.closest('button')) {
        openDetailModal(notice);
      }
    });

    // Calendar button
    card.querySelector('.btn-cal').addEventListener('click', e => {
      e.stopPropagation();
      CalendarAgent.addToCalendar(notice);
      NoticeStore.markSeen(notice.id);
      renderNotices();
    });

    // Link button
    const linkBtn = card.querySelector('.btn-link');
    if (linkBtn) {
      linkBtn.addEventListener('click', e => {
        e.stopPropagation();
        window.open(notice.link, '_blank');
        NoticeStore.markSeen(notice.id);
        renderNotices();
      });
    }

    return card;
  }

  // ── Detail modal ─────────────────────────────────────────────────────────────
  function openDetailModal(notice) {
    currentDetailNotice = notice;
    NoticeStore.markSeen(notice.id);

    $('detail-category').innerHTML = `<span class="cat-tag cat-${notice.category}">${notice.category}</span>`;
    $('detail-title').textContent = notice.title;
    $('detail-meta').textContent =
      `${notice.sourceName} · ${formatDate(notice.fetchedAt)}` +
      (notice.deadline ? ` · 마감: ${notice.deadline}` : '');
    $('detail-summary').textContent = notice.summary;

    if (notice.link) {
      show($('btn-detail-link'));
    } else {
      hide($('btn-detail-link'));
    }

    show($('notice-detail-modal'));
    renderNotices();
  }

  function closeDetail() {
    hide($('notice-detail-modal'));
    currentDetailNotice = null;
  }

  // ── Settings modal ───────────────────────────────────────────────────────────
  function openSettings() {
    renderSettingsSiteList();
    show($('settings-modal'));
  }

  function closeSettings() {
    hide($('settings-modal'));
  }

  function renderSettingsSiteList() {
    const list = $('settings-sites-list');
    const sites = NoticeStore.getSites();
    list.innerHTML = '';

    if (sites.length === 0) {
      list.innerHTML = '<div class="empty-sites">등록된 사이트가 없습니다</div>';
      return;
    }

    sites.forEach(site => {
      const item = document.createElement('div');
      item.className = 'settings-site-item';
      item.innerHTML = `
        <div class="site-info">
          <div class="site-name">${escapeHtml(site.name)}</div>
          <div class="site-url">${escapeHtml(site.url)}</div>
        </div>
        <button class="btn-remove-site" data-id="${site.id}">삭제</button>
      `;
      item.querySelector('.btn-remove-site').addEventListener('click', () => {
        NoticeStore.removeSite(site.id);
        renderSettingsSiteList();
        renderSiteChips();
        renderSidebarSites();
        renderCategoryTabs();
        renderNotices();
      });
      list.appendChild(item);
    });
  }

  // ── Refresh all ──────────────────────────────────────────────────────────────
  async function refreshAll() {
    const apiKey = NoticeStore.getApiKey();
    const sites = NoticeStore.getSites();

    if (!apiKey) {
      showStatus('API 키를 먼저 설정해주세요', 'error');
      return;
    }
    if (sites.length === 0) {
      showStatus('사이트를 먼저 등록해주세요', 'warn');
      return;
    }

    $('btn-refresh').disabled = true;
    showLoadingState(true);
    showStatus('공지 수집 중...', 'loading');

    let totalNew = 0;
    const errors = [];

    console.log(`[App] 새로고침 시작 - 사이트 ${sites.length}개, API키: ${apiKey.slice(0,12)}...`);

    for (const site of sites) {
      try {
        showStatus(`${site.name} 수집 중...`, 'loading');
        console.log(`[App] ${site.name} HTML 가져오는 중...`);
        const html = await FetchAgent.fetch(site.url);
        console.log(`[App] ${site.name} HTML 수신: ${html.length}자`);
        const notices = await ExtractAgent.extract(html, site, apiKey);
        console.log(`[App] ${site.name} 공지 추출: ${notices.length}개`, notices);
        const added = NoticeStore.addNotices(notices);
        console.log(`[App] ${site.name} 저장: ${added}개 신규`);
        totalNew += added;
        NoticeStore.updateSiteChecked(site.id);
      } catch (e) {
        console.error(`[App] ${site.name} 오류:`, e);
        errors.push(`${site.name}: ${e.message}`);
      }
    }
    console.log(`[App] 완료 - 총 ${totalNew}개 신규, 저장된 공지:`, NoticeStore.getNotices().length);

    showLoadingState(false);
    renderNotices();
    renderCategoryTabs();
    renderSidebarSites();
    $('btn-refresh').disabled = false;

    if (errors.length > 0 && totalNew === 0) {
      // 전부 실패
      const firstErr = errors[0];
      if (firstErr.includes('401') || firstErr.includes('403')) {
        showStatus('API 키가 유효하지 않습니다. 설정에서 확인해주세요.', 'error');
      } else if (firstErr.includes('프록시')) {
        showStatus('사이트 접근 실패. URL을 확인해주세요.', 'error');
      } else {
        showStatus(`오류 발생: ${firstErr}`, 'error');
      }
      console.warn('[App] 오류 목록:', errors);
    } else if (errors.length > 0) {
      showStatus(`완료 (${totalNew}개 신규, ${errors.length}개 오류)`, 'warn');
      console.warn('[App] 오류 목록:', errors);
    } else {
      showStatus(`완료! ${totalNew}개 신규 공지`, 'success');
    }
  }

  // ── Status bar ───────────────────────────────────────────────────────────────
  let statusTimer = null;
  function showStatus(message, type) {
    const el = $('status-text');
    el.textContent = (type === 'loading' ? '⏳ ' : '') + message;
    el.className = `status-${type || 'default'}`;
    clearTimeout(statusTimer);
    if (type !== 'loading') {
      statusTimer = setTimeout(() => {
        el.textContent = '준비';
        el.className = '';
      }, 5000);
    }
  }

  function showLoadingState(show) {
    const el = $('loading-state');
    if (show) {
      el.classList.remove('hidden');
      $('empty-state').classList.add('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  // ── Utility ──────────────────────────────────────────────────────────────────
  function isUrgent(deadline) {
    const diff = new Date(deadline) - new Date();
    return diff >= 0 && diff < 7 * 24 * 60 * 60 * 1000;
  }

  function formatDate(isoString) {
    const d = new Date(isoString);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showInlineError(inputId, msg) {
    const el = $(inputId);
    el.style.borderColor = '#EF4444';
    el.placeholder = msg;
    el.value = '';
    setTimeout(() => {
      el.style.borderColor = '';
      el.placeholder = el.dataset.placeholder || '';
    }, 2000);
  }

  // ── Start ────────────────────────────────────────────────────────────────────
  init();
});
