const ASSISTANT_INTENTS = Object.freeze({
    PRODUCT_SEARCH: 'product_search',
    PRODUCT_RECOMMENDATION: 'product_recommendation',
    PRODUCT_COMPARE: 'product_compare',
    PRODUCT_DETAIL: 'product_detail',
    SIMILAR_PRODUCTS: 'similar_products',
    ADD_TO_CART: 'add_to_cart',
    REMOVE_FROM_CART: 'remove_from_cart',
    SHOW_CART: 'show_cart',
    REVIEW_INSIGHT: 'review_insight',
    ORDER_SUPPORT: 'order_status',
    RETURN_POLICY: 'return_policy',
    WARRANTY_INFO: 'warranty_info',
    SHIPPING_INFO: 'shipping_info',
    PAYMENT_HELP: 'payment_help',
    POLICY_SUPPORT: 'policy_support',
    CAMPAIGN_SUPPORT: 'discount_campaign',
    LIVE_SUPPORT: 'live_support',
    MODE_CHANGE: 'mode_change',
    SOCIAL_CHAT: 'general_chat',
    GENERAL_CHAT: 'general_chat',
    FALLBACK: 'fallback',
    ESCALATE_TO_HUMAN: 'live_support',
    GENERAL_HELP: 'general_chat'
});

module.exports = {
    ASSISTANT_INTENTS
};
