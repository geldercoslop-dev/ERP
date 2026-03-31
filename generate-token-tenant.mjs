import jwt from 'jsonwebtoken';

// Token para usuário admin (id=1) com tenantId
const payload = {
  userId: 1,
  openId: 'admin',
  name: 'Administrador',
  role: 'admin',
  email: 'admin@erp.local',
  tenantId: 1  // ESSENCIAL para tenantMiddleware
};

const token = jwt.sign(payload, 'default-secret', { expiresIn: '1h' });
console.log('Token:', token);
