/* ============================================================
   ClearWords — Shared Runtime
   Loaded by learn.html, practice.html, community.html, profile.html,
   and onboarding.html.
   ============================================================ */

/* ============================================================
   1. CONFIG
   ============================================================ */
const CW_CONFIG = {
  API_BASE: 'https://clearwords-backend.onrender.com',
  REQUEST_TIMEOUT: 12000,
  TOKEN_KEY: 'cw_jwt',
  LANG_KEY: 'cw_language',
  THEME_KEY: 'cw_theme',
  ONBOARDING_KEY: 'cw_onboarding',
  LAST_LESSON_KEY: 'cw_last_lesson',
  SUPABASE_URL: 'https://megxgmsivslzdxaqxxpl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZ3hnbXNpdnNsemR4YXF4eHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NzA4MzIsImV4cCI6MjEwMDA0NjgzMn0.hJmwvrXhhGADlHxkciTzq2TgQo25QCdKv142at9_jyw',
  SUPABASE_BUCKET: 'audio',
  LANGUAGES: {
    yoruba:  { name: 'Yorùbá',  emoji: '👑', voice: 'titilayo_yo', speaker: 'titilayo_yo', ttsLang: 'yo-NG' },
    igbo:    { name: 'Igbo',    emoji: '🌍', voice: 'azubuike_ig', speaker: 'azubuike_ig', ttsLang: 'ig-NG' },
    hausa:   { name: 'Hausa',   emoji: '🕌', voice: 'usman_ha',    speaker: 'usman_ha',    ttsLang: 'ha-NG' },
    pidgin:  { name: 'Pidgin',  emoji: '🗣️', voice: 'james_pcm',   speaker: 'james_pcm',   ttsLang: 'en-NG' },
    urhobo:  { name: 'Urhobo',  emoji: '⚓', voice: 'titilayo_yo', speaker: 'titilayo_yo', ttsLang: 'en-NG' },
    itsekiri:{ name: 'Itsekiri',emoji: '⚖️', voice: 'titilayo_yo', speaker: 'titilayo_yo', ttsLang: 'en-NG' }
  }
};

/* ============================================================
   2. AUTH
   ============================================================ */
const Auth = {
  getToken() { return localStorage.getItem(CW_CONFIG.TOKEN_KEY); },
  setToken(t) { localStorage.setItem(CW_CONFIG.TOKEN_KEY, t); },
  clear() {
    localStorage.removeItem(CW_CONFIG.TOKEN_KEY);
    localStorage.removeItem('cw_user');
  },
  isLoggedIn() { return !!this.getToken(); },
  getUser() {
    try { return JSON.parse(localStorage.getItem('cw_user') || 'null'); }
    catch { return null; }
  },
  setUser(u) { localStorage.setItem('cw_user', JSON.stringify(u)); }
};

/* ============================================================
   3. API CLIENT
   ============================================================ */
class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiRequest(path, opts = {}) {
  const {
    method = 'GET', body, params, auth = true,
    timeout = CW_CONFIG.REQUEST_TIMEOUT, raw = false
  } = opts;

  let url = CW_CONFIG.API_BASE + path;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    if (qs) url += '?' + qs;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = Auth.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.status === 401 && auth) {
      Auth.clear();
      localStorage.removeItem(CW_CONFIG.LANG_KEY);
      window.dispatchEvent(new CustomEvent('cw:auth-expired'));
      throw new ApiError('Session expired', 401, 'auth_expired');
    }

    if (raw) {
      if (!res.ok) {
        let msg = 'Request failed (' + res.status + ')';
        try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
        throw new ApiError(msg, res.status);
      }
      return res;
    }

    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch {}
    } else {
      try { data = await res.text(); } catch {}
    }

    if (!res.ok) {
      throw new ApiError(
        (data && (data.message || data.error)) || ('Request failed (' + res.status + ')'),
        res.status
      );
    }
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new ApiError('Request timed out', 0, 'timeout');
    if (err instanceof ApiError) throw err;
    throw new ApiError('Network unavailable', 0, 'network');
  }
}

const api = {
  get:    (p, o)    => apiRequest(p, { ...o, method: 'GET' }),
  post:   (p, b, o) => apiRequest(p, { ...o, method: 'POST', body: b }),
  put:    (p, b, o) => apiRequest(p, { ...o, method: 'PUT', body: b }),
  patch:  (p, b, o) => apiRequest(p, { ...o, method: 'PATCH', body: b }),
  delete: (p, o)    => apiRequest(p, { ...o, method: 'DELETE' }),
  raw:    (p, o)    => apiRequest(p, { ...o, raw: true })
};

/* ============================================================
   4. NAMED BACKEND ENDPOINTS
   ============================================================ */
