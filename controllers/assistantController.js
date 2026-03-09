const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
const { handleAssistantChat } = require('../services/assistantOrchestrator');
const { createEscalationMessage } = require('../services/escalationService');
const { createNotification } = require('./notificationController');

const chat = async (req, res) => {
    try {
        const user = getUserFromRequestIfAny(req);
        const { message, history = [], context = {} } = req.body || {};

        if (!String(message || '').trim()) {
            return res.status(400).json({ error: 'message zorunludur.' });
        }

        const response = await handleAssistantChat({ message, user, history, context });
        res.status(200).json(response);
    } catch (err) {
        console.error('Assistant chat hatasi:', err.message);
        res.status(500).json({ error: 'Yapay zeka asistani su an yanit veremiyor.' });
    }
};

const escalate = async (req, res) => {
    try {
        const user = getUserFromRequestIfAny(req);
        if (!user) {
            return res.status(401).json({ error: 'Canli destek devri icin giris yapmalisiniz.' });
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
                    `AI devri olustu. Musteri #${user.id} temsilciye aktarildi.`,
                    io
                );
            }
        } catch (_) {}

        res.status(201).json({
            message: 'Konusma ozeti canli destek ekibine iletildi.',
            escalation: escalation.message
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ error: err.message || 'Canli destek devri yapilamadi.' });
    }
};

module.exports = {
    chat,
    escalate
};
