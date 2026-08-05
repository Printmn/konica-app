const appJson = require('./app.json');

/**
 * Build-time configuration.
 *
 * `app.json` is the static base; this file layers the Realtime Database token
 * on top from the environment so the secret never sits in a tracked file.
 * Expo CLI loads `.env` before evaluating this, and EAS injects the same name
 * from `eas secret:create --name RTDB_AUTH`.
 *
 * The fallback to `app.json` is deliberate: a machine with no `.env` still
 * builds and runs rather than failing with an empty token and a wall of 401s.
 * Keep that value empty in the committed file.
 *
 * A caveat worth stating plainly: whatever lands in `extra` is embedded in the
 * app bundle, and a database secret grants full admin. Anyone who unpacks the
 * binary can read it. This keeps the token out of git — it does not make the
 * token safe. Firebase Auth with per-device credentials is the real fix.
 */
module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...config };
  const fromEnv = process.env.RTDB_AUTH;

  return {
    ...base,
    extra: {
      ...base.extra,
      rtdbAuth:
        typeof fromEnv === 'string' && fromEnv.length > 0
          ? fromEnv
          : (base.extra?.rtdbAuth ?? ''),
    },
  };
};
