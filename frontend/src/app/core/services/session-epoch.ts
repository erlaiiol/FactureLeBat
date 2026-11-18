// "This release needs everyone to log in again" switch.
//
// Bump SESSION_EPOCH (1 → 2 → …) in a release whose sessions from an older
// build can't be trusted to keep working — e.g. a change to cookie names/
// paths/sameSite, to what the session must carry, or to the native shell's
// origin. On the first launch of that build (new store version on iOS/
// Android, or simply the next page load after a web deploy), a user still
// logged in from an earlier epoch is logged out server-side (refresh token
// revoked, cookies cleared) and lands on /connexion with an explanation —
// see AuthService.ensureLoaded. Never bump it for an ordinary release.
//
// A device with no stored epoch at all (first launch of the build that
// introduced this file, or wiped storage) counts as *current*: introducing
// the mechanism must not itself log everybody out.
export const SESSION_EPOCH = 1;

const STORAGE_KEY = 'fl.sessionEpoch';

export function isSessionEpochOutdated(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return false;
    }
    const stored = Number(raw);
    return Number.isFinite(stored) && stored < SESSION_EPOCH;
  } catch {
    return false;
  }
}

export function markSessionEpochCurrent(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(SESSION_EPOCH));
  } catch {
    // Storage unavailable — the check above then always reads "current".
  }
}
