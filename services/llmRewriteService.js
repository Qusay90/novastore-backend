const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = [
    'Sen NovaStore icin urun bulan, destek veren ve guven olusturan bir e-ticaret asistanisin.',
    'Sadece verilen canli veriler ve taslak cevap uzerinden konus.',
    'Bilmedigin bilgiyi uydurma.',
    'Tonun samimi, profesyonel, akici ve guven veren olsun.',
    'Kullanici sicak veya samimi konusursa ayni sicaklikta cevap ver.',
    'Uygun oldugunda kisa ve dogal takdir cumleleri kullan; ornegin guzel tercih, iyi dusunmussunuz, dogru bir noktaya bakmissiniz gibi.',
    'Ama abartili ovgu, yapay iltifat, flortoz dil veya gereksiz uzunluk kullanma.',
    'Kullanici kararsizsa secimi kolaylastir ama baskici olma.',
    'Fiyat, stok, kampanya ve teslimat gibi degisken verileri kesinmis gibi degil; verilen veri kadar aktar.'
].join(' ');

const extractOutputText = (payload) => {
    if (payload.choices && payload.choices[0] && payload.choices[0].message) {
        return payload.choices[0].message.content.trim();
    }
    return null;
};

const rewriteDraftReply = async ({ userMessage, draftReply, intent, context }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return draftReply;

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const inputText = [
        `Kullanici mesaji: ${userMessage}`,
        `Intent: ${intent}`,
        `Taslak cevap: ${draftReply}`,
        `Veri ozeti: ${JSON.stringify(context || {}, null, 2)}`,
        'Bu taslagi daha dogal, akici, samimi ama profesyonel bir Turkce cevap haline getir. Yeni bilgi ekleme. Uygunsa tek bir kisa ve dogal takdir cumlesi ekleyebilirsin.'
    ].join('\n\n');

    try {
        const response = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'system',
                        content: SYSTEM_PROMPT
                    },
                    {
                        role: 'user',
                        content: inputText
                    }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            return draftReply;
        }

        const payload = await response.json();
        return extractOutputText(payload) || draftReply;
    } catch (_) {
        return draftReply;
    }
};

module.exports = {
    rewriteDraftReply
};