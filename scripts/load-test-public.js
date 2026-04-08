#!/usr/bin/env node

const DEFAULTS = {
    baseUrl: process.env.BASE_URL || 'http://localhost:5001',
    durationSec: 30,
    concurrency: 20,
    path: '/api/public/boletos/stats'
};

function parseArgs(argv) {
    const config = { ...DEFAULTS };

    argv.forEach((arg) => {
        const [rawKey, rawValue] = arg.split('=');
        const key = rawKey.replace(/^--/, '');
        const value = rawValue ?? '';

        if (key === 'baseUrl' && value) config.baseUrl = value;
        if (key === 'duration' && value) config.durationSec = Number(value);
        if (key === 'concurrency' && value) config.concurrency = Number(value);
        if (key === 'path' && value) config.path = value.startsWith('/') ? value : `/${value}`;
    });

    return config;
}

async function runWorker(state, targetUrl, stopAt) {
    while (Date.now() < stopAt) {
        const startedAt = Date.now();

        try {
            const response = await fetch(targetUrl, {
                headers: {
                    accept: 'application/json'
                }
            });

            state.total += 1;
            state.statuses[response.status] = (state.statuses[response.status] || 0) + 1;

            const durationMs = Date.now() - startedAt;
            state.durations.push(durationMs);

            if (!response.ok) {
                state.failures += 1;
            }

            await response.arrayBuffer();
        } catch (error) {
            state.total += 1;
            state.failures += 1;
            state.errors[error.message] = (state.errors[error.message] || 0) + 1;
            state.durations.push(Date.now() - startedAt);
        }
    }
}

function percentile(values, p) {
    if (values.length === 0) {
        return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[index];
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const baseUrl = options.baseUrl.replace(/\/$/, '');
    const targetUrl = `${baseUrl}${options.path}`;
    const stopAt = Date.now() + (options.durationSec * 1000);
    const state = {
        total: 0,
        failures: 0,
        statuses: {},
        errors: {},
        durations: []
    };

    console.log(`Load test -> ${targetUrl}`);
    console.log(`Duración -> ${options.durationSec}s`);
    console.log(`Concurrencia -> ${options.concurrency}`);

    const workers = Array.from({ length: options.concurrency }, () => runWorker(state, targetUrl, stopAt));
    const startedAt = Date.now();
    await Promise.all(workers);
    const totalDurationSec = Math.max(1, (Date.now() - startedAt) / 1000);

    const avgMs = state.durations.length
        ? Math.round(state.durations.reduce((acc, value) => acc + value, 0) / state.durations.length)
        : 0;

    console.log('');
    console.log(`Requests totales -> ${state.total}`);
    console.log(`RPS aprox -> ${(state.total / totalDurationSec).toFixed(2)}`);
    console.log(`Fallos -> ${state.failures}`);
    console.log(`Latencia promedio -> ${avgMs}ms`);
    console.log(`P95 -> ${percentile(state.durations, 95)}ms`);
    console.log(`P99 -> ${percentile(state.durations, 99)}ms`);
    console.log(`Status -> ${JSON.stringify(state.statuses)}`);

    if (Object.keys(state.errors).length > 0) {
        console.log(`Errores -> ${JSON.stringify(state.errors, null, 2)}`);
    }

    if (state.failures > 0) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Load test falló:', error.message);
    process.exit(1);
});
