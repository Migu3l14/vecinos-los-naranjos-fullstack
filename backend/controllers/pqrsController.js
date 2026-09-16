import Storage from '../db/storage.js';
import { validatePhone } from '../utils/validation.js';

const TIPOS = ['Petición', 'Queja', 'Reclamo', 'Sugerencia', 'Reporte de Incidencia'];
const ESTADOS = ['Pendiente', 'En Proceso', 'Resuelto'];

const pad = (n) => String(n).padStart(2, '0');

// Genera un número de radicado legible: PQRS-AAAA-####
const generateTicketId = async () => {
  const count = (await Storage.read('pqrs')).length + 1;
  const now = new Date();
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `PQRS-${date}-${pad(count)}`;
};

// POST /api/pqrs (público) — formulario simplificado del residente
export const createPqrs = async (req, res) => {
  try {
    const { tipo, descripcion, nombre, telefono, email } = req.body;

    if (!tipo || !descripcion || !nombre) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, motivo/tipo y descripción son obligatorios.'
      });
    }
    if (!TIPOS.includes(tipo)) {
      return res.status(400).json({ success: false, message: `Tipo inválido. Opciones: ${TIPOS.join(', ')}` });
    }
    const phoneError = validatePhone(telefono);
    if (phoneError) {
      return res.status(400).json({ success: false, message: phoneError });
    }

    const ticket = {
      id: `pqrs-${Date.now()}`,
      ticketId: await generateTicketId(),
      tipo,
      descripcion,
      nombre,
      telefono,
      email: email || null,
      estado: 'Pendiente',
      notas: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await Storage.insert('pqrs', ticket);
    res.status(201).json({
      success: true,
      message: 'Tu PQRS fue radicada. El equipo de administración dará seguimiento.',
      data: { ticketId: ticket.ticketId, estado: ticket.estado, id: ticket.id }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al radicar la PQRS', error: error.message });
  }
};

// GET /api/pqrs (admin) — listar, con filtro opcional por estado
export const getAllPqrs = async (req, res) => {
  try {
    const { estado, tipo } = req.query;
    let tickets = await Storage.read('pqrs');

    if (estado) {
      tickets = tickets.filter(t => t.estado === estado);
    }
    if (tipo) {
      tickets = tickets.filter(t => t.tipo === tipo);
    }

    // Ordenar: más recientes primero
    tickets = [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar PQRS', error: error.message });
  }
};

// PUT /api/pqrs/:id/status (admin) — cambiar estado
export const updatePqrsStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ success: false, message: `Estado inválido. Opciones: ${ESTADOS.join(', ')}` });
    }

    const ticket = await Storage.findById('pqrs', id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'PQRS no encontrada.' });
    }

    const updated = await Storage.updateById('pqrs', id, {
      estado,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: `PQRS marcada como "${estado}".`, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar estado', error: error.message });
  }
};

// POST /api/pqrs/:id/notes (admin) — agregar nota interna de seguimiento
export const addPqrsNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { nota } = req.body;

    if (!nota || !String(nota).trim()) {
      return res.status(400).json({ success: false, message: 'La nota es obligatoria.' });
    }

    const ticket = await Storage.findById('pqrs', id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'PQRS no encontrada.' });
    }

    const notas = [...(ticket.notas || []), {
      id: `note-${Date.now()}`,
      texto: String(nota).trim(),
      autor: 'Administración',
      createdAt: new Date().toISOString()
    }];

    const updated = await Storage.updateById('pqrs', id, {
      notas,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Nota agregada al seguimiento.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al agregar nota', error: error.message });
  }
};

export default { createPqrs, getAllPqrs, updatePqrsStatus, addPqrsNote };
