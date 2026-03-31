/**
 * ============================================================================
 * SERVICE: Comprobante de Pago
 * ============================================================================
 * Maneja toda la lógica de carga y validación de comprobantes
 * - Validación de archivos
 * - Upload a Cloudinary
 * - Actualización de BD con transacciones
 * - Manejo robusto de errores
 */

const db = require('../db');
const cloudinary = require('../cloudinary-config');

/**
 * Validar que la tabla ordenes tiene las columnas requeridas
 * @throws {Error} Si faltan columnas
 */
async function validarSchemaOrdenes() {
    try {
        const result = await db.raw(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'ordenes'
            AND column_name IN ('comprobante_path', 'comprobante_fecha')
        `);

        const columnasRequeridas = ['comprobante_path', 'comprobante_fecha'];
        const columnasEncontradas = result.rows.map(r => r.column_name);
        
        const columnasAusentes = columnasRequeridas.filter(
            col => !columnasEncontradas.includes(col)
        );

        if (columnasAusentes.length > 0) {
            throw new Error(
                `Esquema de BD incompleto. Faltan columnas: ${columnasAusentes.join(', ')}. ` +
                `Ejecuta: npm run migrate`
            );
        }

        return true;
    } catch (error) {
        console.error('[ComprobanteService] Error validando schema:', error.message);
        throw error;
    }
}

/**
 * Validar archivo de comprobante
 * @param {object} archivo - Objeto file de express-fileupload
 * @returns {object} { valido: boolean, error?: string }
 */
function validarArchivo(archivo) {
    if (!archivo) {
        return { valido: false, error: 'Archivo de comprobante es obligatorio' };
    }

    // Validar MIME type
    const TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!TIPOS_VALIDOS.includes(archivo.mimetype)) {
        return {
            valido: false,
            error: 'Tipo de archivo no permitido. Solo JPG, PNG o PDF'
        };
    }

    // Validar tamaño (máximo 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (archivo.size > MAX_SIZE) {
        return {
            valido: false,
            error: `Archivo demasiado grande. Máximo 5MB. Tamaño: ${(archivo.size / 1024 / 1024).toFixed(2)}MB`
        };
    }

    // Validar que tiene datos
    if (!archivo.data || archivo.data.length === 0) {
        return { valido: false, error: 'Archivo vacío' };
    }

    return { valido: true };
}

/**
 * Validar datos del cliente
 * @param {string} whatsapp - Número de WhatsApp
 * @param {string} numeroOrden - Número de orden
 * @returns {object} { valido: boolean, error?: string }
 */
function validarDatos(whatsapp, numeroOrden) {
    if (!numeroOrden || typeof numeroOrden !== 'string' || numeroOrden.length === 0) {
        return { valido: false, error: 'Número de orden inválido' };
    }

    if (!whatsapp) {
        return { valido: false, error: 'WhatsApp es obligatorio' };
    }

    // Validar formato WhatsApp: solo dígitos, 10-12 caracteres
    const whatsappSanitizado = String(whatsapp).replace(/[^0-9]/g, '');
    if (whatsappSanitizado.length < 10 || whatsappSanitizado.length > 12) {
        return { valido: false, error: 'WhatsApp inválido' };
    }

    return { valido: true, whatsappSanitizado };
}

/**
 * Validar que la orden existe y pertenece al cliente
 * @param {string} numeroOrden - Número de orden
 * @param {string} whatsappSanitizado - WhatsApp sanitizado
 * @returns {object} { valido: boolean, error?: string, orden?: object }
 */
async function validarOrden(numeroOrden, whatsappSanitizado) {
    try {
        const orden = await db('ordenes')
            .where('numero_orden', numeroOrden)
            .first();

        if (!orden) {
            return { valido: false, error: 'Orden no encontrada' };
        }

        // Verificar que el WhatsApp coincida (validación de propiedad)
        const whatsappEnBd = String(orden.telefono_cliente || '').replace(/[^0-9]/g, '');
        if (whatsappSanitizado !== whatsappEnBd) {
            return {
                valido: false,
                error: 'No tienes permiso para subir comprobante a esta orden'
            };
        }

        // Verificar que el estado sea "pendiente"
        if (orden.estado !== 'pendiente') {
            return {
                valido: false,
                error: `No puedes subir comprobante. Estado actual: ${orden.estado}`
            };
        }

        return { valido: true, orden };
    } catch (error) {
        return {
            valido: false,
            error: `Error al validar orden: ${error.message}`
        };
    }
}

/**
 * Subir archivo a Cloudinary
 * @param {Buffer} datos - Buffer del archivo
 * @param {string} nombreArchivo - Nombre único del archivo
 * @param {string} mimetype - Tipo MIME del archivo
 * @returns {Promise<string>} URL de Cloudinary
 * @throws {Error} Si falla el upload
 */
async function subirACloudinary(datos, nombreArchivo, mimetype) {
    return new Promise((resolve, reject) => {
        const tipoArchivo = String(mimetype).toLowerCase();
        const esArchivo = tipoArchivo.includes('pdf') || tipoArchivo.includes('document');
        const resourceType = esArchivo ? 'raw' : 'auto';

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: resourceType,
                public_id: nombreArchivo,
                folder: 'rifas-comprobantes',
                overwrite: true,
                quality: esArchivo ? undefined : 'auto'
            },
            (error, result) => {
                if (error) {
                    reject(new Error(`Cloudinary upload error: ${error.message}`));
                } else {
                    resolve(result.secure_url);
                }
            }
        );

        uploadStream.on('error', (err) => {
            reject(new Error(`Stream error: ${err.message}`));
        });

        uploadStream.end(datos);
    });
}

/**
 * Actualizar orden en BD después de subir comprobante
 * @param {string} numeroOrden - Número de orden
 * @param {string} urlComprobante - URL de Cloudinary
 * @returns {Promise<boolean>}
 * @throws {Error} Si falla la actualización
 */
async function actualizarOrdenEnBd(numeroOrden, urlComprobante) {
    try {
        const timestampUTC = new Date().toISOString();
        
        const result = await db('ordenes')
            .where('numero_orden', numeroOrden)
            .update({
                comprobante_recibido: true,
                comprobante_path: urlComprobante,
                comprobante_fecha: timestampUTC,
                updated_at: timestampUTC
            });

        if (result === 0) {
            throw new Error('Orden no encontrada para actualizar');
        }

        return true;
    } catch (error) {
        throw new Error(`Error actualizando orden en BD: ${error.message}`);
    }
}

/**
 * FUNCIÓN PRINCIPAL: Procesar upload de comprobante
 * @param {object} params - Parámetros
 * @param {string} params.numeroOrden - Número de orden
 * @param {string} params.whatsapp - WhatsApp del cliente
 * @param {object} params.archivo - Objeto file
 * @returns {Promise<object>} { success: true, message, url?, numeroOrden }
 * @throws {Error} Si hay cualquier error en el proceso
 */
async function procesarComprobante({ numeroOrden, whatsapp, archivo }) {
    // Step 1: Validar schema
    await validarSchemaOrdenes();

    // Step 2: Validar datos básicos
    const validacionDatos = validarDatos(whatsapp, numeroOrden);
    if (!validacionDatos.valido) {
        throw new Error(validacionDatos.error);
    }
    const { whatsappSanitizado } = validacionDatos;

    // Step 3: Validar archivo
    const validacionArchivo = validarArchivo(archivo);
    if (!validacionArchivo.valido) {
        throw new Error(validacionArchivo.error);
    }

    // Step 4: Validar orden en BD
    const validacionOrden = await validarOrden(numeroOrden, whatsappSanitizado);
    if (!validacionOrden.valido) {
        throw new Error(validacionOrden.error);
    }

    // Step 5: Upload a Cloudinary
    const nombreArchivo = `${numeroOrden}_${Date.now()}`;
    const urlComprobante = await subirACloudinary(
        archivo.data,
        nombreArchivo,
        archivo.mimetype
    );

    // Step 6: Actualizar BD
    await actualizarOrdenEnBd(numeroOrden, urlComprobante);

    return {
        success: true,
        message: 'Comprobante subido exitosamente',
        numero_orden: numeroOrden,
        url: urlComprobante,
        tamaño_mb: (archivo.size / 1024 / 1024).toFixed(2)
    };
}

module.exports = {
    procesarComprobante,
    validarSchemaOrdenes,
    validarArchivo,
    validarDatos,
    validarOrden,
    subirACloudinary,
    actualizarOrdenEnBd
};
