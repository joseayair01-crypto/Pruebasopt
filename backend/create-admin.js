require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

(async () => {
  const username = 'admin';
  const password = 'admin123';
  const email = 'admin@rifas.com';
  const rol = 'administrador';  // ✅ Rol válido en el sistema
  
  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const connectionString = process.env.DATABASE_URL;
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false } // Ignorar errores de certificado en desarrollo
  });
  try {
    await client.connect();
    
    const { rows } = await client.query(
      'INSERT INTO admin_users (username, password_hash, email, rol, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, username, email, rol',
      [username, hashedPassword, email, rol]
    );
    
    console.log('✅ Admin user created:', rows[0]);
    console.log('📧 Email:', email);
    console.log('🔑 Username:', username);
    console.log('🔐 Password:', password);
    console.log('👤 Rol:', rol);
    
    await client.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
