import jwt from 'jsonwebtoken';

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsIm9wZW5JZCI6ImFkbWluIiwibmFtZSI6IkFkbWluaXN0cmFkb3IiLCJyb2xlIjoiYWRtaW4iLCJlbWFpbCI6ImFkbWluQGVycC5sb2NhbCIsInRlbmFudElkIjoxLCJpYXQiOjE3NzQ5MDEyOTgsImV4cCI6MTc3NDkwNDg5OH0.AxKLYLqN0lRgm-l4VU7N56J0Wh_Tb3JJhjG90xfhgHk";

try {
  const decoded = jwt.verify(token, 'default-secret');
  console.log('✅ Token válido:', decoded);
} catch (error) {
  console.error('❌ Token inválido:', error.message);
}
