'use strict';

const EVENT = Object.freeze({
    SELLER_APPLICATION_CREATED: 'SELLER_APPLICATION_CREATED',
    SELLER_APPLICATION_STATUS_CHANGED: 'SELLER_APPLICATION_STATUS_CHANGED',
    ORDER_CREATED: 'ORDER_CREATED',
    ORDER_CONFIRMED: 'ORDER_CONFIRMED',
    ORDER_CANCEL_REQUESTED: 'ORDER_CANCEL_REQUESTED',
    CANCELLATION_RESULT: 'CANCELLATION_RESULT',
    ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
    PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    PAYMENT_ACTION_REQUIRED: 'PAYMENT_ACTION_REQUIRED',
    REFUND_ACTION_REQUIRED: 'REFUND_ACTION_REQUIRED',
    REFUND_STATUS_CHANGED: 'REFUND_STATUS_CHANGED',
    SHIPMENT_CREATED: 'SHIPMENT_CREATED',
    TRACKING_UPDATED: 'TRACKING_UPDATED',
    ORDER_DELIVERED: 'ORDER_DELIVERED',
    RETURN_REQUESTED: 'RETURN_REQUESTED',
    RETURN_STATUS_CHANGED: 'RETURN_STATUS_CHANGED',
    SUPPORT_CREATED: 'SUPPORT_CREATED',
    SUPPORT_MESSAGE: 'SUPPORT_MESSAGE',
    SUPPORT_ESCALATED: 'SUPPORT_ESCALATED',
    SUPPORT_REPLY: 'SUPPORT_REPLY',
    QUESTION_CREATED: 'QUESTION_CREATED',
    QUESTION_ANSWERED: 'QUESTION_ANSWERED',
    REVIEW_CREATED: 'REVIEW_CREATED',
    REVIEW_MODERATION_RESULT: 'REVIEW_MODERATION_RESULT'
});

const policy = ({ aggregateType, category, priority = 'NORMAL', targetType, recipients, copy }) => Object.freeze({
    aggregateType,
    category,
    priority,
    targetType,
    recipients: Object.freeze([...recipients]),
    copy: Object.freeze(copy)
});

