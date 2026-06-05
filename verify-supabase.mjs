import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:8765';

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} => HTTP ${res.status}`);
    return res.text();
}

function parseSupabaseConfig(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/createClient\(\s*'([^']+)',\s*'([^']+)'/);
    if (!match) throw new Error(`Cannot parse Supabase config from ${filePath}`);
    return { url: match[1], key: match[2] };
}

async function run() {
    const checks = [];

    const dataGetFiles = fs.readdirSync(path.join(root, 'Public/Js'))
        .filter(f => f.startsWith('dataGet') && f.endsWith('.js'));
    const badImports = dataGetFiles.filter(f => {
        const content = fs.readFileSync(path.join(root, 'Public/Js', f), 'utf8');
        return content.includes('jsdelivr') || !content.includes('globalThis.supabase');
    });
    checks.push({
        name: 'All root dataGet*.js use globalThis.supabase',
        ok: badImports.length === 0,
        detail: badImports.join(', ') || `${dataGetFiles.length} files OK`,
    });

    for (const rel of ['Public/Js/common.js', 'us/Public/Js/common.js', 'de/Public/Js/common.js', 'de-ch-at/Public/Js/common.js']) {
        const content = fs.readFileSync(path.join(root, rel), 'utf8');
        checks.push({
            name: `${rel} defines ensureSupabase`,
            ok: content.includes('function ensureSupabase') && content.includes('/Public/Js/supabase.min.js'),
            detail: 'OK',
        });
    }

    const sdk = await fetchText(`${BASE}/Public/Js/supabase.min.js`);
    checks.push({
        name: 'supabase.min.js served from local static host',
        ok: sdk.length > 100000 && sdk.includes('createClient') && sdk.includes('e.supabase=t()'),
        detail: `${sdk.length} bytes, global=supabase`,
    });

    const dataGetUs = await fetchText(`${BASE}/Public/Js/dataGet_us.js`);
    checks.push({
        name: 'dataGet_us.js has no CDN import',
        ok: !dataGetUs.includes('jsdelivr') && dataGetUs.includes('globalThis.supabase'),
        detail: 'OK',
    });

    const listHtml = await fetchText(`${BASE}/us/list.html`);
    checks.push({
        name: 'us/list.html loads SDK before data module',
        ok: listHtml.includes('ensureSupabase().then(() => import(fetchDataUrl))'),
        detail: 'OK',
    });

    const { url, key } = parseSupabaseConfig(path.join(root, 'Public/Js/dataGet_us.js'));
    const rpcRes = await fetch(`${url}/rest/v1/rpc/get_unique_states`, {
        method: 'POST',
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: '{}',
    });
    const rpcData = await rpcRes.json();
    checks.push({
        name: 'Supabase RPC get_unique_states reachable',
        ok: rpcRes.ok && Array.isArray(rpcData) && rpcData.length > 0,
        detail: rpcRes.ok ? `${rpcData.length} states returned` : JSON.stringify(rpcData),
    });

    let passed = 0;
    let failed = 0;
    for (const c of checks) {
        const status = c.ok ? 'PASS' : 'FAIL';
        console.log(`${status}: ${c.name} (${c.detail})`);
        if (c.ok) passed++; else failed++;
    }
    console.log(`\nAll checks: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Verification error:', err.message || err);
    process.exit(1);
});