const Backend = {
  signup: (payload) => api.post('/api/auth/signup', payload, { auth: false }),
  login:  (email, password) => api.post('/api/auth/login', { email, password }, { auth: false }),
  me:     () => api.get('/api/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/api/auth/change-password', { currentPassword, newPassword }),

  updateProfile: (payload) => api.put('/api/users/profile', payload),
  getUser: (identifier) => api.get('/api/users/' + encodeURIComponent(identifier)),
  getUserStats: (userId) => api.get('/api/users/' + userId + '/stats', { auth: false }),

  getProgress: (language) => api.get('/api/progress', { params: { language } }),
  completeLesson: (payload) => api.post('/api/progress/complete-lesson', {
    language: payload.language || State.currentLanguage,
    levelId: payload.levelId ?? payload.levelNumber,
    lessonId: payload.lessonId,
    perfect: payload.perfect || false,
    timeSpentSeconds: payload.timeSpentSeconds || 0,
    mistakesCount: payload.mistakesCount || 0,
    source: payload.source || 'curriculum',
    timezoneOffsetMinutes: -new Date().getTimezoneOffset()
  }),
  syncProgress: (payload) => api.post('/api/progress/sync', payload),
  resetProgress: (language) => api.delete('/api/progress/' + language),

  getCurriculum: (language) => api.get('/api/curriculum/' + language, { auth: false }),
  getCurriculumVersion: (language) => api.get('/api/curriculum/version/' + language, { auth: false }),

  aiChat: (prompt, context) => {
    const tz = -new Date().getTimezoneOffset();
    const fullPrompt = context ? context + '\n\n' + prompt : prompt;
    return api.post('/api/ai/chat', { prompt: fullPrompt, timezoneOffsetMinutes: tz });
  },
  generateCustomLesson: (payload) => {
    const tz = -new Date().getTimezoneOffset();
    const body = typeof payload === 'string'
      ? { prompt: payload, timezoneOffsetMinutes: tz }
      : {
          topic: payload.topic,
          language: payload.language || State.currentLanguage,
          level: payload.level || 'beginner',
          context: payload.context,
          timezoneOffsetMinutes: tz
        };
    return api.post('/api/ai/custom-lesson', body);
  },
  getAIUsage: () => api.get('/api/ai/usage'),

  listPods: () => api.get('/api/pods'),
  createPod: (payload) => api.post('/api/pods', payload),
  matchPod: (payload) => api.post('/api/pods/match', payload || {}),
  joinPod: (podId, inviteCode) => api.post('/api/pods/' + podId + '/join', { inviteCode }),
  joinPodByCode: (inviteCode) => api.post('/api/pods/join-by-code', { inviteCode }),
  leavePod: (podId) => api.delete('/api/pods/' + podId + '/leave'),
  getPodMessages: (podId, params) => api.get('/api/pods/' + podId + '/messages', { params }),
  sendPodMessage: (podId, content) => api.post('/api/pods/' + podId + '/messages', { text: content }),
  podCheckin: (podId, lessonsCompleted) =>
    api.post('/api/pods/' + podId + '/checkin', { lessonsCompleted: lessonsCompleted || 0 }),
  podLeaderboard: (podId) => api.get('/api/pods/' + podId + '/leaderboard'),

  listPairs: () => api.get('/api/pairs'),
  requestPair: (targetUserId, languageA, languageB) =>
    api.post('/api/pairs/request', {
      targetUserId,
      languageA: languageA || State.currentLanguage,
      languageB: languageB || 'english'
    }),
  matchPair: () => api.post('/api/pairs/match'),
  acceptPair: (pairId) => api.post('/api/pairs/' + pairId + '/accept'),
  endPair: (pairId) => api.delete('/api/pairs/' + pairId),
  getPairMessages: (pairId, params) => api.get('/api/pairs/' + pairId + '/messages', { params }),
  sendPairMessage: (pairId, content) => api.post('/api/pairs/' + pairId + '/messages', { text: content }),
  startPairCall: (pairId, type) => api.post('/api/pairs/' + pairId + '/call/start', { type }),

  createCard: (payload) => api.post('/api/cards', payload),
  renderCard: (cardId) => api.post('/api/cards/' + cardId + '/render'),
  listMyCards: () => api.get('/api/cards/mine'),
  shareCardToPod: (cardId, podId) => api.post('/api/cards/' + cardId + '/share/pod/' + podId),
  shareCardExternal: (cardId) => api.post('/api/cards/' + cardId + '/share/external'),

  listNotifications: (params) => api.get('/api/notifications', { params }),
  unreadCount: () => api.get('/api/notifications/unread'),
  markNotificationRead: (id) => api.put('/api/notifications/' + id + '/read'),
  markAllNotificationsRead: () => api.put('/api/notifications/read-all'),
  deleteNotification: (id) => api.delete('/api/notifications/' + id),

  submitReport: (payload) => api.post('/api/reports', payload),
  myReports: () => api.get('/api/reports/mine'),

  getSubscription: () => api.get('/api/subscription'),
  getPlans: () => api.get('/api/subscription/plans', { auth: false }),
  initPayment: (tier, billingCycle = 'monthly', currency = 'NGN') =>
    api.post('/api/subscription/initialize', { tier, billingCycle, currency }),
  verifyPayment: (reference) => api.post('/api/subscription/verify/' + reference),

  myReferrals: () => api.get('/api/referrals/me'),
  redeemReferral: (code) => api.post('/api/referrals/redeem', { code }),
  claimReferral: () => api.post('/api/referrals/claim'),

  getFreezes: (language) => api.get('/api/streak/freezes', { params: { language } }),
  buyFreeze: (language) => api.post('/api/streak/freezes/buy', { language }),
  toggleAutoFreeze: (autoApply) => api.post('/api/streak/freezes/toggle-auto', { autoApply }),
  recoverStreak: (language) => api.post('/api/streak/recover', { language }),

  tts: (text, voice) => api.raw('/api/tts', {
    method: 'POST',
    body: { text, voice: voice || 'titilayo_yo', response_format: 'mp3' },
    timeout: 25000
  }),
  ttsUsage: () => api.get('/api/tts/usage'),
  ttsCredits: () => api.get('/api/tts/credits', { auth: false })
};