const EVENT_POLICIES = Object.freeze({
    [EVENT.SELLER_APPLICATION_CREATED]: policy({
        aggregateType: 'seller_application', category: 'ACCOUNT', priority: 'HIGH', targetType: 'seller_application', recipients: ['admin'],
        copy: { admin: ['Yeni satıcı başvurusu', 'Yeni bir satıcı başvurusu inceleme bekliyor.'] }
    }),
    [EVENT.SELLER_APPLICATION_STATUS_CHANGED]: policy({
        aggregateType: 'seller_application', category: 'ACCOUNT', targetType: 'seller_application', recipients: ['seller'],
        copy: { seller: ['Başvuru durumu güncellendi', 'Satıcı başvurunuzun durumu güncellendi.'] }
    }),
    [EVENT.ORDER_CREATED]: policy({
        aggregateType: 'order', category: 'ORDER', priority: 'HIGH', targetType: 'order', recipients: ['admin', 'customer'],
        copy: {
            admin: ['Yeni sipariş kaydı', 'Yeni bir sipariş kaydı ödeme sonucu bekliyor.'],
            customer: ['Siparişiniz alındı', 'Sipariş kaydınız oluşturuldu; ödeme sonucunu buradan izleyebilirsiniz.']
        }
    }),
    [EVENT.ORDER_CONFIRMED]: policy({
        aggregateType: 'order', category: 'ORDER', priority: 'HIGH', targetType: 'order', recipients: ['admin', 'seller'],
        copy: {
            admin: ['Yeni sipariş kesinleşti', 'Yeni bir sipariş operasyon kuyruğuna alındı.'],
            seller: ['Yeni sipariş', 'Mağazanız için yeni bir sipariş var.']
        }
    }),
    [EVENT.ORDER_CANCEL_REQUESTED]: policy({
        aggregateType: 'order', category: 'ORDER', priority: 'HIGH', targetType: 'order', recipients: ['admin', 'seller', 'customer'],
        copy: {
            admin: ['İptal işlemi', 'Bir sipariş için iptal işlemi kaydedildi.'],
            seller: ['Sipariş iptali', 'Mağazanızı ilgilendiren bir sipariş iptal edildi.'],
            customer: ['İptal talebiniz alındı', 'Sipariş iptal işleminiz kaydedildi.']
        }
    }),
    [EVENT.CANCELLATION_RESULT]: policy({
        aggregateType: 'order', category: 'ORDER', priority: 'HIGH', targetType: 'order', recipients: ['admin', 'seller', 'customer'],
        copy: {
            admin: ['İptal sonucu', 'Sipariş iptal süreci sonuçlandı.'],
            seller: ['İptal sonucu', 'Sipariş iptal süreci sonuçlandı.'],
            customer: ['Siparişiniz iptal edildi', 'Sipariş iptal işleminiz tamamlandı.']
        }
    }),
    [EVENT.ORDER_STATUS_CHANGED]: policy({
        aggregateType: 'order', category: 'ORDER', targetType: 'order', recipients: ['customer'],
        copy: { customer: ['Sipariş durumu güncellendi', 'Siparişinizin durumu güncellendi.'] }
    }),
    [EVENT.PAYMENT_SUCCESS]: policy({
        aggregateType: 'order', category: 'PAYMENT', priority: 'HIGH', targetType: 'order', recipients: ['customer'],
        copy: { customer: ['Ödemeniz alındı', 'Ödemeniz başarıyla alındı.'] }
    }),
    [EVENT.PAYMENT_FAILED]: policy({
        aggregateType: 'order', category: 'PAYMENT', priority: 'HIGH', targetType: 'order', recipients: ['admin', 'customer'],
        copy: {
            admin: ['Ödeme başarısız', 'Bir siparişin ödeme işlemi tamamlanamadı.'],
            customer: ['Ödeme tamamlanamadı', 'Ödeme işlemi tamamlanamadı; sipariş ekranından güvenle yeniden deneyebilirsiniz.']
        }
    }),
    [EVENT.PAYMENT_ACTION_REQUIRED]: policy({
        aggregateType: 'order', category: 'PAYMENT', priority: 'HIGH', targetType: 'order', recipients: ['customer'],
        copy: { customer: ['Ödeme onayı gerekli', 'Ödemenizi tamamlamak için ek bir doğrulama gerekiyor.'] }
    }),
    [EVENT.REFUND_ACTION_REQUIRED]: policy({
        aggregateType: 'order', category: 'PAYMENT', priority: 'CRITICAL', targetType: 'order', recipients: ['admin'],
        copy: { admin: ['Geri ödeme aksiyonu gerekli', 'Bir sipariş için ödeme mutabakatı veya geri ödeme incelemesi gerekiyor.'] }
    }),
    [EVENT.REFUND_STATUS_CHANGED]: policy({
        aggregateType: 'order', category: 'PAYMENT', priority: 'HIGH', targetType: 'order', recipients: ['admin', 'seller', 'customer'],
        copy: {
            admin: ['Geri ödeme durumu güncellendi', 'Bir siparişin geri ödeme durumu güncellendi.'],
            seller: ['Geri ödeme durumu', 'Bir siparişin geri ödeme durumu güncellendi.'],
            customer: ['Geri ödeme durumu güncellendi', 'Siparişinizin geri ödeme durumu güncellendi.']
        }
    }),
    [EVENT.SHIPMENT_CREATED]: policy({
        aggregateType: 'order', category: 'SHIPPING', priority: 'HIGH', targetType: 'order', recipients: ['customer'],
        copy: { customer: ['Siparişiniz kargoya verildi', 'Gönderiniz oluşturuldu; takip bilgilerini sipariş ekranında görebilirsiniz.'] }
    }),
    [EVENT.TRACKING_UPDATED]: policy({
        aggregateType: 'order', category: 'SHIPPING', targetType: 'order', recipients: ['customer'],
        copy: { customer: ['Takip bilgisi güncellendi', 'Siparişinizin kargo takip bilgisi güncellendi.'] }
    }),
    [EVENT.ORDER_DELIVERED]: policy({
        aggregateType: 'order', category: 'SHIPPING', priority: 'HIGH', targetType: 'order', recipients: ['customer'],
        copy: { customer: ['Siparişiniz teslim edildi', 'Siparişiniz teslim edildi olarak işaretlendi.'] }
    }),
    [EVENT.RETURN_REQUESTED]: policy({
        aggregateType: 'return_request', category: 'RETURN', priority: 'HIGH', targetType: 'return_request', recipients: ['admin', 'seller', 'customer'],
        copy: {
            admin: ['Yeni iade talebi', 'Yeni bir iade talebi inceleme bekliyor.'],
            seller: ['Yeni iade talebi', 'Mağazanızı ilgilendiren yeni bir iade talebi var.'],
            customer: ['İade talebiniz alındı', 'İade talebiniz incelemeye alındı.']
        }
    }),
    [EVENT.RETURN_STATUS_CHANGED]: policy({
        aggregateType: 'return_request', category: 'RETURN', priority: 'HIGH', targetType: 'return_request', recipients: ['seller', 'customer'],
        copy: {
            seller: ['İade durumu güncellendi', 'Bir iade talebinin durumu güncellendi.'],
            customer: ['İade durumunuz güncellendi', 'İade talebinizin durumu güncellendi.']
        }
    }),
    [EVENT.SUPPORT_CREATED]: policy({
        aggregateType: 'support_thread', category: 'SUPPORT', priority: 'HIGH', targetType: 'support_thread', recipients: ['admin'],
        copy: { admin: ['Yeni destek talebi', 'Yeni bir müşteri destek talebi var.'] }
    }),
    [EVENT.SUPPORT_MESSAGE]: policy({
        aggregateType: 'support_thread', category: 'SUPPORT', targetType: 'support_thread', recipients: ['admin'],
        copy: { admin: ['Destek talebi güncellendi', 'Bir müşteri destek görüşmesine yeni mesaj gönderdi.'] }
    }),
    [EVENT.SUPPORT_ESCALATED]: policy({
        aggregateType: 'support_thread', category: 'SUPPORT', priority: 'CRITICAL', targetType: 'support_thread', recipients: ['admin'],
        copy: { admin: ['Destek devri gerekli', 'Bir destek görüşmesi temsilci devri bekliyor.'] }
    }),
    [EVENT.SUPPORT_REPLY]: policy({
        aggregateType: 'support_thread', category: 'SUPPORT', priority: 'HIGH', targetType: 'support_thread', recipients: ['customer'],
        copy: { customer: ['Destek yanıtı geldi', 'Destek talebinize yeni bir yanıt geldi.'] }
    }),
    [EVENT.QUESTION_CREATED]: policy({
        aggregateType: 'product_question', category: 'QUESTION_REVIEW', targetType: 'product_question', recipients: ['admin', 'seller'],
        copy: {
            admin: ['Yeni ürün sorusu', 'Yeni bir ürün sorusu yanıt veya moderasyon bekliyor.'],
            seller: ['Yeni ürün sorusu', 'Mağazanızdaki bir ürün için yeni bir soru var.']
        }
    }),
    [EVENT.QUESTION_ANSWERED]: policy({
        aggregateType: 'product_question', category: 'QUESTION_REVIEW', targetType: 'product_question', recipients: ['customer'],
        copy: { customer: ['Sorunuz yanıtlandı', 'Ürün sorunuz yanıtlandı.'] }
    }),
    [EVENT.REVIEW_CREATED]: policy({
        aggregateType: 'review', category: 'QUESTION_REVIEW', targetType: 'review', recipients: ['admin', 'seller'],
        copy: {
            admin: ['Yeni değerlendirme', 'Yeni bir ürün değerlendirmesi moderasyon bekliyor.'],
            seller: ['Yeni değerlendirme', 'Mağazanızdaki bir ürün için yeni değerlendirme var.']
        }
    }),
    [EVENT.REVIEW_MODERATION_RESULT]: policy({
        aggregateType: 'review', category: 'QUESTION_REVIEW', targetType: 'review', recipients: ['customer'],
        copy: { customer: ['Değerlendirme durumu güncellendi', 'Ürün değerlendirmenizin yayın durumu güncellendi.'] }
    })
});

