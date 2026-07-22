const { redact } = require('./staging-migrations/guard');
const { runApply, runPlan, runStatus } = require('./staging-migrations/runner');

const command = process.argv[2];
const actions = {
    apply: runApply,
    plan: runPlan,
    status: runStatus
};

if (!actions[command]) {
    console.error('Usage: node scripts/stagingMigrationCli.js <plan|status|apply>');
    process.exitCode = 1;
} else {
    actions[command]().catch((error) => {
        const code = error?.code ? `${error.code}: ` : '';
        console.error(`${code}${redact(error)}`);
        process.exitCode = 1;
    });
}
