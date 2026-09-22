BEGIN;
-- Local/staging publication only. No commerce table, provider or domain mutation.
ALTER TABLE theme_publications DROP CONSTRAINT theme_publications_status_check;
ALTER TABLE theme_publications ADD CONSTRAINT theme_publications_status_check CHECK(status IN
 ('DRAFT','VALIDATING','READY','PUBLICATION_REQUESTED','BUILDING','DEPLOYING','ACTIVE','BLOCKED','FAILED','SUPERSEDED'));
ALTER TABLE theme_publications ADD COLUMN worker_token UUID;
ALTER TABLE theme_publications ADD COLUMN worker_expires_at TIMESTAMPTZ;
ALTER TABLE theme_publications ADD CONSTRAINT theme_publication_worker_pair CHECK((worker_token IS NULL)=(worker_expires_at IS NULL));

CREATE TABLE theme_publication_artifacts (
 id UUID PRIMARY KEY,
 service_id UUID NOT NULL,
 organization_id BIGINT NOT NULL,
 store_id BIGINT NOT NULL,
 publication_id UUID NOT NULL UNIQUE,
 channel TEXT NOT NULL CHECK(channel IN ('web','app')),
 environment TEXT NOT NULL DEFAULT 'LOCAL' CHECK(environment='LOCAL'),
 digest TEXT NOT NULL UNIQUE CHECK(digest ~ '^[a-f0-9]{64}$'),
 source_digest TEXT NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
 storage_key TEXT NOT NULL UNIQUE CHECK(storage_key ~ '^artifacts/[a-f0-9]{64}$'),
 manifest JSONB NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=4194304),
 validation JSONB NOT NULL CHECK(jsonb_typeof(validation)='object' AND octet_length(validation::text)<=4194304),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,service_id,organization_id,store_id,channel,environment),
 FOREIGN KEY(publication_id,service_id,organization_id,store_id)
  REFERENCES theme_publications(id,service_id,organization_id,store_id) ON DELETE RESTRICT
);

CREATE TABLE theme_publication_stage_events (
 id BIGSERIAL PRIMARY KEY,
 publication_id UUID NOT NULL REFERENCES theme_publications(id) ON DELETE RESTRICT,
 state TEXT NOT NULL CHECK(state IN ('DRAFT','VALIDATING','READY','PUBLICATION_REQUESTED','BUILDING','DEPLOYING','ACTIVE','BLOCKED','FAILED','SUPERSEDED')),
 reason TEXT CHECK(reason ~ '^[A-Z0-9_]{1,120}$'),
 evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=4194304),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE theme_active_artifacts (
 service_id UUID NOT NULL,
 organization_id BIGINT NOT NULL,
 store_id BIGINT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('web','app')),
 environment TEXT NOT NULL DEFAULT 'LOCAL' CHECK(environment='LOCAL'),
 artifact_id UUID NOT NULL,
 previous_artifact_id UUID,
 generation BIGINT NOT NULL CHECK(generation>0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(service_id,channel,environment),
 FOREIGN KEY(artifact_id,service_id,organization_id,store_id,channel,environment)
  REFERENCES theme_publication_artifacts(id,service_id,organization_id,store_id,channel,environment) ON DELETE RESTRICT,
 FOREIGN KEY(previous_artifact_id,service_id,organization_id,store_id,channel,environment)
  REFERENCES theme_publication_artifacts(id,service_id,organization_id,store_id,channel,environment) ON DELETE RESTRICT
);

CREATE TABLE theme_publication_activations (
 id UUID PRIMARY KEY,
 service_id UUID NOT NULL,
 organization_id BIGINT NOT NULL,
 store_id BIGINT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('web','app')),
 environment TEXT NOT NULL CHECK(environment='LOCAL'),
 artifact_id UUID NOT NULL,
 previous_artifact_id UUID,
 generation BIGINT NOT NULL CHECK(generation>0),
 operation TEXT NOT NULL CHECK(operation IN ('ACTIVATE','ROLLBACK')),
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=4194304),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(service_id,channel,environment,generation),
 FOREIGN KEY(artifact_id,service_id,organization_id,store_id,channel,environment)
  REFERENCES theme_publication_artifacts(id,service_id,organization_id,store_id,channel,environment) ON DELETE RESTRICT,
 FOREIGN KEY(previous_artifact_id,service_id,organization_id,store_id,channel,environment)
  REFERENCES theme_publication_artifacts(id,service_id,organization_id,store_id,channel,environment) ON DELETE RESTRICT
);

CREATE TABLE theme_asset_retention (
 asset_id UUID PRIMARY KEY REFERENCES theme_assets(id) ON DELETE RESTRICT,
 service_id UUID NOT NULL,
 organization_id BIGINT NOT NULL,
 store_id BIGINT NOT NULL,
 state TEXT NOT NULL CHECK(state='TOMBSTONED'),
 reason TEXT NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 1 AND 240),
 retain_until TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(retain_until>=created_at),
 FOREIGN KEY(asset_id,service_id,organization_id,store_id)
  REFERENCES theme_assets(id,service_id,organization_id,store_id) ON DELETE RESTRICT
);

CREATE FUNCTION theme_publication_immutable_record() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'THEME_PUBLICATION_EVIDENCE_IMMUTABLE' USING ERRCODE='55000'; END;
$$;
DO $$ DECLARE table_name TEXT; BEGIN
 FOREACH table_name IN ARRAY ARRAY['theme_publication_artifacts','theme_publication_stage_events','theme_publication_activations','theme_asset_retention'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION theme_publication_immutable_record()',table_name||'_immutable',table_name);
 END LOOP;
END; $$;
CREATE TRIGGER theme_active_artifacts_scope_identity BEFORE UPDATE ON theme_active_artifacts
 FOR EACH ROW EXECUTE FUNCTION theme_platform_guard_scope_identity();
CREATE FUNCTION theme_publication_pointer_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.channel<>OLD.channel OR NEW.environment<>OLD.environment OR NEW.generation<>OLD.generation+1
  OR NEW.previous_artifact_id IS DISTINCT FROM OLD.artifact_id THEN
  RAISE EXCEPTION 'THEME_PUBLICATION_POINTER_CONFLICT' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER theme_active_artifacts_generation BEFORE UPDATE ON theme_active_artifacts
 FOR EACH ROW EXECUTE FUNCTION theme_publication_pointer_guard();
CREATE INDEX theme_publication_stage_history ON theme_publication_stage_events(publication_id,id);
CREATE INDEX theme_asset_retention_due ON theme_asset_retention(retain_until,asset_id);
COMMIT;