/* ============================================================
   5. STATE
   ============================================================ */
const State = {
  user: null,
  progress: null,
  curriculumCache: {},
  subscription: null,
  notifications: { items: [], unread: 0 },
  currentLanguage: localStorage.getItem(CW_CONFIG.LANG_KEY) || 'yoruba',
  theme: localStorage.getItem(CW_CONFIG.THEME_KEY) || 'light',

  _listeners: {},
  on(evt, fn) {
    (this._listeners[evt] = this._listeners[evt] || []).push(fn);
    return () => {
      this._listeners[evt] = (this._listeners[evt] || []).filter(f => f !== fn);
    };
  },
  emit(evt, data) {
    (this._listeners[evt] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(e); }
    });
  },

  async hydrate() {
    if (!Auth.isLoggedIn()) return false;
    try {
      const [meRes, subRes] = await Promise.allSettled([
        Backend.me(),
        Backend.getSubscription()
      ]);

      if (meRes.status === 'fulfilled') {
        this.user = meRes.value.user || meRes.value;
        Auth.setUser(this.user);

        if (this.user && this.user.language && CW_CONFIG.LANGUAGES[this.user.language]) {
          if (this.currentLanguage !== this.user.language) {
            this.currentLanguage = this.user.language;
            localStorage.setItem(CW_CONFIG.LANG_KEY, this.user.language);
          }
        }
        this.emit('user:changed', this.user);
      } else if (meRes.reason && meRes.reason.status === 401) {
        Auth.clear();
        localStorage.removeItem(CW_CONFIG.LANG_KEY);
        return false;
      } else {
        this.user = Auth.getUser();
      }

      if (subRes.status === 'fulfilled') this.subscription = subRes.value;

      return true;
    } catch (e) {
      console.warn('State.hydrate failed:', e);
      this.user = Auth.getUser();
      return !!this.user;
    }
  },

  async loadCurriculum(language) {
    if (this.curriculumCache[language]) return this.curriculumCache[language];
    try {
      const raw = await Backend.getCurriculum(language);
      const normalized = Curriculum.normalize(raw, language);
      this.curriculumCache[language] = normalized;
      this.emit('curriculum:loaded', { language, curriculum: normalized });
      return normalized;
    } catch (e) {
      console.warn('Curriculum load failed for ' + language + ':', e);
      return null;
    }
  },

  async loadProgress(language) {
    if (!Auth.isLoggedIn()) return null;
    try {
      const data = await Backend.getProgress(language);
      this.progress = data.progress || data;
      this.emit('progress:changed', this.progress);
      return this.progress;
    } catch (e) {
      console.warn('Progress load failed:', e);
      return null;
    }
  },

  setLanguage(lang) {
    this.currentLanguage = lang;
    localStorage.setItem(CW_CONFIG.LANG_KEY, lang);
    this.emit('language:changed', lang);
  },

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem(CW_CONFIG.THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.emit('theme:changed', theme);
  }
};

/* ============================================================
   5b. LANGUAGE SETUP
   ============================================================ */
