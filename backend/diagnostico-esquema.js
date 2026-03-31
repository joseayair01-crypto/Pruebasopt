#!/usr/bin/env node
/**
 * 🔍 Script de Diagnóstico del Esquema de BD
 * Verifica que el código coincida con las columnas reales en Supabase
 * Uso: node diagnostico-esquema.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const db = require('./db.js');

const EXPECTED_COLUMNS = {
    ordenes: [
        'id', 'numero_orden', 'nombre_cliente',
        'cantidad_boletos', 'precio_unitario',
        'subtotal', 'descuento', 'total', 'boletos',
        'metodo_pago', 'estado', 'created_at', 'updated_at',
        'detalles_pago', 'nombre_banco', 'numero_referencia',
        'nombre_beneficiario', 'comprobante_path', 'estado_cliente',
        'ciudad_cliente', 'telefono_cliente'
    ]
};

const FORBIDDEN_COLUMNS = ['whatsapp', 'oportunidades'];

async function diagnosticar() {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║         🔍 DIAGNÓSTICO DE ESQUEMA DE BASE DE DATOS        ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        let problemas = [];
        let advertencias = [];

        for (const [tabla, columnasEsperadas] of Object.entries(EXPECTED_COLUMNS)) {
            console.log(`📋 Verificando tabla: ${tabla}`);
            
            try {
                const result = await db.raw(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = '${tabla}'
                    ORDER BY ordinal_position
                `);

                const columnasReales = result.rows.map(r => r.column_name);

                // Columnas esperadas que faltan
                const faltantes = columnasEsperadas.filter(c => !columnasReales.includes(c));
                if (faltantes.length > 0) {
                    advertencias.push(`⚠️  ${tabla}: Columnas esperadas pero NO encontradas: ${faltantes.join(', ')}`);
                }

                // Columnas que no deberían existir
                const colasProhibidas = FORBIDDEN_COLUMNS.filter(c => columnasReales.includes(c));
                if (colasProhibidas.length > 0) {
                    advertencias.push(`🚫 ${tabla}: Columnas que DEBERÍAN estar eliminadas: ${colasProhibidas.join(', ')}`);
                }

                console.log(`   ✅ ${columnasReales.length} columnas encontradas`);
                if (faltantes.length === 0 && colasProhibidas.length === 0) {
                    console.log(`   ✅ Todas las columnas son correctas`);
                }
                console.log('');
            } catch (err) {
                if (err.message.includes('does not exist')) {
                    problemas.push(`❌ ${tabla}: LA TABLA NO EXISTE EN LA BD`);
                } else {
                    problemas.push(`❌ ${tabla}: ${err.message}`);
                }
            }
        }

        // Verificar referencias a columnas inexistentes en el código
        console.log('🔎 Verificando uso en el código...\n');

        const fs = require('fs');
        const path = require('path');
        const serverPath = path.join(__dirname, 'server.js');
        const serverCode = fs.readFileSync(serverPath, 'utf-8');

        let codigoProblematico = [];

        // Solo alertar sobre referencias directas a campos de orden (orden.whatsapp, etc)
        // pero NO sobre req.body.whatsapp (que es input válido del cliente)
        const referencias = [
            { columna: 'orden.whatsapp', regex: /orden[a-zA-Z_]*\.whatsapp(?!\s*\.)/ },
            { columna: 'ordenEncontrada.whatsapp', regex: /ordenEncontrada\.whatsapp/ },
            { columna: 'ordenAsociada.whatsapp', regex: /ordenAsociada\.whatsapp/ },
            { columna: 'orden.oportunidades', regex: /orden[a-zA-Z_]*\.oportunidades(?!\s*\.)/ }
        ];

        referencias.forEach(({ columna, regex }) => {
            const matches = serverCode.match(regex);
            if (matches && matches.length > 0) {
                codigoProblematico.push(`⚠️  Referencias a campo "${columna}" que NO existe en BD`);
            }
        });

        if (codigoProblematico.length > 0) {
            codigoProblematico.forEach(msg => advertencias.push(msg));
        }

        // Resumen final
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║                        📊 RESUMEN                          ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        if (problemas.length > 0) {
            console.log('🚨 PROBLEMAS CRÍTICOS:');
            problemas.forEach(p => console.log(`  ${p}`));
            console.log('');
        }

        if (advertencias.length > 0) {
            console.log('⚠️  ADVERTENCIAS:');
            advertencias.forEach(a => console.log(`  ${a}`));
            console.log('');
        }

        if (problemas.length === 0 && advertencias.length === 0) {
            console.log('✅ TODO CORRECTO - Esquema y código están sincronizados\n');
            process.exit(0);
        } else {
            if (problemas.length > 0) {
                console.log(`\n❌ Se encontraron ${problemas.length} PROBLEMA(S) CRÍTICO(S)`);
                process.exit(1);
            } else {
                console.log(`\n⚠️  Se encontraron ${advertencias.length} ADVERTENCIA(S) - Revisar\n`);
                process.exit(0);
            }
        }

    } catch (err) {
        console.error('❌ Error al conectar a BD:', err.message);
        process.exit(1);
    }
}

diagnosticar().finally(() => {
    db.destroy();
});
