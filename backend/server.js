import app from './app.js';

const PORT = process.env.PORT || 4000;

// Iniciar servidor (solo en dev/host: Vercel importa app.js desde api/index.js)
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🍊 Vitrina Digital Los Naranjos — Fullstack Server`);
  console.log(`🚀 Frontend: http://localhost:${PORT}`);
  console.log(`📡 API REST: http://localhost:${PORT}/api/businesses`);
  console.log(`💳 Membresías: http://localhost:${PORT}/api/subscriptions/checkout`);
  console.log(`💳 Wompi Checkout: http://localhost:${PORT}/api/payments/wompi-checkout`);
  console.log(`📲 Wompi Webhook:  http://localhost:${PORT}/api/payments/wompi-webhook`);
  console.log(`🔐 Admin Login:    http://localhost:${PORT}/api/auth/admin/login`);
  console.log(`🙋 Auth Residente: http://localhost:${PORT}/api/auth/resident/login`);
  console.log(`📋 PQRS:           http://localhost:${PORT}/api/pqrs`);
  console.log(`🛒 Pedidos:        http://localhost:${PORT}/api/orders`);
  console.log(`====================================================`);
});