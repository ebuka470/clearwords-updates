/* ============================================================
   ClearWords — ShareCards
   Renders the ClearWords identity card and chat snippets to
   canvas, and opens a native or fallback share sheet.

   Loaded as <script src="sharecards.js"></script> before page
   scripts. Exposes window.ShareCards.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     CONSTANTS
     ============================================================ */
  const CARD_W = 1080;
  const CARD_H = 1350;
  const CHAT_W = 1080;
  const CHAT_H = 900;

  const PALETTE = {
    yoruba:   { bg1: '#0F172A', bg2: '#1E293B', accent: '#FBBF24', accent2: '#F472B6', label: 'Yorùbá' },
    igbo:     { bg1: '#052E16', bg2: '#064E3B', accent: '#34D399', accent2: '#60A5FA', label: 'Igbo' },
    hausa:    { bg1: '#1E1B4B', bg2: '#312E81', accent: '#F472B6', accent2: '#A78BFA', label: 'Hausa' },
    pidgin:   { bg1: '#3B0764', bg2: '#581C87', accent: '#C084FC', accent2: '#F472B6', label: 'Nigerian Pidgin' },
    urhobo:   { bg1: '#431407', bg2: '#7C2D12', accent: '#FB923C', accent2: '#FBBF24', label: 'Urhobo' },
    itsekiri: { bg1: '#1E3A8A', bg2: '#1E40AF', accent: '#60A5FA', accent2: '#93C5FD', label: 'Itsekiri' }
  };

  const LEVELS = [
    { max: 1,  label: 'Newcomer' },
    { max: 5,  label: 'Starter' },
    { max: 10, label: 'Explorer' },
    { max: 15, label: 'Learner' },
    { max: 25, label: 'Speaker' },
    { max: 35, label: 'Storyteller' },
    { max: 50, label: 'Keeper' },
    { max: Infinity, label: 'Elder' }
  ];

  /* ============================================================
     HELPERS
     ============================================================ */

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function loadState() {
    // shared.js owns the canonical State. If it's there, use it.
    const state = (typeof window !== 'undefined' && window.State) ? window.State : null;
    if (state && state.user) {
      return {
        user: state.user,
        progress: state.progress || {},
        language: state.currentLanguage || (state.user.language) || 'yoruba'
      };
    }
    // Fallback: read from localStorage directly if shared.js hasn't loaded
    let user = null;
    try { user = JSON.parse(localStorage.getItem('cw_user') || 'null'); } catch {}
    const language = localStorage.getItem('cw_language') || (user && user.language) || 'yoruba';
    return { user, progress: {}, language };
  }

  function langConfig(language) {
    return PALETTE[language] || PALETTE.yoruba;
  }

  function langName(language) {
    const cfg = (typeof window !== 'undefined' && window.CW_CONFIG && window.CW_CONFIG.LANGUAGES)
      ? window.CW_CONFIG.LANGUAGES[language]
      : null;
    if (cfg) return cfg.name;
    return langConfig(language).label;
  }

  function langEmoji(language) {
    const cfg = (typeof window !== 'undefined' && window.CW_CONFIG && window.CW_CONFIG.LANGUAGES)
      ? window.CW_CONFIG.LANGUAGES[language]
      : null;
    return (cfg && cfg.emoji) || '👑';
  }

  // Seeded RNG so the same seed gives the same card every time
  function mulberry32(seed) {
    let a = seed || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* ============================================================
     PUBLIC HELPERS
     ============================================================ */

  function art(word) {
    if (!word) return 'a';
    return /^[aeiou]/i.test(String(word).trim()) ? 'an' : 'a';
  }

  function levelLabel(level) {
    const n = Number(level) || 1;
    for (const row of LEVELS) if (n <= row.max) return row.label;
    return 'Elder';
  }

  function firstName(user) {
    const u = user || {};
    const name = u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '';
    if (!name) return 'Friend';
    return name.split(' ')[0];
  }

  function spiritAge(data, seed) {
    // A fun, stable "spirit age" derived from real stats + a seed
    const rand = mulberry32((seed || 0) * 7919 + 13);
    const base = 18 + Math.floor((data && data.level ? data.level : 1) * 0.6);
    const variance = Math.floor(rand() * 12) - 6;
    return Math.max(14, base + variance);
  }

  function fluency(data) {
    // 0-100 percentage. Real number, rounded, feels earned.
    if (!data) return 0;
    const lessons = Math.min(data.lessons || 0, 50);
    const xp = Math.min(data.xp || 0, 5000);
    const fromLessons = (lessons / 50) * 60;
    const fromXp = (xp / 5000) * 40;
    return Math.min(99, Math.round(fromLessons + fromXp));
  }

  /* ============================================================
     GATHER — read stats from the running app
     ============================================================ */

  async function gather() {
    const { user, progress, language } = loadState();
    if (!user) return null;

    const p = progress || {};
    const completed = (p.completedLessons || p.completedLevels || []).length;
    const lessons = Math.max(
      completed,
      (user.completedLessons || []).length,
      (user.completedLevels || []).length
    );

    // Streak: prefer a fresh value from State.effectiveStreak if available
    let streak = 0;
    try {
      if (typeof window !== 'undefined' && window.State && typeof window.State.effectiveStreak === 'function') {
        streak = window.State.effectiveStreak(p) || 0;
      } else {
        streak = p.streak || user.streak || 0;
      }
    } catch { streak = p.streak || user.streak || 0; }

    const xp = p.totalXP || user.totalXP || 0;
    const level = p.currentLevel || user.currentLevel || 1;
    const savedWords = (user.savedWords || []).length;
    const name = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Learner';
    const username = user.username || (user.email ? user.email.split('@')[0] : 'learner');

    return {
      name,
      username,
      language,
      langName: langName(language),
      langEmoji: langEmoji(language),
      lessons,
      streak,
      xp,
      level,
      savedWords,
      // Derived for the card
      fluency: fluency({ lessons, xp }),
      tier: user.subscriptionTier || 'free'
    };
  }

  /* ============================================================
     DRAW — the identity card
     ============================================================ */

  function drawIdentity(data, seed) {
    const d = data || {};
    const cfg = langConfig(d.language);
    const rand = mulberry32((seed || 0) * 982451653 + 7);

    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');

    // ---- Background gradient ----
    const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    grad.addColorStop(0, cfg.bg1);
    grad.addColorStop(1, cfg.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // ---- Decorative circles ----
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = cfg.accent;
    ctx.beginPath(); ctx.arc(CARD_W * 0.85, CARD_H * 0.12, 260, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cfg.accent2;
    ctx.beginPath(); ctx.arc(CARD_W * 0.12, CARD_H * 0.9, 220, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // ---- Top bar ----
    const topGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
    topGrad.addColorStop(0, cfg.accent);
    topGrad.addColorStop(1, cfg.accent2);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, CARD_W, 12);

    // ---- Brand row ----
    ctx.font = '700 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = cfg.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ClearWords', 80, 90);

    // Top-right: language label
    ctx.font = '600 34px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.textAlign = 'right';
    ctx.fillText(d.langName || 'Nigerian', CARD_W - 80, 96);

    // ---- Big "ID card" heading ----
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 28px -apple-system, sans-serif';
    ctx.fillText('MY CLEARWORDS CARD', 80, 200);

    // ---- Name ----
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 84px -apple-system, sans-serif';
    const nameLines = wrapText(ctx, d.name || 'Learner', CARD_W - 160);
    let nameY = 260;
    for (const line of nameLines.slice(0, 2)) {
      ctx.fillText(line, 80, nameY);
      nameY += 96;
    }

    // ---- Handle ----
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '500 36px -apple-system, sans-serif';
    ctx.fillText('@' + (d.username || 'learner'), 80, nameY + 8);
    nameY += 70;

    // ---- Big emoji avatar ----
    const avatarX = CARD_W - 240;
    const avatarY = 400;
    ctx.globalAlpha = 0.9;
    ctx.font = '220px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.langEmoji || '👑', avatarX, avatarY);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top';

    // ---- Identity headline ----
    const headlineY = nameY + 40;
    ctx.fillStyle = cfg.accent;
    ctx.font = '700 46px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    const headline = `I'm ${art(d.langName)} ${d.langName} ${levelLabel(d.level)}`;
    const headLines = wrapText(ctx, headline, CARD_W - 160);
    let hy = headlineY;
    for (const line of headLines.slice(0, 2)) {
      ctx.fillText(line, 80, hy);
      hy += 60;
    }

    // ---- Stats panel ----
    const panelY = hy + 60;
    const panelH = 320;
    roundedRect(ctx, 80, panelY, CARD_W - 160, panelH, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const statCols = 3;
    const panelW = CARD_W - 160;
    const colW = panelW / statCols;

    const stats = [
      { label: 'DAY STREAK', value: String(d.streak || 0) },
      { label: 'TOTAL XP',   value: String(d.xp || 0) },
      { label: 'LESSONS',    value: String(d.lessons || 0) }
    ];

    stats.forEach((s, i) => {
      const cx = 80 + colW * i + colW / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = cfg.accent;
      ctx.font = '800 76px -apple-system, sans-serif';
      ctx.fillText(s.value, cx, panelY + 90);
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = '700 24px -apple-system, sans-serif';
      ctx.fillText(s.label, cx, panelY + 190);
    });

    // Divider lines
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(80 + colW, panelY + 40); ctx.lineTo(80 + colW, panelY + panelH - 40);
    ctx.moveTo(80 + colW * 2, panelY + 40); ctx.lineTo(80 + colW * 2, panelY + panelH - 40);
    ctx.stroke();

    // ---- Spirit age + fluency row ----
    const metaY = panelY + panelH + 50;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 24px -apple-system, sans-serif';
    ctx.fillText('SPIRIT AGE', 80, metaY);
    ctx.fillText('FLUENCY', CARD_W / 2 + 20, metaY);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 60px -apple-system, sans-serif';
    ctx.fillText(String(spiritAge(d, seed || 0)), 80, metaY + 40);
    ctx.fillText(fluency(d) + '%', CARD_W / 2 + 20, metaY + 40);

    // ---- Bottom footer ----
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '500 26px -apple-system, sans-serif';
    ctx.fillText('clearwords.com.ng', 80, CARD_H - 100);

    ctx.textAlign = 'right';
    ctx.fillStyle = cfg.accent;
    ctx.font = '700 26px -apple-system, sans-serif';
    ctx.fillText('Speak your heritage 🇳🇬', CARD_W - 80, CARD_H - 100);

    return canvas;
  }

  /* ============================================================
     DRAW — chat snippet card
     ============================================================ */

  function drawChat(snippet) {
    const cfg = langConfig((loadState().language) || 'yoruba');
    const canvas = document.createElement('canvas');
    canvas.width = CHAT_W;
    canvas.height = CHAT_H;
    const ctx = canvas.getContext('2d');

    // Background
    const grad = ctx.createLinearGradient(0, 0, CHAT_W, CHAT_H);
    grad.addColorStop(0, cfg.bg1);
    grad.addColorStop(1, cfg.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CHAT_W, CHAT_H);

    // Top accent bar
    const topGrad = ctx.createLinearGradient(0, 0, CHAT_W, 0);
    topGrad.addColorStop(0, cfg.accent);
    topGrad.addColorStop(1, cfg.accent2);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, CHAT_W, 10);

    // Header
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = cfg.accent;
    ctx.font = '700 34px -apple-system, sans-serif';
    ctx.fillText('ClearWords · Timmy', 60, 60);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 26px -apple-system, sans-serif';
    ctx.fillText('A moment from my practice', 60, 106);

    // Focus exchange: user message above + assistant message
    const messages = snippet.messages || [];
    const idx = Math.max(0, Math.min(snippet.index || 0, messages.length - 1));

    // Grab up to 3 messages ending at idx (or centered)
    const start = Math.max(0, idx - 2);
    const slice = messages.slice(start, idx + 1);

    let y = 200;
    const bubbleMaxW = CHAT_W - 240;

    for (const m of slice) {
      const isUser = m.role === 'user';
      const bubbleW = Math.min(bubbleMaxW, 400 + Math.min(360, String(m.text || '').length * 8));
      const bubbleX = isUser ? (CHAT_W - 60 - bubbleW) : 60;
      const padding = 30;

      ctx.font = '500 32px -apple-system, sans-serif';
      const wrapped = wrapText(ctx, String(m.text || '').slice(0, 220), bubbleW - padding * 2);
      const bubbleH = wrapped.length * 44 + padding * 2;

      // Bubble
      roundedRect(ctx, bubbleX, y, bubbleW, bubbleH, 32);
      if (isUser) {
        ctx.fillStyle = cfg.accent;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
      }
      ctx.fill();

      // Bubble text
      ctx.fillStyle = isUser ? '#0F172A' : '#FFFFFF';
      ctx.font = '500 32px -apple-system, sans-serif';
      let ty = y + padding + 4;
      for (const line of wrapped) {
        ctx.fillText(line, bubbleX + padding, ty);
        ty += 44;
      }

      // From-label above bubble
      ctx.font = '700 22px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = isUser ? 'right' : 'left';
      ctx.fillText(isUser ? 'You' : 'Timmy', isUser ? CHAT_W - 60 : 60, y - 34);
      ctx.textAlign = 'left';

      y += bubbleH + 70;
    }

    // Footer
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '500 26px -apple-system, sans-serif';
    ctx.fillText('clearwords.com.ng', 60, CHAT_H - 90);

    ctx.textAlign = 'right';
    ctx.fillStyle = cfg.accent;
    ctx.font = '700 26px -apple-system, sans-serif';
    ctx.fillText('Practice with Timmy 🤓', CHAT_W - 60, CHAT_H - 90);

    return canvas;
  }

  /* ============================================================
     CANVAS → BLOB / URL helpers
     ============================================================ */

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png', 0.95);
      } else {
        // Older browsers
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const bin = atob(dataUrl.split(',')[1]);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (e) { reject(e); }
      }
    });
  }

  function canvasToDataURL(canvas) {
    return canvas.toDataURL('image/png');
  }

  /* ============================================================
     SHARE SHEET (bottom sheet UI)
     ============================================================ */

  function ensureSheet() {
    let sheet = document.getElementById('cw-share-sheet');
    if (sheet) return sheet;

    sheet = document.createElement('div');
    sheet.id = 'cw-share-sheet';
    sheet.className = 'cw-share-overlay';
    sheet.innerHTML = `
      <div class="cw-share-panel">
        <div class="cw-share-head">
          <div class="cw-share-title">Share</div>
          <button class="cw-share-close" onclick="ShareCards._closeSheet()">×</button>
        </div>
        <div class="cw-share-preview" id="cw-share-preview"></div>
        <div class="cw-share-actions" id="cw-share-actions"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', e => {
      if (e.target === sheet) ShareCards._closeSheet();
    });
    return sheet;
  }

  function injectStyles() {
    if (document.getElementById('cw-share-styles')) return;
    const style = document.createElement('style');
    style.id = 'cw-share-styles';
    style.textContent = `
      .cw-share-overlay {
        position: fixed; inset: 0; z-index: 30000;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(6px);
        display: none; align-items: flex-end; justify-content: center;
      }
      .cw-share-overlay.active { display: flex; }
      .cw-share-panel {
        width: 100%; max-width: 560px;
        max-height: 92vh;
        background: var(--card, #fff);
        color: var(--text, #1C1E21);
        border-radius: 24px 24px 0 0;
        padding: 20px 20px calc(20px + env(safe-area-inset-bottom, 0));
        display: flex; flex-direction: column;
        animation: cwShareUp .25s ease;
        border: 1px solid var(--border, #E5E1D8);
        border-bottom: none;
        overflow-y: auto;
      }
      @keyframes cwShareUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .cw-share-head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 14px;
      }
      .cw-share-title { font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
      .cw-share-close {
        width: 36px; height: 36px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; color: var(--text-2, #6B6F76);
        background: transparent; border: none; cursor: pointer;
      }
      .cw-share-close:active { background: var(--border, #E5E1D8); }
      .cw-share-preview {
        margin-bottom: 16px; text-align: center;
      }
      .cw-share-preview img {
        max-width: 100%; max-height: 50vh;
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      }
      .cw-share-actions {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
      }
      .cw-share-actions button {
        display: flex; align-items: center; gap: 10px;
        padding: 14px 16px; border-radius: 14px;
        font-size: 14.5px; font-weight: 700;
        background: var(--bg-elev, #fff);
        border: 1.5px solid var(--border, #E5E1D8);
        color: var(--text, #1C1E21);
        cursor: pointer;
        transition: transform .08s, background .15s;
        text-align: left;
        font-family: inherit;
      }
      .cw-share-actions button:active { transform: scale(.97); }
      .cw-share-actions button.wide { grid-column: span 2; }
      .cw-share-actions button.primary { background: var(--brand, #2E8B57); color: #fff; border-color: var(--brand, #2E8B57); }
      .cw-share-actions button .ico { font-size: 18px; }
    `;
    document.head.appendChild(style);
  }

  function openSheet({ canvas, filename, caption }) {
    injectStyles();
    const sheet = ensureSheet();

    const preview = sheet.querySelector('#cw-share-preview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = canvasToDataURL(canvas);
    img.alt = 'Share preview';
    preview.appendChild(img);

    const actions = sheet.querySelector('#cw-share-actions');
    actions.innerHTML = '';

    const addBtn = (label, ico, handler, opts = {}) => {
      const btn = document.createElement('button');
      if (opts.wide) btn.classList.add('wide');
      if (opts.primary) btn.classList.add('primary');
      btn.innerHTML = `<span class="ico">${ico}</span><span>${esc(label)}</span>`;
      btn.onclick = () => handler(btn);
      actions.appendChild(btn);
      return btn;
    };

    // Native share (mobile)
    if (navigator.share && navigator.canShare) {
      addBtn('Share', '📤', async () => {
        try {
          const blob = await canvasToBlob(canvas);
          const file = new File([blob], filename, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'ClearWords', text: caption || '' });
            _closeSheet();
            return;
          }
        } catch (e) { /* fall through to other options */ }
      }, { primary: true });
    }

    // WhatsApp
    addBtn('WhatsApp', '💬', async () => {
      try {
        const blob = await canvasToBlob(canvas);
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'ClearWords', text: caption || '' });
          _closeSheet();
          return;
        }
        // Fallback: copy to clipboard, open WhatsApp web
        await copyBlobToClipboard(blob);
        const text = encodeURIComponent((caption || 'My ClearWords card') + ' — clearwords.com.ng');
        window.open(`https://wa.me/?text=${text}`, '_blank');
        _closeSheet();
      } catch (e) {
        console.warn('WhatsApp share failed:', e);
      }
    });

    // X / Twitter
    addBtn('X', '𝕏', async () => {
      const text = encodeURIComponent((caption || 'Learning Nigerian languages with ClearWords') + ' — clearwords.com.ng');
      window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
      _closeSheet();
    });

    // Copy to clipboard
    addBtn('Copy image', '📋', async (btn) => {
      try {
        const blob = await canvasToBlob(canvas);
        await copyBlobToClipboard(blob);
        btn.innerHTML = '<span class="ico">✅</span><span>Copied!</span>';
        setTimeout(() => _closeSheet(), 700);
      } catch (e) {
        alert('Could not copy. Try downloading instead.');
      }
    });

    // Download
    addBtn('Save to device', '💾', async () => {
      const a = document.createElement('a');
      a.href = canvasToDataURL(canvas);
      a.download = filename;
      a.click();
      _closeSheet();
    }, { wide: true });

    sheet.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  async function copyBlobToClipboard(blob) {
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return true;
      } catch (e) { /* fall through */ }
    }
    throw new Error('Clipboard image copy not supported');
  }

  function _closeSheet() {
    const sheet = document.getElementById('cw-share-sheet');
    if (sheet) sheet.classList.remove('active');
    document.body.style.overflow = '';
  }

  /* ============================================================
     PUBLIC: openIdentity — the identity card share sheet
     ============================================================ */

  async function openIdentity(seed) {
    const data = await gather();
    if (!data) {
      // No user yet — nothing to share
      if (window.showToast) window.showToast('Finish a lesson first to make your card.', 'info');
      return;
    }
    if (data.lessons < 1) {
      if (window.showToast) window.showToast('Complete your first lesson to unlock your card.', 'info');
      return;
    }
    const canvas = drawIdentity(data, seed || 0);
    const filename = `clearwords-card-${data.username}-${Date.now()}.png`;
    const caption = `I'm ${art(data.langName)} ${data.langName} ${levelLabel(data.level)} on ClearWords! 🇳🇬`;
    openSheet({ canvas, filename, caption });
  }

  /* ============================================================
     PUBLIC: openChat — snippet share from a Timmy chat
     ============================================================ */

  function openChat(snippet) {
    if (!snippet || !Array.isArray(snippet.messages) || !snippet.messages.length) {
      if (window.showToast) window.showToast('Nothing to share yet.', 'info');
      return;
    }
    const canvas = drawChat(snippet);
    const filename = `clearwords-timmy-${Date.now()}.png`;
    const caption = 'A moment from practicing with Timmy 🤓';
    openSheet({ canvas, filename, caption });
  }

  /* ============================================================
     EXPOSE
     ============================================================ */

  window.ShareCards = {
    gather,
    drawIdentity,
    drawChat,
    openIdentity,
    openChat,
    art,
    levelLabel,
    spiritAge,
    fluency,
    firstName,
    _closeSheet
  };

  console.log('[ShareCards] loaded');
})();
