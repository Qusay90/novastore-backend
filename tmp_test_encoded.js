const { Client } = require('pg');
const fs = require('fs');

const regions = [
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'ap-south-1',
    'ap-southeast-1'
];

async function test() {
    let out = '';
    // Encoded password: b%26UVpAk9.FhELDD
    for (const r of regions) {
        const host = `aws-0-${r}.pooler.supabase.com`;
        out += 'Testing ' + host + '\n';
        const client = new Client({
            // url encoded password!
            connectionString: `postgresql://postgres.ytiqiljtopsinlbkweop:b%26UVpAk9.FhELDD@${host}:6543/postgres`,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000
        });
        try {
            await client.connect();
            out += '============= SUCCESS: ' + host + ' =============\n';
            await client.end();
            break;
        } catch (e) {
            out += 'FAILED: ' + host + ' ' + e.message + '\n';
        }
    }
    fs.writeFileSync('test_out_encoded.txt', out, 'utf8');
    console.log('Done!');
}

test();
