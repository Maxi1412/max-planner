'use strict';
// Private Mum Google Calendar -> encrypted public-repository payload.
// No Google credentials, raw events, or encryption keys are written to this repository.
const fs = require('node:fs');
const crypto = require('node:crypto');

async function main() {
  const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
  const keyHex = process.env.MUM_CALENDAR_FEED_KEY;
  if (!accessToken) throw new Error('Google Calendar access token is unavailable.');
  if (!/^[0-9a-f]{64}$/i.test(keyHex || '')) throw new Error('Set MUM_CALENDAR_FEED_KEY to exactly 64 hexadecimal characters in GitHub Actions secrets.');
  const key = Buffer.from(keyHex, 'hex');
  const calendarId = 'martina.orihuela@gmail.com';
  const min = new Date(); min.setUTCDate(min.getUTCDate() - 120); min.setUTCHours(0, 0, 0, 0);
  const max = new Date(); max.setUTCDate(max.getUTCDate() + 365); max.setUTCHours(23, 59, 59, 999);
  const events = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      timeMin: min.toISOString(), timeMax: max.toISOString(),
      singleEvents: 'true', showDeleted: 'true', maxResults: '2500',
      fields: 'nextPageToken,items(id,status,summary,description,location,start,end,updated,htmlLink)'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events?' + params;
    const res = await fetch(url, {headers: {Authorization: 'Bearer ' + accessToken}});
    if (!res.ok) throw new Error('Google Calendar read failed (HTTP ' + res.status + '). Encrypted feed not modified.');
    const page = await res.json();
    if (!Array.isArray(page.items)) throw new Error('Google Calendar response was incomplete. Encrypted feed not modified.');
    events.push(...page.items);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  // Sort for stable HMAC. Private event details are encrypted below.
  events.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const plain = JSON.stringify({
    version: 1,
    calendarId,
    range: {minKey: min.toISOString().slice(0, 10), maxKey: max.toISOString().slice(0, 10)},
    items: events
  });
  const fingerprint = crypto.createHmac('sha256', key).update(plain).digest('hex');
  const outputPath = 'mum-calendar.enc.json';
  if (fs.existsSync(outputPath)) {
    try {
      const previous = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (previous.version === 1 && previous.fingerprint === fingerprint) {
        console.log('Encrypted calendar feed is up to date. No change.');
        return;
      }
    } catch (_) { /* Do not trust an invalid previous payload. */ }
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  fs.writeFileSync(outputPath, JSON.stringify({
    version: 1, cipher: 'AES-256-GCM',
    iv: iv.toString('base64'), ciphertext: encrypted.toString('base64'), fingerprint
  }) + '\n', {mode: 0o644});
  console.log('Encrypted calendar feed updated successfully. No event details logged.');
}
if (require.main === module) main().catch(err => {console.error(err.message); process.exitCode = 1;});
module.exports = {main};