// Entry serverless para Vercel: la misma app Express que usa backend/server.js
// en desarrollo. Vercel la importa y maneja las peticiones.
import app from '../backend/app.js';

export default app;