const LanguageSetup = {
  _pendingResolve: null,

  prompt() {
    return new Promise(resolve => {
      this._pendingResolve = resolve;

      const u = State.user || {};
      const learning = u.learningLanguages || [];
      const teaching = u.teachingLanguages || [];
      const primaryLang = u.language || 'yoruba';

      const allLangs = Object.entries(CW_CONFIG.LANGUAGES)
        .map(([key, cfg]) => ({ key, ...cfg }));

      const renderChips = (containerId, selected) =>
        allLangs.map(l => `
          <button type="button"
                  class="lang-chip ${selected.includes(l.key) ? 'active' : ''}"
                  data-lang="${l.key}"
                  onclick="LanguageSetup.toggle('${containerId}', '${l.key}')">
            ${l.emoji} ${l.name}
          </button>
        `).join('');

      const body = `
        <div style="font-size: 14px; color: var(--text-2); line-height: 1.5; margin-bottom: 18px;">
          To match you with the right pod and language exchange partner,
          we need to know two things. It takes 10 seconds and you can
          change it later.
        </div>

        <div class="lang-section">
          <div class="lang-section-title">
            What do you want to learn?
            <span style="color: var(--danger);">*</span>
          </div>
          <div class="lang-section-sub">
            Pick every Nigerian language you want to get better at.
          </div>
          <div class="lang-chips" id="ls-learning">
            ${renderChips('ls-learning', learning)}
          </div>
          <div class="lang-error" id="ls-learning-err"></div>
        </div>

        <div class="lang-section" style="margin-top: 18px;">
          <div class="lang-section-title">
            What can you help others with?
            <span style="color: var(--danger);">*</span>
          </div>
          <div class="lang-section-sub">
            Even a little counts — English is common. Language exchange
            is two-way: you teach, they teach.
          </div>
          <div class="lang-chips" id="ls-teaching">
            ${renderChips('ls-teaching', teaching)}
          </div>
          <div class="lang-error" id="ls-teaching-err"></div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 22px;">
          <button class="btn btn-ghost" style="flex: 1;" onclick="LanguageSetup.cancel()">
            Not now
          </button>
          <button class="btn" id="ls-save" style="flex: 2;" onclick="LanguageSetup.save()">
            Save &amp; match me
          </button>
        </div>
      `;

      Header._modal('Set up your languages', body);

      setTimeout(() => {
        ['ls-learning', 'ls-teaching'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const hasAny = el.querySelector('.lang-chip.active');
          if (!hasAny && primaryLang) {
            const btn = el.querySelector(`[data-lang="${primaryLang}"]`);
            if (btn) btn.classList.add('active');
          }
        });
      }, 50);
    });
  },

  toggle(containerId, langKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const btn = container.querySelector(`[data-lang="${langKey}"]`);
    if (!btn) return;
    btn.classList.toggle('active');
    const err = document.getElementById(containerId + '-err');
    if (err) err.textContent = '';
  },

  cancel() {
    if (this._pendingResolve) this._pendingResolve(null);
    this._pendingResolve = null;
    closeModal('cw-generic-modal');
  },

  async save() {
    const learning = Array.from(
      document.querySelectorAll('#ls-learning .lang-chip.active')
    ).map(b => b.dataset.lang);

    const teaching = Array.from(
      document.querySelectorAll('#ls-teaching .lang-chip.active')
    ).map(b => b.dataset.lang);

    if (learning.length === 0) {
      document.getElementById('ls-learning-err').textContent =
        'Pick at least one language you want to learn.';
      return;
    }
    if (teaching.length === 0) {
      document.getElementById('ls-teaching-err').textContent =
        'Pick at least one language you can help with.';
      return;
    }

    const btn = document.getElementById('ls-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-inline"></span> Saving…';

    try {
      await Backend.updateProfile({
        learningLanguages: learning,
        teachingLanguages: teaching
      });

      const me = await Backend.me();
      State.user = me.user || me;
      Auth.setUser(State.user);

      if (this._pendingResolve) {
        this._pendingResolve({ learning, teaching });
      }
      this._pendingResolve = null;
      closeModal('cw-generic-modal');
      showToast('Languages saved ✨', 'success');
    } catch (e) {
      console.error('Language setup save failed:', e);
      btn.disabled = false;
      btn.textContent = 'Save & match me';
      document.getElementById('ls-learning-err').textContent =
        e.message || 'Could not save. Check your connection.';
    }
  },

  hasLanguages() {
    const u = State.user || {};
    const learning = u.learningLanguages || [];
    const teaching = u.teachingLanguages || [];
    return learning.length > 0 && teaching.length > 0;
  },

  async ensure() {
    if (this.hasLanguages()) return true;
    const result = await this.prompt();
    return result !== null;
  }
};

/* ============================================================
   5c. PAYWALL PROMPT
   ============================================================ */
