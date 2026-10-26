/* Encrypted Mum Google Calendar feed reader. Never loads plain calendar data from GitHub. */
(() => {
  'use strict';
  const KEY_STORAGE = 'max-planner-mum-feed-secret-v1';
  const FEED_URL = 'https://raw.githubusercontent.com/Maxi1412/max-planner/main/mum-calendar.enc.json';
  const EMAIL = 'martina.orihuela@gmail.com';
  let busy = false, lastFingerprint = '';
  const status = message => {
    const el = document.getElementById('mumPrivateFeedStatus');
    if (el) el.textContent = message;
  };
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const hexBytes = hex => Uint8Array.from(hex.match(/.{2}/g), s => parseInt(s, 16));
  async function refresh() {
    if (busy || document.visibilityState === 'hidden') return;
    const hex = localStorage.getItem(KEY_STORAGE) || '';
    if (!/^[0-9a-f]{64}$/i.test(hex)) return;
    if (!window.MaxPlannerPrivateMumFeed) return;
    busy = true;
    try {
      const res = await fetch(FEED_URL + '?r=' + Date.now(), {cache:'no-store'});
      if (res.status === 404) {status('Private Mum sync: awaiting the first encrypted feed.'); return;}
      if (!res.ok) throw new Error('encrypted feed download failed (' + res.status + ')');
      const encrypted = await res.json();
      if (encrypted.version !== 1 || encrypted.cipher !== 'AES-256-GCM' ||
          !encrypted.iv || !encrypted.ciphertext || !encrypted.fingerprint)
        throw new Error('invalid encrypted feed');
      if (encrypted.fingerprint === lastFingerprint) return;
      const key = await crypto.subtle.importKey('raw', hexBytes(hex), {name:'AES-GCM'}, false, ['decrypt']);
      const plain = await crypto.subtle.decrypt(
        {name:'AES-GCM', iv:bytes(encrypted.iv)}, key, bytes(encrypted.ciphertext));
      const payload = JSON.parse(new TextDecoder().decode(plain));
      if (payload.version !== 1 || payload.calendarId !== EMAIL ||
          !payload.range || !Array.isArray(payload.items)) throw new Error('calendar identity mismatch');
      const result = {
        minKey:payload.range.minKey, maxKey:payload.range.maxKey,
        calendars:[{id:EMAIL, summary:EMAIL}],
        items:payload.items.map(ev => ({...ev, _calendarId:EMAIL, _calendarSummary:EMAIL}))
      };
      const summary = window.MaxPlannerPrivateMumFeed.apply(result);
      lastFingerprint = encrypted.fingerprint;
      status('Private Mum sync active · ' + new Date().toLocaleString() +
             ' · ' + summary.imported + ' new · ' + summary.linked + ' existing linked');
    } catch (_) {
      status('Private Mum sync: cannot read/decrypt feed. Existing appointments preserved. Check that the same key is in GitHub Actions secrets.');
    } finally {busy = false;}
  }
  function configure() {
    try {
      const current = localStorage.getItem(KEY_STORAGE) || '';
      const input = prompt('Enter your 64-character private calendar key. Leave empty to generate a new key, or Cancel to keep existing settings.', current);
      if (input === null) return;
      let hex = input.trim();
      if (!hex) {
        const random = new Uint8Array(32);
        crypto.getRandomValues(random);
        hex = Array.from(random, b => b.toString(16).padStart(2, '0')).join('');
      }
      if (!/^[0-9a-f]{64}$/i.test(hex)) {alert('Invalid key. It must have exactly 64 hexadecimal characters. Nothing changed.');return;}
      localStorage.setItem(KEY_STORAGE, hex.toLowerCase());
      // Prompt displays the private value for copying locally, not in repository code or app logs.
      prompt('Copy this key privately. In GitHub repository Settings → Secrets and variables → Actions, add a repository secret named MUM_CALENDAR_FEED_KEY with EXACTLY this value. Do not share the key in chat.', hex.toLowerCase());
      lastFingerprint = '';
      status('Private Mum sync key saved on this device. Awaiting encrypted feed from GitHub Actions.');
      refresh();
    } catch (_) {status('Private Mum sync key could not be saved. No appointments changed.');}
  }
  function setup() {
    const list = document.querySelector('#menuModal .menuList');
    if (!list || document.getElementById('mumPrivateFeedSetupBtn')) return;
    const button = document.createElement('button');
    button.id = 'mumPrivateFeedSetupBtn';
    button.type = 'button';
    button.textContent = 'Activate private Mum sync (one-time key)';
    button.addEventListener('click', configure);
    const info = document.createElement('div');
    info.id = 'mumPrivateFeedStatus';
    info.className = 'pwaMeta';
    info.textContent = localStorage.getItem(KEY_STORAGE)
      ? 'Private Mum sync: key configured; checking feed…'
      : 'Private Mum sync: not configured';
    const before = document.getElementById('googleCalendarConnectBtn');
    list.insertBefore(button, before || null);
    list.insertBefore(info, before || null);
    refresh();
    setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true});
  else setup();
})();
