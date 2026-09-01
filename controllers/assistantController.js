const { getUserFromRequestIfAny, sendAuthError } = require('../middlewares/authMiddleware');
const { handleAssistantChat } = require('../services/assistantOrchestrator');
const { createEscalationMessage } = require('../services/escalationService');
const { SUPPORT_SUMMARY_MAX_LENGTH } = require('../services/supportThreadService');
const {
    ExternalSideEffectBlockedError,
    assertExternalSideEffectAllowed
} = require('../config/stagingRuntimePolicy');

const { getAiProviderConfig } = require('../config/appConfig');

const ASSISTANT_MESSAGE_MAX_LENGTH = 2000;
const ASSISTANT_HISTORY_MAX_ITEMS = 10;
const ASSISTANT_HISTORY_MESSAGE_MAX_LENGTH = 2000;
const ASSISTANT_BODY_KEYS = new Set(['message', 'history', 'context']);
const ASSISTANT_HISTORY_KEYS = new Set(['role', 'message']);
const ASSISTANT_CONTEXT_KEYS = new Set(['selectedMode', 'mode']);

class AssistantInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssistantInputError';
        this.code = 'ASSISTANT_INPUT_INVALID';
        this.statusCode = 400;
    }
}

const cleanAssistantText = (value) => String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .trim();

const normalizeAssistantChatInput = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AssistantInputError('Geçerli bir NovaBot isteği gereklidir.');
    }
    if (Object.keys(body).some((key) => !ASSISTANT_BODY_KEYS.has(key))) {
        throw new AssistantInputError('NovaBot isteği bilinmeyen alan içeriyor.');
    }
    if (typeof body.message !== 'string') {
        throw new AssistantInputError('message metin olmalıdır.');
    }
    const message = cleanAssistantText(body.message);
    if (!message || message.length > ASSISTANT_MESSAGE_MAX_LENGTH) {
        throw new AssistantInputError(`message 1-${ASSISTANT_MESSAGE_MAX_LENGTH} karakter olmalıdır.`);
    }
    const rawHistory = body.history === undefined ? [] : body.history;
    if (!Array.isArray(rawHistory) || rawHistory.length > ASSISTANT_HISTORY_MAX_ITEMS) {
        throw new AssistantInputError(`history en fazla ${ASSISTANT_HISTORY_MAX_ITEMS} öğe içermelidir.`);
    }
    const history = rawHistory.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).some((key) => !ASSISTANT_HISTORY_KEYS.has(key))
            || !['user', 'assistant'].includes(item.role)
            || typeof item.message !== 'string') {
            throw new AssistantInputError('history öğesi geçersizdir.');
        }
        const historyMessage = cleanAssistantText(item.message);
        if (!historyMessage || historyMessage.length > ASSISTANT_HISTORY_MESSAGE_MAX_LENGTH) {
            throw new AssistantInputError(`history mesajı 1-${ASSISTANT_HISTORY_MESSAGE_MAX_LENGTH} karakter olmalıdır.`);
        }
        return Object.freeze({ role: item.role, message: historyMessage });
    });
    const rawContext = body.context === undefined ? {} : body.context;
    if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)
        || Object.keys(rawContext).some((key) => !ASSISTANT_CONTEXT_KEYS.has(key))) {
        throw new AssistantInputError('NovaBot context alanı geçersizdir.');
    }
    const context = {};
    for (const key of Object.keys(rawContext)) {
        if (typeof rawContext[key] !== 'string') throw new AssistantInputError('NovaBot modu metin olmalıdır.');
        const mode = cleanAssistantText(rawContext[key]);
        if (!mode || mode.length > 32) throw new AssistantInputError('NovaBot modu geçersizdir.');
        context[key] = mode;
    }
    return Object.freeze({
        message,
        history: Object.freeze(history),
        context: Object.freeze(context)
    });
};

const normalizeAssistantResponse = (response = {}) => {
    const reply = String(response.reply || response.message || response.text || '').trim();
    return {
        ...response,
        reply,
        message: String(response.message || reply).trim(),
        suggestions: Array.isArray(response.suggestions) ? response.suggestions : [],
        products: Array.isArray(response.products) ? response.products : [],
        cards: Array.isArray(response.cards) ? response.cards : [],
        comparison: response.comparison || null,
        requiresConfirmation: Boolean(response.requiresConfirmation),
        pendingAction: response.pendingAction || null,
        allowEscalation: Boolean(response.allowEscalation),
        escalated: Boolean(response.escalated),
        citations: Array.isArray(response.citations) ? response.citations : []
    };
};

const chat = async (req, res) => {
    try {
        const { message, history, context } = normalizeAssistantChatInput(req.body);
        const user = await getUserFromRequestIfAny(req);

        const response = await handleAssistantChat({ message, user, history, context });
        res.status(200).json(normalizeAssistantResponse(response));
    } catch (err) {
        if (err instanceof AssistantInputError) {
            return res.status(err.statusCode).json({ code: err.code, error: err.message });
        }
        if (err instanceof ExternalSideEffectBlockedError) {
            return res.status(err.statusCode).json({ code: err.code, error: err.publicMessage });
        }
        if (err.publicMessage && [401, 503].includes(err.statusCode)) return sendAuthError(res, err);
        const aiProviderConfig = getAiProviderConfig();
        console.error('Assistant chat hatası:', {
            message: err.message,
            provider: aiProviderConfig.primaryProvider,
            fallbacks: aiProviderConfig.fallbackProviders
        });
        res.status(500).json({ error: 'Yapay zeka asistanı şu an yanıt veremiyor.' });
    }
};

const escalate = async (req, res) => {
    try {
        const user = await getUserFromRequestIfAny(req);
        if (!user) {
            return res.status(401).json({ error: 'Canlı destek devri için giriş yapmalısınız.' });
        }

        const summary = String(req.body?.summary || '').trim();
        if (!summary) {
            return res.status(400).json({ error: 'summary zorunludur.' });
        }
        if (summary.length > SUPPORT_SUMMARY_MAX_LENGTH) {
            return res.status(400).json({
                code: 'SUPPORT_TEXT_INVALID',
                error: `summary en fazla ${SUPPORT_SUMMARY_MAX_LENGTH} karakter olabilir.`
            });
        }

        assertExternalSideEffectAllowed('outbound_notification');
        const escalation = await createEscalationMessage({ userId: user.id, summary });

        try {
            const { io } = require('../server');
            if (io) {
                io.to('admin_room').emit('receive_message', {
                    ...escalation.message,
                    receiver_role: 'admin'
                });
            }
        } catch (_) {}

        res.status(201).json({
            message: 'Konuşma özeti canlı destek ekibine iletildi.',
            escalation: escalation.message,
            thread: escalation.thread
        });
    } catch (err) {
        if (err instanceof ExternalSideEffectBlockedError) {
            return res.status(err.statusCode).json({ code: err.code, error: err.publicMessage });
        }
        if (err.publicMessage && [401, 503].includes(err.statusCode)) return sendAuthError(res, err);
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ error: err.message || 'Canlı destek devri yapılamadı.' });
    }
};

module.exports = {
    AssistantInputError,
    chat,
    escalate,
    normalizeAssistantChatInput,
    normalizeAssistantResponse
};
