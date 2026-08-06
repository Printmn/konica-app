const fs = require('node:fs');
const path = require('node:path');

const appJson = require('./app.json');

/**
 * Build-time configuration.
 *
 * `app.json` is the static base; this file layers the Realtime Database token
 * on top so the secret never sits in a tracked file.
 *
 * The token is looked for in three places, in order:
 *
 *   1. `process.env` — how EAS Build supplies it on the server.
 *   2. `.env` in this folder, read here rather than relied upon.
 *   3. `app.json`, which is committed empty and only ever a placeholder.
 *
 * Step 2 exists because this file is evaluated by several different Expo
 * commands, and not all of them load `.env` first. `eas update` shells out to
 * `expo config --json`, which does not — so an update published happily with
 * no token at all, every request came back 401, and the app showed "could not
 * reach the server" on the shop floor. Reading the file here means it does not
 * matter which process asks.
 *
 * An empty token is a hard failure rather than a fallback, for the same
 * reason: failing here costs a moment, failing on the counter costs a day.
 * Set `ALLOW_EMPTY_RTDB_AUTH=1` to work on the UI without a database.
 *
 * A caveat worth stating plainly: whatever lands in `extra` is embedded in the
 * app bundle, and a database secret grants full admin. Anyone who unpacks the
 * binary can read it. This keeps the token out of git — it does not make the
 * token safe. Firebase Auth with per-device credentials is the real fix.
 */

/** Minimal `.env` reader. Enough for `KEY=value`, quoted or not. */
function readEnvFile(name) {
  try {
    const contents = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of contents.split('\n')) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match || match[1] !== name) continue;
      return match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // No `.env` at all is normal on the build server, where the value comes
    // from the environment instead.
  }
  return '';
}

const firstNonEmpty = (...values) =>
  values.find((value) => typeof value === 'string' && value.length > 0) ?? '';

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...config };

  const rtdbAuth = firstNonEmpty(
    process.env.RTDB_AUTH,
    readEnvFile('RTDB_AUTH'),
    base.extra?.rtdbAuth,
  );

  if (rtdbAuth === '' && process.env.ALLOW_EMPTY_RTDB_AUTH !== '1') {
    throw new Error(
      'RTDB_AUTH is empty — the app would ship with no database access.\n' +
        '  • Locally: check that .env contains RTDB_AUTH=<token>.\n' +
        '  • On EAS Build: the build profile needs "environment", and the\n' +
        '    variable must exist in that environment.\n' +
        '  • UI-only work without a database: ALLOW_EMPTY_RTDB_AUTH=1',
    );
  }

  return { ...base, extra: { ...base.extra, rtdbAuth } };
};