const Paywall = {
  show(opts = {}) {
    const title = opts.title || "You've hit a limit";
    const message = opts.message || 'Upgrade to Premium to keep going.';
    const benefit = opts.benefit || '';
    const feature = opts.feature || 'unknown';
    const ctaLabel = opts.ctaLabel || 'See Premium plans';

    const body = `
      <div style="text-align: center; padding: 8px 0 4px;">
        <div style="
          width: 72px; height: 72px; border-radius: 50%;
          background: rgba(232,179,60,0.14);
          border: 2px solid rgba(232,179,60,0.4);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px; font-size: 34px;
        ">🌱</div>

        <div style="font-size: 19px; font-weight: 800; margin-bottom: 8px; line-height: 1.25;">
          ${esc(title)}
        </div>

        <div style="font-size: 14px; color: var(--text-2); line-height: 1.55; max-width: 320px; margin: 0 auto;">
          ${esc(message)}
        </div>

        ${benefit ? `
          <div style="
            margin: 18px auto 0; padding: 12px 16px; max-width: 320px;
            border-radius: 12px;
            background: rgba(46,139,87,0.06);
            border: 1px solid rgba(46,139,87,0.22);
            font-size: 13px; color: var(--text-2); line-height: 1.5; text-align: left;
          ">
            <strong style="color: var(--brand);">✨ Premium</strong><br>
            ${esc(benefit)}
          </div>
        ` : ''}
      </div>

      <button class="btn btn-block" id="paywall-cta" style="margin-top: 20px;">
        ${esc(ctaLabel)}
      </button>
      <button class="btn btn-ghost btn-block" style="margin-top: 8px;" onclick="closeModal('cw-generic-modal')">
        Maybe later
      </button>
    `;

    Header._modal('Upgrade to Premium', body);

    const cta = document.getElementById('paywall-cta');
    if (cta) {
      cta.onclick = () => {
        closeModal('cw-generic-modal');
        try {
          console.log(`[paywall] upgrade CTA clicked for feature: ${feature}`);
        } catch {}
        if (location.pathname.endsWith('profile.html')) {
          if (window.Prof && typeof window.Prof.openUpgrade === 'function') {
            window.Prof.openUpgrade();
          }
        } else {
          Nav.go('profile', { upgrade: '1' });
        }
      };
    }
  },

  fromError(e) {
    if (!e) return false;

    const status = e.status;
    const message = String(e.message || '');

    const isDailyLimit = status === 429 && (/limit/i.test(message) || /daily/i.test(message));
    const isFeatureGate = status === 403 && (
      /premium/i.test(message) || /immersive/i.test(message) ||
      /tier/i.test(message) || /upgrade/i.test(message)
    );

    if (!isDailyLimit && !isFeatureGate) return false;

    if (/custom lesson/i.test(message) || /instant lesson/i.test(message)) {
      this.showCustomLessonLimit();
      return true;
    }

    if (/chat/i.test(message) || /timmy/i.test(message) || /message/i.test(message)) {
      this.showChatLimit();
      return true;
    }

    if (/pod/i.test(message)) {
      this.show({
        title: 'Pod limit reached',
        message: 'The free plan includes 3 pods. Premium lets you create your own pod.',
        benefit: 'Create your own pod, lead your own group, unlimited AI lessons.',
        feature: 'pod_create',
        ctaLabel: 'Create your own pod'
      });
      return true;
    }

    if (/pair/i.test(message) || /partner/i.test(message)) {
      this.show({
        title: 'Partner limit reached',
        message: 'The free plan includes 1 language exchange partner. Premium opens up to 5.',
        benefit: 'Up to 5 exchange partners, voice calls with them, unlimited chat.',
        feature: 'pair_limit',
        ctaLabel: 'Get more partners'
      });
      return true;
    }

    if (/voice|call/i.test(message)) {
      this.show({
        title: 'Voice calls are Premium',
        message: 'Voice calls with your language exchange partner are part of Premium.',
        benefit: 'Voice calls with up to 5 partners, unlimited lessons, unlimited chat.',
        feature: 'voice_call',
        ctaLabel: 'See Premium'
      });
      return true;
    }

    if (/tts|audio/i.test(message)) {
      this.show({
        title: "You've used all your audio clips today",
        message: 'The free plan includes 30 audio clips per day. Premium gives you 300.',
        benefit: 'More audio, unlimited lessons, unlimited Timmy chat.',
        feature: 'tts_limit',
        ctaLabel: 'See Premium'
      });
      return true;
    }

    this.show({
      title: "You've hit a limit",
      message: message || 'Upgrade to Premium to keep going.',
      feature: 'generic'
    });
    return true;
  },

  showCreatePodGate() {
    this.show({
      title: 'Creating a pod is a Premium feature',
      message: 'On the free plan you can join up to 3 pods. Premium lets you create your own and lead your group.',
      benefit: 'Create and lead your own pod, unlimited lessons, voice calls with your exchange partner.',
      feature: 'pod_create',
      ctaLabel: 'Create your own pod'
    });
  },

  showChatLimit() {
    this.show({
      title: "You've hit today's Timmy limit",
      message: 'The free plan includes 200 messages per day. Premium gives you unlimited conversations with Timmy.',
      benefit: 'Unlimited Timmy chat, unlimited instant lessons, voice calls with your partner.',
      feature: 'ai_chat',
      ctaLabel: 'Unlock unlimited chat'
    });
  },

  showCustomLessonLimit() {
    this.show({
      title: "You've used all your instant lessons today",
      message: 'The free plan includes 5 instant AI lessons per day. Premium makes them unlimited.',
      benefit: 'Unlimited instant lessons, unlimited Timmy chat, unlimited lessons per language.',
      feature: 'ai_custom_lesson',
      ctaLabel: 'Unlock unlimited lessons'
    });
  }
};

/* ============================================================
   6. CURRICULUM NORMALIZER
   ============================================================ */
