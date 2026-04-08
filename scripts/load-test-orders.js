#!/usr/bin/env node

const DEFAULTS = {
    baseUrl: process.env.BASE_URL || 'http://localhost:5001',
    durationSec: 30,
    concurrency: 2,
    ticketStart: 100000,
    ticketsPerOrder: 3,
    clienteId: process.env.CLIENTE_ID || '',
    pricePerTicket: Number(process.env.PRICE_PER_TICKET || 6)
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
        if (key === 'ticketStart' && value) config.ticketStart = Number(value);
        if (key === 'ticketsPerOrder' && value) config.ticketsPerOrder = Number(value);
        if (key === 'clienteId' && value) config.clienteId = value;
        if (key === 'pricePerTicket' && value) config.pricePerTicket = Number(value);
    });

    return config;
}

function buildOrderPayload({ orderId, orderIndex, tickets, pricePerTicket }) {
    const subtotal = tickets.length * pricePerTicket;
    return {
        ordenId: orderId,
        cliente: {
            nombre: 'Load',
            apellidos: `Test${orderIndex}`,
            whatsapp: `4499${String(100000 + orderIndex).slice(-6)}`,
            estado: 'Querétaro',
            ciudad: 'Queretaro'
        },
        cuenta: {
            id: 1,
            bank: 'Santander',
            accountNumber: '4444 5555 6666 7777',
            accountType: 'Tarjeta',
            beneficiary: 'Carga Controlada',
            phone: ''
        },
        boletos: tickets,
        totales: {
            subtotal,
            descuento: 0,
            totalFinal: subtotal
        },
        metodoPago: 'transferencia',
        fecha: new Date().toISOString(),
        referencia: orderId
    };
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();

    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (error) {
        json = { raw: text };
    }

    return { response, json };
}

async function createOrder(baseUrl, options, orderIndex) {
    const ticketBase = options.ticketStart + (orderIndex * options.ticketsPerOrder);
    const tickets = Array.from({ length: options.ticketsPerOrder }, (_, idx) => ticketBase + idx);

    const counterResult = await fetchJson(`${baseUrl}/api/public/order-counter/next`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify({ cliente_id: options.clienteId || null })
    });

    if (!counterResult.response.ok || !counterResult.json?.orden_id) {
        return {
            ok: false,
            stage: 'order-counter',
            status: counterResult.response.status,
            body: counterResult.json
        };
    }

    const orderId = String(counterResult.json.orden_id).trim().toUpperCase();
    const payload = buildOrderPayload({
        orderId,
        orderIndex,
        tickets,
        pricePerTicket: options.pricePerTicket
    });

    const orderResult = await fetchJson(`${baseUrl}/api/ordenes`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify(payload)
    });

    return {
        ok: orderResult.response.ok && orderResult.json?.success === true,
        stage: 'create-order',
        status: orderResult.response.status,
        orderId,
        tickets,
        body: orderResult.json
    };
}

async function runWorker(state, baseUrl, options, stopAt, workerIndex) {
    while (Date.now() < stopAt) {
        const orderIndex = state.nextOrderIndex++;
        const startedAt = Date.now();

        try {
            const result = await createOrder(baseUrl, options, orderIndex);
            const durationMs = Date.now() - startedAt;
            state.total += 1;
            state.durations.push(durationMs);
            state.statuses[result.status] = (state.statuses[result.status] || 0) + 1;

            if (!result.ok) {
                state.failures += 1;
                state.failureSamples.push({
                    workerIndex,
                    orderIndex,
                    status: result.status,
                    stage: result.stage,
                    body: result.body
                });
            }
        } catch (error) {
            state.total += 1;
            state.failures += 1;
            state.errors[error.message] = (state.errors[error.message] || 0) + 1;
            state.durations.push(Date.now() - startedAt);
        }
    }
}

function percentile(values, p) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[index];
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const baseUrl = options.baseUrl.replace(/\/$/, '');
    const stopAt = Date.now() + (options.durationSec * 1000);
    const state = {
        total: 0,
        failures: 0,
        statuses: {},
        errors: {},
        durations: [],
        nextOrderIndex: 0,
        failureSamples: []
    };

    console.log(`Order load test -> ${baseUrl}/api/ordenes`);
    console.log(`Duración -> ${options.durationSec}s`);
    console.log(`Concurrencia -> ${options.concurrency}`);
    console.log(`Boletos por orden -> ${options.ticketsPerOrder}`);
    console.log(`Ticket inicial -> ${options.ticketStart}`);

    const startedAt = Date.now();
    const workers = Array.from(
        { length: options.concurrency },
        (_, index) => runWorker(state, baseUrl, options, stopAt, index)
    );

    await Promise.all(workers);

    const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
    const avgMs = state.durations.length
        ? Math.round(state.durations.reduce((sum, value) => sum + value, 0) / state.durations.length)
        : 0;

    console.log('');
    console.log(`Ordenes intentadas -> ${state.total}`);
    console.log(`TPS aprox -> ${(state.total / elapsedSec).toFixed(2)}`);
    console.log(`Fallos -> ${state.failures}`);
    console.log(`Latencia promedio -> ${avgMs}ms`);
    console.log(`P95 -> ${percentile(state.durations, 95)}ms`);
    console.log(`P99 -> ${percentile(state.durations, 99)}ms`);
    console.log(`Status -> ${JSON.stringify(state.statuses)}`);

    if (state.failureSamples.length > 0) {
        console.log('Muestras de fallo ->');
        state.failureSamples.slice(0, 5).forEach((sample) => {
            console.log(JSON.stringify(sample, null, 2));
        });
    }

    if (Object.keys(state.errors).length > 0) {
        console.log(`Errores -> ${JSON.stringify(state.errors, null, 2)}`);
    }

    if (state.failures > 0) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Order load test falló:', error.message);
    process.exit(1);
});
