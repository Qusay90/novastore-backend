const maskNamePart = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';

    const visibleChars = Array.from(text).slice(0, Math.min(2, text.length)).join('');
    return `${visibleChars.toLocaleUpperCase('tr-TR')}***`;
};

const maskFullName = (fullName) => {
    const parts = String(fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 0) {
        return 'MI***';
    }

    return parts.map(maskNamePart).join(' ');
};

module.exports = {
    maskFullName
};