const Curriculum = {
  normalize(raw, language) {
    if (!raw) return { language, levels: [] };
    const rawLevels = Array.isArray(raw) ? raw : (raw.levels || []);

    const levels = rawLevels.map(level => {
      if (Array.isArray(level.lessons) && level.lessons.length) {
        return {
          level: level.level,
          title: level.title || ('Level ' + level.level),
          description: level.description || '',
          topic: level.topic || level.subTopic || '',
          difficulty: level.difficulty || 'Beginner',
          estimatedTime: level.estimatedTime || '15 min',
          xpReward: level.xpReward || 25,
          lessons: level.lessons.map((l, i) => ({
            id: l.id || (level.level + '-' + (i + 1)),
            levelNumber: level.level,
            title: l.title || ('Lesson ' + (i + 1)),
            description: l.description || level.description || '',
            topic: l.topic || level.topic || '',
            difficulty: l.difficulty || level.difficulty || 'Beginner',
            estimatedTime: l.estimatedTime || level.estimatedTime || '15 min',
            xpReward: l.xpReward || level.xpReward || 25,
            vocabulary: l.vocabulary || [],
            dialogue: l.dialogue || [],
            grammarPoints: l.grammarPoints || [],
            culturalNotes: l.culturalNotes || [],
            practiceExercises: l.practiceExercises || []
          }))
        };
      }
      return {
        level: level.level,
        title: level.title || ('Level ' + level.level),
        description: level.description || '',
        topic: level.topic || level.subTopic || '',
        difficulty: level.difficulty || 'Beginner',
        estimatedTime: level.estimatedTime || '15 min',
        xpReward: level.xpReward || 25,
        lessons: [{
          id: level.id || ('level-' + level.level),
          levelNumber: level.level,
          title: level.title || ('Level ' + level.level),
          description: level.description || '',
          topic: level.topic || level.subTopic || '',
          difficulty: level.difficulty || 'Beginner',
          estimatedTime: level.estimatedTime || '15 min',
          xpReward: level.xpReward || 25,
          vocabulary: level.vocabulary || [],
          dialogue: level.dialogue || [],
          grammarPoints: level.grammarPoints || [],
          culturalNotes: level.culturalNotes || [],
          practiceExercises: level.practiceExercises || []
        }]
      };
    }).sort((a, b) => a.level - b.level);

    return { language, levels };
  },

  findLesson(curriculum, lessonId) {
    for (const level of curriculum.levels) {
      for (const lesson of level.lessons) {
        if (lesson.id === lessonId) return { level, lesson };
      }
    }
    return null;
  },

  allLessons(curriculum) {
    const out = [];
    curriculum.levels.forEach(l => l.lessons.forEach(ls => out.push(ls)));
    return out;
  },

  completedLessonIds(progress) {
    if (!progress) return [];
    return progress.completedLessons || progress.completedLevels || [];
  },

  nextIncompleteLesson(curriculum, progress) {
    const done = this.completedLessonIds(progress);
    const all = this.allLessons(curriculum);
    for (const lesson of all) {
      if (!done.includes(lesson.id) && !done.includes(lesson.levelNumber)) return lesson;
    }
    return all[all.length - 1] || null;
  }
};

/* ============================================================
   7. AUDIO MANAGER
   Priority: Supabase cache → backend /api/tts → browser fallback.
   Paywall-relevant errors (429/403) are re-thrown so callers can
   show the upgrade prompt.
   ============================================================ */
const AudioMgr = {
  current: null,

  cacheKey(text, language) {
    const clean = String(text || '')
      .toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
    return language + '/vocabulary/' + (clean || ('w' + Date.now())) + '.mp3';
  },

  supabaseUrl(key) {
    return CW_CONFIG.SUPABASE_URL + '/storage/v1/object/public/'
         + CW_CONFIG.SUPABASE_BUCKET + '/' + key;
  },

  async existsInSupabase(key) {
    try {
      const res = await fetch(this.supabaseUrl(key), { method: 'HEAD' });
      return res.ok;
    } catch { return false; }
  },

  stop() {
    if (this.current) {
      try { this.current.pause(); this.current.currentTime = 0; } catch {}
      this.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  },

  async play(text, language) {
    if (!text || !String(text).trim()) return false;
    this.stop();

    const langCfg = CW_CONFIG.LANGUAGES[language] || CW_CONFIG.LANGUAGES.yoruba;
    const key = this.cacheKey(text, language);

    if (await this.existsInSupabase(key)) {
      return this._playUrl(this.supabaseUrl(key));
    }

    try {
      const res = await Backend.tts(text, langCfg.voice);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      return this._playUrl(url, true);
    } catch (e) {
      // Paywall-relevant errors must bubble up so the caller can prompt
      if (e.status === 429 || e.status === 403) throw e;
      console.warn('Backend TTS failed, falling back to browser:', e.message);
    }

    return this._browserFallback(text, language);
  },

  _playUrl(url, revoke) {
    return new Promise(resolve => {
      const audio = new Audio(url);
      audio.onended = () => { if (revoke) URL.revokeObjectURL(url); resolve(true); };
      audio.onerror = () => { if (revoke) URL.revokeObjectURL(url); resolve(false); };
      audio.play().catch(() => resolve(false));
      this.current = audio;
    });
  },

  _browserFallback(text, language) {
    if (!('speechSynthesis' in window)) return false;
    const langCfg = CW_CONFIG.LANGUAGES[language] || CW_CONFIG.LANGUAGES.yoruba;
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = langCfg.ttsLang || 'en-NG';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
    return true;
  },

  async playDialogue(lines, language) {
    for (const line of lines) {
      await this.play(line.text, language);
      await new Promise(r => setTimeout(r, 400));
    }
  }
};

/* ============================================================
   8. UI HELPERS
   ============================================================ */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function showToast(msg, type) {
  type = type || 'info';
  const el = document.createElement('div');
  el.className = 'cw-toast cw-toast-' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('active'); document.body.style.overflow = ''; }
}

