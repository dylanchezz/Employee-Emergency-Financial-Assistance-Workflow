-- 010_oauth.sql
-- Enhancement A3 — Google sign-in (OAuth2 authorization-code flow). Design locked in Impact Log A25.
--
-- 1. password_hash becomes NULLABLE: a Google-created account has no password of ours.
--    Password login on such an account is refused with "this account uses Google sign-in".
--
-- 2. oauth_provider + oauth_subject: the external identity. We store Google's stable `sub`
--    (subject id), NOT just the email — an email address can change, `sub` never does.
--    Generic column names leave room for other providers later (future work).
--
-- 3. Integrity rules (CHECK constraints), so the database itself refuses broken accounts:
--    - provider and subject are both set or both NULL (never half an identity);
--    - every account has at least one way to sign in (a password or an external identity).
--    And a UNIQUE (provider, subject): one Google identity can map to only one account.
--
-- Existing rows all have a password and no OAuth identity, so they satisfy every rule.

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20),
    ADD COLUMN IF NOT EXISTS oauth_subject  VARCHAR(255);

ALTER TABLE users
    ADD CONSTRAINT users_oauth_pair_chk
        CHECK ((oauth_provider IS NULL) = (oauth_subject IS NULL)),
    ADD CONSTRAINT users_has_login_method_chk
        CHECK (password_hash IS NOT NULL OR oauth_subject IS NOT NULL),
    ADD CONSTRAINT users_oauth_identity_key
        UNIQUE (oauth_provider, oauth_subject);
