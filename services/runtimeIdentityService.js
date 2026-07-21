const FULL_REVISION_PATTERN = /^[0-9a-f]{40}$/;

const PROVIDERS = Object.freeze([
    Object.freeze({ environmentKey: 'RENDER_GIT_COMMIT', provider: 'render' }),
    Object.freeze({ environmentKey: 'RAILWAY_GIT_COMMIT_SHA', provider: 'railway' })
]);

const unavailableIdentity = () => ({ available: false });

const resolveRuntimeIdentity = (environment = process.env) => {
    const configuredProviders = PROVIDERS.filter(
        ({ environmentKey }) => environment[environmentKey] !== undefined
    );

    if (configuredProviders.length !== 1) return unavailableIdentity();

    const selectedProvider = configuredProviders[0];
    const revision = environment[selectedProvider.environmentKey];

    if (typeof revision !== 'string' || !FULL_REVISION_PATTERN.test(revision)) {
        return unavailableIdentity();
    }

    return {
        available: true,
        provider: selectedProvider.provider,
        revision
    };
};

module.exports = { resolveRuntimeIdentity };
