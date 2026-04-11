/**
 * ============================================================
 * Configuración de Cloudinary para almacenamiento de comprobantes
 * ============================================================
 * 
 * Variables soportadas en .env:
 * - CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
 *   o
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * 
 * Signup gratis: https://cloudinary.com/users/register/free
 */

const cloudinary = require('cloudinary').v2;

const hasCloudinaryUrl = Boolean(String(process.env.CLOUDINARY_URL || '').trim());
const requiredVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingVars = requiredVars.filter(v => !process.env[v]);

if (hasCloudinaryUrl) {
    cloudinary.config(true);
    const config = cloudinary.config();
    console.log('✅ Cloudinary configurado correctamente');
    console.log(`   Cloud: ${config.cloud_name}`);
} else if (missingVars.length > 0) {
    console.warn('⚠️ Cloudinary no completamente configurado:');
    missingVars.forEach(v => console.warn(`   - ${v} no definida`));
    console.warn('\nPara usar Cloudinary:');
    console.warn('1. Signup gratis en: https://cloudinary.com/users/register/free');
    console.warn('2. Obtén tus credenciales del Dashboard');
    console.warn('3. Agrega a .env una de estas opciones:');
    console.warn('   CLOUDINARY_URL=cloudinary://tu-api-key:tu-api-secret@tu-cloud-name');
    console.warn('   o');
    console.warn('   CLOUDINARY_CLOUD_NAME=tu-cloud-name');
    console.warn('   CLOUDINARY_API_KEY=tu-api-key');
    console.warn('   CLOUDINARY_API_SECRET=tu-api-secret');
} else {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('✅ Cloudinary configurado correctamente');
    console.log(`   Cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);
}

module.exports = cloudinary;
