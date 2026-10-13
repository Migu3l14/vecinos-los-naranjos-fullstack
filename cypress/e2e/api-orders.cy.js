// Prueba de contrato de la API — flujo real de pedidos de la plataforma.
// Demuestra cy.request() validando un contrato de API (slides 11–13).
// Solo se ejecuta en local (baseUrl = http://localhost:4000).

describe('API · crear pedido (contrato de API)', () => {
  const businessId = 'biz_test_cypress';

  const cuerpoPedido = () => ({
    businessId,
    products: [{ name: 'Cafe de prueba', price: 8000, qty: 2 }],
    resident: {
      fullName: 'Residente Cypress',
      phone: '3001234567',
      tower: '1',
      apartment: '101',
      deliveryAddress: 'Manzana A Casa 1',
    },
  });

  it('POST /api/orders responde 201 cumpliendo el contrato', () => {
    cy.request({
      method: 'POST',
      url: '/api/orders',
      body: {
        businessId,
        products: [{ name: 'Cafe de prueba', price: 8000, qty: 2 }],
        resident: {
          fullName: 'Residente Cypress',
          phone: '3001234567',
          tower: '1',
          apartment: '101',
          deliveryAddress: 'Manzana A Casa 1',
        },
      },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.have.property('orderId').and.match(/^ORD-\d{3,}$/);
      expect(res.body.data).to.have.property('businessId', 'biz_test_cypress');
      expect(res.body.data).to.have.property('estado', 'Recibido');
      expect(res.body.data.products).to.be.an('array').with.length.greaterThan(0);
      expect(res.body.data).to.have.property('resident').and.to.be.an('object');

      // Limpieza: elimina el pedido de prueba del almacén local (no ensucia datos reales).
      cy.task('removeOrder', res.body.data.id || res.body.data.orderId);
    });
  });

  it('rechaza un pedido sin productos (400)', () => {
    cy.request({
      method: 'POST',
      url: '/api/orders',
      body: {
        businessId: 'biz_test_cypress',
        products: [],
        resident: { fullName: 'x', phone: '1', tower: '1', apartment: '1', deliveryAddress: 'd' },
      },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body).to.have.property('success', false);
    });
  });
});
