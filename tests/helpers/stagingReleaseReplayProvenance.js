const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ZERO_SHA = '0'.repeat(40);
const GIT_NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';
const CURRENT_26_CANDIDATE_SHA = '39eb4ced0d3d5c08f3576c19f9bcf0d588ba1cc2';
const CANONICAL_NATIVE_PATCH_ID = 'f22dad882a91b04aee6782cf9bcfa9e93dd62003';
const SUPERSEDED_LOSSY_PATCH_ID = '7534f74d692085c5d33a2b627b85af965397418a';
const identityCache = new Map();
const objectExistenceCache = new Map();
const ancestryCache = new Map();

const EXPECTED_CHANGED_PATHS = Object.freeze([
    'config/cloudinary.js',
    'config/stagingRuntimePolicy.js',
    'config/startupSafety.js',
    'controllers/assistantController.js',
    'controllers/authController.js',
    'controllers/messageController.js',
    'controllers/notificationController.js',
    'controllers/paymentController.js',
    'controllers/runtimeMetaController.js',
    'docs/staging-runtime-safety.md',
    'middlewares/adminCommerceCapability.js',
    'middlewares/stagingAccessGate.js',
    'package.json',
    'routes/adminAttributeRoutes.js',
    'routes/adminCategoryRoutes.js',
    'routes/adminCollectionRoutes.js',
    'routes/adminMenuRoutes.js',
    'routes/productRoutes.js',
    'scripts/runCiSmokes.js',
    'server.js',
    'services/aiProviderService.js',
    'services/escalationService.js',
    'services/notificationService.js',
    'services/paymentProviderService.js',
    'services/paytrPaymentService.js',
    'tests/adminCatalogMutationFoundationSmoke.js',
    'tests/stagingAccessGateHttpSmoke.js',
    'tests/stagingRuntimeSafetySmoke.js'
].sort());

const CHECKPOINT_2_SECOND_PARENT_CHAIN = Object.freeze([
    Object.freeze({
        sha: 'cad3ae7593c37ce81cc7e62d11c20566527a20c3',
        parent: 'ccede5fa36e22fb0d3de9e96f8ee58a5c9909411',
        tree: 'c4af6a989f660c2425d1ef15252db44fc48c6498',
        subject: 'fix(release): attest approved RC13 merge topology',
        changedPaths: Object.freeze([
            'tests/helpers/stagingReleaseReplayProvenance.js',
            'tests/stagingReleaseContractSmoke.js'
        ])
    }),
    Object.freeze({
        sha: '31fc915b369ade956ebfbcad9eeb610f1e27fa16',
        parent: 'cad3ae7593c37ce81cc7e62d11c20566527a20c3',
        tree: '4ea6d2a162a1321fea5658d352e53454628258b0',
        subject: 'fix(db): enforce attested verified runtime target',
        changedPaths: Object.freeze([
            'config/db.js',
            'config/stagingReleaseContract.js',
            'config/startupSafety.js',
            'controllers/runtimeMetaController.js',
            'tests/runtimeIdentitySmoke.js',
            'tests/serverStartupSafetySmoke.js',
            'tests/stagingVerificationHarnessSmoke.js',
            'tests/startupSafetySmoke.js'
        ])
    }),
    Object.freeze({
        sha: '44c3a314f87a024fa534238bbac164abe4e5a757',
        parent: '31fc915b369ade956ebfbcad9eeb610f1e27fa16',
        tree: '8329d8f78182329eb0b1391fb9ffa1170d6b1fb6',
        subject: 'fix(runtime): require own revision attestation',
        changedPaths: Object.freeze([
            'services/runtimeIdentityService.js',
            'tests/runtimeIdentitySmoke.js'
        ])
    }),
    Object.freeze({
        sha: '56a0adce4baacd61a396d5a7d8a6a7517dd09769',
        parent: '44c3a314f87a024fa534238bbac164abe4e5a757',
        tree: '2bd17eba01f58aaec31dfceb3d31b4bf184f3fae',
        subject: 'fix(test): make blocked startup wait race-safe',
        changedPaths: Object.freeze([
            'tests/serverStartupSafetySmoke.js'
        ])
    }),
    Object.freeze({
        sha: '0ca267c39e68bb683f85ffa3a6ae2083547a78ef',
        parent: '56a0adce4baacd61a396d5a7d8a6a7517dd09769',
        tree: 'e85429600962ef873441fcc202d10591096e90bd',
        subject: 'fix(test): synchronize startup smoke readiness',
        changedPaths: Object.freeze([
            'tests/serverStartupSafetySmoke.js'
        ])
    }),
    Object.freeze({
        sha: 'fc8c0e4aaca343fcfb03810451507a263b1fe674',
        parent: '0ca267c39e68bb683f85ffa3a6ae2083547a78ef',
        tree: '63582c7ff60f829287b72d0e08271cd03973ae08',
        subject: 'fix(test): bound failed-db shutdown wait',
        changedPaths: Object.freeze([
            'tests/serverStartupSafetySmoke.js'
        ])
    })
]);

const APPROVED_MERGE_CHECKPOINTS = Object.freeze([
    Object.freeze({
        sha: 'ccede5fa36e22fb0d3de9e96f8ee58a5c9909411',
        firstParent: '71ff4ed76b09496343d1593e23dc5d30d9cf5964',
        secondParent: '3b9bce487d8257da3bbb334117c8af3b51e469c2',
        resultTree: 'b22f19c4011f4f423fd30857ca61c3504cae30b3',
        secondParentTree: 'b22f19c4011f4f423fd30857ca61c3504cae30b3',
        subject:
            'Merge pull request #24 from Qusay90/codex/commerce-pro-v3-reconciled-r5-20260729',
        secondParentValidation: Object.freeze({ type: 'CONTROLLED_REPLAY' })
    }),
    Object.freeze({
        sha: 'efc20acb5f221a8abdf7dc7d6e30ffb5c59383f0',
        firstParent: 'ccede5fa36e22fb0d3de9e96f8ee58a5c9909411',
        secondParent: 'fc8c0e4aaca343fcfb03810451507a263b1fe674',
        resultTree: '63582c7ff60f829287b72d0e08271cd03973ae08',
        secondParentTree: '63582c7ff60f829287b72d0e08271cd03973ae08',
        subject:
            'Merge pull request #25 from Qusay90/codex/main5-prepromotion-remediation-20260730',
        secondParentValidation: Object.freeze({
            type: 'EXACT_COMMIT_CHAIN',
            baseSha: 'ccede5fa36e22fb0d3de9e96f8ee58a5c9909411',
            commits: CHECKPOINT_2_SECOND_PARENT_CHAIN
        })
    })
]);

const RELEASE_PROVENANCE_CONTRACT = Object.freeze({
    frozenTarget: '71ff4ed76b09496343d1593e23dc5d30d9cf5964',
    frozenTargetTree: '1084dec268b39e2c97bd730ce1a919381d5735ba',
    approvedMergeCheckpoints: APPROVED_MERGE_CHECKPOINTS,
    originalSha: 'c06cbcba0d1cba77b030d2a588e7a699be4a05a2',
    originalParent: 'cfeaf0f043642ad1db6a7b2b565c3f0e0050ed47',
    replaySha: '7b4765b1c0868852821c16af6d6483ab41a5bef0',
    replayParent: '6dc7bc110658b6ecb233a4fde0817d4c466a0d1e',
    parentTree: '10680b4afe302262678eaf9c1d4e08342edfe3ed',
    resultTree: 'be3504ffea9c99b22502a88bed1dfd9351e9c59a',
    subject: 'feat(staging): gate access and external side effects',
    changedPaths: EXPECTED_CHANGED_PATHS,
    replayOrdinal: 18,
    rawDiffSize: 111429,
    rawDiffSha256: 'fd2cace8d9b57949084057dc4e7bdd23375f781a7d68832dd1b21e9741b32a11'
});

class ReleaseProvenanceError extends Error {
    constructor(code, detail = '') {
        super(`Release provenance validation failed: ${code}${detail ? ` (${detail})` : ''}`);
        this.name = 'ReleaseProvenanceError';
        this.code = code;
    }
}

const fail = (code) => {
    throw new ReleaseProvenanceError(code);
};

const ensure = (condition, code) => {
    if (!condition) fail(code);
};

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const cleanGitEnvironment = (extra = {}) => {
    const environment = { ...process.env };
    for (const name of Object.keys(environment)) {
        if (/^GIT_/i.test(name)) delete environment[name];
    }
    return {
        ...environment,
        GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_NO_LAZY_FETCH: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
        ...extra
    };
};

const runGit = (
    cwd,
    args,
    {
        allowedStatuses = [0],
        encoding = 'utf8',
        extraEnv = {},
        input = undefined,
        maxBuffer = 32 * 1024 * 1024
    } = {}
) => {
    const result = spawnSync(
        'git',
        [
            '--no-replace-objects',
            '-c', 'diff.external=',
            '-c', 'diff.renames=false',
            ...args
        ],
        {
            cwd,
            encoding,
            env: cleanGitEnvironment(extraEnv),
            input,
            maxBuffer,
            windowsHide: true
        }
    );
    if (result.error || !allowedStatuses.includes(result.status)) {
        const stderr = String(result.stderr || result.error?.message || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 240);
        throw new ReleaseProvenanceError(
            'GIT_COMMAND_FAILED',
            `${args[0] || 'unknown'} exit=${result.status}${stderr ? ` ${stderr}` : ''}`
        );
    }
    return result;
};

const gitText = (cwd, args, options = {}) => String(
    runGit(cwd, args, { ...options, encoding: 'utf8' }).stdout
).trimEnd();

const gitBuffer = (cwd, args, options = {}) => runGit(
    cwd,
    args,
    { ...options, encoding: null }
).stdout;

const resolveGitPath = (cwd, gitPath) => (
    path.isAbsolute(gitPath) ? gitPath : path.resolve(cwd, gitPath)
);

