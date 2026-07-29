const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildNamesOnlyReleaseContract } = require('../config/stagingReleaseContract');

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const EXPECTED_ARGUMENTS = Object.freeze([
    '--expected-head',
    '--expected-tree',
    '--expected-parent',
    '--expected-subject'
]);

class OfflineReleasePlanError extends Error {
    constructor(code) {
        super('Offline staging release plan validation failed.');
        this.name = 'OfflineReleasePlanError';
        this.code = code;
    }
}

const parseArguments = (argv) => {
    if (!Array.isArray(argv)) throw new OfflineReleasePlanError('INVALID_ARGUMENT_VECTOR');
    const parsed = Object.create(null);

    for (let index = 0; index < argv.length; index += 2) {
        const name = argv[index];
        const value = argv[index + 1];
        if (!EXPECTED_ARGUMENTS.includes(name) || typeof value !== 'string' || value.startsWith('--')) {
            throw new OfflineReleasePlanError('INVALID_ARGUMENT_SHAPE');
        }
        if (Object.prototype.hasOwnProperty.call(parsed, name)) {
            throw new OfflineReleasePlanError('DUPLICATE_ARGUMENT');
        }
        parsed[name] = value;
    }

    if (argv.length !== EXPECTED_ARGUMENTS.length * 2) {
        throw new OfflineReleasePlanError('MISSING_REQUIRED_ARGUMENT');
    }
    for (const name of EXPECTED_ARGUMENTS) {
        if (!Object.prototype.hasOwnProperty.call(parsed, name)) {
            throw new OfflineReleasePlanError('MISSING_REQUIRED_ARGUMENT');
        }
    }

    const expected = {
        head: parsed['--expected-head'],
        tree: parsed['--expected-tree'],
        parent: parsed['--expected-parent'],
        subject: parsed['--expected-subject']
    };
    for (const name of ['head', 'tree', 'parent']) {
        if (!FULL_SHA_PATTERN.test(expected[name])) {
            throw new OfflineReleasePlanError('MALFORMED_FULL_SHA');
        }
    }
    if (
        !expected.subject ||
        expected.subject.length > 200 ||
        /[\u0000-\u001f\u007f]/.test(expected.subject)
    ) {
        throw new OfflineReleasePlanError('MALFORMED_SUBJECT');
    }
    return Object.freeze(expected);
};

const createGitReader = (cwd) => (args, { encoding = 'utf8' } = {}) => execFileSync(
    'git',
    args,
    {
        cwd,
        encoding,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024
    }
);

const asLine = (value) => String(value).replace(/\r?\n$/, '');

const buildOfflineReleasePlan = ({ expected, readGit }) => {
    if (!expected || typeof readGit !== 'function') {
        throw new OfflineReleasePlanError('INVALID_PLAN_INPUT');
    }

    let head;
    let tree;
    let parent;
    let subject;
    let status;
    try {
        head = asLine(readGit(['rev-parse', 'HEAD']));
        tree = asLine(readGit(['rev-parse', 'HEAD^{tree}']));
        parent = asLine(readGit(['rev-parse', 'HEAD^']));
        subject = asLine(readGit(['show', '-s', '--format=%s', 'HEAD']));
        status = readGit(
            ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
            { encoding: null }
        );
    } catch (_) {
        throw new OfflineReleasePlanError('GIT_ATTESTATION_FAILED');
    }

    if (![head, tree, parent].every((value) => FULL_SHA_PATTERN.test(value))) {
        throw new OfflineReleasePlanError('GIT_ATTESTATION_MALFORMED');
    }
    if (head !== expected.head) throw new OfflineReleasePlanError('HEAD_MISMATCH');
    if (tree !== expected.tree) throw new OfflineReleasePlanError('TREE_MISMATCH');
    if (parent !== expected.parent) throw new OfflineReleasePlanError('PARENT_MISMATCH');
    if (subject !== expected.subject) throw new OfflineReleasePlanError('SUBJECT_MISMATCH');

    const statusBytes = Buffer.isBuffer(status) ? status : Buffer.from(String(status || ''), 'utf8');
    if (statusBytes.length !== 0) throw new OfflineReleasePlanError('WORKTREE_NOT_CLEAN');

    return Object.freeze({
        schemaVersion: 1,
        status: 'PASS',
        git: Object.freeze({
            head,
            tree,
            parent,
            subjectAttestation: 'PASS',
            cleanState: 'PASS'
        }),
        releaseContract: buildNamesOnlyReleaseContract()
    });
};

const runCli = ({ argv = process.argv.slice(2), cwd = path.resolve(__dirname, '..') } = {}) => {
    const expected = parseArguments(argv);
    return buildOfflineReleasePlan({ expected, readGit: createGitReader(cwd) });
};

if (require.main === module) {
    try {
        process.stdout.write(`${JSON.stringify(runCli())}\n`);
    } catch (error) {
        const code = error instanceof OfflineReleasePlanError ? error.code : 'OFFLINE_PLAN_FAILED';
        process.stderr.write(`${JSON.stringify({ status: 'FAIL', code })}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    EXPECTED_ARGUMENTS,
    FULL_SHA_PATTERN,
    OfflineReleasePlanError,
    buildOfflineReleasePlan,
    createGitReader,
    parseArguments,
    runCli
};
