const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const productSource = fs.readFileSync(path.join(root, 'frontend', 'product.html'), 'utf8');
const profileSource = fs.readFileSync(path.join(root, 'frontend', 'profile.html'), 'utf8');
const adminSource = fs.readFileSync(path.join(root, 'frontend', 'admin.html'), 'utf8');

function extractFunction(source, functionName) {
    const match = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`).exec(source);
    assert.ok(match, `${functionName} function should exist`);

    const start = match.index;
    const bodyStart = source.indexOf('{', start);
    let depth = 0;

    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }

    throw new Error(`${functionName} function body could not be extracted`);
}

const dangerousQuestion = '<img src=x onerror="window.__questionXss=1">';
const dangerousUserName = '<svg onload="window.__nameXss=1"></svg>';
const dangerousAnswer = '<script>window.__answerXss=1</script>';
let qaHtml = '';

const document = {
    getElementById(id) {
        if (id !== 'qa-list') return null;
        return {
            set innerHTML(value) {
                qaHtml = String(value);
            },
            get innerHTML() {
                return qaHtml;
            }
        };
    }
};

const context = {
    document,
    fetch: async (requestPath) => {
        assert.equal(requestPath, '/api/questions/product/101');
        return {
            ok: true,
            json: async () => [{
                question: dangerousQuestion,
                user_name: dangerousUserName,
                answer: dangerousAnswer,
                created_at: '2026-07-05T12:00:00.000Z',
                answered_at: '2026-07-05T13:00:00.000Z'
            }]
        };
    },
    productId: 101,
    console
};

(async () => {
    const renderPromise = vm.runInNewContext(
        [
            extractFunction(productSource, 'escapeHtml'),
            extractFunction(productSource, 'fetchProductQuestions'),
            'fetchProductQuestions();'
        ].join('\n'),
        context,
        { filename: 'product-question-render-harness.js' }
    );

    await renderPromise;

    assert.match(qaHtml, /&lt;img src=x onerror=&quot;window\.__questionXss=1&quot;&gt;/);
    assert.match(qaHtml, /&lt;svg onload=&quot;window\.__nameXss=1&quot;&gt;&lt;\/svg&gt;/);
    assert.match(qaHtml, /&lt;script&gt;window\.__answerXss=1&lt;\/script&gt;/);
    assert.ok(!qaHtml.includes(dangerousQuestion), 'question payload must not be emitted as HTML');
    assert.ok(!qaHtml.includes(dangerousUserName), 'user name payload must not be emitted as HTML');
    assert.ok(!qaHtml.includes(dangerousAnswer), 'answer payload must not be emitted as HTML');

    assert.ok(!productSource.includes('<div>${q.question}</div>'));
    assert.ok(!productSource.includes('${q.user_name} -'));
    assert.ok(!productSource.includes("${q.answer || '<em>"));
    assert.ok(!profileSource.includes('>${q.question}</div>'));
    assert.ok(!profileSource.includes('>${q.answer}</div>'));
    assert.ok(!adminSource.includes('<td>${q.user_name}</td>'));
    assert.ok(!adminSource.includes('title="${q.question}">${q.question}</div>'));
    assert.ok(!adminSource.includes("q.question.replace(/'/g"));

    console.log('productQuestionsXssRenderSmoke: OK');
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
