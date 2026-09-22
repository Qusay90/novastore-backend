BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Additive local-first Wave 2. No existing tenant is migrated or granted access.
CREATE TABLE theme_experience_profiles (
    code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    capabilities JSONB NOT NULL CHECK (jsonb_typeof(capabilities)='object' AND octet_length(capabilities::text)<32768),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE theme_service_experiences (
    service_id UUID PRIMARY KEY,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    profile_code TEXT NOT NULL REFERENCES theme_experience_profiles(code) ON DELETE RESTRICT,
    overrides JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(overrides)='object' AND octet_length(overrides::text)<32768),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_id,organization_id,store_id) REFERENCES seller_theme_services(id,organization_id,store_id) ON DELETE RESTRICT
);
ALTER TABLE theme_assignments ADD COLUMN commerce_mode TEXT NOT NULL DEFAULT 'MARKETPLACE'
    CHECK(commerce_mode IN ('MARKETPLACE','SINGLE_STORE'));
CREATE TABLE theme_offers (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    theme_version_id UUID NOT NULL REFERENCES theme_versions(id) ON DELETE RESTRICT,
    channel TEXT NOT NULL CHECK(channel IN ('web','app')),
    commerce_mode TEXT NOT NULL CHECK(commerce_mode IN ('MARKETPLACE','SINGLE_STORE')),
    profile_code TEXT NOT NULL REFERENCES theme_experience_profiles(code) ON DELETE RESTRICT,
    overrides JSONB NOT NULL CHECK(jsonb_typeof(overrides)='object' AND octet_length(overrides::text)<32768),
    profile_revision INTEGER NOT NULL CHECK(profile_revision>0),
    policy_revision INTEGER NOT NULL CHECK(policy_revision>0),
    status TEXT NOT NULL DEFAULT 'CONFIGURED' CHECK(status IN ('CONFIGURED','PREPARED_FOR_DELIVERY','WITHDRAWN')),
    assignment_id UUID,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_id,organization_id,store_id) REFERENCES seller_theme_services(id,organization_id,store_id) ON DELETE RESTRICT,
    FOREIGN KEY(assignment_id,service_id,organization_id,store_id) REFERENCES theme_assignments(id,service_id,organization_id,store_id) ON DELETE RESTRICT,
    CHECK((status='PREPARED_FOR_DELIVERY' AND assignment_id IS NOT NULL) OR (status<>'PREPARED_FOR_DELIVERY' AND assignment_id IS NULL))
);
CREATE TABLE theme_version_packages (
    theme_version_id UUID PRIMARY KEY REFERENCES theme_versions(id) ON DELETE RESTRICT,
    manifest JSONB NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=4194304),
    package_digest TEXT NOT NULL CHECK(package_digest ~ '^[a-f0-9]{64}$'),
    renderer_id TEXT NOT NULL CHECK(renderer_id='novastore-studio-core'),
    renderer_version TEXT NOT NULL CHECK(renderer_version='1.0.0'),
    supported_channels TEXT[] NOT NULL CHECK(cardinality(supported_channels)>0 AND supported_channels <@ ARRAY['web','app']::TEXT[]),
    required_capabilities TEXT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE theme_package_assets (
    theme_version_id UUID NOT NULL REFERENCES theme_version_packages(theme_version_id) ON DELETE RESTRICT,
    asset_key TEXT NOT NULL CHECK(asset_key ~ '^theme-assets/[a-z0-9_-]+/[a-z0-9_-]+\.(png|webp|jpg)$'),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
    byte_size BIGINT NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
    digest TEXT NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
    original_digest TEXT NOT NULL CHECK(original_digest ~ '^[a-f0-9]{64}$'),
    width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 8192),
    height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 8192),
    storage_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(theme_version_id,asset_key)
);
ALTER TABLE theme_assets ADD COLUMN width INTEGER CHECK(width BETWEEN 1 AND 8192);
ALTER TABLE theme_assets ADD COLUMN height INTEGER CHECK(height BETWEEN 1 AND 8192);
ALTER TABLE theme_assets ADD COLUMN original_digest TEXT CHECK(original_digest ~ '^[a-f0-9]{64}$');
ALTER TABLE theme_assets ADD COLUMN storage_backend TEXT CHECK(storage_backend='local-v1');
ALTER TABLE theme_assets ADD CONSTRAINT theme_real_storage_ready CHECK(storage_backend IS NULL OR status<>'READY'
    OR (width IS NOT NULL AND height IS NOT NULL AND original_digest IS NOT NULL));

