// Genera un hash bcrypt para la contraseña del administrador.
// Uso: node scripts/hash-password.js <mi-contraseña>
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Debes indicar la contraseña: node scripts/hash-password.js <contraseña>');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
console.log(hash);