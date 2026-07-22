const { runBootstrap } = require('./staging-migrations/bootstrap');
const { redact } = require('./staging-migrations/guard');

runBootstrap().catch((error) => {
    const code = error?.code ? `${error.code}: ` : '';
    console.error(`${code}${redact(error)}`);
    process.exitCode = 1;
});