CREATE TABLE theme_domain_bindings (
    id UUID PRIMARY KEY,
    hostname TEXT NOT NULL UNIQUE CHECK(hostname=lower(hostname) AND char_length(hostname) BETWEEN 1 AND 253
        AND hostname ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' AND hostname NOT LIKE '%..%'),
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    assignment_id UUID NOT NULL,
    commerce_mode TEXT NOT NULL DEFAULT 'SINGLE_STORE' CHECK(commerce_mode IN ('MARKETPLACE','SINGLE_STORE')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','REVOKED')),
    verified_at TIMESTAMPTZ,
    verification_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_id,organization_id,store_id) REFERENCES seller_theme_services(id,organization_id,store_id) ON DELETE RESTRICT,
    FOREIGN KEY(assignment_id,service_id,organization_id,store_id) REFERENCES theme_assignments(id,service_id,organization_id,store_id) ON DELETE RESTRICT,
    CHECK(status<>'VERIFIED' OR (verified_at IS NOT NULL AND length(btrim(verification_reference))>0))
);
-- Verification is internal only. Wave 2 exposes no domain activation endpoint.
CREATE FUNCTION theme_wave2_guard_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE old_row JSONB:=to_jsonb(OLD); new_row JSONB:=to_jsonb(NEW); field_name TEXT;
BEGIN
    FOREACH field_name IN ARRAY ARRAY['id','service_id','organization_id','store_id','hostname','theme_version_id','channel','commerce_mode'] LOOP
        IF old_row ? field_name AND old_row->field_name IS DISTINCT FROM new_row->field_name THEN
            RAISE EXCEPTION 'THEME_SCOPE_IDENTITY_IMMUTABLE' USING ERRCODE='55000';
        END IF;
    END LOOP;
    IF TG_TABLE_NAME='theme_offers' THEN
        IF OLD.status<>'CONFIGURED' THEN RAISE EXCEPTION 'THEME_OFFER_FINAL' USING ERRCODE='55000'; END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER theme_experiences_scope_identity BEFORE UPDATE ON theme_service_experiences FOR EACH ROW EXECUTE FUNCTION theme_wave2_guard_identity();
CREATE TRIGGER theme_offers_scope_identity BEFORE UPDATE ON theme_offers FOR EACH ROW EXECUTE FUNCTION theme_wave2_guard_identity();
CREATE TRIGGER theme_domains_scope_identity BEFORE UPDATE ON theme_domain_bindings FOR EACH ROW EXECUTE FUNCTION theme_platform_guard_scope_identity();
CREATE TRIGGER theme_domains_host_identity BEFORE UPDATE ON theme_domain_bindings FOR EACH ROW EXECUTE FUNCTION theme_wave2_guard_identity();
CREATE TRIGGER theme_assignments_mode_identity BEFORE UPDATE ON theme_assignments FOR EACH ROW EXECUTE FUNCTION theme_wave2_guard_identity();
DO $$ DECLARE table_name TEXT; BEGIN
    FOREACH table_name IN ARRAY ARRAY['theme_version_packages','theme_package_assets'] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION theme_platform_prevent_history_mutation()',table_name||'_immutable',table_name);
        EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION theme_platform_prevent_history_mutation()',table_name||'_no_truncate',table_name);
    END LOOP;
END; $$;
CREATE INDEX theme_offers_service ON theme_offers(service_id,created_at DESC);
CREATE INDEX theme_domains_scope ON theme_domain_bindings(service_id,status);

-- Seed only product capability definitions; no account/service gets a grant here.
INSERT INTO theme_experience_profiles(code,name,capabilities) VALUES
('BASIC','BASIC','{"theme.logo":"EDITABLE","theme.colors":"EDITABLE","theme.typography":"EDITABLE","theme.header":"READ_ONLY","theme.footer":"READ_ONLY","theme.navigation":"READ_ONLY","theme.product_grid":"EDITABLE","theme.category_grid":"EDITABLE","theme.banner":"EDITABLE","theme.text":"EDITABLE","theme.homepage_blocks":"HIDDEN","theme.campaign_canvas":"HIDDEN","theme.advanced_blocks":"HIDDEN","theme.assets":"READ_ONLY","theme.preview":"EDITABLE","theme.save_draft":"EDITABLE","theme.mobile_editor":"HIDDEN","theme.version_history":"READ_ONLY","theme.publish":"HIDDEN","theme.direct_publish":"HIDDEN","theme.scheduling":"HIDDEN","theme.custom_css":"HIDDEN","theme.custom_html":"HIDDEN","theme.custom_js":"HIDDEN","theme.ai_builder":"HIDDEN"}'::jsonb),
('ADVANCED','ADVANCED','{"theme.logo":"EDITABLE","theme.colors":"EDITABLE","theme.typography":"EDITABLE","theme.header":"READ_ONLY","theme.footer":"MANAGE","theme.navigation":"MANAGE","theme.product_grid":"EDITABLE","theme.category_grid":"EDITABLE","theme.banner":"EDITABLE","theme.text":"EDITABLE","theme.homepage_blocks":"MANAGE","theme.campaign_canvas":"HIDDEN","theme.advanced_blocks":"HIDDEN","theme.assets":"MANAGE","theme.preview":"EDITABLE","theme.save_draft":"EDITABLE","theme.mobile_editor":"EDITABLE","theme.version_history":"READ_ONLY","theme.publish":"HIDDEN","theme.direct_publish":"HIDDEN","theme.scheduling":"HIDDEN","theme.custom_css":"HIDDEN","theme.custom_html":"HIDDEN","theme.custom_js":"HIDDEN","theme.ai_builder":"HIDDEN"}'::jsonb),
('PRO','PRO','{"theme.logo":"EDITABLE","theme.colors":"EDITABLE","theme.typography":"EDITABLE","theme.header":"MANAGE","theme.footer":"MANAGE","theme.navigation":"MANAGE","theme.product_grid":"EDITABLE","theme.category_grid":"EDITABLE","theme.banner":"EDITABLE","theme.text":"EDITABLE","theme.homepage_blocks":"MANAGE","theme.campaign_canvas":"MANAGE","theme.advanced_blocks":"MANAGE","theme.assets":"MANAGE","theme.preview":"EDITABLE","theme.save_draft":"EDITABLE","theme.mobile_editor":"EDITABLE","theme.version_history":"READ_ONLY","theme.publish":"PUBLISH","theme.direct_publish":"HIDDEN","theme.scheduling":"HIDDEN","theme.custom_css":"HIDDEN","theme.custom_html":"HIDDEN","theme.custom_js":"HIDDEN","theme.ai_builder":"HIDDEN"}'::jsonb),
('CUSTOM','CUSTOM','{"theme.logo":"HIDDEN","theme.colors":"HIDDEN","theme.typography":"HIDDEN","theme.header":"HIDDEN","theme.footer":"HIDDEN","theme.navigation":"HIDDEN","theme.product_grid":"HIDDEN","theme.category_grid":"HIDDEN","theme.banner":"HIDDEN","theme.text":"HIDDEN","theme.homepage_blocks":"HIDDEN","theme.campaign_canvas":"HIDDEN","theme.advanced_blocks":"HIDDEN","theme.assets":"HIDDEN","theme.preview":"HIDDEN","theme.save_draft":"HIDDEN","theme.mobile_editor":"HIDDEN","theme.version_history":"HIDDEN","theme.publish":"HIDDEN","theme.direct_publish":"HIDDEN","theme.scheduling":"HIDDEN","theme.custom_css":"HIDDEN","theme.custom_html":"HIDDEN","theme.custom_js":"HIDDEN","theme.ai_builder":"HIDDEN"}'::jsonb);
COMMIT;
