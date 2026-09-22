'use strict';

const CARD_FRAMING_DEFAULT = Object.freeze({ focal_x: 0.5, focal_y: 0.5, zoom: 1 });
const CARD_FRAMING_LIMITS = Object.freeze({ focalMin: 0, focalMax: 1, zoomMin: 1, zoomMax: 3 });
const CARD_VIEWPORT_ASPECT_RATIO = 1;
const CARD_VIEWPORT_BORDER_RADIUS_PX = 14;
const CARD_VIEWPORT_ASPECT_TOLERANCE = 0.08;
const CARD_VIEWPORT_MIN_SOURCE_DIMENSION = 600;
const CARD_FRAMING_STATES = Object.freeze({
    NO_FRAMING_NEEDED: 'NO_FRAMING_NEEDED',
    FRAMING_RECOMMENDED: 'FRAMING_RECOMMENDED',
    CUSTOM_FRAMING_SAVED: 'CUSTOM_FRAMING_SAVED'
});

const finiteNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const rounded = (value, precision) => Number(value.toFixed(precision));

const normalizeCardFraming = (value, { nullable = true, strict = true } = {}) => {
    if (value === null || value === undefined) return nullable ? null : CARD_FRAMING_DEFAULT;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('card_framing nesne veya null olmalıdır.');
    }
    const allowed = new Set(['focal_x', 'focal_y', 'zoom']);
    if (strict && Object.keys(value).some((key) => !allowed.has(key))) {
        throw new TypeError('card_framing desteklenmeyen alan içeriyor.');
    }
    if (!Object.prototype.hasOwnProperty.call(value, 'focal_x')
        || !Object.prototype.hasOwnProperty.call(value, 'focal_y')
        || !Object.prototype.hasOwnProperty.call(value, 'zoom')) {
        throw new TypeError('card_framing focal_x, focal_y ve zoom alanlarını birlikte içermelidir.');
    }
    const focalX = finiteNumber(value.focal_x);
    const focalY = finiteNumber(value.focal_y);
    const zoom = finiteNumber(value.zoom);
    if (focalX === null || focalY === null || zoom === null
        || focalX < CARD_FRAMING_LIMITS.focalMin || focalX > CARD_FRAMING_LIMITS.focalMax
        || focalY < CARD_FRAMING_LIMITS.focalMin || focalY > CARD_FRAMING_LIMITS.focalMax
        || zoom < CARD_FRAMING_LIMITS.zoomMin || zoom > CARD_FRAMING_LIMITS.zoomMax) {
        throw new RangeError('card_framing aralık dışında.');
    }
    return Object.freeze({
        focal_x: rounded(focalX, 5),
        focal_y: rounded(focalY, 5),
        zoom: rounded(zoom, 2)
    });
};

const resolveCardFraming = (value) => normalizeCardFraming(value, { nullable: true, strict: false }) || CARD_FRAMING_DEFAULT;

const cardFramingFromStorage = (row = {}) => {
    const values = [row.card_focal_x, row.card_focal_y, row.card_zoom];
    if (values.every((value) => value === null || value === undefined)) return null;
    if (!values.every((value) => value !== null && value !== undefined)) return null;
    return normalizeCardFraming({
        focal_x: row.card_focal_x,
        focal_y: row.card_focal_y,
        zoom: row.card_zoom
    });
};

const cardFramingPresentation = (value) => {
    const framing = resolveCardFraming(value);
    const position = `${rounded(framing.focal_x * 100, 3)}% ${rounded(framing.focal_y * 100, 3)}%`;
    return Object.freeze({
        objectFit: 'cover',
        objectPosition: position,
        transformOrigin: position,
        transform: `scale(${framing.zoom})`
    });
};

const panCardFraming = (value, deltaX, deltaY, stageWidth, stageHeight) => {
    const framing = resolveCardFraming(value);
    const width = Math.max(1, finiteNumber(stageWidth) || 1);
    const height = Math.max(1, finiteNumber(stageHeight) || 1);
    return Object.freeze({
        focal_x: rounded(clamp(framing.focal_x - (finiteNumber(deltaX) || 0) / (width * framing.zoom), 0, 1), 5),
        focal_y: rounded(clamp(framing.focal_y - (finiteNumber(deltaY) || 0) / (height * framing.zoom), 0, 1), 5),
        zoom: framing.zoom
    });
};

const classifyCardFramingNeed = ({ width, height, cardFraming = null } = {}) => {
    const sourceWidth = finiteNumber(width);
    const sourceHeight = finiteNumber(height);
    const dimensionsKnown = sourceWidth !== null && sourceHeight !== null && sourceWidth > 0 && sourceHeight > 0;
    const storedFraming = normalizeCardFraming(cardFraming, { nullable: true, strict: false });
    const sourceAspectRatio = dimensionsKnown ? sourceWidth / sourceHeight : null;
    const aspectMismatch = dimensionsKnown
        ? Math.abs(sourceAspectRatio - CARD_VIEWPORT_ASPECT_RATIO) / CARD_VIEWPORT_ASPECT_RATIO > CARD_VIEWPORT_ASPECT_TOLERANCE
        : false;
    return Object.freeze({
        state: storedFraming
            ? CARD_FRAMING_STATES.CUSTOM_FRAMING_SAVED
            : aspectMismatch
                ? CARD_FRAMING_STATES.FRAMING_RECOMMENDED
                : CARD_FRAMING_STATES.NO_FRAMING_NEEDED,
        dimensionsKnown,
        sourceWidth,
        sourceHeight,
        sourceAspectRatio: sourceAspectRatio === null ? null : rounded(sourceAspectRatio, 4),
        aspectMismatch,
        lowResolution: dimensionsKnown
            && Math.min(sourceWidth, sourceHeight) < CARD_VIEWPORT_MIN_SOURCE_DIMENSION
    });
};

export default Object.freeze({
    CARD_FRAMING_DEFAULT,
    CARD_FRAMING_LIMITS,
    CARD_FRAMING_STATES,
    CARD_VIEWPORT_ASPECT_RATIO,
    CARD_VIEWPORT_ASPECT_TOLERANCE,
    CARD_VIEWPORT_BORDER_RADIUS_PX,
    CARD_VIEWPORT_MIN_SOURCE_DIMENSION,
    cardFramingPresentation,
    cardFramingFromStorage,
    classifyCardFramingNeed,
    normalizeCardFraming,
    panCardFraming,
    resolveCardFraming
});
