const { getUserFromRequestIfAny, sendAuthError } = require('../middlewares/authMiddleware');
const { handleAssistantChat } = require('../services/assistantOrchestrator');
const { createEscalationMessage } = require('../services/escalationService');
const { createNotification } = require('./notificationController');

const { getAiProviderConfig } = require('../config/appConfig');

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
        const user = await getUserFromRequestIfAny(req);
        const { message, history = [], context = {} } = req.body || {};

        if (!String(message || '').trim()) {
            return res.status(400).json({ error: 'message zorunludur.' });
        }

        const response = await handleAssistantChat({ message, user, history, context });
        res.status(200).json(normalizeAssistantResponse(response));
    } catch (err) {
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

        const summary = String(req.body.summary || '').trim();
        if (!summary) {
            return res.status(400).json({ error: 'summary zorunludur.' });
        }

        const escalation = await createEscalationMessage({ userId: user.id, summary });

        try {
            const { io } = require('../server');
            if (io) {
                io.to('admin_room').emit('receive_message', {
                    ...escalation.message,
                    receiver_role: 'admin'
                });

                await createNotification(
                    null,
                    'ai_handoff',
                    `AI devri oluştu. Müşteri #${user.id} temsilciye aktarıldı.`,
                    io
                );
            }
        } catch (_) {}

        res.status(201).json({
            message: 'Konuşma özeti canlı destek ekibine iletildi.',
            escalation: escalation.message
        });
    } catch (err) {
        if (err.publicMessage && [401, 503].includes(err.statusCode)) return sendAuthError(res, err);
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ error: err.message || 'Canlı destek devri yapılamadı.' });
    }
};

module.exports = {
    chat,
    escalate,
    normalizeAssistantResponse
};
