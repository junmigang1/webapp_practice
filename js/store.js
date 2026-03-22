const NoticeStore = (() => {
  const SITES_KEY = 'nid_sites';
  const NOTICES_KEY = 'nid_notices';
  const APIKEY_KEY = 'nid_apikey';

  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getApiKey() { return localStorage.getItem(APIKEY_KEY) || ''; }
  function setApiKey(key) { localStorage.setItem(APIKEY_KEY, key); }

  function getSites() { return load(SITES_KEY) || []; }

  function addSite(url, name) {
    const sites = getSites();
    const site = {
      id: crypto.randomUUID(),
      url,
      name,
      addedAt: new Date().toISOString(),
      lastChecked: null
    };
    sites.push(site);
    save(SITES_KEY, sites);
    return site;
  }

  function removeSite(id) {
    save(SITES_KEY, getSites().filter(s => s.id !== id));
    save(NOTICES_KEY, getNotices().filter(n => n.sourceId !== id));
  }

  function updateSiteChecked(id) {
    save(SITES_KEY, getSites().map(s =>
      s.id === id ? { ...s, lastChecked: new Date().toISOString() } : s
    ));
  }

  function getNotices() { return load(NOTICES_KEY) || []; }

  function addNotices(notices) {
    const existing = getNotices();
    const hadExisting = existing.length > 0;
    const existingTitles = new Set(existing.map(n => n.title));
    let addedCount = 0;
    const newOnes = [];
    for (const notice of notices) {
      if (!existingTitles.has(notice.title)) {
        // isNew: true only if store already had notices (not first-ever load)
        newOnes.push({ ...notice, isNew: hadExisting });
        existingTitles.add(notice.title);
        addedCount++;
      }
    }
    // Merge new + existing, then keep only latest 5 per source site
    const merged = [...newOnes, ...existing];
    const perSite = {};
    const result = [];
    for (const n of merged) {
      if (!perSite[n.sourceId]) perSite[n.sourceId] = 0;
      if (perSite[n.sourceId] < 5) {
        result.push(n);
        perSite[n.sourceId]++;
      }
    }
    save(NOTICES_KEY, result);
    return addedCount;
  }

  function markSeen(id) {
    save(NOTICES_KEY, getNotices().map(n =>
      n.id === id ? { ...n, isNew: false } : n
    ));
  }

  function clearNotices() { save(NOTICES_KEY, []); }

  return {
    getApiKey, setApiKey,
    getSites, addSite, removeSite, updateSiteChecked,
    getNotices, addNotices, markSeen, clearNotices
  };
})();

window.NoticeStore = NoticeStore;
