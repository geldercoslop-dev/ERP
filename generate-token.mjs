import jwt from 'jsonwebtoken';

// Token para usuário admin (id=1)
const payload = {
  userId: 1,
  openId: 'admin',
  name: 'Administrador',
  role: 'admin',
  email: 'admin@erp.local'
};

const token = jwt.sign(payload, 'default-secret', { expiresIn: '1h' });
console.log('Token:', token);
