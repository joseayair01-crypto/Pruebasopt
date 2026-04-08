#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const BASE_URL = (process.argv[2] || DEFAULT_BASE_URL).replace(/\/$/, '');

async function checkEndpoint(pathname) {
    const startedAt = Date.now();
    const response = await fetch(`${BASE_URL}${pathname}`, {
        headers: {
            accept: 'application/json'
        }
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (error) {
        payload = null;
    }

    return {
        pathname,
        ok: response.ok,
        status: response.status,
        durationMs: Date.now() - startedAt,
        payload
    };
}

async function main() {
    const checks = await Promise.all([
        checkEndpoint('/api/health'),
        checkEndpoint('/api/public/ordenes-stats'),
        checkEndpoint('/api/public/boletos/stats')
    ]);

    let failed = false;

    checks.forEach((result) => {
        const label = result.ok ? 'OK ' : 'ERR';
        console.log(`[${label}] ${result.pathname} ${result.status} ${result.durationMs}ms`);

        if (!result.ok) {
            failed = true;
            return;
        }

        if (result.pathname === '/api/health' && result.payload?.status !== 'healthy') {
            failed = true;
            console.error(`  Health reportado como ${result.payload?.status || 'desconocido'}`);
        }
    });

    if (failed) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Health-check falló:', error.message);
    process.exit(1);
});