function fmtTimeAgo(iso) {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function initialsOf(name) {
  return String(name || 'Learner').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

/* ============================================================
   9. NAVIGATION
   ============================================================ */
const Nav = {
  TABS: {
    learn:     'learn.html',
    practice:  'practice.html',
    community: 'community.html',
    profile:   'profile.html'
  },
  go(tab, params) {
    if (!this.TABS[tab]) return;
    let url = this.TABS[tab];
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += '?' + qs;
    }
    location.href = url;
  },
  current() {
    const p = location.pathname.split('/').pop() || 'learn.html';
    for (const [k, v] of Object.entries(this.TABS)) if (v === p) return k;
    return 'learn';
  }
};

/* ============================================================
   10. HEADER
   ============================================================ */
const Header = {
  render(activeTab) {
    const el = document.getElementById('cw-header');
    if (!el) return;
    const lang = State.currentLanguage;
    const langCfg = CW_CONFIG.LANGUAGES[lang] || {};
    const streak = (State.user && State.user.streak) || 0;

    el.innerHTML = `
      <div class="hdr-left">
        <button class="lang-pill" onclick="Header.openLanguagePicker()">
          <span>${langCfg.emoji || '📚'}</span>
          <span>${esc(langCfg.name || lang)}</span>
          <span class="chev">▾</span>
        </button>
      </div>
      <div class="hdr-right">
        <button class="icon-btn streak-btn" onclick="Nav.go('profile')" title="Streak">
          <span class="streak-icon">🔥</span>
          <span>${streak}</span>
        </button>
        <button class="icon-btn bell-btn" onclick="Header.openNotifications()" title="Notifications">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span class="notif-dot" id="cw-notif-dot" hidden></span>
        </button>
      </div>
    `;
    this.refreshNotifDot();
  },

  async refreshNotifDot() {
    if (!Auth.isLoggedIn()) return;
    try {
      const r = await Backend.unreadCount();
      const dot = document.getElementById('cw-notif-dot');
      if (dot) dot.hidden = (r.unread || r.count || 0) === 0;
    } catch {}
  },

  openLanguagePicker() {
    const available = ['yoruba', 'igbo', 'hausa', 'pidgin'];
    const content = available.map(l => {
      const cfg = CW_CONFIG.LANGUAGES[l];
      const active = l === State.currentLanguage ? 'active' : '';
      return `
        <button class="lang-option ${active}" onclick="Header.pickLanguage('${l}')">
          <span class="lang-emoji">${cfg.emoji}</span>
          <span class="lang-name">${cfg.name}</span>
          ${active ? '<span class="lang-check">✓</span>' : ''}
        </button>`;
    }).join('');

    this._modal('Language', content, 'language-modal');
  },

  pickLanguage(lang) {
    State.setLanguage(lang);
    closeModal('cw-generic-modal');
    Backend.updateProfile({ primaryLanguage: lang }).catch(() => {});
    location.reload();
  },

  async openNotifications() {
    this._modal('Notifications',
      '<div class="modal-loading">Loading…</div>',
      'notifications-modal');

    try {
      const res = await Backend.listNotifications({ limit: 50 });
      const items = res.data || res.items || res.notifications || [];
      const body = document.querySelector('#cw-generic-modal .cw-modal-body');
      if (!items.length) {
        body.innerHTML = '<div class="empty-note">No notifications yet.</div>';
        return;
      }
      body.innerHTML = items.map(n => `
        <div class="notif-item ${n.read || n.isRead ? '' : 'unread'}" onclick="Header.readNotif('${n._id || n.id}')">
          <div class="notif-icon">${this._notifIcon(n.type)}</div>
          <div class="notif-body">
            <div class="notif-title">${esc(n.title || this._notifTitle(n.type))}</div>
            <div class="notif-text">${esc(n.message || n.body || n.content || '')}</div>
            <div class="notif-time">${fmtTimeAgo(n.createdAt)}</div>
          </div>
        </div>`).join('');
    } catch (e) {
      document.querySelector('#cw-generic-modal .cw-modal-body').innerHTML =
        '<div class="empty-note">Couldn\u2019t load notifications.</div>';
    }
  },

  _notifIcon(type) {
    return {
      referral_signup: '👋', referral_qualified: '🎉',
      pod_invite: '📨', pod_milestone: '🏅', pod_message: '💬',
      pair_matched: '🤝', pair_message: '💬', pair_ended: '👋',
      streak_bonus: '🔥', level_completed: '🏆',
      report_resolved: '🛡️',
      subscription_activated: '⭐', subscription_ended: '⏰'
    }[type] || '🔔';
  },
  _notifTitle(type) {
    return {
      referral_signup: 'New referral signup',
      referral_qualified: 'Referral qualified',
      pod_invite: 'Pod invitation',
      pod_milestone: 'Pod milestone',
      pod_message: 'New pod message',
      pair_matched: 'New pair match',
      pair_message: 'New pair message',
      pair_ended: 'Pair ended',
      streak_bonus: 'Streak bonus',
      level_completed: 'Level completed',
      subscription_activated: 'Subscription active',
      subscription_ended: 'Subscription ended'
    }[type] || 'Notification';
  },

  readNotif(id) {
    Backend.markNotificationRead(id).catch(() => {});
    const el = event && event.currentTarget;
    if (el) el.classList.remove('unread');
    this.refreshNotifDot();
  },

  _modal(title, bodyHtml, id) {
    let host = document.getElementById('cw-generic-modal');
    if (!host) {
      host = document.createElement('div');
      host.id = 'cw-generic-modal';
      host.className = 'cw-modal-overlay';
      host.innerHTML = `
        <div class="cw-modal">
          <div class="cw-modal-head">
            <div class="cw-modal-title"></div>
            <button class="cw-modal-close" onclick="closeModal('cw-generic-modal')">×</button>
          </div>
          <div class="cw-modal-body"></div>
        </div>`;
      document.body.appendChild(host);
    }
    host.querySelector('.cw-modal-title').textContent = title;
    host.querySelector('.cw-modal-body').innerHTML = bodyHtml;
    host.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

/* ============================================================
   11. AUTH FLOW HELPERS
   ============================================================ */
async function cwSignup(payload) {
  const r = await Backend.signup(payload);
  if (r.token) Auth.setToken(r.token);
  if (r.user) {
    Auth.setUser(r.user);
    if (r.user.language && CW_CONFIG.LANGUAGES[r.user.language]) {
      State.currentLanguage = r.user.language;
      localStorage.setItem(CW_CONFIG.LANG_KEY, r.user.language);
    }
  }
  return r;
}

async function cwLogin(email, password) {
  const r = await Backend.login(email, password);
  if (r.token) Auth.setToken(r.token);
  if (r.user) {
    Auth.setUser(r.user);
    if (r.user.language && CW_CONFIG.LANGUAGES[r.user.language]) {
      State.currentLanguage = r.user.language;
      localStorage.setItem(CW_CONFIG.LANG_KEY, r.user.language);
    }
  }
  return r;
}

function cwLogout() {
  Auth.clear();
  localStorage.removeItem(CW_CONFIG.LANG_KEY);
  localStorage.removeItem('cw_onboarding_partial');
  location.href = 'onboarding.html';
}

/* ============================================================
   12. BOOT
   ============================================================ */
async function cwBoot() {
  State.setTheme(State.theme);

  if (!Auth.isLoggedIn()) {
    if (location.pathname.indexOf('onboarding') === -1) {
      location.href = 'onboarding.html';
    }
    return false;
  }

  State.user = Auth.getUser();

  State.hydrate().then(ok => {
    if (!ok) {
      Auth.clear();
      localStorage.removeItem(CW_CONFIG.LANG_KEY);
      location.href = 'onboarding.html';
      return;
    }
    State.emit('hydrated');
  });

  window.addEventListener('cw:auth-expired', () => {
    location.href = 'onboarding.html';
  });

  return true;
}

/* ============================================================
   13. EXPOSE
   ============================================================ */
window.CW_CONFIG = CW_CONFIG;
window.Auth = Auth;
window.api = api;
window.ApiError = ApiError;
window.Backend = Backend;
window.State = State;
window.LanguageSetup = LanguageSetup;
window.Paywall = Paywall;
window.Curriculum = Curriculum;
window.AudioMgr = AudioMgr;
window.Nav = Nav;
window.Header = Header;
window.showToast = showToast;
window.showModal = showModal;
window.closeModal = closeModal;
window.esc = esc;
window.fmtTimeAgo = fmtTimeAgo;
window.initialsOf = initialsOf;
window.cwSignup = cwSignup;
window.cwLogin = cwLogin;
window.cwLogout = cwLogout;
window.cwBoot = cwBoot;
