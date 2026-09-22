'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const v = require('./themePlatformValidation');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const formats = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' });
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const readyPattern = new RegExp(`^ready/(owned|package)/(${uuidPattern})/(${uuidPattern})/([0-9a-f]{64})\\.(png|jpg|webp)$`, 'u');

// Avoid repeated four-character regex groups: V8 can exhaust its regexp stack
// on otherwise valid multi-megabyte uploads. Decode remains bounded/canonical.
const decodeBase64 = (value, maxBytes = 5242880) => {
    v.integer(maxBytes, 1, 52428800);
    if (typeof value !== 'string' || !value.length || value.length % 4 !== 0) v.fail('THEME_INVALID_ASSET_BYTES');
    if (value.length > Math.ceil(maxBytes / 3) * 4) v.fail('THEME_ASSET_SIZE_LIMIT', 413);
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) v.fail('THEME_INVALID_ASSET_BYTES');
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.toString('base64') !== value) v.fail('THEME_INVALID_ASSET_BYTES');
    if (bytes.length > maxBytes) v.fail('THEME_ASSET_SIZE_LIMIT', 413);
    return bytes;
};

const detectFormat = (bytes) => {
    if (!Buffer.isBuffer(bytes)) v.fail('THEME_INVALID_ASSET_BYTES');
    if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
    if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    v.fail('THEME_ASSET_MIME_REJECTED');
};

