// api/open-graph.js - Vercel Serverless Function
// Sirve el index.html con meta tags dinámicos para redes sociales

const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
    try {
        // Detectar si es un bot de red social
        const userAgent = req.headers['user-agent'] || '';
        const isSocialBot = /facebookexternalhit|twitterbot|whatsapp|linkedinbot|slurp|googlebot|slackbot|discordbot/i.test(userAgent);
        
        if (!isSocialBot) {
            // No es un bot, redirigir al index.html normal
            res.redirect('/index.html');
            return;
        }

        // Obtener datos del sorteo desde el backend
        let rifaTitulo = 'RAM 700 2025 - Rifas el Trebol';
        let rifaDescripcion = 'Participa en nuestro sorteo 100% transparente';
        
        try {
            const backendUrl = process.env.BACKEND_URL || 'https://rifas-web-1.onrender.com';
            const response = await fetch(`${backendUrl}/api/public/sorteo-info`);
            if (response.ok) {
                const data = await response.json();
                rifaTitulo = data.titulo || rifaTitulo;
                rifaDescripcion = data.descripcion || rifaDescripcion;
                console.log(`✅ Open Graph dinámico: ${rifaTitulo}`);
            }
        } catch (fetchError) {
            console.warn('⚠️ No se pudo obtener datos del backend, usando valores por defecto');
        }
        
        const imagenUrl = 'https://rifas-web.vercel.app/images/ImgPrincipal.png';
        const urlBase = 'https://rifas-web.vercel.app';
        
        // Construir HTML dinámico
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SORTEOS YEPE - Gana ${rifaTitulo} | Rifas 100% Transparentes</title>
    <meta name="description" content="Participa en SORTEOS YEPE. ${rifaDescripcion}. Sorteo 100% transparente en vivo.">
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="SORTEOS YEPE - Gana ${rifaTitulo}" />
    <meta property="og:description" content="${rifaDescripcion}" />
    <meta property="og:image" content="${imagenUrl}" />
    <meta property="og:url" content="${urlBase}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SORTEOS YEPE" />
    
    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="SORTEOS YEPE - Gana ${rifaTitulo}" />
    <meta name="twitter:description" content="${rifaDescripcion}" />
    <meta name="twitter:image" content="${imagenUrl}" />
    
    <!-- WhatsApp Meta Tags -->
    <meta property="og:type" content="website" />
    
    <!-- Redirect to actual page -->
    <meta http-equiv="refresh" content="0; url=/" />
    <link rel="canonical" href="${urlBase}" />
</head>
<body>
    <p>Cargando...</p>
    <script>
        window.location.href = '/';
    </script>
</body>
</html>`;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).send(html);
        
    } catch (error) {
        console.error('Error en open-graph:', error);
        res.status(500).json({ error: 'Error sirviendo página' });
    }
}
