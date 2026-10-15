/* ============================================================
   ClearWords — ShareCards
   Renders the ClearWords identity card and chat snippets to
   canvas using the app's brand palette, and opens a share sheet.

   Load after shared.js:
     <script src="shared.js"></script>
     <script src="sharecards.js"></script>
   Exposes window.ShareCards.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     CONSTANTS — brand palette, no indigo, no purple
     ============================================================ */
  const CARD_W = 1080;
  const CARD_H = 1350;
  const CHAT_W = 1080;
  const CHAT_H = 1200;

  // Brand colors pulled straight from the app
  const BRAND = {
    green:      '#2E8B57',
    greenDeep:  '#1E5C3A',
    greenDark:  '#0F3E24',
    greenLight: '#4CAF7A',
    gold:       '#E8B33C',
    goldLight:  '#F5CB6C',
    goldDeep:   '#C79422',
    cream:      '#FAF7F2',
    text:       '#1C1E21',
    textMuted:  '#6B6F76'
  };

  // Per-language: a subtly different shade within the brand family.
  // Every background is a green, every accent is gold. Only the hue
  // warmth shifts a little so cards don't feel identical.
  const PALETTE = {
    yoruba:   { bg1: '#0F3E24', bg2: '#1E5C3A', accent: '#E8B33C', accent2: '#F5CB6C', label: 'Yorùbá' },
    igbo:     { bg1: '#0F3E24', bg2: '#1B5535', accent: '#E8B33C', accent2: '#F5CB6C', label: 'Igbo' },
    hausa:    { bg1: '#123F28', bg2: '#1F5C3C', accent: '#E8B33C', accent2: '#F5CB6C', label: 'Hausa' },
    pidgin:   { bg1: '#0F3E24', bg2: '#256B45', accent: '#E8B33C', accent2: '#F5CB6C', label: 'Nigerian Pidgin' },
    urhobo:   { bg1: '#123E22', bg2: '#1E5A34', accent: '#E8B33C', accent2: '#D97757', label: 'Urhobo' },
    itsekiri: { bg1: '#0F3E24', bg2: '#1E5C3A', accent: '#E8B33C', accent2: '#F5CB6C', label: 'Itsekiri' }
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
    const state = (typeof window !== 'undefined' && window.State) ? window.State : null;
    if (state && state.user) {
      return {
        user: state.user,
        progress: state.progress || {},
        language: state.currentLanguage || (state.user.language) || 'yoruba'
      };
    }
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

  function mulberry32(seed) {
    let a = (seed | 0) >>> 0;
    if (a === 0) a = 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
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
    const words = String(text).split(/\s+/);
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
     THE LOGO — a branded mark drawn on canvas
     ============================================================ */

  /**
   * Draws the ClearWords logo mark: a rounded-square badge with the
   * brand green gradient, a gold ring inside it, and a small
   * speech-bubble icon. Returns { width, height } so callers can
   * position other elements relative to it.
   */
  function drawLogo(ctx, x, y, size) {
    const r = size * 0.28;

    // Badge background — brand green gradient
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, BRAND.greenLight);
    grad.addColorStop(1, BRAND.greenDeep);
    roundedRect(ctx, x, y, size, size, r);
    ctx.fillStyle = grad;
    ctx.fill();

    // Gold inner ring
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.32, 0, Math.PI * 2);
    ctx.strokeStyle = BRAND.gold;
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.stroke();

    // Speech-bubble icon in the middle
    const cx = x + size / 2;
    const cy = y + size / 2;
    const bw = size * 0.38;
    const bh = size * 0.28;
    roundedRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.35);
    ctx.fillStyle = BRAND.gold;
    ctx.fill();

    // Little tail on the bubble
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.18, cy + bh / 2 - 1);
    ctx.lineTo(cx - bw * 0.05, cy + bh / 2 + bh * 0.28);
    ctx.lineTo(cx + bw * 0.02, cy + bh / 2 - 1);
    ctx.closePath();
    ctx.fillStyle = BRAND.gold;
    ctx.fill();

    // Three dots inside the bubble
    const dotR = size * 0.028;
    const dotGap = size * 0.075;
    ctx.fillStyle = BRAND.greenDeep;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * dotGap, cy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    return { width: size, height: size };
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
    const rand = mulberry32((seed || 0) + 13);
    const base = 18 + Math.floor((data && data.level ? data.level : 1) * 0.6);
    const variance = Math.floor(rand() * 12) - 6;
    return Math.max(14, base + variance);
  }

  function fluency(data) {
    if (!data) return 0;
    const lessons = Math.min(data.lessons || 0, 50);
    const xp = Math.min(data.xp || 0, 5000);
    const fromLessons = (lessons / 50) * 60;
    const fromXp = (xp / 5000) * 40;
    return Math.min(99, Math.round(fromLessons + fromXp));
  }

  /* ============================================================
     GATHER
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
      fluency: fluency({ lessons, xp }),
      tier: user.subscriptionTier || 'free'
    };
  }

  /* ============================================================
     DRAW — identity card (brand green + gold, logo top-left)
     ============================================================ */

  function drawIdentity(data, seed) {
    const d = data || {};
    const cfg = langConfig(d.language);

    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');

    // ---- Background: brand green gradient ----
    const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
    grad.addColorStop(0, cfg.bg1);
    grad.addColorStop(1, cfg.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // ---- Subtle top gold bar ----
    const topGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
    topGrad.addColorStop(0, BRAND.gold);
    topGrad.addColorStop(1, BRAND.goldLight);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, CARD_W, 10);

    // ---- Big soft gold ring behind the card (brand depth, no purple) ----
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = BRAND.gold;
    ctx.lineWidth = 60;
    ctx.beginPath(); ctx.arc(CARD_W * 0.9, CARD_H * 0.1, 340, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(CARD_W * 0.05, CARD_H * 0.95, 260, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // ============================================================
    // HEADER — logo + wordmark on the left, language on the right
    // ============================================================
    const headerY = 90;
    const logoSize = 72;
    drawLogo(ctx, 80, headerY, logoSize);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = BRAND.cream;
    ctx.font = '800 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('ClearWords', 80 + logoSize + 22, headerY + logoSize / 2);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(232,179,60,0.85)';
    ctx.font = '700 34px -apple-system, sans-serif';
    ctx.fillText(d.langName || 'Nigerian', CARD_W - 80, headerY + logoSize / 2);

    // ---- Divider under header ----
    ctx.beginPath();
    ctx.moveTo(80, headerY + logoSize + 40);
    ctx.lineTo(CARD_W - 80, headerY + logoSize + 40);
    ctx.strokeStyle = 'rgba(232,179,60,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ============================================================
    // EYEBROW + NAME + HANDLE
    // ============================================================
    let y = headerY + logoSize + 90;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(250,247,242,0.55)';
    ctx.font = '700 26px -apple-system, sans-serif';
    ctx.fillText('MY CLEARWORDS CARD', 80, y);
    y += 50;

    ctx.fillStyle = BRAND.cream;
    ctx.font = '800 92px -apple-system, sans-serif';
    const nameLines = wrapText(ctx, d.name || 'Learner', CARD_W - 380);
    for (const line of nameLines.slice(0, 2)) {
      ctx.fillText(line, 80, y);
      y += 104;
    }

    ctx.fillStyle = 'rgba(232,179,60,0.9)';
    ctx.font = '600 34px -apple-system, sans-serif';
    ctx.fillText('@' + (d.username || 'learner'), 80, y);
    y += 60;

    // ============================================================
    // LANGUAGE EMOJI AVATAR on the right (top area)
    // ============================================================
    const emojiX = CARD_W - 200;
    const emojiY = headerY + logoSize + 200;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = BRAND.gold;
    ctx.beginPath(); ctx.arc(emojiX, emojiY, 130, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '180px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText(d.langEmoji || '👑', emojiX, emojiY);
    ctx.textBaseline = 'top';

    // ============================================================
    // HEADLINE — "I'm a Hausa Starter"
    // ============================================================
    y += 40;
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.gold;
    ctx.font = '800 52px -apple-system, sans-serif';
    const headline = `I'm ${art(d.langName)} ${d.langName} ${levelLabel(d.level)}`;
    const headLines = wrapText(ctx, headline, CARD_W - 400);
    for (const line of headLines.slice(0, 2)) {
      ctx.fillText(line, 80, y);
      y += 66;
    }

    // ============================================================
    // STATS PANEL
    // ============================================================
    y += 30;
    const panelH = 300;
    roundedRect(ctx, 80, y, CARD_W - 160, panelH, 32);
    ctx.fillStyle = 'rgba(15, 62, 36, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,179,60,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const panelW = CARD_W - 160;
    const colW = panelW / 3;
    const stats = [
      { label: 'DAY STREAK', value: String(d.streak || 0) },
      { label: 'TOTAL XP',   value: String(d.xp || 0) },
      { label: 'LESSONS',    value: String(d.lessons || 0) }
    ];

    stats.forEach((s, i) => {
      const cx = 80 + colW * i + colW / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = BRAND.gold;
      ctx.font = '800 82px -apple-system, sans-serif';
      ctx.fillText(s.value, cx, y + 100);
      ctx.fillStyle = 'rgba(250,247,242,0.62)';
      ctx.font = '700 22px -apple-system, sans-serif';
      ctx.fillText(s.label, cx, y + 210);
    });

    // Divider lines inside the panel
    ctx.strokeStyle = 'rgba(232,179,60,0.22)';
    ctx.beginPath();
    ctx.moveTo(80 + colW,     y + 50); ctx.lineTo(80 + colW,     y + panelH - 50);
    ctx.moveTo(80 + colW * 2, y + 50); ctx.lineTo(80 + colW * 2, y + panelH - 50);
    ctx.stroke();

    // ============================================================
    // SPIRIT AGE + FLUENCY
    // ============================================================
    y += panelH + 60;
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(250,247,242,0.55)';
    ctx.font = '700 24px -apple-system, sans-serif';
    ctx.fillText('SPIRIT AGE', 80, y);

    ctx.fillText('FLUENCY', CARD_W / 2 + 20, y);

    ctx.fillStyle = BRAND.cream;
    ctx.font = '800 66px -apple-system, sans-serif';
    ctx.fillText(String(spiritAge(d, seed || 0)), 80, y + 42);
    ctx.fillText(fluency(d) + '%', CARD_W / 2 + 20, y + 42);

    // ============================================================
    // FOOTER — small gold mark + URL + tagline
    // ============================================================
    const footerY = CARD_H - 110;
    drawLogo(ctx, 80, footerY, 40);

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(250,247,242,0.62)';
    ctx.font = '600 24px -apple-system, sans-serif';
    ctx.fillText('clearwords.com.ng', 80 + 40 + 14, footerY + 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = BRAND.gold;
    ctx.font = '700 24px -apple-system, sans-serif';
    ctx.fillText('Speak your heritage 🇳🇬', CARD_W - 80, footerY + 22);

    return canvas;
  }

  /* ============================================================
     DRAW — chat snippet card
     Only includes the selected exchange (the message plus the one
     it was replying to if applicable), with the ClearWords logo
     in the header.
     ============================================================ */

  function drawChat(snippet) {
    const cfg = langConfig((loadState().language) || 'yoruba');
    const canvas = document.createElement('canvas');
    canvas.width = CHAT_W;
    canvas.height = CHAT_H;
    const ctx = canvas.getContext('2d');

    // Background — brand green
    const grad = ctx.createLinearGradient(0, 0, 0, CHAT_H);
    grad.addColorStop(0, cfg.bg1);
    grad.addColorStop(1, cfg.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CHAT_W, CHAT_H);

    // Top gold bar
    const topGrad = ctx.createLinearGradient(0, 0, CHAT_W, 0);
    topGrad.addColorStop(0, BRAND.gold);
    topGrad.addColorStop(1, BRAND.goldLight);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, CHAT_W, 10);

    // ---- Header with logo ----
    const headerY = 70;
    drawLogo(ctx, 60, headerY, 64);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = BRAND.cream;
    ctx.font = '800 36px -apple-system, sans-serif';
    ctx.fillText('ClearWords', 60 + 64 + 18, headerY + 32);

    ctx.fillStyle = 'rgba(232,179,60,0.85)';
    ctx.font = '600 24px -apple-system, sans-serif';
    ctx.fillText('A moment with Timmy 🤓', 60, headerY + 88);

    // Divider
    ctx.beginPath();
    ctx.moveTo(60, headerY + 130);
    ctx.lineTo(CHAT_W - 60, headerY + 130);
    ctx.strokeStyle = 'rgba(232,179,60,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ---- Build the exchange to display ----
    const messages = snippet.messages || [];
    const idx = Math.max(0, Math.min(snippet.index || 0, messages.length - 1));

    // The selected message plus the one it replied to (if it was a bot reply)
    let slice = [];
    const selected = messages[idx];
    if (selected) {
      if (selected.role === 'assistant' && idx > 0 && messages[idx - 1].role === 'user') {
        // Show the question + the reply
        slice = [messages[idx - 1], messages[idx]];
      } else if (selected.role === 'user' && idx + 1 < messages.length && messages[idx + 1].role === 'assistant') {
        // Show the user's message + the reply it got
        slice = [messages[idx], messages[idx + 1]];
      } else {
        // Just show the selected message
        slice = [selected];
      }
    }

    // ---- Chat area: a soft cream board so bubbles pop ----
    const boardX = 60;
    const boardY = headerY + 170;
    const boardW = CHAT_W - 120;
    const boardH = CHAT_H - boardY - 200;

    roundedRect(ctx, boardX, boardY, boardW, boardH, 32);
    ctx.fillStyle = 'rgba(15, 62, 36, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,179,60,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ---- Render the bubbles ----
    let y = boardY + 60;
    const bubbleMaxW = boardW - 160;

    for (const m of slice) {
      const isUser = m.role === 'user';
      const text = String(m.text || m.content || '').slice(0, 400);

      // Measure text at target font
      ctx.font = '500 34px -apple-system, sans-serif';
      const wrapped = wrapText(ctx, text, bubbleMaxW);
      const lineH = 46;
      const padding = 28;
      const bubbleH = wrapped.length * lineH + padding * 2 - 6;

      // Bubble width fits the wrapped content
      let maxLineW = 0;
      for (const line of wrapped) maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
      const bubbleW = Math.min(bubbleMaxW, maxLineW + padding * 2);

      const bubbleX = isUser
        ? boardX + boardW - bubbleW - 40
        : boardX + 40;

      // Sender label above bubble
      ctx.textAlign = isUser ? 'right' : 'left';
      ctx.fillStyle = isUser ? BRAND.gold : 'rgba(250,247,242,0.7)';
      ctx.font = '700 22px -apple-system, sans-serif';
      ctx.textBaseline = 'bottom';
      const labelX = isUser ? boardX + boardW - 40 : boardX + 40;
      ctx.fillText(isUser ? 'You' : 'Timmy', labelX, y - 10);
      y += 12;

      // Bubble background
      roundedRect(ctx, bubbleX, y, bubbleW, bubbleH, 26);
      if (isUser) {
        ctx.fillStyle = BRAND.gold;
      } else {
        ctx.fillStyle = 'rgba(250,247,242,0.10)';
      }
      ctx.fill();
      if (!isUser) {
        ctx.strokeStyle = 'rgba(232,179,60,0.30)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Bubble text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isUser ? BRAND.greenDark : BRAND.cream;
      ctx.font = '500 34px -apple-system, sans-serif';
      let ty = y + padding;
      for (const line of wrapped) {
        ctx.fillText(line, bubbleX + padding, ty);
        ty += lineH;
      }

      y += bubbleH + 60;
    }

    // ---- Footer: URL + tagline ----
    const footerY = CHAT_H - 90;
    drawLogo(ctx, 60, footerY, 36);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(250,247,242,0.62)';
    ctx.font = '600 22px -apple-system, sans-serif';
    ctx.fillText('clearwords.com.ng', 60 + 36 + 12, footerY + 18);

    ctx.textAlign = 'right';
    ctx.fillStyle = BRAND.gold;
    ctx.font = '700 22px -apple-system, sans-serif';
    ctx.fillText('Learn Nigerian languages 🇳🇬', CHAT_W - 60, footerY + 18);

    return canvas;
  }

  /* ============================================================
     CANVAS → BLOB helpers
     ============================================================ */

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png', 0.95);
      } else {
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
     SHARE SHEET
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
        max-width: 100%; max-height: 55vh;
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
        } catch (e) {}
      }, { primary: true });
    }

    addBtn('WhatsApp', '💬', async () => {
      try {
        const blob = await canvasToBlob(canvas);
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'ClearWords', text: caption || '' });
          _closeSheet();
          return;
        }
        await copyBlobToClipboard(blob).catch(() => {});
        const text = encodeURIComponent((caption || 'My ClearWords card') + ' — clearwords.com.ng');
        window.open(`https://wa.me/?text=${text}`, '_blank');
        _closeSheet();
      } catch (e) { console.warn('WhatsApp share failed:', e); }
    });

    addBtn('X', '𝕏', async () => {
      const text = encodeURIComponent((caption || 'Learning Nigerian languages with ClearWords') + ' — clearwords.com.ng');
      window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
      _closeSheet();
    });

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
      } catch (e) {}
    }
    throw new Error('Clipboard image copy not supported');
  }

  function _closeSheet() {
    const sheet = document.getElementById('cw-share-sheet');
    if (sheet) sheet.classList.remove('active');
    document.body.style.overflow = '';
  }

  /* ============================================================
     PUBLIC
     ============================================================ */

  async function openIdentity(seed) {
    const data = await gather();
    if (!data) {
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