const createThemeAssetStorage = ({ rootDir, maxBytes = 5242880, maxPixels = 16777216, maxDimension = 8192 } = {}) => {
    if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) v.fail('THEME_ASSET_STORAGE_UNAVAILABLE', 503);
    const root = path.resolve(rootDir);
    if (root === path.parse(root).root || root.split(path.sep).some((part) => ['public', 'static'].includes(part.toLowerCase()))) {
        v.fail('THEME_ASSET_STORAGE_ROOT_UNSAFE', 503);
    }
    v.integer(maxBytes, 1, 52428800); v.integer(maxPixels, 1, 33554432); v.integer(maxDimension, 1, 16384);
    const handles = new WeakMap();
    const resolveKey = (key) => {
        const absolute = path.resolve(root, ...key.split('/'));
        const relative = path.relative(root, absolute);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !relative) v.fail('THEME_ASSET_PATH_REJECTED');
        return absolute;
    };
    const safeDirectory = async (absolute, create = false) => {
        const parsed = path.parse(absolute);
        let current = parsed.root;
        for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
            current = path.join(current, part);
            let stat;
            try { stat = await fs.lstat(current); }
            catch (error) {
                if (error.code !== 'ENOENT' || !create) throw error;
                try { await fs.mkdir(current, { mode: 0o700 }); }
                catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
                stat = await fs.lstat(current);
            }
            if (stat.isSymbolicLink() || !stat.isDirectory()) v.fail('THEME_ASSET_PATH_REJECTED');
        }
    };
    const removeFile = async (absolute) => {
        await safeDirectory(path.dirname(absolute));
        try {
            const stat = await fs.lstat(absolute);
            if (stat.isSymbolicLink() || !stat.isFile()) v.fail('THEME_ASSET_PATH_REJECTED');
            await fs.unlink(absolute);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    };
    const writeExclusive = async (absolute, bytes) => {
        await safeDirectory(path.dirname(absolute), true);
        let file;
        try {
            file = await fs.open(absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
            await file.writeFile(bytes);
            await file.sync();
        } catch (error) {
            if (file) await removeFile(absolute).catch(() => {});
            if (error.code === 'EEXIST') v.fail('THEME_ASSET_STORAGE_CONFLICT', 409);
            throw error;
        } finally { if (file) await file.close(); }
    };
    const safeRead = async (absolute, limit = maxBytes) => {
        await safeDirectory(path.dirname(absolute));
        const stat = await fs.lstat(absolute);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > limit) v.fail('THEME_ASSET_PATH_REJECTED');
        const file = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        try {
            const opened = await file.stat();
            if (!opened.isFile() || opened.size !== stat.size || opened.ino !== stat.ino) v.fail('THEME_ASSET_PATH_REJECTED');
            const bytes = await file.readFile();
            if (bytes.length > limit) v.fail('THEME_ASSET_SIZE_LIMIT', 413);
            return bytes;
        } finally { await file.close(); }
    };
    const inspect = async (bytes) => {
        const format = detectFormat(bytes);
        let sharp;
        try { sharp = require('sharp'); }
        catch { v.fail('THEME_ASSET_DECODER_UNAVAILABLE', 503); }
        try {
            const options = { failOn: 'warning', limitInputPixels: maxPixels, limitInputChannels: 4, sequentialRead: true };
            const metadata = await sharp(bytes, options).metadata();
            if (metadata.format !== format || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)
                || metadata.width < 1 || metadata.height < 1 || metadata.width > maxDimension || metadata.height > maxDimension
                || metadata.width * metadata.height > maxPixels || (metadata.pages || 1) !== 1) v.fail('THEME_ASSET_DIMENSIONS_REJECTED');
            // Full pixel decode and fresh encoding strip EXIF/XMP/ICC, comments and
            // trailing payload. No withMetadata/keepMetadata option is permitted.
            const result = await sharp(bytes, options).rotate().toFormat(format).toBuffer({ resolveWithObject: true });
            if (!result.data.length || result.data.length > maxBytes) v.fail('THEME_ASSET_SIZE_LIMIT', 413);
            return { bytes: result.data, format, detectedMime: formats[format], width: result.info.width, height: result.info.height };
        } catch (error) {
            if (error instanceof v.ThemePlatformError) throw error;
            v.fail('THEME_ASSET_DECODE_REJECTED');
        }
    };
    const stage = async (kind, owner, assetId, input) => {
        owner = v.uuid(owner); assetId = v.uuid(assetId);
        if (!Buffer.isBuffer(input) || !input.length) v.fail('THEME_INVALID_ASSET_BYTES');
        if (input.length > maxBytes) v.fail('THEME_ASSET_SIZE_LIMIT', 413);
        detectFormat(input);
        const bytes = Buffer.from(input);
        const quarantineKey = `quarantine/${kind}/${owner}/${assetId}.upload`;
        const quarantineFile = resolveKey(quarantineKey);
        await writeExclusive(quarantineFile, bytes);
        const handle = Object.freeze({ status: 'QUARANTINED', assetId, originalDigest: sha256(bytes), originalByteSize: bytes.length });
        handles.set(handle, { kind, owner, assetId, quarantineFile, status: 'QUARANTINED', originalDigest: handle.originalDigest });
        return handle;
    };
    const discard = async (handle) => {
        const state = handles.get(handle);
        if (!state) v.fail('THEME_ASSET_STORAGE_HANDLE_INVALID');
        if (state.status === 'DISCARDED') return;
        if (state.readyFile) await removeFile(state.readyFile);
        await removeFile(state.quarantineFile);
        state.status = 'DISCARDED';
    };
    const promote = async (handle) => {
        const state = handles.get(handle);
        if (!state || state.status !== 'QUARANTINED') v.fail('THEME_ASSET_STORAGE_HANDLE_INVALID');
        try {
            const original = await safeRead(state.quarantineFile);
            if (sha256(original) !== state.originalDigest) v.fail('THEME_ASSET_INTEGRITY_FAILURE', 409);
            const normalized = await inspect(original);
            const digest = sha256(normalized.bytes);
            const extension = normalized.format === 'jpeg' ? 'jpg' : normalized.format;
            const storageKey = `ready/${state.kind}/${state.owner}/${state.assetId}/${digest}.${extension}`;
            const readyFile = resolveKey(storageKey);
            await writeExclusive(readyFile, normalized.bytes);
            state.readyFile = readyFile;
            const stored = await safeRead(readyFile);
            if (sha256(stored) !== digest) v.fail('THEME_ASSET_INTEGRITY_FAILURE', 409);
            await removeFile(state.quarantineFile);
            state.status = 'READY';
            return Object.freeze({ storageKey, detectedMime: normalized.detectedMime, byteSize: stored.length,
                digest, originalDigest: state.originalDigest, width: normalized.width, height: normalized.height,
                storageBackend: 'local-v1', status: 'READY' });
        } catch (error) {
            await discard(handle);
            if (error instanceof v.ThemePlatformError) throw error;
            v.fail('THEME_ASSET_STORAGE_UNAVAILABLE', 503);
        }
    };
    const read = async (kind, owner, storageKey, digest) => {
        owner = v.uuid(owner);
        const match = typeof storageKey === 'string' && readyPattern.exec(storageKey);
        if (!match || match[1] !== kind || match[2] !== owner || match[4] !== digest) v.fail('THEME_RESOURCE_NOT_FOUND', 404);
        try {
            const bytes = await safeRead(resolveKey(storageKey));
            if (sha256(bytes) !== digest) v.fail('THEME_ASSET_INTEGRITY_FAILURE', 409);
            return bytes;
        } catch (error) {
            if (error instanceof v.ThemePlatformError) throw error;
            if (error.code === 'ENOENT') v.fail('THEME_RESOURCE_NOT_FOUND', 404);
            v.fail('THEME_ASSET_STORAGE_UNAVAILABLE', 503);
        }
    };
    return Object.freeze({
        stageOwned: ({ serviceId, assetId, bytes }) => stage('owned', serviceId, assetId, bytes),
        stagePackage: ({ themeVersionId, assetId, bytes }) => stage('package', themeVersionId, assetId, bytes),
        promote, discard,
        readOwned: ({ serviceId, storageKey, digest }) => read('owned', serviceId, storageKey, digest),
        readPackage: ({ themeVersionId, storageKey, digest }) => read('package', themeVersionId, storageKey, digest)
    });
};

module.exports = Object.freeze({ createThemeAssetStorage, detectFormat, decodeBase64 });
