/**
 * Configuración del cliente
 * Actualizado: 2026-02-16T17:45:40.011Z
 */

module.exports = {
  "cliente": {
    "nombre": "Sorteos Torres",
    "eslogan": "La mejor forma de ganar",
    "telefono": "459 115 3960",
    "email": "ayairlp12@gmail.com",
    "redesSociales": {
      "whatsapp": "+524591153960",
      "facebook": "https://www.facebook.com/profile.php?id=100008315310869&locale=es_LA",
      "instagram": "https://www.instagram.com/joseayair",
      "tiktok": ""
    }
  },
  "rifa": {
    "titulo": "RAM 1200 2025 como nueva + 150,000 pesos",
    "totalBoletos": 250000,
    "precioBoleto": 5,
    "descripcion": "Llevatela este 09 de Febrero en base al ganador de la Loteria Nacional, Ademas tenemos presorteo y 20 ruletazos a lo largo del sorteo, participa con solo $8 pesitos y te llevas 3 oportunidades extras de ganar",
    "fechaSorteo": ""
  },
  "servidor": {
    "puerto": "5001",
    "ambiente": "development",
    "database": {
      "type": "postgres",
      "host": "localhost",
      "puerto": 5432
    },
    "jwt": {
      "secret": "rifaplus-secret-key-2024-ultra-seguro-demo",
      "expiresIn": "24h"
    }
  },
  "meta": {
    "createdAt": "2026-02-11T01:45:53.857Z",
    "version": "2.0.0",
    "nota": "Configuración simplificada - datos principales en js/config.js"
  },
  "cuentas": []
};