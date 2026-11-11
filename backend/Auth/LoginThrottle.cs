namespace backend.Auth;

// Phase 7 (A1) — the "no leak" half of login throttling.
//
// Real accounts are throttled in the database (users.failed_login_count / locked_until). But if ONLY
// real accounts could ever be locked, an attacker could learn which emails are registered: hammer an
// address 5 times and see whether the 6th answer is "locked" (429) or still "wrong password" (401).
// So emails that DON'T exist get the same treatment from this small in-memory counter: after
// MaxFailedLogins tries they get the identical 429 message for LockoutDuration.
//
// In memory is fine here: there is nothing to protect (no account), the goal is only to make both
// paths look the same. A restart forgets these counters — harmless. Registered as a singleton.
public class LoginThrottle
{
    private sealed class Entry
    {
        public int Count;
        public DateTimeOffset? LockedUntil;
        public DateTimeOffset LastFailure;
    }

    // Keep memory bounded if someone sprays random emails: past this size, stale entries are pruned.
    private const int PruneThreshold = 10_000;

    private readonly Dictionary<string, Entry> _entries = new();
    private readonly object _gate = new();

    private static string Key(string email) => email.Trim().ToLowerInvariant();

    // The current lock for an unknown email, or null if it isn't locked.
    public DateTimeOffset? ActiveLock(string email)
    {
        lock (_gate)
        {
            return _entries.TryGetValue(Key(email), out var e) && e.LockedUntil > DateTimeOffset.UtcNow
                ? e.LockedUntil
                : null;
        }
    }

    // Count one failed try for an unknown email; returns the lock if this try caused one.
    // Same rule as the DB version: an expired lock starts the count again from zero.
    public DateTimeOffset? RecordFailure(string email)
    {
        var now = DateTimeOffset.UtcNow;
        lock (_gate)
        {
            if (_entries.Count > PruneThreshold) Prune(now);

            var key = Key(email);
            if (!_entries.TryGetValue(key, out var e))
            {
                e = new Entry();
                _entries[key] = e;
            }
            if (e.LockedUntil is { } until && until <= now)
            {
                e.Count = 0;
                e.LockedUntil = null;
            }
            e.Count++;
            e.LastFailure = now;
            if (e.Count >= AuthPolicy.MaxFailedLogins)
            {
                e.LockedUntil ??= now + AuthPolicy.LockoutDuration;
            }
            return e.LockedUntil;
        }
    }

    private void Prune(DateTimeOffset now)
    {
        var stale = _entries
            .Where(kv => (kv.Value.LockedUntil ?? kv.Value.LastFailure + AuthPolicy.LockoutDuration) <= now)
            .Select(kv => kv.Key)
            .ToList();
        foreach (var k in stale) _entries.Remove(k);
    }
}
