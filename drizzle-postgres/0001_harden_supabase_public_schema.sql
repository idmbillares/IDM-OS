-- IDM OS uses a private server-side PostgreSQL connection. The Supabase Data
-- API roles must never receive direct access to operational or financial data.
ALTER TABLE idm_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_unlock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION idm_migration_mode() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION idm_append_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION idm_movement_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION idm_transaction_guard() FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
