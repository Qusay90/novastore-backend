SELECT jsonb_build_object(
 'identity', jsonb_build_object('database',current_database(),'schema',current_schema(),'search_path',current_setting('search_path'),'server_version_num',current_setting('server_version_num'),'read_only',current_setting('transaction_read_only')),
 'tables', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM (
   SELECT c.relname AS name,c.relkind AS kind,c.relpersistence AS persistence,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.relreplident AS replica_identity,c.reloptions AS options
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','f')
 ) x),'[]'::jsonb),
 'columns', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,position) FROM (
   SELECT c.relname AS table_name,a.attname AS name,a.attnum AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_expr,a.attidentity AS identity,a.attgenerated AS generated,CASE WHEN a.attcollation=0 THEN NULL ELSE co.collname END AS collation
   FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation
   WHERE n.nspname='public' AND c.relkind IN ('r','p','f','v','m') AND a.attnum>0 AND NOT a.attisdropped
 ) x),'[]'::jsonb),
 'constraints', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,name) FROM (
   SELECT c.relname AS table_name,k.conname AS name,k.contype AS type,pg_get_constraintdef(k.oid,true) AS definition,k.convalidated AS validated,k.condeferrable AS deferrable,k.condeferred AS deferred
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 ) x),'[]'::jsonb),
 'indexes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,name) FROM (
   SELECT t.relname AS table_name,c.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,i.indisvalid AS valid,i.indisready AS ready,i.indisunique AS is_unique,i.indisprimary AS is_primary
   FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
 ) x),'[]'::jsonb),
 'sequences', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM (
   SELECT c.relname AS name,format_type(s.seqtypid,NULL) AS type,s.seqstart::text AS start,s.seqincrement::text AS increment,s.seqmax::text AS max,s.seqmin::text AS min,s.seqcache::text AS cache,s.seqcycle AS cycle,t.relname AS owned_table,a.attname AS owned_column,d.deptype AS dependency_type
   FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i') LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE n.nspname='public'
 ) x),'[]'::jsonb),
 'views', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM (
   SELECT c.relname AS name,c.relkind AS kind,pg_get_viewdef(c.oid,true) AS definition,c.reloptions AS options FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')
 ) x),'[]'::jsonb),
 'functions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY name,arguments) FROM (
   SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition,p.prosecdef AS security_definer,p.proconfig AS config
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
 ) x),'[]'::jsonb),
 'triggers', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,name) FROM (
   SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
 ) x),'[]'::jsonb),
 'types', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM (
   SELECT t.typname AS name,t.typtype AS kind,format_type(t.typbasetype,t.typtypmod) AS base_type,(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS enum_values
   FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_class c ON c.oid=t.typrelid WHERE n.nspname='public' AND (t.typtype IN ('d','e','r','m') OR (t.typtype='c' AND c.relkind='c')) AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')
 ) x),'[]'::jsonb),
 'policies', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY tablename,policyname) FROM (SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public') x),'[]'::jsonb),
 'table_grants', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,grantee,privilege_type) FROM (SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.table_privileges WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')) x),'[]'::jsonb),
 'default_acls', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY owner,object_type) FROM (SELECT r.rolname AS owner,d.defaclobjtype AS object_type,d.defaclacl::text AS acl FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public') x),'[]'::jsonb),
 'estimates', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name) FROM (SELECT c.relname AS table_name,c.reltuples::bigint AS estimated_rows,pg_total_relation_size(c.oid)::text AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) x),'[]'::jsonb)
) AS inventory;
