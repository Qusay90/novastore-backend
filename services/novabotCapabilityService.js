'use strict';

const { getAiProviderConfig } = require('../config/appConfig');
const { resolveStagingRuntimePolicy } = require('../config/stagingRuntimePolicy');
const {
    DEFAULT_NOVABOT_MODE_ID,
    listPublicNovabotModes,
    requireNovabotModeId
} = require('./novabotModeRegistry');

const MODE_CAPABLE_PROVIDER_NAMES = new Set(['gemini', 'openai']);
const REQUIRED_PROVIDER_ENV = Object.freeze({
    gemini: Object.freeze(['GEMINI_API_KEY']),
    openai: Object.freeze(['OPENAI_API_KEY'])
});

class NovaBotProviderUnavailableError extends Error {
    constructor() {
        super('NovaBot için seçilen sohbet modu şu anda kullanılamıyor.');
        this.name = 'NovaBotProviderUnavailableError';
        this.code = 'NOVABOT_MODE_PROVIDER_UNAVAILABLE';
        this.statusCode = 503;
        this.publicMessage = 'Seçilen NovaBot modu şu anda kullanılamıyor. Lütfen temel modu kullanın veya daha sonra yeniden deneyin.';
    }
}

const hasConfiguredValue = (env, name) => typeof env?.[name] === 'string' && env[name].trim().length > 0;

const isProviderConfigured = (providerName, env) => {
    const required = REQUIRED_PROVIDER_ENV[providerName];
    return Array.isArray(required) && required.every((name) => hasConfiguredValue(env, name));
};

const resolveExternalAiAllowed = (env) => {
    const policy = resolveStagingRuntimePolicy(env);
    return policy.canStart && (!policy.isStaging || !policy.externalSideEffectsDisabled);
};

const resolveNovabotCapability = ({ env = process.env } = {}) => {
    const providerConfig = getAiProviderConfig(env);
    const primaryModeCapable = MODE_CAPABLE_PROVIDER_NAMES.has(providerConfig.primaryProvider);
    const providerChain = primaryModeCapable
        ? [providerConfig.primaryProvider].concat(
            providerConfig.fallbackEnabled ? providerConfig.fallbackProviders : []
        ).filter((provider, index, list) => (
            MODE_CAPABLE_PROVIDER_NAMES.has(provider) && list.indexOf(provider) === index
        ))
        : [];
    const configuredProvider = providerChain.find((provider) => isProviderConfigured(provider, env)) || null;
    const providerConfigured = configuredProvider !== null;
    const providerReady = providerConfigured && resolveExternalAiAllowed(env);
    const modes = Object.freeze(listPublicNovabotModes({ advancedModesAvailable: providerReady }));
    const reasonCode = providerReady
        ? null
        : !primaryModeCapable
            ? 'ADVANCED_PROVIDER_NOT_SELECTED'
            : !providerConfigured
                ? 'ADVANCED_PROVIDER_NOT_CONFIGURED'
                : 'EXTERNAL_AI_DISABLED';

    return Object.freeze({
        contractVersion: 'novabot-modes-v1',
        available: modes.length > 0,
        provider: Object.freeze({
            configured: providerConfigured,
            ready: providerReady
        }),
        advancedModesAvailable: providerReady,
        modeSelectionAvailable: modes.length > 1,
        defaultModeId: DEFAULT_NOVABOT_MODE_ID,
        modes,
        unavailableReason: reasonCode
    });
};

const assertNovabotModeAvailable = (modeId, capability = resolveNovabotCapability()) => {
    const canonicalModeId = requireNovabotModeId(modeId, { allowDefault: true });
    if (canonicalModeId !== DEFAULT_NOVABOT_MODE_ID && capability?.provider?.ready !== true) {
        throw new NovaBotProviderUnavailableError();
    }
    return canonicalModeId;
};

module.exports = {
    MODE_CAPABLE_PROVIDER_NAMES,
    NovaBotProviderUnavailableError,
    REQUIRED_PROVIDER_ENV,
    assertNovabotModeAvailable,
    isProviderConfigured,
    resolveNovabotCapability
};
