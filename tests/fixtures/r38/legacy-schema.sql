-- DISPOSABLE ONLY. This creates empty public schema objects, never production data.
SET search_path TO public, pg_catalog;
CREATE SEQUENCE "admin_catalog_audit_events_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "assistant_events_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "attribute_definitions_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "attribute_options_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "attribute_templates_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "categories_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "category_aliases_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "collection_rules_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "collections_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "coupons_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "customer_addresses_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "favorites_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "invoices_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "menu_items_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "menus_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "messages_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "notification_audit_logs_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "notifications_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "order_events_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "order_items_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "orders_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "page_visits_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "payments_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "product_actions_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "product_attribute_values_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "product_media_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "product_questions_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "products_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "returns_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "review_media_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "reviews_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "shipments_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "stores_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;
CREATE SEQUENCE "users_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "visitor_sessions_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE SEQUENCE "webhook_events_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;
CREATE OR REPLACE FUNCTION public.normalize_product_sku(raw_sku text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT UPPER(REPLACE(BTRIM(raw_sku), ' ', ''))
$function$
;
CREATE OR REPLACE FUNCTION public.reject_admin_catalog_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'admin_catalog_audit_events is append-only'
        USING ERRCODE = '55000';
END;
$function$
;
CREATE TABLE "admin_catalog_audit_events" (
"id" bigint DEFAULT nextval('admin_catalog_audit_events_id_seq'::regclass) NOT NULL,
"actor_user_id" bigint NOT NULL,
"actor_role" character varying(20) NOT NULL,
"entity_type" character varying(40) NOT NULL,
"entity_key" character varying(160) NOT NULL,
"action" character varying(40) NOT NULL,
"expected_revision" bigint,
"result_revision" bigint NOT NULL,
"changed_fields" text[] DEFAULT ARRAY[]::text[] NOT NULL,
"request_id" character varying(120),
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "assistant_events" (
"id" integer DEFAULT nextval('assistant_events_id_seq'::regclass) NOT NULL,
"session_id" character varying(80) NOT NULL,
"user_id" integer,
"event_name" character varying(80) NOT NULL,
"tool_name" character varying(80),
"intent" character varying(80),
"product_id" integer,
"query_text" text,
"page" character varying(120),
"status" character varying(40) DEFAULT 'success'::character varying,
"metadata" jsonb DEFAULT '{}'::jsonb,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "attribute_definitions" (
"id" integer DEFAULT nextval('attribute_definitions_id_seq'::regclass) NOT NULL,
"code" character varying(80) NOT NULL,
"name" character varying(160) NOT NULL,
"type" character varying(24) NOT NULL,
"unit" character varying(40),
"is_filterable" boolean DEFAULT false NOT NULL,
"is_required" boolean DEFAULT false NOT NULL,
"is_variant_relevant" boolean DEFAULT false NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"validation_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "attribute_options" (
"id" integer DEFAULT nextval('attribute_options_id_seq'::regclass) NOT NULL,
"attribute_id" integer NOT NULL,
"value" character varying(160) NOT NULL,
"label" character varying(160) NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "attribute_templates" (
"id" integer DEFAULT nextval('attribute_templates_id_seq'::regclass) NOT NULL,
"name" character varying(160) NOT NULL,
"category_id" integer NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "campaign_configs" (
"key" character varying(80) NOT NULL,
"value" text NOT NULL,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "categories" (
"id" integer DEFAULT nextval('categories_id_seq'::regclass) NOT NULL,
"name" character varying(255) NOT NULL,
"parent_id" integer,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"slug" character varying(255),
"path" text,
"depth" integer,
"image_url" text,
"banner_url" text,
"icon" text,
"accent_color" character varying(20),
"description" text,
"seo_title" character varying(255),
"seo_description" text,
"sort_order" integer DEFAULT 0 NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"is_customer_visible" boolean DEFAULT true NOT NULL,
"show_in_menu" boolean DEFAULT true NOT NULL,
"show_on_home" boolean DEFAULT false NOT NULL,
"hide_when_empty" boolean DEFAULT true NOT NULL,
"google_taxonomy_id" character varying(100),
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"deleted_at" timestamp with time zone,
"revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "category_aliases" (
"id" bigint DEFAULT nextval('category_aliases_id_seq'::regclass) NOT NULL,
"category_id" integer NOT NULL,
"alias" character varying(255) NOT NULL,
"normalized_alias" character varying(255) NOT NULL,
"alias_type" character varying(30) DEFAULT 'legacy'::character varying NOT NULL,
"redirect_status" smallint DEFAULT 301 NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "category_stats" (
"category_id" integer NOT NULL,
"direct_product_count" bigint DEFAULT 0 NOT NULL,
"visible_product_count" bigint DEFAULT 0 NOT NULL,
"sellable_product_count" bigint DEFAULT 0 NOT NULL,
"descendant_visible_product_count" bigint DEFAULT 0 NOT NULL,
"descendant_sellable_product_count" bigint DEFAULT 0 NOT NULL,
"subtree_visible_product_count" bigint DEFAULT 0 NOT NULL,
"subtree_sellable_product_count" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "collection_products" (
"collection_id" bigint NOT NULL,
"product_id" integer NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "collection_rules" (
"id" bigint DEFAULT nextval('collection_rules_id_seq'::regclass) NOT NULL,
"collection_id" bigint NOT NULL,
"rule_type" character varying(40) NOT NULL,
"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "collections" (
"id" bigint DEFAULT nextval('collections_id_seq'::regclass) NOT NULL,
"name" character varying(160) NOT NULL,
"slug" character varying(180) NOT NULL,
"collection_type" character varying(20) DEFAULT 'manual'::character varying NOT NULL,
"rule_code" character varying(40),
"description" text,
"image_url" text,
"banner_url" text,
"accent_color" character varying(20),
"seo_title" character varying(180),
"seo_description" text,
"sort_order" integer DEFAULT 0 NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"deleted_at" timestamp with time zone,
"show_on_home" boolean DEFAULT false NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "coupons" (
"id" integer DEFAULT nextval('coupons_id_seq'::regclass) NOT NULL,
"code" character varying(64) NOT NULL,
"discount_type" character varying(20) NOT NULL,
"discount_value" numeric(10,2) NOT NULL,
"min_order_amount" numeric(10,2) DEFAULT 0,
"max_discount_amount" numeric(10,2),
"usage_limit" integer,
"used_count" integer DEFAULT 0,
"is_active" boolean DEFAULT true,
"starts_at" timestamp without time zone,
"ends_at" timestamp without time zone,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "customer_addresses" (
"id" integer DEFAULT nextval('customer_addresses_id_seq'::regclass) NOT NULL,
"user_id" integer NOT NULL,
"title" character varying(80) NOT NULL,
"full_name" character varying(160) NOT NULL,
"phone" character varying(40) NOT NULL,
"city" character varying(120) NOT NULL,
"district" character varying(120) NOT NULL,
"address_line" text NOT NULL,
"is_default" boolean DEFAULT false,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "favorites" (
"id" integer DEFAULT nextval('favorites_id_seq'::regclass) NOT NULL,
"user_id" integer NOT NULL,
"product_id" integer NOT NULL,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "invoices" (
"id" integer DEFAULT nextval('invoices_id_seq'::regclass) NOT NULL,
"order_id" integer NOT NULL,
"invoice_type" character varying(30) NOT NULL,
"invoice_no" character varying(80) NOT NULL,
"amount" numeric(10,2) NOT NULL,
"currency" character varying(10) DEFAULT 'TRY'::character varying,
"status" character varying(30) DEFAULT 'CREATED'::character varying,
"provider" character varying(40) DEFAULT 'mock'::character varying,
"provider_ref" character varying(120),
"issued_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "menu_items" (
"id" bigint DEFAULT nextval('menu_items_id_seq'::regclass) NOT NULL,
"menu_id" bigint NOT NULL,
"parent_id" bigint,
"title" character varying(160) NOT NULL,
"subtitle" character varying(240),
"target_type" character varying(30),
"category_id" integer,
"collection_id" bigint,
"internal_url" character varying(500),
"icon" character varying(120),
"image_url" text,
"accent_color" character varying(20),
"sort_order" integer DEFAULT 0 NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "menus" (
"id" bigint DEFAULT nextval('menus_id_seq'::regclass) NOT NULL,
"code" character varying(40) NOT NULL,
"name" character varying(120) NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "messages" (
"id" integer DEFAULT nextval('messages_id_seq'::regclass) NOT NULL,
"sender_id" integer,
"receiver_id" integer,
"message" text NOT NULL,
"is_read" boolean DEFAULT false,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"is_ai_reply" boolean DEFAULT false
);
CREATE TABLE "notification_audit_logs" (
"id" integer DEFAULT nextval('notification_audit_logs_id_seq'::regclass) NOT NULL,
"notification_id" integer,
"channel" character varying(40) NOT NULL,
"room" character varying(120) NOT NULL,
"event_name" character varying(80) NOT NULL,
"payload" jsonb,
"delivered" boolean DEFAULT false,
"attempts" integer DEFAULT 0,
"last_error" text,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "notifications" (
"id" integer DEFAULT nextval('notifications_id_seq'::regclass) NOT NULL,
"user_id" integer,
"type" character varying(50) NOT NULL,
"message" text NOT NULL,
"is_read" boolean DEFAULT false,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "order_events" (
"id" integer DEFAULT nextval('order_events_id_seq'::regclass) NOT NULL,
"order_id" integer NOT NULL,
"event_type" character varying(60) NOT NULL,
"message" text,
"payload" jsonb,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "order_item_backfill_issues" (
"order_id" integer NOT NULL,
"reason" character varying(80) NOT NULL,
"source_items" jsonb,
"recorded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "order_items" (
"id" bigint DEFAULT nextval('order_items_id_seq'::regclass) NOT NULL,
"order_id" integer NOT NULL,
"product_id" integer,
"product_name" character varying(255) NOT NULL,
"quantity" integer NOT NULL,
"unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
"total_price" numeric(12,2) DEFAULT 0 NOT NULL,
"source_item_index" integer,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "orders" (
"id" integer DEFAULT nextval('orders_id_seq'::regclass) NOT NULL,
"user_id" integer,
"total_amount" numeric(10,2) NOT NULL,
"status" character varying(50) DEFAULT 'pending'::character varying,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"customer_name" character varying(100),
"email" character varying(100),
"phone" character varying(20),
"address" text,
"items" jsonb,
"payment_status" character varying(40) DEFAULT 'PENDING'::character varying,
"payment_ref" character varying(120),
"shipment_provider" character varying(80),
"tracking_no" character varying(120),
"shipment_status" character varying(40) DEFAULT 'NONE'::character varying,
"cancel_reason" text,
"refund_status" character varying(40) DEFAULT 'NONE'::character varying,
"estimated_delivery_date" date,
"payment_method" character varying(30) DEFAULT 'card'::character varying,
"currency" character varying(10) DEFAULT 'TRY'::character varying,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"analytics_session_key" character varying(120)
);
CREATE TABLE "page_visits" (
"id" integer DEFAULT nextval('page_visits_id_seq'::regclass) NOT NULL,
"page_key" character varying(120) NOT NULL,
"session_key" character varying(120) NOT NULL,
"page_type" character varying(40) DEFAULT 'other'::character varying,
"page_path" text NOT NULL,
"page_title" character varying(255),
"product_id" integer,
"referrer" text,
"entered_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"last_seen_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"left_at" timestamp without time zone,
"duration_seconds" integer DEFAULT 0,
"heartbeat_count" integer DEFAULT 0
);
CREATE TABLE "payments" (
"id" integer DEFAULT nextval('payments_id_seq'::regclass) NOT NULL,
"order_id" integer NOT NULL,
"provider" character varying(40) NOT NULL,
"idempotency_key" character varying(120),
"payment_ref" character varying(120),
"external_ref" character varying(120),
"amount" numeric(10,2) NOT NULL,
"currency" character varying(10) DEFAULT 'TRY'::character varying,
"status" character varying(40) NOT NULL,
"raw_request" jsonb,
"raw_response" jsonb,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "product_actions" (
"id" integer DEFAULT nextval('product_actions_id_seq'::regclass) NOT NULL,
"action_key" character varying(120) NOT NULL,
"session_key" character varying(120) NOT NULL,
"visitor_key" character varying(120) NOT NULL,
"user_id" integer,
"product_id" integer,
"action_type" character varying(40) NOT NULL,
"quantity" integer DEFAULT 1,
"page_path" text,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "product_attribute_values" (
"id" integer DEFAULT nextval('product_attribute_values_id_seq'::regclass) NOT NULL,
"product_id" integer NOT NULL,
"attribute_id" integer NOT NULL,
"text_value" text,
"number_value" numeric,
"boolean_value" boolean,
"option_id" integer,
"option_ids" integer[],
"range_min" numeric,
"range_max" numeric,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "product_categories" (
"product_id" integer NOT NULL,
"category_id" integer NOT NULL,
"is_primary" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "product_media" (
"id" integer DEFAULT nextval('product_media_id_seq'::regclass) NOT NULL,
"product_id" integer,
"media_url" text NOT NULL,
"is_main" boolean DEFAULT false,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"sort_order" integer DEFAULT 0
);
CREATE TABLE "product_questions" (
"id" integer DEFAULT nextval('product_questions_id_seq'::regclass) NOT NULL,
"product_id" integer,
"user_id" integer,
"question" text NOT NULL,
"answer" text,
"answered_at" timestamp without time zone,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "products" (
"id" integer DEFAULT nextval('products_id_seq'::regclass) NOT NULL,
"name" character varying(255) NOT NULL,
"description" text,
"price" numeric(10,2) NOT NULL,
"stock" integer DEFAULT 0,
"image_url" text,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"old_price" numeric(10,2),
"category" character varying(100) DEFAULT 'Kategorisiz'::character varying,
"categories" text[] DEFAULT ARRAY['Kategorisiz'::text],
"publication_status" character varying(30) DEFAULT 'active'::character varying NOT NULL,
"is_customer_visible" boolean DEFAULT true NOT NULL,
"deleted_at" timestamp with time zone,
"store_id" bigint,
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"revision" bigint DEFAULT 1 NOT NULL,
"sku" character varying(120),
"normalized_sku" character varying(120),
"brand" character varying(160),
"product_type" character varying(160),
"vat_rate" numeric(5,2),
"vat_rate_source" character varying(40),
"weight_grams" integer,
"desi" numeric(10,3)
);
CREATE TABLE "returns" (
"id" integer DEFAULT nextval('returns_id_seq'::regclass) NOT NULL,
"order_id" integer NOT NULL,
"user_id" integer,
"reason_code" character varying(50) NOT NULL,
"note" text,
"status" character varying(40) DEFAULT 'REQUESTED'::character varying,
"refund_amount" numeric(10,2),
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "review_media" (
"id" integer DEFAULT nextval('review_media_id_seq'::regclass) NOT NULL,
"review_id" integer,
"media_url" text NOT NULL,
"media_type" character varying(20) DEFAULT 'image'::character varying,
"sort_order" integer DEFAULT 0,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "reviews" (
"id" integer DEFAULT nextval('reviews_id_seq'::regclass) NOT NULL,
"product_id" integer,
"user_id" integer,
"rating" integer NOT NULL,
"comment" text,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "shipments" (
"id" integer DEFAULT nextval('shipments_id_seq'::regclass) NOT NULL,
"order_id" integer NOT NULL,
"provider" character varying(80) NOT NULL,
"tracking_no" character varying(120) NOT NULL,
"tracking_url" text,
"shipment_status" character varying(40) DEFAULT 'CREATED'::character varying,
"eta_date" date,
"label_url" text,
"raw_payload" jsonb,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "stores" (
"id" bigint DEFAULT nextval('stores_id_seq'::regclass) NOT NULL,
"name" character varying(255) NOT NULL,
"slug" character varying(255),
"owner_user_id" integer,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE "template_attributes" (
"template_id" integer NOT NULL,
"attribute_id" integer NOT NULL,
"is_required" boolean,
"is_filterable" boolean,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "user_shared_state" (
"user_id" integer NOT NULL,
"state_key" character varying(40) NOT NULL,
"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
"updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "users" (
"id" integer DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
"name" character varying(100),
"email" character varying(100) NOT NULL,
"phone" character varying(20),
"password" character varying(255) NOT NULL,
"role" character varying(20) DEFAULT 'customer'::character varying,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"full_name" character varying(100),
"password_reset_token_hash" character varying(64),
"password_reset_expires_at" timestamp without time zone
);
CREATE TABLE "visitor_sessions" (
"id" integer DEFAULT nextval('visitor_sessions_id_seq'::regclass) NOT NULL,
"session_key" character varying(120) NOT NULL,
"visitor_key" character varying(120) NOT NULL,
"user_id" integer,
"landing_path" text,
"entry_page_type" character varying(40) DEFAULT 'other'::character varying,
"referrer" text,
"user_agent" text,
"started_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"last_seen_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"ended_at" timestamp without time zone
);
CREATE TABLE "webhook_events" (
"id" integer DEFAULT nextval('webhook_events_id_seq'::regclass) NOT NULL,
"provider" character varying(40) NOT NULL,
"external_event_id" character varying(120),
"signature_valid" boolean DEFAULT false,
"payload" jsonb,
"processed" boolean DEFAULT false,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "admin_catalog_audit_events_pkey" PRIMARY KEY (id);
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "chk_admin_catalog_audit_action" CHECK (action IN ('create', 'update', 'archive', 'restore', 'link', 'unlink', 'move', 'reorder'));
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "chk_admin_catalog_audit_actor_role" CHECK (actor_role::text = 'admin'::text);
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "chk_admin_catalog_audit_entity_type" CHECK (entity_type IN ('product', 'category', 'attribute', 'attribute_option', 'attribute_template', 'template_attribute', 'collection', 'collection_product', 'menu', 'menu_item'));
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "chk_admin_catalog_audit_expected_by_action" CHECK (action::text = 'create'::text AND expected_revision IS NULL OR action::text <> 'create'::text AND expected_revision IS NOT NULL);
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "chk_admin_catalog_audit_expected_revision" CHECK (expected_revision IS NULL OR expected_revision >= 1);
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "chk_admin_catalog_audit_metadata_object" CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE "admin_catalog_audit_events" ADD CONSTRAINT "chk_admin_catalog_audit_result_revision" CHECK (result_revision >= 1);
ALTER TABLE "assistant_events" ADD CONSTRAINT "assistant_events_pkey" PRIMARY KEY (id);
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_code_format_check" CHECK (code::text ~ '^[a-z][a-z0-9_]{1,79}$'::text);
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY (id);
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_type_check" CHECK (type IN ('text', 'number', 'boolean', 'option', 'multi_option', 'range'));
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_validation_object_check" CHECK (jsonb_typeof(validation_metadata) = 'object'::text);
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "chk_attribute_definitions_revision_positive" CHECK (revision >= 1);
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_pkey" PRIMARY KEY (id);
ALTER TABLE "attribute_options" ADD CONSTRAINT "chk_attribute_options_revision_positive" CHECK (revision >= 1);
ALTER TABLE "attribute_templates" ADD CONSTRAINT "attribute_templates_pkey" PRIMARY KEY (id);
ALTER TABLE "attribute_templates" ADD CONSTRAINT "chk_attribute_templates_revision_positive" CHECK (revision >= 1);
ALTER TABLE "campaign_configs" ADD CONSTRAINT "campaign_configs_pkey" PRIMARY KEY (key);
ALTER TABLE "categories" ADD CONSTRAINT "categories_depth_nonnegative" CHECK (depth IS NULL OR depth >= 0);
ALTER TABLE "categories" ADD CONSTRAINT "categories_pkey" PRIMARY KEY (id);
ALTER TABLE "categories" ADD CONSTRAINT "chk_categories_revision_positive" CHECK (revision >= 1);
ALTER TABLE "category_aliases" ADD CONSTRAINT "category_aliases_pkey" PRIMARY KEY (id);
ALTER TABLE "category_aliases" ADD CONSTRAINT "category_aliases_redirect_status_check" CHECK (redirect_status = ANY (ARRAY[301, 302, 307, 308]));
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_descendant_sellable_product_count_check" CHECK (descendant_sellable_product_count >= 0);
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_descendant_visible_product_count_check" CHECK (descendant_visible_product_count >= 0);
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_direct_product_count_check" CHECK (direct_product_count >= 0);
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_pkey" PRIMARY KEY (category_id);
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_sellable_product_count_check" CHECK (sellable_product_count >= 0);
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_subtree_sellable_product_count_check" CHECK (subtree_sellable_product_count >= 0);
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_subtree_visible_product_count_check" CHECK (subtree_visible_product_count >= 0);
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_visible_product_count_check" CHECK (visible_product_count >= 0);
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_pkey" PRIMARY KEY (collection_id, product_id);
ALTER TABLE "collection_rules" ADD CONSTRAINT "collection_rules_collection_type_unique" UNIQUE (collection_id, rule_type);
ALTER TABLE "collection_rules" ADD CONSTRAINT "collection_rules_pkey" PRIMARY KEY (id);
ALTER TABLE "collection_rules" ADD CONSTRAINT "collection_rules_type_check" CHECK (rule_type IN ('new_arrivals', 'discount', 'best_sellers'));
ALTER TABLE "collections" ADD CONSTRAINT "chk_collections_revision_positive" CHECK (revision >= 1);
ALTER TABLE "collections" ADD CONSTRAINT "collections_pkey" PRIMARY KEY (id);
ALTER TABLE "collections" ADD CONSTRAINT "collections_rule_check" CHECK (collection_type::text = 'manual'::text AND rule_code IS NULL OR collection_type::text = 'dynamic'::text AND (rule_code IN ('new_arrivals', 'discount', 'best_sellers')));
ALTER TABLE "collections" ADD CONSTRAINT "collections_slug_key" UNIQUE (slug);
ALTER TABLE "collections" ADD CONSTRAINT "collections_type_check" CHECK (collection_type IN ('manual', 'dynamic'));
ALTER TABLE "coupons" ADD CONSTRAINT "chk_coupon_type" CHECK (upper(discount_type::text) = ANY (ARRAY['PERCENT'::text, 'FIXED'::text]));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_code_key" UNIQUE (code);
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_pkey" PRIMARY KEY (id);
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY (id);
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_pkey" PRIMARY KEY (id);
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_product_unique" UNIQUE (user_id, product_id);
ALTER TABLE "invoices" ADD CONSTRAINT "chk_invoice_type" CHECK (invoice_type IN ('INVOICE', 'CANCELLATION', 'RETURN'));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoice_no_key" UNIQUE (invoice_no);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pkey" PRIMARY KEY (id);
ALTER TABLE "menu_items" ADD CONSTRAINT "chk_menu_items_revision_positive" CHECK (revision >= 1);
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY (id);
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_target_shape_check" CHECK (target_type IS NULL AND category_id IS NULL AND collection_id IS NULL AND internal_url IS NULL OR target_type::text = 'category'::text AND category_id IS NOT NULL AND collection_id IS NULL AND internal_url IS NULL OR target_type::text = 'collection'::text AND category_id IS NULL AND collection_id IS NOT NULL AND internal_url IS NULL OR target_type::text = 'internal_url'::text AND category_id IS NULL AND collection_id IS NULL AND internal_url IS NOT NULL);
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_target_type_check" CHECK (target_type IS NULL OR (target_type IN ('category', 'collection', 'internal_url')));
ALTER TABLE "menus" ADD CONSTRAINT "chk_menus_revision_positive" CHECK (revision >= 1);
ALTER TABLE "menus" ADD CONSTRAINT "menus_code_check" CHECK (code IN ('main', 'footer', 'mobile', 'home'));
ALTER TABLE "menus" ADD CONSTRAINT "menus_code_key" UNIQUE (code);
ALTER TABLE "menus" ADD CONSTRAINT "menus_pkey" PRIMARY KEY (id);
ALTER TABLE "messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY (id);
ALTER TABLE "notification_audit_logs" ADD CONSTRAINT "notification_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_pkey" PRIMARY KEY (id);
ALTER TABLE "order_item_backfill_issues" ADD CONSTRAINT "order_item_backfill_issues_pkey" PRIMARY KEY (order_id);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_source_unique" UNIQUE (order_id, source_item_index);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_pkey" PRIMARY KEY (id);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK (quantity > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_page_key_key" UNIQUE (page_key);
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_pkey" PRIMARY KEY (id);
ALTER TABLE "payments" ADD CONSTRAINT "payments_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_ref_key" UNIQUE (payment_ref);
ALTER TABLE "payments" ADD CONSTRAINT "payments_pkey" PRIMARY KEY (id);
ALTER TABLE "product_actions" ADD CONSTRAINT "product_actions_action_key_key" UNIQUE (action_key);
ALTER TABLE "product_actions" ADD CONSTRAINT "product_actions_pkey" PRIMARY KEY (id);
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY (id);
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_attribute_unique" UNIQUE (product_id, attribute_id);
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_range_order_check" CHECK (range_min IS NULL OR range_max IS NULL OR range_min <= range_max);
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY (product_id, category_id);
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_pkey" PRIMARY KEY (id);
ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_pkey" PRIMARY KEY (id);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_brand_nonblank" CHECK (brand IS NULL OR brand::text = btrim(brand::text) AND brand::text <> ''::text);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_desi_positive" CHECK (desi IS NULL OR desi > 0::numeric);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_product_type_nonblank" CHECK (product_type IS NULL OR product_type::text = btrim(product_type::text) AND product_type::text <> ''::text);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_revision_positive" CHECK (revision >= 1);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_sku_format" CHECK (sku IS NULL OR sku::text = btrim(sku::text) AND sku::text ~ '^[A-Za-z0-9][A-Za-z0-9._/ -]{0,119}$'::text AND normalized_sku::text = normalize_product_sku(sku::text) AND normalized_sku::text <> ''::text);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_sku_pair" CHECK ((sku IS NULL) = (normalized_sku IS NULL));
ALTER TABLE "products" ADD CONSTRAINT "chk_products_vat_pair" CHECK ((vat_rate IS NULL) = (vat_rate_source IS NULL));
ALTER TABLE "products" ADD CONSTRAINT "chk_products_vat_rate" CHECK (vat_rate IS NULL OR vat_rate >= 0::numeric AND vat_rate <= 100::numeric);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_vat_rate_source" CHECK (vat_rate_source IS NULL OR vat_rate_source::text = 'USER_SUPPLIED_TAX_VALUE'::text);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_weight_grams_positive" CHECK (weight_grams IS NULL OR weight_grams > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
ALTER TABLE "products" ADD CONSTRAINT "products_publication_status_check" CHECK (publication_status IN ('draft', 'pending_approval', 'active', 'inactive', 'rejected', 'archived'));
ALTER TABLE "returns" ADD CONSTRAINT "returns_pkey" PRIMARY KEY (id);
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_pkey" PRIMARY KEY (id);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_pkey" PRIMARY KEY (id);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_key" UNIQUE (order_id);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_pkey" PRIMARY KEY (id);
ALTER TABLE "stores" ADD CONSTRAINT "stores_pkey" PRIMARY KEY (id);
ALTER TABLE "template_attributes" ADD CONSTRAINT "template_attributes_pkey" PRIMARY KEY (template_id, attribute_id);
ALTER TABLE "user_shared_state" ADD CONSTRAINT "user_shared_state_key_check" CHECK (state_key IN ('cart', 'checkout'));
ALTER TABLE "user_shared_state" ADD CONSTRAINT "user_shared_state_pkey" PRIMARY KEY (user_id, state_key);
ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE (email);
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_session_key_key" UNIQUE (session_key);
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_external_event_id_key" UNIQUE (external_event_id);
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY (id);
ALTER TABLE "assistant_events" ADD CONSTRAINT "assistant_events_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE "assistant_events" ADD CONSTRAINT "assistant_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES attribute_definitions(id) ON DELETE CASCADE;
ALTER TABLE "attribute_templates" ADD CONSTRAINT "attribute_templates_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_restrict_fkey" FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE "category_aliases" ADD CONSTRAINT "category_aliases_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE "category_stats" ADD CONSTRAINT "category_stats_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "collection_rules" ADD CONSTRAINT "collection_rules_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE RESTRICT;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_fkey" FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES menu_items(id) ON DELETE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES users(id);
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users(id);
ALTER TABLE "notification_audit_logs" ADD CONSTRAINT "notification_audit_logs_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE "order_item_backfill_issues" ADD CONSTRAINT "order_item_backfill_issues_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_session_key_fkey" FOREIGN KEY (session_key) REFERENCES visitor_sessions(session_key) ON DELETE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE "product_actions" ADD CONSTRAINT "product_actions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE "product_actions" ADD CONSTRAINT "product_actions_session_key_fkey" FOREIGN KEY (session_key) REFERENCES visitor_sessions(session_key) ON DELETE CASCADE;
ALTER TABLE "product_actions" ADD CONSTRAINT "product_actions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES attribute_definitions(id) ON DELETE RESTRICT;
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_option_id_fkey" FOREIGN KEY (option_id) REFERENCES attribute_options(id) ON DELETE RESTRICT;
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE "returns" ADD CONSTRAINT "returns_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE "template_attributes" ADD CONSTRAINT "template_attributes_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES attribute_definitions(id) ON DELETE RESTRICT;
ALTER TABLE "template_attributes" ADD CONSTRAINT "template_attributes_template_id_fkey" FOREIGN KEY (template_id) REFERENCES attribute_templates(id) ON DELETE CASCADE;
ALTER TABLE "user_shared_state" ADD CONSTRAINT "user_shared_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_admin_catalog_audit_actor ON public.admin_catalog_audit_events USING btree (actor_user_id, created_at DESC, id DESC);
CREATE INDEX idx_admin_catalog_audit_entity ON public.admin_catalog_audit_events USING btree (entity_type, entity_key, created_at DESC, id DESC);
CREATE INDEX idx_assistant_events_name_created_at ON public.assistant_events USING btree (event_name, created_at DESC);
CREATE INDEX idx_assistant_events_product_id ON public.assistant_events USING btree (product_id);
CREATE INDEX idx_assistant_events_session_id ON public.assistant_events USING btree (session_id);
CREATE INDEX idx_attribute_definitions_active_sort ON public.attribute_definitions USING btree (sort_order, id) WHERE (is_active = true);
CREATE UNIQUE INDEX uq_attribute_definitions_code_lower ON public.attribute_definitions USING btree (lower((code)::text));
CREATE INDEX idx_attribute_options_attribute_active_sort ON public.attribute_options USING btree (attribute_id, sort_order, id) WHERE (is_active = true);
CREATE UNIQUE INDEX uq_attribute_options_attribute_value_lower ON public.attribute_options USING btree (attribute_id, lower((value)::text));
CREATE INDEX idx_attribute_templates_category_active_sort ON public.attribute_templates USING btree (category_id, sort_order, id) WHERE (is_active = true);
CREATE UNIQUE INDEX uq_attribute_templates_category_name_lower ON public.attribute_templates USING btree (category_id, lower((name)::text));
CREATE INDEX idx_categories_parent_sort ON public.categories USING btree (parent_id, sort_order, id);
CREATE UNIQUE INDEX idx_categories_path_unique ON public.categories USING btree (lower(path)) WHERE ((path IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_categories_public_visibility ON public.categories USING btree (is_active, is_customer_visible, parent_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_categories_sibling_name_unique ON public.categories USING btree (COALESCE(parent_id, 0), lower(btrim((name)::text))) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_categories_slug_unique ON public.categories USING btree (lower((slug)::text)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_category_aliases_category_id ON public.category_aliases USING btree (category_id);
CREATE UNIQUE INDEX idx_category_aliases_normalized_unique ON public.category_aliases USING btree (lower((normalized_alias)::text));
CREATE INDEX idx_collection_products_product ON public.collection_products USING btree (product_id, collection_id);
CREATE INDEX idx_collections_home_public ON public.collections USING btree (sort_order, id) WHERE ((show_on_home = true) AND (is_active = true) AND (deleted_at IS NULL));
CREATE INDEX idx_collections_public ON public.collections USING btree (is_active, sort_order, id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_customer_addresses_one_default ON public.customer_addresses USING btree (user_id) WHERE (is_default = true);
CREATE INDEX idx_customer_addresses_user_id ON public.customer_addresses USING btree (user_id);
CREATE INDEX idx_favorites_product_id ON public.favorites USING btree (product_id);
CREATE INDEX idx_favorites_user_id ON public.favorites USING btree (user_id);
CREATE INDEX idx_invoices_order_id ON public.invoices USING btree (order_id);
CREATE INDEX idx_menu_items_category ON public.menu_items USING btree (category_id) WHERE (category_id IS NOT NULL);
CREATE INDEX idx_menu_items_collection ON public.menu_items USING btree (collection_id) WHERE (collection_id IS NOT NULL);
CREATE INDEX idx_menu_items_menu_parent_sort ON public.menu_items USING btree (menu_id, parent_id, sort_order, id);
CREATE INDEX idx_menu_items_parent ON public.menu_items USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX idx_messages_thread ON public.messages USING btree (sender_id, receiver_id, created_at);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_order_events_order_id ON public.order_events USING btree (order_id);
CREATE INDEX idx_order_items_product_order ON public.order_items USING btree (product_id, order_id);
CREATE INDEX idx_orders_analytics_session_key ON public.orders USING btree (analytics_session_key);
CREATE INDEX idx_orders_completed_created ON public.orders USING btree (status, created_at);
CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);
CREATE INDEX idx_page_visits_entered_at ON public.page_visits USING btree (entered_at DESC);
CREATE INDEX idx_page_visits_product_id ON public.page_visits USING btree (product_id);
CREATE INDEX idx_page_visits_session_key ON public.page_visits USING btree (session_key);
CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);
CREATE INDEX idx_product_actions_product_id ON public.product_actions USING btree (product_id);
CREATE INDEX idx_product_actions_session_key ON public.product_actions USING btree (session_key);
CREATE INDEX idx_product_actions_type_created_at ON public.product_actions USING btree (action_type, created_at DESC);
CREATE INDEX idx_product_attribute_values_attribute_product ON public.product_attribute_values USING btree (attribute_id, product_id);
CREATE INDEX idx_product_attribute_values_boolean ON public.product_attribute_values USING btree (attribute_id, boolean_value) WHERE (boolean_value IS NOT NULL);
CREATE INDEX idx_product_attribute_values_number ON public.product_attribute_values USING btree (attribute_id, number_value) WHERE (number_value IS NOT NULL);
CREATE INDEX idx_product_attribute_values_option_id ON public.product_attribute_values USING btree (option_id, product_id) WHERE (option_id IS NOT NULL);
CREATE INDEX idx_product_attribute_values_option_ids_gin ON public.product_attribute_values USING gin (option_ids) WHERE (option_ids IS NOT NULL);
CREATE INDEX idx_product_attribute_values_range ON public.product_attribute_values USING btree (attribute_id, range_min, range_max) WHERE ((range_min IS NOT NULL) AND (range_max IS NOT NULL));
CREATE INDEX idx_product_attribute_values_text ON public.product_attribute_values USING btree (attribute_id, text_value) WHERE (text_value IS NOT NULL);
CREATE INDEX idx_product_categories_category_product ON public.product_categories USING btree (category_id, product_id);
CREATE UNIQUE INDEX idx_product_categories_one_primary ON public.product_categories USING btree (product_id) WHERE (is_primary = true);
CREATE INDEX idx_product_media_product_id ON public.product_media USING btree (product_id);
CREATE INDEX idx_product_questions_product_id ON public.product_questions USING btree (product_id);
CREATE UNIQUE INDEX idx_products_normalized_sku_unique ON public.products USING btree (normalized_sku) WHERE ((normalized_sku IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_products_public_visibility ON public.products USING btree (id) WHERE (((publication_status)::text = 'active'::text) AND (is_customer_visible = true) AND (deleted_at IS NULL));
CREATE INDEX idx_products_sellable_visibility ON public.products USING btree (id) WHERE (((publication_status)::text = 'active'::text) AND (is_customer_visible = true) AND (deleted_at IS NULL) AND (stock > 0));
CREATE INDEX idx_products_store_id ON public.products USING btree (store_id) WHERE (store_id IS NOT NULL);
CREATE INDEX idx_returns_order_id ON public.returns USING btree (order_id);
CREATE INDEX idx_returns_user_id ON public.returns USING btree (user_id);
CREATE INDEX idx_review_media_review_id ON public.review_media USING btree (review_id);
CREATE INDEX idx_reviews_product_id ON public.reviews USING btree (product_id);
CREATE INDEX idx_shipments_tracking_no ON public.shipments USING btree (tracking_no);
CREATE UNIQUE INDEX idx_stores_slug_unique ON public.stores USING btree (lower((slug)::text)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_template_attributes_attribute_id ON public.template_attributes USING btree (attribute_id, template_id);
CREATE INDEX idx_user_shared_state_user_id ON public.user_shared_state USING btree (user_id);
CREATE INDEX idx_visitor_sessions_started_at ON public.visitor_sessions USING btree (started_at DESC);
CREATE INDEX idx_visitor_sessions_user_id ON public.visitor_sessions USING btree (user_id);
CREATE INDEX idx_visitor_sessions_visitor_key ON public.visitor_sessions USING btree (visitor_key);
ALTER SEQUENCE "admin_catalog_audit_events_id_seq" OWNED BY "admin_catalog_audit_events"."id";
ALTER SEQUENCE "assistant_events_id_seq" OWNED BY "assistant_events"."id";
ALTER SEQUENCE "attribute_definitions_id_seq" OWNED BY "attribute_definitions"."id";
ALTER SEQUENCE "attribute_options_id_seq" OWNED BY "attribute_options"."id";
ALTER SEQUENCE "attribute_templates_id_seq" OWNED BY "attribute_templates"."id";
ALTER SEQUENCE "categories_id_seq" OWNED BY "categories"."id";
ALTER SEQUENCE "category_aliases_id_seq" OWNED BY "category_aliases"."id";
ALTER SEQUENCE "collection_rules_id_seq" OWNED BY "collection_rules"."id";
ALTER SEQUENCE "collections_id_seq" OWNED BY "collections"."id";
ALTER SEQUENCE "coupons_id_seq" OWNED BY "coupons"."id";
ALTER SEQUENCE "customer_addresses_id_seq" OWNED BY "customer_addresses"."id";
ALTER SEQUENCE "favorites_id_seq" OWNED BY "favorites"."id";
ALTER SEQUENCE "invoices_id_seq" OWNED BY "invoices"."id";
ALTER SEQUENCE "menu_items_id_seq" OWNED BY "menu_items"."id";
ALTER SEQUENCE "menus_id_seq" OWNED BY "menus"."id";
ALTER SEQUENCE "messages_id_seq" OWNED BY "messages"."id";
ALTER SEQUENCE "notification_audit_logs_id_seq" OWNED BY "notification_audit_logs"."id";
ALTER SEQUENCE "notifications_id_seq" OWNED BY "notifications"."id";
ALTER SEQUENCE "order_events_id_seq" OWNED BY "order_events"."id";
ALTER SEQUENCE "order_items_id_seq" OWNED BY "order_items"."id";
ALTER SEQUENCE "orders_id_seq" OWNED BY "orders"."id";
ALTER SEQUENCE "page_visits_id_seq" OWNED BY "page_visits"."id";
ALTER SEQUENCE "payments_id_seq" OWNED BY "payments"."id";
ALTER SEQUENCE "product_actions_id_seq" OWNED BY "product_actions"."id";
ALTER SEQUENCE "product_attribute_values_id_seq" OWNED BY "product_attribute_values"."id";
ALTER SEQUENCE "product_media_id_seq" OWNED BY "product_media"."id";
ALTER SEQUENCE "product_questions_id_seq" OWNED BY "product_questions"."id";
ALTER SEQUENCE "products_id_seq" OWNED BY "products"."id";
ALTER SEQUENCE "returns_id_seq" OWNED BY "returns"."id";
ALTER SEQUENCE "review_media_id_seq" OWNED BY "review_media"."id";
ALTER SEQUENCE "reviews_id_seq" OWNED BY "reviews"."id";
ALTER SEQUENCE "shipments_id_seq" OWNED BY "shipments"."id";
ALTER SEQUENCE "stores_id_seq" OWNED BY "stores"."id";
ALTER SEQUENCE "users_id_seq" OWNED BY "users"."id";
ALTER SEQUENCE "visitor_sessions_id_seq" OWNED BY "visitor_sessions"."id";
ALTER SEQUENCE "webhook_events_id_seq" OWNED BY "webhook_events"."id";
CREATE TRIGGER trg_admin_catalog_audit_append_only BEFORE DELETE OR UPDATE ON admin_catalog_audit_events FOR EACH ROW EXECUTE FUNCTION reject_admin_catalog_audit_mutation();
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_shared_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;