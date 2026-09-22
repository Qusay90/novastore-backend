'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const v = require('./themePlatformValidation');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/u;
const safeName = name => typeof name === 'string' && name.length <= 240 && /^[a-zA-Z0-9_./-]+$/u.test(name)
    && !name.startsWith('/') && name.split('/').every(part => part && part !== '.' && part !== '..')
    && !name.split('/').some(part => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part));

// Only server-authoritative renderer bundles use this adapter. It is not an upload API.
function createThemeArtifactStorage({ rootDir, maxBytes = 67108864 } = {}) {
    if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) v.fail('THEME_ARTIFACT_STORAGE_REQUIRED', 503);
    const root = path.resolve(rootDir);
    if (root === path.parse(root).root || root.split(path.sep).some(part => ['public', 'static'].includes(part.toLowerCase()))) v.fail('THEME_ARTIFACT_ROOT_UNSAFE', 503);
    v.integer(maxBytes, 1, 268435456);
    const directory = async (name, create = false) => {
        const absolute = path.resolve(name), parsed = path.parse(absolute);
        let current = parsed.root;
        for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
            current = path.join(current, part);
            if (create) await fs.mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
            const stat = await fs.lstat(current);
            if (stat.isSymbolicLink() || !stat.isDirectory()) v.fail('THEME_ARTIFACT_PATH_REJECTED');
        }
    };
    const inside = (base, name) => {
        if (!safeName(name)) v.fail('THEME_ARTIFACT_PATH_REJECTED');
        const absolute = path.resolve(base, ...name.split('/')), relative = path.relative(base, absolute);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) v.fail('THEME_ARTIFACT_PATH_REJECTED');
        return absolute;
    };
    const readFile = async (file, limit = maxBytes) => {
        await directory(path.dirname(file));
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE', 409);
        const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        try {
            const opened = await handle.stat();
            if (opened.ino !== stat.ino || opened.size !== stat.size || !opened.isFile()) v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE', 409);
            const bytes = await handle.readFile();
            if (bytes.length > limit) v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE', 409);
            return bytes;
        } finally { await handle.close(); }
    };
    const write = async (file, bytes) => {
        await directory(path.dirname(file), true);
        const handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    };
    const locate = digest => {
        if (!digestPattern.test(digest)) v.fail('THEME_ARTIFACT_DIGEST_INVALID');
        return path.join(root, 'artifacts', digest);
    };
    const verify = async ({ digest, manifest }) => {
        if (v.digest(manifest) !== digest || manifest.format !== 'novastore-local-artifact-v1') v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE', 409);
        const base = locate(digest), stored = await readFile(path.join(base, 'manifest.json'), 4194304);
        if (stored.toString('utf8') !== v.canonical(manifest)) v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE', 409);
        for (const file of manifest.files) {
            const bytes = await readFile(inside(base, file.path));
            if (bytes.length !== file.byteSize || sha(bytes) !== file.sha256) v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE', 409);
        }
        return { digest, verified: true, storageKey: `artifacts/${digest}` };
    };
    const build = async ({ metadata, files, entryPoint }) => {
        if (!Array.isArray(files) || !files.length || files.length > 256 || !safeName(entryPoint)) v.fail('THEME_ARTIFACT_BUNDLE_INVALID');
        const names = new Set(); let total = 0;
        const prepared = files.map(file => {
            if (!safeName(file.path) || file.path === 'manifest.json' || names.has(file.path) || !Buffer.isBuffer(file.bytes)) v.fail('THEME_ARTIFACT_BUNDLE_INVALID');
            names.add(file.path); total += file.bytes.length;
            if (total > maxBytes || !file.bytes.length || typeof file.mimeType !== 'string' || file.mimeType.length > 100) v.fail('THEME_ARTIFACT_BUNDLE_INVALID');
            const bytes = Buffer.from(file.bytes), hash = sha(bytes);
            if (file.sha256 !== undefined && hash !== file.sha256) v.fail('THEME_RENDERER_SOURCE_CHANGED', 409);
            return { path: file.path, bytes, sha256: hash, byteSize: bytes.length, mimeType: file.mimeType };
        }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
        if (!names.has(entryPoint)) v.fail('THEME_ARTIFACT_ENTRY_MISSING');
        const manifest = { format: 'novastore-local-artifact-v1', environment: 'LOCAL', metadata: structuredClone(metadata), entryPoint,
            files: prepared.map(({ bytes, ...descriptor }) => descriptor) };
        const digest = v.digest(manifest), target = locate(digest);
        await directory(root, true);
        try { await fs.lstat(target); return { ...(await verify({ digest, manifest })), manifest, reused: true }; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const staged = path.join(root, 'building', crypto.randomUUID());
        try {
            await directory(staged, true);
            for (const file of prepared) await write(inside(staged, file.path), file.bytes);
            await write(path.join(staged, 'manifest.json'), Buffer.from(v.canonical(manifest)));
            await directory(path.dirname(target), true);
            try { await fs.rename(staged, target); }
            catch (error) { if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error; await verify({ digest, manifest }); }
            return { ...(await verify({ digest, manifest })), manifest, reused: false };
        } finally {
            const relative = path.relative(path.join(root, 'building'), staged);
            if (/^[0-9a-f-]{36}$/u.test(relative)) {
                const stat = await fs.lstat(staged).catch(error => { if (error.code !== 'ENOENT') throw error; });
                if (stat && !stat.isSymbolicLink() && stat.isDirectory()) await fs.rm(staged, { recursive: true, force: true });
            }
        }
    };
    const read = async ({ digest, manifest, filePath = manifest.entryPoint }) => {
        await verify({ digest, manifest });
        const descriptor = manifest.files.find(file => file.path === filePath);
        if (!descriptor) v.fail('THEME_RESOURCE_NOT_FOUND', 404);
        const bytes = await readFile(inside(locate(digest), filePath));
        if (sha(bytes) !== descriptor.sha256) v.fail('THEME_ARTIFACT_INTEGRITY_FAILURE', 409);
        return { bytes, mimeType: descriptor.mimeType, sha256: descriptor.sha256 };
    };
    return Object.freeze({ build, verify, read });
}
module.exports = { createThemeArtifactStorage };
