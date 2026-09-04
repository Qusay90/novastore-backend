BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO seller_permissions (code, domain, description)
VALUES
    ('reputation.read', 'reputation', 'Read current scoped customer product questions'),
    ('reputation.reply', 'reputation', 'Reply once to a current scoped customer product question')
ON CONFLICT (code) DO NOTHING;

INSERT INTO seller_role_permissions (role_id, permission_code)
SELECT role_row.id, permission_row.code
FROM seller_roles role_row
JOIN seller_permissions permission_row ON permission_row.code IN ('reputation.read', 'reputation.reply')
WHERE role_row.organization_id IS NULL
  AND LOWER(role_row.code) IN ('owner', 'manager', 'operator')
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO seller_role_permissions (role_id, permission_code)
SELECT role_row.id, 'reputation.read'
FROM seller_roles role_row
WHERE role_row.organization_id IS NULL AND LOWER(role_row.code) = 'viewer'
ON CONFLICT (role_id, permission_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_product_questions_product_inbox_id
    ON product_questions (product_id, id DESC);

COMMIT;
