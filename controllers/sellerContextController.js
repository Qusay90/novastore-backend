'use strict';

const safeError = (res, error) => {
    const statusCode = Number(error?.statusCode) || 500;
    const code = statusCode >= 500 ? 'SELLER_CONTEXT_UNAVAILABLE' : (error?.code || 'RESOURCE_NOT_FOUND');
    return res.status(statusCode).json({ code, error: code });
};

const boundedLimit = (value) => {
    const parsed = Number(value || 25);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 25;
};

const safeOrganization = (organization) => Object.freeze({
    id: Number(organization.id),
    external_key: organization.external_key || organization.externalKey || null,
    display_name: String(organization.display_name || organization.displayName || ''),
    status: String(organization.status || 'active')
});

const safeRole = (role) => Object.freeze({
    id: Number(role.id),
    code: String(role.code),
    name: String(role.name || role.code),
    invitation_assignable: role.invitationAssignable === true
});

const safeMember = (member) => Object.freeze({
    id: Number(member.id),
    role_code: String(member.role_code || member.roleCode || ''),
    status: String(member.status || 'active'),
    display_name: member.display_name ? String(member.display_name).slice(0, 80) : null
});

const createSellerContextController = ({ readOrganization, listRoles, listMembers } = {}) => {
    if (typeof readOrganization !== 'function' || typeof listRoles !== 'function' || typeof listMembers !== 'function') {
        throw new TypeError('Seller context read dependencies are required.');
    }
    const getContext = async (req, res) => {
        try {
            const organization = safeOrganization(await readOrganization(req.sellerContext));
            return res.status(200).json({ organization, store_ids: req.sellerContext.storeIds, selection_required: req.sellerContext.storeIds.length > 1 });
        } catch (error) {
            return safeError(res, error);
        }
    };
    const getOrganizationCurrent = async (req, res) => {
        try {
            return res.status(200).json({ organization: safeOrganization(await readOrganization(req.sellerContext)) });
        } catch (error) {
            return safeError(res, error);
        }
    };
    const getTeamRoles = async (req, res) => {
        try {
            const roles = await listRoles(req.sellerContext);
            return res.status(200).json({ roles: Object.freeze((roles || []).map(safeRole)) });
        } catch (error) {
            return safeError(res, error);
        }
    };
    const getTeamMembers = async (req, res) => {
        try {
            const members = await listMembers(req.sellerContext, { limit: boundedLimit(req.query?.limit), cursor: typeof req.query?.cursor === 'string' ? req.query.cursor : null });
            return res.status(200).json({ members: Object.freeze((members || []).map(safeMember)), next_cursor: null });
        } catch (error) {
            return safeError(res, error);
        }
    };
    return Object.freeze({ getContext, getOrganizationCurrent, getTeamRoles, getTeamMembers });
};

module.exports = Object.freeze({ createSellerContextController, boundedLimit });