const assertRepositoryIsComplete = (cwd) => {
    ensure(gitText(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true', 'NOT_A_WORKTREE');
    ensure(gitText(cwd, ['rev-parse', '--show-object-format']) === 'sha1', 'UNSUPPORTED_OBJECT_FORMAT');
    ensure(
        gitText(cwd, ['rev-parse', '--is-shallow-repository']) === 'false',
        'SHALLOW_HISTORY'
    );

    const partial = runGit(
        cwd,
        [
            'config',
            '--local',
            '--get-regexp',
            '^(extensions\\.partialclone|remote\\..*\\.(promisor|partialclonefilter))$'
        ],
        { allowedStatuses: [0, 1] }
    );
    ensure(partial.status === 1 || !String(partial.stdout).trim(), 'PARTIAL_HISTORY');

    for (const [gitRelativePath, code] of [
        ['objects/info/alternates', 'OBJECT_ALTERNATES_FORBIDDEN'],
        ['info/grafts', 'GRAFTS_FORBIDDEN']
    ]) {
        const location = resolveGitPath(
            cwd,
            gitText(cwd, ['rev-parse', '--git-path', gitRelativePath])
        );
        ensure(!fs.existsSync(location) || fs.statSync(location).size === 0, code);
    }

    ensure(
        gitText(cwd, ['for-each-ref', '--format=%(refname)', 'refs/replace']) === '',
        'REPLACE_REFS_FORBIDDEN'
    );
};

const objectExists = (cwd, sha) => {
    ensure(FULL_SHA_PATTERN.test(sha), 'MALFORMED_CONTRACT_SHA');
    const cacheKey = `${path.resolve(cwd)}\0${sha}`;
    if (objectExistenceCache.has(cacheKey)) return objectExistenceCache.get(cacheKey);
    const result = runGit(
        cwd,
        ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`],
        { allowedStatuses: [0, 1] }
    );
    if (result.status === 1) {
        objectExistenceCache.set(cacheKey, false);
        return false;
    }
    ensure(String(result.stdout).trim() === sha, 'OBJECT_ID_MISMATCH');
    objectExistenceCache.set(cacheKey, true);
    return true;
};

const isAncestor = (cwd, ancestor, descendant) => {
    const cacheKey = `${path.resolve(cwd)}\0${ancestor}\0${descendant}`;
    if (ancestryCache.has(cacheKey)) return ancestryCache.get(cacheKey);
    const result = runGit(
        cwd,
        ['merge-base', '--is-ancestor', ancestor, descendant],
        { allowedStatuses: [0, 1] }
    );
    const answer = result.status === 0;
    ancestryCache.set(cacheKey, answer);
    return answer;
};

const readParents = (cwd, sha) => {
    const parts = gitText(cwd, ['rev-list', '--parents', '-n', '1', sha])
        .split(' ')
        .filter(Boolean);
    ensure(parts.shift() === sha, 'COMMIT_GRAPH_MALFORMED');
    return parts;
};

const readChangedPaths = (cwd, sha) => {
    const bytes = gitBuffer(cwd, [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        '-z',
        '--no-renames',
        sha
    ]);
    return bytes.toString('utf8').split('\0').filter(Boolean).sort();
};

const readRawDiff = (cwd, parent, sha) => gitBuffer(cwd, [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    '--binary',
    '--abbrev=7',
    '--diff-algorithm=myers',
    '--indent-heuristic',
    '--unified=3',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    parent,
    sha
]);

const readNativePatchId = (cwd, rawDiff) => {
    const result = runGit(
        cwd,
        ['patch-id', '--stable'],
        {
            allowedStatuses: [0, 1, 128],
            input: rawDiff,
            encoding: null
        }
    );
    if (result.status !== 0) return null;
    const output = String(result.stdout);
    const patchId = output.split(/\s+/)[0] || '';
    return FULL_SHA_PATTERN.test(patchId) ? patchId : null;
};

const readIdentity = (cwd, sha) => {
    const cacheKey = `${path.resolve(cwd)}\0${sha}`;
    if (identityCache.has(cacheKey)) return identityCache.get(cacheKey);
    const parents = readParents(cwd, sha);
    const parent = parents[0] || null;
    const parentTree = parent ? gitText(cwd, ['rev-parse', `${parent}^{tree}`]) : null;
    const resultTree = gitText(cwd, ['rev-parse', `${sha}^{tree}`]);
    const subject = gitText(cwd, ['show', '-s', '--format=%s', sha]);
    const changedPaths = parents.length === 1 ? readChangedPaths(cwd, sha) : [];
    const rawDiff = parents.length === 1 ? readRawDiff(cwd, parent, sha) : Buffer.alloc(0);
    const identity = {
        sha,
        parents,
        parent,
        parentTree,
        resultTree,
        subject,
        changedPaths,
        rawDiff,
        rawDiffSize: rawDiff.length,
        rawDiffSha256: sha256(rawDiff)
    };
    identityCache.set(cacheKey, identity);
    return identity;
};

const sameStringArray = (left, right) => (
    left.length === right.length && left.every((value, index) => value === right[index])
);

const matchesAuthoritativeFingerprint = (identity, contract) => (
    identity.parents.length === 1 &&
    identity.parentTree === contract.parentTree &&
    identity.resultTree === contract.resultTree &&
    identity.parentTree !== identity.resultTree &&
    identity.subject === contract.subject &&
    sameStringArray(identity.changedPaths, [...contract.changedPaths].sort()) &&
    identity.rawDiffSize === contract.rawDiffSize &&
    identity.rawDiffSha256 === contract.rawDiffSha256
);

const assertContractShape = (contract) => {
    for (const name of [
        'frozenTarget',
        'frozenTargetTree',
        'originalSha',
        'originalParent',
        'replaySha',
        'replayParent',
        'parentTree',
        'resultTree'
    ]) ensure(FULL_SHA_PATTERN.test(contract[name]), 'MALFORMED_CONTRACT_SHA');
    ensure(SHA256_PATTERN.test(contract.rawDiffSha256), 'MALFORMED_CONTRACT_HASH');
    ensure(Number.isInteger(contract.rawDiffSize) && contract.rawDiffSize >= 0, 'MALFORMED_CONTRACT_SIZE');
    ensure(Number.isInteger(contract.replayOrdinal) && contract.replayOrdinal > 0, 'MALFORMED_ORDINAL');
    ensure(Array.isArray(contract.changedPaths), 'MALFORMED_PATH_CONTRACT');

    const checkpoints = contract.approvedMergeCheckpoints;
    ensure(Array.isArray(checkpoints), 'MALFORMED_CHECKPOINT_CONTRACT');
    ensure(checkpoints.length >= 1 && checkpoints.length <= 2, 'MALFORMED_CHECKPOINT_COUNT');
    ensure(Object.isFrozen(checkpoints), 'MALFORMED_CHECKPOINT_IMMUTABILITY');

    const seen = new Set();
    let expectedFirstParent = contract.frozenTarget;
    for (const [index, checkpoint] of checkpoints.entries()) {
        const role = `CHECKPOINT_${index + 1}`;
        ensure(Object.isFrozen(checkpoint), `${role}_MUTABLE`);
        for (const name of [
            'sha',
            'firstParent',
            'secondParent',
            'resultTree',
            'secondParentTree'
        ]) ensure(FULL_SHA_PATTERN.test(checkpoint[name]), `${role}_MALFORMED_SHA`);
        ensure(!seen.has(checkpoint.sha), 'DUPLICATE_APPROVED_CHECKPOINT');
        seen.add(checkpoint.sha);
        ensure(checkpoint.firstParent === expectedFirstParent, 'MALFORMED_CHECKPOINT_ORDER');
        ensure(checkpoint.resultTree === checkpoint.secondParentTree, `${role}_TREE_CONTRACT`);
        ensure(
            typeof checkpoint.subject === 'string' && checkpoint.subject.length > 0,
            `${role}_SUBJECT_CONTRACT`
        );

        const validation = checkpoint.secondParentValidation;
        ensure(
            validation && typeof validation === 'object' && Object.isFrozen(validation),
            `${role}_SECOND_PARENT_CONTRACT`
        );
        if (validation.type === 'CONTROLLED_REPLAY') {
            ensure(index === 0, `${role}_REPLAY_POSITION`);
        } else if (validation.type === 'EXACT_COMMIT_CHAIN') {
            ensure(index > 0, `${role}_CHAIN_POSITION`);
            ensure(validation.baseSha === checkpoint.firstParent, `${role}_CHAIN_BASE`);
            ensure(Array.isArray(validation.commits), `${role}_CHAIN_CONTRACT`);
            ensure(validation.commits.length === 6, `${role}_CHAIN_LENGTH`);
            ensure(Object.isFrozen(validation.commits), `${role}_CHAIN_MUTABLE`);
            let expectedParent = validation.baseSha;
            for (const [commitIndex, entry] of validation.commits.entries()) {
                const commitRole = `${role}_CHAIN_${commitIndex + 1}`;
                ensure(Object.isFrozen(entry), `${commitRole}_MUTABLE`);
                for (const name of ['sha', 'parent', 'tree']) {
                    ensure(FULL_SHA_PATTERN.test(entry[name]), `${commitRole}_MALFORMED_SHA`);
                }
                ensure(entry.parent === expectedParent, `${commitRole}_ORDER`);
                ensure(
                    typeof entry.subject === 'string' && entry.subject.length > 0,
                    `${commitRole}_SUBJECT_CONTRACT`
                );
                ensure(
                    Array.isArray(entry.changedPaths) && Object.isFrozen(entry.changedPaths),
                    `${commitRole}_PATH_CONTRACT`
                );
                expectedParent = entry.sha;
            }
            ensure(expectedParent === checkpoint.secondParent, `${role}_CHAIN_TIP`);
            ensure(
                validation.commits.at(-1).tree === checkpoint.secondParentTree,
                `${role}_CHAIN_TREE`
            );
        } else {
            fail(`${role}_SECOND_PARENT_MODE`);
        }
        expectedFirstParent = checkpoint.sha;
    }
};

const assertExactIdentity = (cwd, sha, expectedParent, contract, role) => {
    ensure(objectExists(cwd, sha), `${role}_OBJECT_MISSING`);
    const identity = readIdentity(cwd, sha);
    ensure(identity.parents.length === 1, `${role}_MERGE`);
    ensure(identity.parent === expectedParent, `${role}_PARENT_MISMATCH`);
    ensure(identity.parentTree === contract.parentTree, `${role}_PARENT_TREE_MISMATCH`);
    ensure(identity.resultTree === contract.resultTree, `${role}_RESULT_TREE_MISMATCH`);
    ensure(identity.parentTree !== identity.resultTree, `${role}_EMPTY`);
    ensure(identity.subject === contract.subject, `${role}_SUBJECT_MISMATCH`);
    ensure(
        sameStringArray(identity.changedPaths, [...contract.changedPaths].sort()),
        `${role}_PATH_SET_MISMATCH`
    );
    ensure(
        identity.rawDiffSize === contract.rawDiffSize &&
        identity.rawDiffSha256 === contract.rawDiffSha256,
        `${role}_RAW_DIFF_MISMATCH`
    );
    if (!identity.diagnosticPatchId) {
        identity.diagnosticPatchId = readNativePatchId(cwd, identity.rawDiff);
    }
    return {
        ...identity,
        diagnosticPatchId: identity.diagnosticPatchId
    };
};

const firstParentChain = (cwd, revisionRange) => {
    const output = gitText(cwd, ['rev-list', '--first-parent', '--reverse', revisionRange]);
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
};

const findFingerprintMatches = (cwd, chain, contract) => {
    const matches = [];
    for (const sha of chain) {
        const identity = readIdentity(cwd, sha);
        if (matchesAuthoritativeFingerprint(identity, contract)) matches.push(sha);
    }
    return matches;
};

const commitList = (cwd, args) => {
    const output = gitText(cwd, args);
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
};

const assertNormalFirstParentDescendants = (
    cwd,
    ancestor,
    resolvedHead,
    role,
    requireNonEmpty = true
) => {
    const descendants = firstParentChain(cwd, `${ancestor}..${resolvedHead}`);
    let expectedParent = ancestor;
    for (const sha of descendants) {
        const identity = readIdentity(cwd, sha);
        ensure(identity.parents.length === 1, `${role}_MERGE`);
        ensure(identity.parent === expectedParent, `${role}_NOT_FIRST_PARENT`);
        if (requireNonEmpty) {
            ensure(identity.parentTree !== identity.resultTree, `${role}_EMPTY`);
        }
        expectedParent = sha;
    }
    ensure(expectedParent === resolvedHead, `${role}_NOT_FIRST_PARENT`);
    return descendants;
};

const verifyApprovedReplayForHead = ({
    cwd,
    contract,
    resolvedHead,
    headTree
}) => {
    ensure(objectExists(cwd, contract.frozenTarget), 'FROZEN_TARGET_MISSING');
    ensure(
        gitText(cwd, ['rev-parse', `${contract.frozenTarget}^{tree}`]) ===
            contract.frozenTargetTree,
        'FROZEN_TARGET_TREE_MISMATCH'
    );
    ensure(
        isAncestor(cwd, contract.frozenTarget, resolvedHead),
        'FROZEN_TARGET_NOT_ANCESTOR'
    );

    const range = `${contract.frozenTarget}..${resolvedHead}`;
    const mergeOutput = gitText(cwd, ['rev-list', '--min-parents=2', range]);
    ensure(mergeOutput === '', 'CANDIDATE_MERGE_PRESENT');

    const chain = firstParentChain(cwd, range);
    const replayOccurrences = chain.filter((sha) => sha === contract.replaySha);
    ensure(replayOccurrences.length === 1, 'REPLAY_NOT_FIRST_PARENT');
    ensure(
        chain.indexOf(contract.replaySha) + 1 === contract.replayOrdinal,
        'REPLAY_ORDINAL_MISMATCH'
    );

    const replayIdentity = assertExactIdentity(
        cwd,
        contract.replaySha,
        contract.replayParent,
        contract,
        'REPLAY'
    );
    const matches = findFingerprintMatches(cwd, chain, contract);
    ensure(
        matches.length === 1 && matches[0] === contract.replaySha,
        'AMBIGUOUS_RELEASE_LINEAGE'
    );

    return Object.freeze({
        mode: 'APPROVED_REPLAY',
        head: resolvedHead,
        headTree,
        acceptedCommit: contract.replaySha,
        replayOrdinal: chain.indexOf(contract.replaySha) + 1,
        fingerprintOccurrenceCount: matches.length,
        diagnosticPatchId: replayIdentity.diagnosticPatchId
    });
};

const assertExactMergeCheckpoint = (cwd, checkpoint, role) => {
    ensure(objectExists(cwd, checkpoint.sha), `${role}_OBJECT_MISSING`);
    ensure(objectExists(cwd, checkpoint.secondParent), `${role}_SECOND_PARENT_OBJECT_MISSING`);
    const identity = readIdentity(cwd, checkpoint.sha);
    ensure(identity.parents.length === 2, `${role}_PARENT_COUNT`);
    ensure(identity.parents[0] === checkpoint.firstParent, `${role}_FIRST_PARENT_MISMATCH`);
    ensure(identity.parents[1] === checkpoint.secondParent, `${role}_SECOND_PARENT_MISMATCH`);
    ensure(identity.resultTree === checkpoint.resultTree, `${role}_RESULT_TREE_MISMATCH`);
    ensure(identity.subject === checkpoint.subject, `${role}_SUBJECT_MISMATCH`);
    ensure(
        gitText(cwd, ['rev-parse', `${checkpoint.secondParent}^{tree}`]) ===
            checkpoint.secondParentTree,
        `${role}_SECOND_PARENT_TREE_MISMATCH`
    );
    return identity;
};

const verifyExactSecondParentChain = (cwd, checkpoint, role) => {
    const validation = checkpoint.secondParentValidation;
    const expectedChain = validation.commits.map((entry) => entry.sha);
    const actualChain = firstParentChain(
        cwd,
        `${validation.baseSha}..${checkpoint.secondParent}`
    );
    ensure(sameStringArray(actualChain, expectedChain), `${role}_SECOND_PARENT_CHAIN_MISMATCH`);

    let expectedParent = validation.baseSha;
    for (const [index, entry] of validation.commits.entries()) {
        const commitRole = `${role}_SECOND_PARENT_${index + 1}`;
        ensure(objectExists(cwd, entry.sha), `${commitRole}_OBJECT_MISSING`);
        const identity = readIdentity(cwd, entry.sha);
        ensure(identity.parents.length === 1, `${commitRole}_MERGE`);
        ensure(identity.parent === expectedParent, `${commitRole}_PARENT_MISMATCH`);
        ensure(identity.parent === entry.parent, `${commitRole}_CONTRACT_PARENT_MISMATCH`);
        ensure(identity.resultTree === entry.tree, `${commitRole}_TREE_MISMATCH`);
        ensure(identity.parentTree !== identity.resultTree, `${commitRole}_EMPTY`);
        ensure(identity.subject === entry.subject, `${commitRole}_SUBJECT_MISMATCH`);
        ensure(
            sameStringArray(identity.changedPaths, [...entry.changedPaths].sort()),
            `${commitRole}_PATH_SET_MISMATCH`
        );
        expectedParent = entry.sha;
    }
    ensure(expectedParent === checkpoint.secondParent, `${role}_SECOND_PARENT_TIP_MISMATCH`);
};

const verifyApprovedCheckpointChainForHead = ({
    cwd,
    contract,
    resolvedHead,
    headTree
}) => {
    const headFirstParentChain = firstParentChain(
        cwd,
        `${contract.frozenTarget}..${resolvedHead}`
    );
    const applicable = [];
    let missingPrefixEntry = false;
    for (const checkpoint of contract.approvedMergeCheckpoints) {
        const present = headFirstParentChain.includes(checkpoint.sha);
        if (present) {
            ensure(!missingPrefixEntry, 'APPROVED_CHECKPOINT_PREFIX_ORDER');
            applicable.push(checkpoint);
        } else {
            missingPrefixEntry = true;
        }
    }
    ensure(applicable.length > 0, 'APPROVED_MERGE_NOT_FIRST_PARENT');

    const replayResults = [];
    for (const [index, checkpoint] of applicable.entries()) {
        const role = `APPROVED_CHECKPOINT_${index + 1}`;
        assertExactMergeCheckpoint(cwd, checkpoint, role);
        if (checkpoint.secondParentValidation.type === 'CONTROLLED_REPLAY') {
            replayResults.push(verifyApprovedReplayForHead({
                cwd,
                contract,
                resolvedHead: checkpoint.secondParent,
                headTree: checkpoint.secondParentTree
            }));
        } else {
            verifyExactSecondParentChain(cwd, checkpoint, role);
        }
    }

    const merges = commitList(cwd, [
        'rev-list',
        '--topo-order',
        '--reverse',
        '--min-parents=2',
        `${contract.frozenTarget}..${resolvedHead}`
    ]);
    ensure(
        sameStringArray(merges, applicable.map((checkpoint) => checkpoint.sha)),
        'UNAPPROVED_MERGE_PRESENT'
    );

    const latestCheckpoint = applicable.at(-1);
    assertNormalFirstParentDescendants(
        cwd,
        latestCheckpoint.sha,
        resolvedHead,
        'APPROVED_CHECKPOINT_DESCENDANT'
    );

    const replay = replayResults[0];

    return Object.freeze({
        mode: applicable.length === 1
            ? 'APPROVED_RC13_MERGE'
            : 'APPROVED_MERGE_CHECKPOINT_CHAIN',
        head: resolvedHead,
        headTree,
        acceptedCommit: latestCheckpoint.sha,
        approvedSecondParent: latestCheckpoint.secondParent,
        approvedCheckpointCount: applicable.length,
        approvedCheckpoints: Object.freeze(applicable.map((checkpoint) => checkpoint.sha)),
        replayOrdinal: replay.replayOrdinal,
        fingerprintOccurrenceCount: replay.fingerprintOccurrenceCount,
        diagnosticPatchId: replay.diagnosticPatchId
    });
};

const verifyRepositoryForTest = ({
    cwd,
    contract = RELEASE_PROVENANCE_CONTRACT,
    head = 'HEAD'
}) => {
    assertContractShape(contract);
    assertRepositoryIsComplete(cwd);

    const resolvedHead = gitText(cwd, ['rev-parse', `${head}^{commit}`]);
    ensure(FULL_SHA_PATTERN.test(resolvedHead), 'HEAD_MALFORMED');
    const headTree = gitText(cwd, ['rev-parse', `${resolvedHead}^{tree}`]);

    const originalExists = objectExists(cwd, contract.originalSha);
    const originalIsAncestor = originalExists && isAncestor(cwd, contract.originalSha, resolvedHead);

    if (originalIsAncestor) {
        const directIdentity = assertExactIdentity(
            cwd,
            contract.originalSha,
            contract.originalParent,
            contract,
            'SOURCE'
        );
        const chain = firstParentChain(cwd, resolvedHead);
        ensure(chain.includes(contract.originalSha), 'SOURCE_NOT_FIRST_PARENT');
        const matches = findFingerprintMatches(cwd, chain, contract);
        ensure(
            matches.length === 1 && matches[0] === contract.originalSha,
            'AMBIGUOUS_RELEASE_LINEAGE'
        );
        ensure(
            gitText(cwd, [
                'rev-list',
                '--min-parents=2',
                `${contract.originalSha}..${resolvedHead}`
            ]) === '',
            'SOURCE_DESCENDANT_MERGE'
        );
        assertNormalFirstParentDescendants(
            cwd,
            contract.originalSha,
            resolvedHead,
            'SOURCE_DESCENDANT',
            false
        );
        if (
            contract.replaySha !== contract.originalSha &&
            objectExists(cwd, contract.replaySha) &&
            isAncestor(cwd, contract.replaySha, resolvedHead)
        ) fail('AMBIGUOUS_RELEASE_LINEAGE');
        return Object.freeze({
            mode: 'DIRECT',
            head: resolvedHead,
            headTree,
            acceptedCommit: contract.originalSha,
            fingerprintOccurrenceCount: matches.length,
            diagnosticPatchId: directIdentity.diagnosticPatchId
        });
    }

    const approvedCheckpointIsAncestor = contract.approvedMergeCheckpoints.some(
        (checkpoint) => objectExists(cwd, checkpoint.sha) &&
            isAncestor(cwd, checkpoint.sha, resolvedHead)
    );
    if (approvedCheckpointIsAncestor) {
        return verifyApprovedCheckpointChainForHead({
            cwd,
            contract,
            resolvedHead,
            headTree
        });
    }

    return verifyApprovedReplayForHead({
        cwd,
        contract,
        resolvedHead,
        headTree
    });
};

const verifyReleaseProvenance = ({ cwd }) => verifyRepositoryForTest({
    cwd,
    contract: RELEASE_PROVENANCE_CONTRACT,
    head: 'HEAD'
});

const validateWorkflowCheckoutContract = (workflowSource) => {
    const source = String(workflowSource).replace(/\r\n/g, '\n');
    const backendStart = source.indexOf('  backend-storefront-smoke:\n');
    const adminStart = source.indexOf('  admin-commerce-pro:\n');
    const androidStart = source.indexOf('  android-unit:\n');
    ensure(backendStart >= 0 && adminStart > backendStart && androidStart > adminStart, 'WORKFLOW_JOB_LAYOUT');

    const backend = source.slice(backendStart, adminStart);
    const admin = source.slice(adminStart, androidStart);
    const android = source.slice(androidStart);
    const exactRef = "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";
    const checkoutPattern = new RegExp(
        [
            '- name: Checkout',
            '\\n\\s+uses: actions/checkout@v6',
            '\\n\\s+with:',
            '\\n\\s+fetch-depth: 0',
            `\\n\\s+ref: \\$\\{\\{ github\\.event_name == 'pull_request' && github\\.event\\.pull_request\\.head\\.sha \\|\\| github\\.sha \\}\\}`
        ].join('')
    );

    ensure(checkoutPattern.test(backend), 'WORKFLOW_BACKEND_CHECKOUT_MISMATCH');
    ensure((source.match(/uses: actions\/checkout@v6/g) || []).length === 3, 'WORKFLOW_ACTION_VERSION');
    ensure((source.match(/fetch-depth:\s*0/g) || []).length === 1, 'WORKFLOW_FETCH_DEPTH_SCOPE');
    ensure((source.match(/github\.event\.pull_request\.head\.sha/g) || []).length === 1, 'WORKFLOW_PR_HEAD_SCOPE');
    ensure((source.match(/ref:\s*\$\{\{/g) || []).length === 1, 'WORKFLOW_REF_SCOPE');
    ensure(/run:\s*npm test(?:\s|$)/.test(backend), 'WORKFLOW_ROOT_TEST_MISSING');
    ensure(/^permissions:\n  contents: read\n/m.test(source), 'WORKFLOW_PERMISSIONS_CHANGED');
    ensure(!/\n\s{4}permissions:\s*\n/.test(source), 'WORKFLOW_JOB_PERMISSION_OVERRIDE');
    ensure(!/\bpull_request_target\s*:/.test(source), 'WORKFLOW_PULL_REQUEST_TARGET');
    ensure(!/\$\{\{\s*secrets\./.test(source), 'WORKFLOW_SECRET_REFERENCE');
    ensure(!/\b(?:token|persist-credentials)\s*:/.test(source), 'WORKFLOW_CREDENTIAL_INPUT');
    ensure(!/\brun:\s*.*\b(?:git\s+push|deploy|force-push)\b/im.test(source), 'WORKFLOW_WRITE_STEP');
    for (const job of [admin, android]) {
        ensure(/- name: Checkout\n\s+uses: actions\/checkout@v6\n/.test(job), 'WORKFLOW_OTHER_CHECKOUT_CHANGED');
        ensure(!/fetch-depth:|github\.event\.pull_request\.head\.sha|\n\s+ref:/.test(job), 'WORKFLOW_OTHER_CHECKOUT_EXPANDED');
    }

    return Object.freeze({
        action: 'actions/checkout@v6',
        fetchDepth: 0,
        pullRequestRef: exactRef,
        pushRef: exactRef,
        permissions: 'contents: read',
        checkoutCount: 3
    });
};

const assertSafeStartScript = (packageJson) => {
    ensure(packageJson?.scripts?.start === 'node server.js', 'RELEASE_BEHAVIOR_ASSERTION_FAILED');
    ensure(!/migrat|bootstrap|initDb/i.test(packageJson.scripts.start), 'RELEASE_BEHAVIOR_ASSERTION_FAILED');
    return true;
};

let fixtureSequence = 0;

const fixtureDate = () => {
    fixtureSequence += 1;
    const seconds = fixtureSequence % 50;
    return `2026-01-01T00:00:${String(seconds).padStart(2, '0')}Z`;
};

const initFixtureRepository = (directory) => {
    fs.mkdirSync(directory, { recursive: true });
    runGit(directory, ['init', '--quiet']);
    runGit(directory, ['config', '--local', 'user.name', 'RC10R4 Fixture']);
    runGit(directory, ['config', '--local', 'user.email', 'rc10r4-fixture@example.invalid']);
    return gitText(directory, ['mktree'], { input: Buffer.alloc(0) });
};

const deriveTree = (cwd, baseTree, changes) => {
    const indexPath = path.join(os.tmpdir(), `novastore-rc10r4-index-${process.pid}-${fixtureSequence + 1}`);
    const indexEnv = { GIT_INDEX_FILE: indexPath };
    try {
        runGit(cwd, ['read-tree', baseTree], { extraEnv: indexEnv });
        for (const [relativePath, content] of Object.entries(changes)) {
            if (content === null) {
                runGit(
                    cwd,
                    ['update-index', '--force-remove', '--', relativePath],
                    { extraEnv: indexEnv, allowedStatuses: [0, 1] }
                );
                continue;
            }
            const blob = gitText(
                cwd,
                ['hash-object', '-w', '--stdin'],
                {
                    input: Buffer.isBuffer(content)
                        ? content
                        : Buffer.from(String(content), 'utf8')
                }
            );
            runGit(
                cwd,
                ['update-index', '--add', '--cacheinfo', `100644,${blob},${relativePath}`],
                { extraEnv: indexEnv }
            );
        }
        return gitText(cwd, ['write-tree'], { extraEnv: indexEnv });
    } finally {
        fs.rmSync(indexPath, { force: true });
    }
};

const commitTree = (cwd, tree, parents, subject) => {
    const date = fixtureDate();
    const args = ['commit-tree', tree];
    for (const parent of parents) args.push('-p', parent);
    args.push('-m', subject);
    return gitText(cwd, args, {
        extraEnv: {
            GIT_AUTHOR_NAME: 'RC10R4 Fixture',
            GIT_AUTHOR_EMAIL: 'rc10r4-fixture@example.invalid',
            GIT_AUTHOR_DATE: date,
            GIT_COMMITTER_NAME: 'RC10R4 Fixture',
            GIT_COMMITTER_EMAIL: 'rc10r4-fixture@example.invalid',
            GIT_COMMITTER_DATE: date
        }
    });
};

const setFixtureHead = (cwd, sha) => {
    runGit(cwd, ['update-ref', 'refs/heads/fixture', sha]);
    runGit(cwd, ['symbolic-ref', 'HEAD', 'refs/heads/fixture']);
};

const freezeCheckpoint = (checkpoint) => {
    const validation = { ...checkpoint.secondParentValidation };
    if (Array.isArray(validation.commits)) {
        validation.commits = Object.freeze(validation.commits.map((entry) => Object.freeze({
            ...entry,
            changedPaths: Object.freeze([...entry.changedPaths])
        })));
    }
    return Object.freeze({
        ...checkpoint,
        secondParentValidation: Object.freeze(validation)
    });
};

const contractFromIdentity = ({
    cwd,
    target,
    identitySha,
    mode,
    ordinal = 18
}) => {
    const identity = readIdentity(cwd, identitySha);
    ensure(identity.parents.length === 1, 'FIXTURE_IDENTITY_INVALID');
    return Object.freeze({
        frozenTarget: target,
        frozenTargetTree: gitText(cwd, ['rev-parse', `${target}^{tree}`]),
        approvedMergeCheckpoints: Object.freeze([freezeCheckpoint({
            sha: '4'.repeat(40),
            firstParent: target,
            secondParent: '5'.repeat(40),
            resultTree: '6'.repeat(40),
            secondParentTree: '6'.repeat(40),
            subject: 'fixture approved merge',
            secondParentValidation: { type: 'CONTROLLED_REPLAY' }
        })]),
        originalSha: mode === 'DIRECT' ? identitySha : ZERO_SHA,
        originalParent: mode === 'DIRECT' ? identity.parent : '1'.repeat(40),
        replaySha: mode === 'APPROVED_REPLAY' ? identitySha : '2'.repeat(40),
        replayParent: mode === 'APPROVED_REPLAY' ? identity.parent : '3'.repeat(40),
        parentTree: identity.parentTree,
        resultTree: identity.resultTree,
        subject: identity.subject,
        changedPaths: Object.freeze([...identity.changedPaths]),
        replayOrdinal: ordinal,
        rawDiffSize: identity.rawDiffSize,
        rawDiffSha256: identity.rawDiffSha256
    });
};

const buildDirectFixture = (directory) => {
    const emptyTree = initFixtureRepository(directory);
    let tree = deriveTree(directory, emptyTree, { 'base.txt': 'base\n' });
    const target = commitTree(directory, tree, [], 'direct base');
    const changes = Object.fromEntries(
        EXPECTED_CHANGED_PATHS.map((relativePath, index) => [
            relativePath,
            `direct fixture ${index + 1}\n`
        ])
    );
    tree = deriveTree(directory, tree, changes);
    const original = commitTree(
        directory,
        tree,
        [target],
        RELEASE_PROVENANCE_CONTRACT.subject
    );
    tree = deriveTree(directory, tree, { 'after-direct.txt': 'after direct\n' });
    const head = commitTree(directory, tree, [original], 'after direct');
    setFixtureHead(directory, head);
    return {
        cwd: directory,
        target,
        head,
        original,
        contract: contractFromIdentity({
            cwd: directory,
            target,
            identitySha: original,
            mode: 'DIRECT',
            ordinal: 1
        })
    };
};

const cloneContract = (contract, overrides = {}) => Object.freeze({
    ...contract,
    ...overrides,
    changedPaths: Object.freeze([
        ...(overrides.changedPaths || contract.changedPaths)
    ]),
    approvedMergeCheckpoints: Object.freeze([
        ...(overrides.approvedMergeCheckpoints || contract.approvedMergeCheckpoints)
    ].map(freezeCheckpoint))
});

const cloneCheckpointContract = (contract, checkpointIndex, overrides = {}) => {
    const checkpoints = contract.approvedMergeCheckpoints.map((checkpoint, index) => (
        index === checkpointIndex
            ? freezeCheckpoint({
                ...checkpoint,
                ...overrides,
                secondParentValidation: overrides.secondParentValidation ||
                    checkpoint.secondParentValidation
            })
            : checkpoint
    ));
    return cloneContract(contract, { approvedMergeCheckpoints: checkpoints });
};

const cloneHistoricalCheckpointContract = (contract, overrides = {}) => cloneContract(
    contract,
    {
        approvedMergeCheckpoints: [freezeCheckpoint({
            ...contract.approvedMergeCheckpoints[0],
            ...overrides,
            secondParentValidation: overrides.secondParentValidation ||
                contract.approvedMergeCheckpoints[0].secondParentValidation
        })]
    }
);

const expectReleaseFailure = (assertion, detail = '') => {
    try {
        assertion();
    } catch (error) {
        ensure(error instanceof ReleaseProvenanceError, 'FIXTURE_UNEXPECTED_ERROR');
        return error.code;
    }
    throw new ReleaseProvenanceError('FIXTURE_EXPECTED_FAILURE_MISSING', detail);
};

const runProvenanceFixtureMatrix = ({ cwd }) => {
    const matrix = [];
    const recordPass = (number, name, assertion) => {
        assertion();
        matrix.push(Object.freeze({
            number,
            name,
            expectedOutcome: 'ACCEPT',
            result: 'PASS'
        }));
    };
    const recordFailClosed = (
        number,
        name,
        expectedCodeOrAssertion,
        maybeAssertion
    ) => {
        const expectedCode = typeof expectedCodeOrAssertion === 'string'
            ? expectedCodeOrAssertion
            : null;
        const assertion = expectedCode ? maybeAssertion : expectedCodeOrAssertion;
        let actualCode;
        try {
            actualCode = expectReleaseFailure(assertion, `case=${number} ${name}`);
        } catch (error) {
            if (error.code === 'FIXTURE_EXPECTED_FAILURE_MISSING') {
                throw new ReleaseProvenanceError(
                    'FIXTURE_EXPECTED_FAILURE_MISSING',
                    `case=${number} ${name}`
                );
            }
            throw error;
        }
        if (expectedCode && actualCode !== expectedCode) {
            throw new ReleaseProvenanceError(
                'FIXTURE_UNEXPECTED_FAILURE_CODE',
                `case=${number} expected=${expectedCode} actual=${actualCode}`
            );
        }
        matrix.push(Object.freeze({
            number,
            name,
            expectedOutcome: 'REJECT',
            rejectionCode: actualCode,
            result: 'PASS'
        }));
    };

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'novastore-rc10r4-provenance-'));
    try {
        const direct = buildDirectFixture(path.join(tempRoot, 'direct'));
        const replayPath = path.join(tempRoot, 'replay');
        runGit(tempRoot, [
            'clone',
            '--quiet',
            '--no-checkout',
            '--no-local',
            '--no-hardlinks',
            cwd,
            replayPath
        ]);
        runGit(replayPath, [
            'fetch',
            '--quiet',
            '--no-tags',
            cwd,
            `${CURRENT_26_CANDIDATE_SHA}:refs/heads/fixture`
        ]);
        runGit(replayPath, ['symbolic-ref', 'HEAD', 'refs/heads/fixture']);
        const replay = {
            cwd: replayPath,
            target: RELEASE_PROVENANCE_CONTRACT.frozenTarget,
            head: CURRENT_26_CANDIDATE_SHA,
            replay: RELEASE_PROVENANCE_CONTRACT.replaySha,
            replayParent: RELEASE_PROVENANCE_CONTRACT.replayParent,
            replayParentTree: RELEASE_PROVENANCE_CONTRACT.parentTree,
            replayResultTree: RELEASE_PROVENANCE_CONTRACT.resultTree,
            finalTree: gitText(replayPath, [
                'rev-parse',
                `${CURRENT_26_CANDIDATE_SHA}^{tree}`
            ]),
            contract: RELEASE_PROVENANCE_CONTRACT
        };

        recordPass(1, 'original source direct ancestor', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: direct.cwd,
                    contract: direct.contract,
                    head: direct.head
                }).mode === 'DIRECT',
                'FIXTURE_DIRECT_NOT_ACCEPTED'
            );
        });
        recordPass(2, 'exact approved replay authoritative identity', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: replay.head
                }).mode === 'APPROVED_REPLAY',
                'FIXTURE_REPLAY_NOT_ACCEPTED'
            );
        });
        recordPass(3, 'current 26-commit candidate', () => {
            const result = verifyRepositoryForTest({
                cwd,
                contract: RELEASE_PROVENANCE_CONTRACT,
                head: CURRENT_26_CANDIDATE_SHA
            });
            ensure(result.mode === 'APPROVED_REPLAY', 'FIXTURE_CURRENT_CANDIDATE_NOT_ACCEPTED');
        });
        recordPass(4, 'full-history pull-request head', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: replay.head
            });
        });
        recordPass(5, 'full-history push SHA', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: replay.head
            });
        });

        const syntheticMerge = commitTree(
            replay.cwd,
            replay.finalTree,
            [replay.target, replay.head],
            'synthetic pull request merge'
        );
        recordFailClosed(6, 'synthetic pull-request merge HEAD', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: syntheticMerge
            });
        });

        const shallowPath = path.join(tempRoot, 'shallow');
        runGit(tempRoot, [
            'clone',
            '--quiet',
            '--depth', '1',
            '--no-local',
            '--no-hardlinks',
            '--branch', 'fixture',
            pathToFileURL(replay.cwd).href,
            shallowPath
        ]);
        recordFailClosed(7, 'shallow history', () => {
            verifyRepositoryForTest({
                cwd: shallowPath,
                contract: replay.contract,
                head: 'HEAD'
            });
        });

        const unrelated = buildDirectFixture(path.join(tempRoot, 'unrelated'));
        recordFailClosed(8, 'source and replay absent', () => {
            verifyRepositoryForTest({
                cwd: unrelated.cwd,
                contract: replay.contract,
                head: unrelated.head
            });
        });

        const samePatchDifferentSha = commitTree(
            replay.cwd,
            replay.replayResultTree,
            [replay.replayParent],
            replay.contract.subject
        );
        recordFailClosed(9, 'same patch-id different SHA', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: samePatchDifferentSha
            });
        });

        recordFailClosed(10, 'superseded lossy patch-id cannot authorize', () => {
            const previous = process.env.NOVASTORE_RELEASE_PATCH_ID;
            process.env.NOVASTORE_RELEASE_PATCH_ID = SUPERSEDED_LOSSY_PATCH_ID;
            try {
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: samePatchDifferentSha
                });
            } finally {
                if (previous === undefined) delete process.env.NOVASTORE_RELEASE_PATCH_ID;
                else process.env.NOVASTORE_RELEASE_PATCH_ID = previous;
            }
        });

        recordFailClosed(11, 'wrong parent SHA', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, { replayParent: replay.target }),
                head: replay.head
            });
        });
        recordFailClosed(12, 'wrong parent tree', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, {
                    parentTree: replay.contract.frozenTargetTree
                }),
                head: replay.head
            });
        });
        recordFailClosed(13, 'wrong result tree', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, {
                    resultTree: replay.contract.frozenTargetTree
                }),
                head: replay.head
            });
        });
        recordFailClosed(14, 'wrong raw diff hash or byte size', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, {
                    rawDiffSha256: 'f'.repeat(64),
                    rawDiffSize: replay.contract.rawDiffSize + 1
                }),
                head: replay.head
            });
        });

        const extraTree = deriveTree(
            replay.cwd,
            replay.replayResultTree,
            { 'unexpected-extra.txt': 'extra\n' }
        );
        const extraCommit = commitTree(
            replay.cwd,
            extraTree,
            [replay.replayParent],
            replay.contract.subject
        );
        const extraContract = contractFromIdentity({
            cwd: replay.cwd,
            target: replay.target,
            identitySha: extraCommit,
            mode: 'APPROVED_REPLAY',
            ordinal: 18
        });
        recordFailClosed(15, 'extra path', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(extraContract, {
                    changedPaths: replay.contract.changedPaths
                }),
                head: extraCommit
            });
        });

        const missingPath = replay.contract.changedPaths[0];
        const parentPathBytes = gitBuffer(
            replay.cwd,
            ['show', `${replay.replayParentTree}:${missingPath}`]
        );
        const missingTree = deriveTree(
            replay.cwd,
            replay.replayResultTree,
            { [missingPath]: parentPathBytes }
        );
        const missingCommit = commitTree(
            replay.cwd,
            missingTree,
            [replay.replayParent],
            replay.contract.subject
        );
        const missingContract = contractFromIdentity({
            cwd: replay.cwd,
            target: replay.target,
            identitySha: missingCommit,
            mode: 'APPROVED_REPLAY',
            ordinal: 18
        });
        recordFailClosed(16, 'missing path', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(missingContract, {
                    changedPaths: replay.contract.changedPaths
                }),
                head: missingCommit
            });
        });

        const wrongSubject = commitTree(
            replay.cwd,
            replay.replayResultTree,
            [replay.replayParent],
            'wrong replay subject'
        );
        recordFailClosed(17, 'wrong subject', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, { replaySha: wrongSubject }),
                head: wrongSubject
            });
        });

        recordFailClosed(18, 'wrong ordinal', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, { replayOrdinal: 17 }),
                head: replay.head
            });
        });

        const revert = commitTree(
            replay.cwd,
            replay.replayParentTree,
            [replay.replay],
            'revert authoritative fixture'
        );
        const reapply = commitTree(
            replay.cwd,
            replay.replayResultTree,
            [revert],
            replay.contract.subject
        );
        recordFailClosed(19, 'duplicate replay fingerprint', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: reapply
            });
        });

        const sideTree = deriveTree(
            replay.cwd,
            replay.replayParentTree,
            { 'side.txt': 'side\n' }
        );
        const side = commitTree(replay.cwd, sideTree, [replay.replayParent], 'side parent');
        const replayMerge = commitTree(
            replay.cwd,
            replay.replayResultTree,
            [replay.replayParent, side],
            replay.contract.subject
        );
        recordFailClosed(20, 'merge replay commit', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, { replaySha: replayMerge }),
                head: replayMerge
            });
        });

        const main = commitTree(
            replay.cwd,
            sideTree,
            [replay.replayParent],
            'main first-parent'
        );
        const sideParentMerge = commitTree(
            replay.cwd,
            replay.replayResultTree,
            [main, replay.replay],
            'side-parent-only replay'
        );
        recordFailClosed(21, 'replay only on side parent', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: sideParentMerge
            });
        });

        const empty = commitTree(
            replay.cwd,
            replay.replayParentTree,
            [replay.replayParent],
            replay.contract.subject
        );
        recordFailClosed(22, 'empty metadata-only imitation', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, {
                    replaySha: empty,
                    resultTree: replay.replayParentTree,
                    changedPaths: [],
                    rawDiffSize: 0,
                    rawDiffSha256: sha256(Buffer.alloc(0))
                }),
                head: empty
            });
        });

        recordFailClosed(23, 'wrong frozen target', () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, {
                    frozenTarget: 'd'.repeat(40)
                }),
                head: replay.head
            });
        });

        recordFailClosed(24, 'environment external evidence and Git steering bypass', () => {
            const previous = {
                GIT_DIR: process.env.GIT_DIR,
                GIT_ALTERNATE_OBJECT_DIRECTORIES: process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES,
                NOVASTORE_RELEASE_REPLAY_SHA: process.env.NOVASTORE_RELEASE_REPLAY_SHA,
                NOVASTORE_RELEASE_PATCH_ID: process.env.NOVASTORE_RELEASE_PATCH_ID
            };
            process.env.GIT_DIR = path.join(replay.cwd, '.git');
            process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(replay.cwd, '.git', 'objects');
            process.env.NOVASTORE_RELEASE_REPLAY_SHA = replay.contract.replaySha;
            process.env.NOVASTORE_RELEASE_PATCH_ID = CANONICAL_NATIVE_PATCH_ID;
            try {
                verifyRepositoryForTest({
                    cwd: unrelated.cwd,
                    contract: replay.contract,
                    head: unrelated.head
                });
            } finally {
                for (const [name, value] of Object.entries(previous)) {
                    if (value === undefined) delete process.env[name];
                    else process.env[name] = value;
                }
            }
        });

        const bypassPath = path.join(tempRoot, 'bypass');
        runGit(tempRoot, [
            'clone',
            '--quiet',
            '--no-local',
            '--no-hardlinks',
            replay.cwd,
            bypassPath
        ]);
        runGit(bypassPath, ['replace', replay.target, replay.replayParent]);
        expectReleaseFailure(() => verifyRepositoryForTest({
            cwd: bypassPath,
            contract: replay.contract,
            head: 'HEAD'
        }), 'case=24 replace-ref');
        runGit(bypassPath, ['replace', '-d', replay.target]);

        const graftPath = resolveGitPath(
            bypassPath,
            gitText(bypassPath, ['rev-parse', '--git-path', 'info/grafts'])
        );
        fs.writeFileSync(graftPath, `${replay.head} ${replay.target}\n`, 'utf8');
        expectReleaseFailure(() => verifyRepositoryForTest({
            cwd: bypassPath,
            contract: replay.contract,
            head: 'HEAD'
        }), 'case=24 graft');
        fs.rmSync(graftPath, { force: true });

        const alternatesPath = resolveGitPath(
            bypassPath,
            gitText(bypassPath, ['rev-parse', '--git-path', 'objects/info/alternates'])
        );
        fs.mkdirSync(path.dirname(alternatesPath), { recursive: true });
        fs.writeFileSync(
            alternatesPath,
            `${path.join(direct.cwd, '.git', 'objects')}\n`,
            'utf8'
        );
        expectReleaseFailure(() => verifyRepositoryForTest({
            cwd: bypassPath,
            contract: replay.contract,
            head: 'HEAD'
        }), 'case=24 alternates');
        fs.rmSync(alternatesPath, { force: true });

        runGit(bypassPath, ['config', '--local', 'extensions.partialClone', 'origin']);
        expectReleaseFailure(() => verifyRepositoryForTest({
            cwd: bypassPath,
            contract: replay.contract,
            head: 'HEAD'
        }), 'case=24 partial-clone');
        runGit(bypassPath, ['config', '--local', '--unset', 'extensions.partialClone']);

        runGit(bypassPath, ['config', '--local', 'remote.origin.promisor', 'true']);
        expectReleaseFailure(() => verifyRepositoryForTest({
            cwd: bypassPath,
            contract: replay.contract,
            head: 'HEAD'
        }), 'case=24 promisor');
        runGit(bypassPath, ['config', '--local', '--unset', 'remote.origin.promisor']);

        runGit(bypassPath, ['config', '--local', 'remote.origin.partialclonefilter', 'blob:none']);
        expectReleaseFailure(() => verifyRepositoryForTest({
            cwd: bypassPath,
            contract: replay.contract,
            head: 'HEAD'
        }), 'case=24 partial-clone-filter');
        runGit(bypassPath, ['config', '--local', '--unset', 'remote.origin.partialclonefilter']);

        const unsafeRepository = path.join(tempRoot, 'unsafe-behavior');
        const unsafeEmptyTree = initFixtureRepository(unsafeRepository);
        const unsafeTree = deriveTree(unsafeRepository, unsafeEmptyTree, {
            'package.json': `${JSON.stringify({ scripts: { start: 'node unsafe.js' } })}\n`
        });
        const unsafeCommit = commitTree(unsafeRepository, unsafeTree, [], 'unsafe behavior');
        setFixtureHead(unsafeRepository, unsafeCommit);
        recordFailClosed(25, 'release behavior assertion broken', () => {
            const packageJson = JSON.parse(
                gitBuffer(unsafeRepository, ['show', `${unsafeCommit}:package.json`]).toString('utf8')
            );
            assertSafeStartScript(packageJson);
        });

        const approvedCheckpoint = replay.contract.approvedMergeCheckpoints[0];
        const approvedMerge = approvedCheckpoint.sha;
        const approvedCandidate = approvedCheckpoint.secondParent;
        const approvedTree = approvedCheckpoint.resultTree;
        const approvedSubject = approvedCheckpoint.subject;

        recordPass(26, 'approved matrix existing DIRECT lineage', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: direct.cwd,
                    contract: direct.contract,
                    head: direct.head
                }).mode === 'DIRECT',
                'FIXTURE_DIRECT_NOT_ACCEPTED'
            );
        });
        recordPass(27, 'approved matrix existing APPROVED_REPLAY candidate', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: approvedCandidate
                }).mode === 'APPROVED_REPLAY',
                'FIXTURE_APPROVED_CANDIDATE_NOT_ACCEPTED'
            );
        });
        recordPass(28, 'exact RC13 merge at HEAD', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: approvedMerge
                }).mode === 'APPROVED_RC13_MERGE',
                'FIXTURE_APPROVED_MERGE_NOT_ACCEPTED'
            );
        });

        const approvedDescendantTree = deriveTree(
            replay.cwd,
            approvedTree,
            { 'approved-descendant.txt': 'approved descendant\n' }
        );
        const approvedDescendant = commitTree(
            replay.cwd,
            approvedDescendantTree,
            [approvedMerge],
            'approved merge descendant'
        );
        recordPass(29, 'exact RC13 merge plus one non-empty descendant', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: approvedDescendant
                }).mode === 'APPROVED_RC13_MERGE',
                'FIXTURE_APPROVED_DESCENDANT_NOT_ACCEPTED'
            );
        });
        recordPass(30, 'current source anchor', () => {
            const result = verifyRepositoryForTest({
                cwd,
                contract: RELEASE_PROVENANCE_CONTRACT,
                head: RELEASE_PROVENANCE_CONTRACT.approvedMergeCheckpoints[0].sha
            });
            ensure(result.mode === 'APPROVED_RC13_MERGE', 'FIXTURE_SOURCE_ANCHOR_NOT_ACCEPTED');
        });

        const wrongFirstMerge = commitTree(
            replay.cwd,
            approvedTree,
            [replay.replayParent, approvedCandidate],
            approvedSubject
        );
        recordFailClosed(
            31,
            'approved merge wrong first parent',
            'APPROVED_CHECKPOINT_1_FIRST_PARENT_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: wrongFirstMerge
                }),
                head: wrongFirstMerge
            });
            }
        );

        const wrongSecondMerge = commitTree(
            replay.cwd,
            approvedTree,
            [replay.target, CURRENT_26_CANDIDATE_SHA],
            approvedSubject
        );
        recordFailClosed(
            32,
            'approved merge wrong second parent',
            'APPROVED_CHECKPOINT_1_SECOND_PARENT_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: wrongSecondMerge
                }),
                head: wrongSecondMerge
            });
            }
        );

        const reversedParentMerge = commitTree(
            replay.cwd,
            approvedTree,
            [approvedCandidate, replay.target],
            approvedSubject
        );
        recordFailClosed(
            33,
            'approved merge reversed parents',
            'APPROVED_CHECKPOINT_1_FIRST_PARENT_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: reversedParentMerge
                }),
                head: reversedParentMerge
            });
            }
        );

        const wrongMergeTree = deriveTree(
            replay.cwd,
            approvedTree,
            { 'wrong-merge-result.txt': 'wrong result\n' }
        );
        const wrongResultMerge = commitTree(
            replay.cwd,
            wrongMergeTree,
            [replay.target, approvedCandidate],
            approvedSubject
        );
        recordFailClosed(
            34,
            'approved merge wrong result tree',
            'APPROVED_CHECKPOINT_1_RESULT_TREE_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: wrongResultMerge
                }),
                head: wrongResultMerge
            });
            }
        );

        const wrongSecondParentTree = deriveTree(
            replay.cwd,
            approvedTree,
            { 'wrong-second-parent-tree.txt': 'wrong second parent tree\n' }
        );
        const wrongTreeCandidate = commitTree(
            replay.cwd,
            wrongSecondParentTree,
            [approvedCandidate],
            'candidate with wrong tree'
        );
        const wrongSecondTreeMerge = commitTree(
            replay.cwd,
            approvedTree,
            [replay.target, wrongTreeCandidate],
            approvedSubject
        );
        recordFailClosed(
            35,
            'approved merge wrong second-parent tree',
            'APPROVED_CHECKPOINT_1_SECOND_PARENT_TREE_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: wrongSecondTreeMerge,
                    secondParent: wrongTreeCandidate
                }),
                head: wrongSecondTreeMerge
            });
            }
        );

        const wrongSubjectMerge = commitTree(
            replay.cwd,
            approvedTree,
            [replay.target, approvedCandidate],
            'wrong approved merge subject'
        );
        recordFailClosed(
            36,
            'approved merge wrong subject',
            'APPROVED_CHECKPOINT_1_SUBJECT_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: wrongSubjectMerge
                }),
                head: wrongSubjectMerge
            });
            }
        );

        const sameVisibleDifferentSha = commitTree(
            replay.cwd,
            approvedTree,
            [replay.target, approvedCandidate],
            approvedSubject
        );
        recordFailClosed(
            37,
            'same visible merge fields but different SHA',
            'CANDIDATE_MERGE_PRESENT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: sameVisibleDifferentSha
            });
            }
        );

        const outsideMainTree = deriveTree(
            replay.cwd,
            replay.contract.frozenTargetTree,
            { 'outside-main.txt': 'outside main\n' }
        );
        const outsideMain = commitTree(
            replay.cwd,
            outsideMainTree,
            [replay.target],
            'outside first-parent main'
        );
        const mergeOutsideFirstParent = commitTree(
            replay.cwd,
            approvedTree,
            [outsideMain, approvedMerge],
            'approved merge only on side parent'
        );
        recordFailClosed(
            38,
            'approved merge outside first-parent chain',
            'APPROVED_MERGE_NOT_FIRST_PARENT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: mergeOutsideFirstParent
            });
            }
        );

        const wrapperSideTree = deriveTree(
            replay.cwd,
            approvedTree,
            { 'wrapper-side.txt': 'wrapper side\n' }
        );
        const wrapperSide = commitTree(
            replay.cwd,
            wrapperSideTree,
            [approvedMerge],
            'wrapper side'
        );
        const syntheticWrapper = commitTree(
            replay.cwd,
            approvedTree,
            [approvedMerge, wrapperSide],
            'synthetic wrapper above approved merge'
        );
        recordFailClosed(
            39,
            'synthetic wrapper merge above approved merge',
            'UNAPPROVED_MERGE_PRESENT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: syntheticWrapper
            });
            }
        );

        const secondMergeAfter = commitTree(
            replay.cwd,
            approvedDescendantTree,
            [approvedDescendant, wrapperSide],
            'second merge after approved merge'
        );
        recordFailClosed(
            40,
            'second merge after approved merge',
            'UNAPPROVED_MERGE_PRESENT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: secondMergeAfter
            });
            }
        );

        const beforeSide = commitTree(
            replay.cwd,
            outsideMainTree,
            [replay.target],
            'merge-before side'
        );
        const mergeBefore = commitTree(
            replay.cwd,
            outsideMainTree,
            [replay.target, beforeSide],
            'merge before approved merge'
        );
        const approvedAfterUnknownMerge = commitTree(
            replay.cwd,
            approvedTree,
            [mergeBefore, approvedCandidate],
            approvedSubject
        );
        recordFailClosed(
            41,
            'merge before approved merge fails exact first-parent identity',
            'APPROVED_CHECKPOINT_1_FIRST_PARENT_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: approvedAfterUnknownMerge
                }),
                head: approvedAfterUnknownMerge
            });
            }
        );

        const octopusMerge = commitTree(
            replay.cwd,
            approvedTree,
            [replay.target, approvedCandidate, wrapperSide],
            approvedSubject
        );
        recordFailClosed(
            42,
            'octopus approved merge imitation',
            'APPROVED_CHECKPOINT_1_PARENT_COUNT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: octopusMerge
                }),
                head: octopusMerge
            });
            }
        );

        const candidateMergeSide = commitTree(
            replay.cwd,
            approvedTree,
            [approvedCandidate],
            'candidate merge side'
        );
        const mergedCandidate = commitTree(
            replay.cwd,
            approvedTree,
            [approvedCandidate, candidateMergeSide],
            'merged candidate'
        );
        const mergeWithMergedCandidate = commitTree(
            replay.cwd,
            approvedTree,
            [replay.target, mergedCandidate],
            approvedSubject
        );
        recordFailClosed(
            43,
            'candidate second parent contains merge',
            'CANDIDATE_MERGE_PRESENT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: mergeWithMergedCandidate,
                    secondParent: mergedCandidate
                }),
                head: mergeWithMergedCandidate
            });
            }
        );

        recordFailClosed(
            44,
            'approved merge candidate replay absent',
            'REPLAY_NOT_FIRST_PARENT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, {
                    replaySha: 'e'.repeat(40)
                }),
                head: approvedMerge
            });
            }
        );

        const duplicateReplayTree = gitText(
            replay.cwd,
            ['rev-parse', `${reapply}^{tree}`]
        );
        const mergeWithDuplicateReplay = commitTree(
            replay.cwd,
            duplicateReplayTree,
            [replay.target, reapply],
            approvedSubject
        );
        recordFailClosed(
            45,
            'approved merge candidate replay duplicate',
            'AMBIGUOUS_RELEASE_LINEAGE',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract, {
                    sha: mergeWithDuplicateReplay,
                    secondParent: reapply,
                    resultTree: duplicateReplayTree,
                    secondParentTree: duplicateReplayTree
                }),
                head: mergeWithDuplicateReplay
            });
            }
        );

        recordFailClosed(
            46,
            'approved merge candidate replay wrong ordinal',
            'REPLAY_ORDINAL_MISMATCH',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneContract(replay.contract, {
                    replayOrdinal: 17
                }),
                head: approvedMerge
            });
            }
        );

        recordFailClosed(
            47,
            'approved matrix shallow history',
            'SHALLOW_HISTORY',
            () => {
            verifyRepositoryForTest({
                cwd: shallowPath,
                contract: replay.contract,
                head: 'HEAD'
            });
            }
        );

        runGit(bypassPath, ['config', '--local', 'extensions.partialClone', 'origin']);
        recordFailClosed(
            48,
            'approved matrix partial history',
            'PARTIAL_HISTORY',
            () => {
            verifyRepositoryForTest({
                cwd: bypassPath,
                contract: replay.contract,
                head: approvedMerge
            });
            }
        );
        runGit(bypassPath, ['config', '--local', '--unset', 'extensions.partialClone']);

        const emptyApprovedDescendant = commitTree(
            replay.cwd,
            approvedTree,
            [approvedMerge],
            'empty approved descendant'
        );
        recordFailClosed(
            49,
            'empty post-approved-merge descendant',
            'APPROVED_CHECKPOINT_DESCENDANT_EMPTY',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: emptyApprovedDescendant
            });
            }
        );

        const unknownMain = commitTree(
            replay.cwd,
            outsideMainTree,
            [replay.target],
            'unknown merge main'
        );
        const unknownCandidateMerge = commitTree(
            replay.cwd,
            approvedTree,
            [unknownMain, approvedCandidate],
            'unknown merge containing approved candidate'
        );
        recordFailClosed(
            50,
            'unknown merge containing approved candidate',
            'CANDIDATE_MERGE_PRESENT',
            () => {
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: unknownCandidateMerge
            });
            }
        );

        const directSideTree = deriveTree(
            direct.cwd,
            gitText(direct.cwd, ['rev-parse', `${direct.original}^{tree}`]),
            { 'direct-merge-side.txt': 'direct merge side\n' }
        );
        const directSide = commitTree(
            direct.cwd,
            directSideTree,
            [direct.original],
            'direct merge side'
        );
        const directMerge = commitTree(
            direct.cwd,
            gitText(direct.cwd, ['rev-parse', `${direct.head}^{tree}`]),
            [direct.head, directSide],
            'unknown merge after approved direct source'
        );
        recordFailClosed(
            51,
            'unknown merge after approved DIRECT source',
            'SOURCE_DESCENDANT_MERGE',
            () => {
            verifyRepositoryForTest({
                cwd: direct.cwd,
                contract: direct.contract,
                head: directMerge
            });
            }
        );

        const directEmptyDescendant = commitTree(
            direct.cwd,
            gitText(direct.cwd, ['rev-parse', `${direct.head}^{tree}`]),
            [direct.head],
            'empty direct descendant'
        );
        recordPass(52, 'DIRECT empty linear descendant compatibility', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: direct.cwd,
                    contract: direct.contract,
                    head: directEmptyDescendant
                }).mode === 'DIRECT',
                'FIXTURE_DIRECT_EMPTY_DESCENDANT_NOT_ACCEPTED'
            );
        });

        const checkpoint1 = replay.contract.approvedMergeCheckpoints[0];
        const checkpoint2 = replay.contract.approvedMergeCheckpoints[1];
        const checkpoint2Chain = checkpoint2.secondParentValidation.commits;
        const withCheckpoint2Chain = (contract, commits, overrides = {}) => (
            cloneCheckpointContract(contract, 1, {
                ...overrides,
                secondParentValidation: {
                    ...checkpoint2.secondParentValidation,
                    commits
                }
            })
        );
        const replaceChainEntry = (entries, index, overrides) => entries.map(
            (entry, entryIndex) => entryIndex === index ? { ...entry, ...overrides } : entry
        );

        recordPass(53, 'exact Checkpoint 2 merge HEAD', () => {
            const result = verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: checkpoint2.sha
            });
            ensure(
                result.mode === 'APPROVED_MERGE_CHECKPOINT_CHAIN' &&
                    result.approvedCheckpointCount === 2,
                'FIXTURE_CHECKPOINT_2_NOT_ACCEPTED'
            );
        });

        const checkpoint2DescendantTree = deriveTree(
            replay.cwd,
            checkpoint2.resultTree,
            { 'checkpoint-2-descendant.txt': 'checkpoint 2 descendant\n' }
        );
        const checkpoint2Descendant = commitTree(
            replay.cwd,
            checkpoint2DescendantTree,
            [checkpoint2.sha],
            'checkpoint 2 normal descendant'
        );
        recordPass(54, 'Checkpoint 2 plus one normal non-empty descendant', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: checkpoint2Descendant
                }).mode === 'APPROVED_MERGE_CHECKPOINT_CHAIN',
                'FIXTURE_CHECKPOINT_2_DESCENDANT_NOT_ACCEPTED'
            );
        });

        const correctivePaths = [
            'tests/helpers/stagingReleaseReplayProvenance.js',
            'tests/stagingReleaseContractSmoke.js'
        ];
        const correctiveCandidateTree = deriveTree(
            replay.cwd,
            checkpoint2.resultTree,
            Object.fromEntries(correctivePaths.map((relativePath) => [
                relativePath,
                fs.readFileSync(path.join(cwd, relativePath))
            ]))
        );
        ensure(
            correctiveCandidateTree !== checkpoint2.resultTree,
            'FIXTURE_CORRECTIVE_CANDIDATE_EMPTY'
        );
        const correctiveCandidate = commitTree(
            replay.cwd,
            correctiveCandidateTree,
            [checkpoint2.sha],
            'fix(release): attest ordered merge checkpoints'
        );
        recordPass(55, 'new corrective commit HEAD', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: correctiveCandidate
                }).mode === 'APPROVED_MERGE_CHECKPOINT_CHAIN',
                'FIXTURE_CORRECTIVE_COMMIT_NOT_ACCEPTED'
            );
        });
        recordPass(56, 'historical Checkpoint 1 HEAD remains accepted', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: checkpoint1.sha
                }).mode === 'APPROVED_RC13_MERGE',
                'FIXTURE_HISTORICAL_CHECKPOINT_1_NOT_ACCEPTED'
            );
        });
        recordPass(57, 'historical Checkpoint 1 normal descendant remains accepted', () => {
            ensure(
                verifyRepositoryForTest({
                    cwd: replay.cwd,
                    contract: replay.contract,
                    head: approvedDescendant
                }).mode === 'APPROVED_RC13_MERGE',
                'FIXTURE_HISTORICAL_CHECKPOINT_1_DESCENDANT_NOT_ACCEPTED'
            );
        });

        const wrongCheckpoint2FirstParentTree = deriveTree(
            replay.cwd,
            checkpoint1.resultTree,
            { 'wrong-checkpoint-2-first-parent.txt': 'wrong first parent\n' }
        );
        const wrongCheckpoint2FirstParent = commitTree(
            replay.cwd,
            wrongCheckpoint2FirstParentTree,
            [checkpoint1.sha],
            'wrong Checkpoint 2 first parent'
        );
        const checkpoint2WrongFirstParent = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [wrongCheckpoint2FirstParent, checkpoint2.secondParent],
            checkpoint2.subject
        );
        recordFailClosed(
            58,
            'PR #25 wrong first parent',
            'APPROVED_CHECKPOINT_2_FIRST_PARENT_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneCheckpointContract(replay.contract, 1, {
                    sha: checkpoint2WrongFirstParent
                }),
                head: checkpoint2WrongFirstParent
            })
        );

        const checkpoint2WrongSecondParent = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint1.sha, checkpoint2Chain[4].sha],
            checkpoint2.subject
        );
        recordFailClosed(
            59,
            'PR #25 wrong second parent',
            'APPROVED_CHECKPOINT_2_SECOND_PARENT_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneCheckpointContract(replay.contract, 1, {
                    sha: checkpoint2WrongSecondParent
                }),
                head: checkpoint2WrongSecondParent
            })
        );

        const checkpoint2ReversedParents = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint2.secondParent, checkpoint1.sha],
            checkpoint2.subject
        );
        recordFailClosed(
            60,
            'PR #25 reversed parents',
            'APPROVED_CHECKPOINT_2_FIRST_PARENT_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneCheckpointContract(replay.contract, 1, {
                    sha: checkpoint2ReversedParents
                }),
                head: checkpoint2ReversedParents
            })
        );

        const checkpoint2Octopus = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint1.sha, checkpoint2.secondParent, wrongCheckpoint2FirstParent],
            checkpoint2.subject
        );
        recordFailClosed(
            61,
            'PR #25 third parent octopus',
            'APPROVED_CHECKPOINT_2_PARENT_COUNT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneCheckpointContract(replay.contract, 1, {
                    sha: checkpoint2Octopus
                }),
                head: checkpoint2Octopus
            })
        );

        const checkpoint2WrongResultTree = deriveTree(
            replay.cwd,
            checkpoint2.resultTree,
            { 'wrong-checkpoint-2-result.txt': 'wrong result tree\n' }
        );
        const checkpoint2WrongResult = commitTree(
            replay.cwd,
            checkpoint2WrongResultTree,
            [checkpoint1.sha, checkpoint2.secondParent],
            checkpoint2.subject
        );
        recordFailClosed(
            62,
            'PR #25 wrong result tree',
            'APPROVED_CHECKPOINT_2_RESULT_TREE_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneCheckpointContract(replay.contract, 1, {
                    sha: checkpoint2WrongResult
                }),
                head: checkpoint2WrongResult
            })
        );

        const wrongCheckpoint2SecondParentTree = deriveTree(
            replay.cwd,
            checkpoint2Chain[4].tree,
            { 'wrong-checkpoint-2-second-parent.txt': 'wrong second-parent tree\n' }
        );
        const wrongCheckpoint2SecondParent = commitTree(
            replay.cwd,
            wrongCheckpoint2SecondParentTree,
            [checkpoint2Chain[4].sha],
            checkpoint2Chain[5].subject
        );
        const checkpoint2WrongSecondTreeMerge = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint1.sha, wrongCheckpoint2SecondParent],
            checkpoint2.subject
        );
        const wrongSecondTreeChain = replaceChainEntry(checkpoint2Chain, 5, {
            sha: wrongCheckpoint2SecondParent
        });
        recordFailClosed(
            63,
            'PR #25 wrong second-parent tree',
            'APPROVED_CHECKPOINT_2_SECOND_PARENT_TREE_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(replay.contract, wrongSecondTreeChain, {
                    sha: checkpoint2WrongSecondTreeMerge,
                    secondParent: wrongCheckpoint2SecondParent
                }),
                head: checkpoint2WrongSecondTreeMerge
            })
        );

        const checkpoint2WrongSubject = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint1.sha, checkpoint2.secondParent],
            'wrong PR #25 checkpoint subject'
        );
        recordFailClosed(
            64,
            'PR #25 wrong subject',
            'APPROVED_CHECKPOINT_2_SUBJECT_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneCheckpointContract(replay.contract, 1, {
                    sha: checkpoint2WrongSubject
                }),
                head: checkpoint2WrongSubject
            })
        );

        const missingCheckpoint1 = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [replay.target, checkpoint2.secondParent],
            checkpoint2.subject
        );
        recordFailClosed(
            65,
            'missing Checkpoint 1',
            'APPROVED_MERGE_NOT_FIRST_PARENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: missingCheckpoint1
            })
        );
        recordFailClosed(
            66,
            'missing Checkpoint 2 when HEAD is after it',
            'UNAPPROVED_MERGE_PRESENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: cloneHistoricalCheckpointContract(replay.contract),
                head: checkpoint2Descendant
            })
        );
        recordFailClosed(67, 'reversed checkpoint order', () => verifyRepositoryForTest({
            cwd: replay.cwd,
            contract: cloneContract(replay.contract, {
                approvedMergeCheckpoints: [checkpoint2, checkpoint1]
            }),
            head: checkpoint2.sha
        }));

        const duplicateCheckpoint2SideTree = deriveTree(
            replay.cwd,
            checkpoint2.resultTree,
            { 'duplicate-checkpoint-2-side.txt': 'duplicate side\n' }
        );
        const duplicateCheckpoint2Side = commitTree(
            replay.cwd,
            duplicateCheckpoint2SideTree,
            [checkpoint2.sha],
            'duplicate Checkpoint 2 side'
        );
        const duplicateCheckpoint2 = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint2.sha, duplicateCheckpoint2Side],
            checkpoint2.subject
        );
        recordFailClosed(
            68,
            'duplicate Checkpoint 2',
            'UNAPPROVED_MERGE_PRESENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: duplicateCheckpoint2
            })
        );

        const betweenCheckpointSideTree = deriveTree(
            replay.cwd,
            checkpoint1.resultTree,
            { 'between-checkpoints-side.txt': 'between checkpoints\n' }
        );
        const betweenCheckpointSide = commitTree(
            replay.cwd,
            betweenCheckpointSideTree,
            [checkpoint1.sha],
            'between checkpoints side'
        );
        const mergeBetweenCheckpoints = commitTree(
            replay.cwd,
            betweenCheckpointSideTree,
            [checkpoint1.sha, betweenCheckpointSide],
            'additional merge between checkpoints'
        );
        recordFailClosed(
            69,
            'additional merge between checkpoints',
            'UNAPPROVED_MERGE_PRESENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: mergeBetweenCheckpoints
            })
        );

        const mergeAfterCheckpoint2 = commitTree(
            replay.cwd,
            checkpoint2DescendantTree,
            [checkpoint2Descendant, duplicateCheckpoint2Side],
            'additional merge after Checkpoint 2'
        );
        recordFailClosed(
            70,
            'additional merge after Checkpoint 2',
            'UNAPPROVED_MERGE_PRESENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: mergeAfterCheckpoint2
            })
        );
        const syntheticCheckpoint2Wrapper = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint2.sha, checkpoint2Descendant],
            'synthetic wrapper above Checkpoint 2'
        );
        recordFailClosed(
            71,
            'synthetic wrapper above Checkpoint 2',
            'UNAPPROVED_MERGE_PRESENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: syntheticCheckpoint2Wrapper
            })
        );

        recordFailClosed(72, 'second-parent chain missing a commit', () => (
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(
                    replay.contract,
                    checkpoint2Chain.filter((_, index) => index !== 2)
                ),
                head: checkpoint2.sha
            })
        ));
        const reorderedCheckpoint2Chain = [...checkpoint2Chain];
        [reorderedCheckpoint2Chain[1], reorderedCheckpoint2Chain[2]] = [
            reorderedCheckpoint2Chain[2],
            reorderedCheckpoint2Chain[1]
        ];
        recordFailClosed(73, 'second-parent chain reordered', () => (
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(replay.contract, reorderedCheckpoint2Chain),
                head: checkpoint2.sha
            })
        ));
        recordFailClosed(74, 'second-parent chain with extra commit', () => (
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(replay.contract, [
                    ...checkpoint2Chain,
                    checkpoint2Chain[5]
                ]),
                head: checkpoint2.sha
            })
        ));

        const emptyChainTip = commitTree(
            replay.cwd,
            checkpoint2Chain[4].tree,
            [checkpoint2Chain[4].sha],
            checkpoint2Chain[5].subject
        );
        const emptyCheckpoint2 = commitTree(
            replay.cwd,
            checkpoint2Chain[4].tree,
            [checkpoint1.sha, emptyChainTip],
            checkpoint2.subject
        );
        const emptyCheckpoint2Chain = replaceChainEntry(checkpoint2Chain, 5, {
            sha: emptyChainTip,
            tree: checkpoint2Chain[4].tree,
            changedPaths: []
        });
        recordFailClosed(
            75,
            'second-parent chain with empty commit',
            'APPROVED_CHECKPOINT_2_SECOND_PARENT_6_EMPTY',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(replay.contract, emptyCheckpoint2Chain, {
                    sha: emptyCheckpoint2,
                    secondParent: emptyChainTip,
                    resultTree: checkpoint2Chain[4].tree,
                    secondParentTree: checkpoint2Chain[4].tree
                }),
                head: emptyCheckpoint2
            })
        );

        const chainMergeSideTree = deriveTree(
            replay.cwd,
            checkpoint2Chain[4].tree,
            { 'chain-merge-side.txt': 'chain merge side\n' }
        );
        const chainMergeSide = commitTree(
            replay.cwd,
            chainMergeSideTree,
            [checkpoint2Chain[4].sha],
            'authorized chain merge side'
        );
        const chainMergeTip = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint2Chain[4].sha, chainMergeSide],
            checkpoint2Chain[5].subject
        );
        const chainMergeCheckpoint2 = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint1.sha, chainMergeTip],
            checkpoint2.subject
        );
        const mergedCheckpoint2Chain = replaceChainEntry(checkpoint2Chain, 5, {
            sha: chainMergeTip,
            changedPaths: []
        });
        recordFailClosed(
            76,
            'second-parent chain containing a merge',
            'APPROVED_CHECKPOINT_2_SECOND_PARENT_6_MERGE',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(replay.contract, mergedCheckpoint2Chain, {
                    sha: chainMergeCheckpoint2,
                    secondParent: chainMergeTip
                }),
                head: chainMergeCheckpoint2
            })
        );

        const shaMismatchChain = replaceChainEntry(checkpoint2Chain, 2, {
            sha: 'a'.repeat(40)
        }).map((entry, index) => index === 3 ? {
            ...entry,
            parent: 'a'.repeat(40)
        } : entry);
        recordFailClosed(77, 'authorized commit SHA mismatch', () => (
            verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(replay.contract, shaMismatchChain),
                head: checkpoint2.sha
            })
        ));
        recordFailClosed(
            78,
            'authorized commit tree mismatch',
            'APPROVED_CHECKPOINT_2_SECOND_PARENT_3_TREE_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(
                    replay.contract,
                    replaceChainEntry(checkpoint2Chain, 2, { tree: 'f'.repeat(40) })
                ),
                head: checkpoint2.sha
            })
        );
        recordFailClosed(
            79,
            'authorized commit subject mismatch',
            'APPROVED_CHECKPOINT_2_SECOND_PARENT_3_SUBJECT_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(
                    replay.contract,
                    replaceChainEntry(checkpoint2Chain, 2, {
                        subject: 'wrong authorized subject'
                    })
                ),
                head: checkpoint2.sha
            })
        );
        recordFailClosed(
            80,
            'authorized commit path mismatch',
            'APPROVED_CHECKPOINT_2_SECOND_PARENT_3_PATH_SET_MISMATCH',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: withCheckpoint2Chain(
                    replay.contract,
                    replaceChainEntry(checkpoint2Chain, 2, {
                        changedPaths: [
                            ...checkpoint2Chain[2].changedPaths,
                            'unexpected-authorized-path.txt'
                        ]
                    })
                ),
                head: checkpoint2.sha
            })
        );

        const arbitrarySameTreeMerge = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [checkpoint1.sha, checkpoint2.secondParent],
            'arbitrary merge with same result tree'
        );
        recordFailClosed(
            81,
            'arbitrary merge with same result tree',
            'UNAPPROVED_MERGE_PRESENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: arbitrarySameTreeMerge
            })
        );

        const nonFirstParentMainTree = deriveTree(
            replay.cwd,
            checkpoint1.resultTree,
            { 'non-first-parent-main.txt': 'non-first-parent main\n' }
        );
        const nonFirstParentMain = commitTree(
            replay.cwd,
            nonFirstParentMainTree,
            [checkpoint1.sha],
            'non-first-parent main'
        );
        const checkpoint2OnSideLineage = commitTree(
            replay.cwd,
            checkpoint2.resultTree,
            [nonFirstParentMain, checkpoint2.sha],
            'Checkpoint 2 only on side lineage'
        );
        recordFailClosed(
            82,
            'checkpoint-shaped merge on non-first-parent lineage',
            'UNAPPROVED_MERGE_PRESENT',
            () => verifyRepositoryForTest({
                cwd: replay.cwd,
                contract: replay.contract,
                head: checkpoint2OnSideLineage
            })
        );

        ensure(matrix.length === 82, 'FIXTURE_MATRIX_INCOMPLETE');
        return Object.freeze(matrix);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
};

module.exports = {
    CANONICAL_NATIVE_PATCH_ID,
    CURRENT_26_CANDIDATE_SHA,
    EXPECTED_CHANGED_PATHS,
    RELEASE_PROVENANCE_CONTRACT,
    ReleaseProvenanceError,
    SUPERSEDED_LOSSY_PATCH_ID,
    assertSafeStartScript,
    runProvenanceFixtureMatrix,
    validateWorkflowCheckoutContract,
    verifyReleaseProvenance,
    verifyRepositoryForTest
};
