-- Parish-managed Resend accounts are retired in favor of AGAPAY's centrally
-- managed sender. Keep the historical table for safe application rollback,
-- but remove every stored third-party credential.
DELETE FROM parish_email_credentials;
