import Storage from '../db/storage.js';

export const registerJoinRequest = (req, res) => {
  try {
    const { name, manzana, category, phone, description } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'El nombre y el WhatsApp son obligatorios.' });
    }

    const newRequest = {
      id: `req-${Date.now()}`,
      name,
      manzana: manzana || '1',
      category: category || 'General',
      phone,
      description: description || '',
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    Storage.insert('joinRequests', newRequest);

    res.status(201).json({
      success: true,
      message: 'Solicitud registrada correctamente. El equipo se contactará pronto.',
      data: newRequest
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al registrar la solicitud', error: error.message });
  }
};