class NotificationEventError extends TypeError {
    constructor(message, code = 'NOTIFICATION_EVENT_INVALID') {
        super(message);
        this.name = 'NotificationEventError';
        this.code = code;
        this.statusCode = 400;
    }
}

const getNotificationEventPolicy = (eventType) => {
    const normalized = String(eventType || '').trim().toUpperCase();
    const resolved = EVENT_POLICIES[normalized];
    if (!resolved) throw new NotificationEventError('Bildirim olayı desteklenen katalogda değil.', 'NOTIFICATION_EVENT_TYPE_REJECTED');
    return Object.freeze({ eventType: normalized, ...resolved });
};

const getNotificationCopy = (eventType, recipientRole) => {
    const eventPolicy = getNotificationEventPolicy(eventType);
    const role = String(recipientRole || '').trim().toLowerCase();
    const copy = eventPolicy.copy[role];
    if (!copy) throw new NotificationEventError('Bildirim olayı bu alıcı rolünü desteklemiyor.', 'NOTIFICATION_RECIPIENT_ROLE_REJECTED');
    return Object.freeze({ title: copy[0], body: copy[1] });
};

module.exports = Object.freeze({
    EVENT,
    EVENT_POLICIES,
    NOTIFICATION_EVENT_TYPE_COUNT: Object.keys(EVENT_POLICIES).length,
    NotificationEventError,
    getNotificationCopy,
    getNotificationEventPolicy
});
