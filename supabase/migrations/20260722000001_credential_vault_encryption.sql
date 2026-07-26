-- Encrypt client_credentials passwords at rest (pgcrypto + Vault key). See app RPCs cred_set_secret / cred_get_secret.
alter table client_credentials add column if not exists password_enc bytea;
-- Vault key CRED_ENC_KEY created via vault.create_secret; _cred_enc_key() accessor is definer-only.
-- cred_set_secret(id,pw): org-member check → pgp_sym_encrypt into password_enc, clears plaintext.
-- cred_get_secret(id): org-member check → pgp_sym_decrypt on demand.
-- Backfill encrypted existing plaintext then nulled the password column.
