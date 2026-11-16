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

  it('guarda cantidad, observaciones, pago y producto de forma opcional', () => {
    cy.request({
      method: 'POST',
      url: '/api/orders',
      body: {
        businessId,
        products: [{ id: 'p-test-1', name: 'Cafe de prueba', price: 8000, qty: 3 }],
        observations: 'Sin azucar',
        paymentMethod: 'Nequi',
        resident: {
          fullName: 'Residente Cypress',
          phone: '3001234567',
          tower: '1',
          apartment: '101',
          deliveryAddress: 'Manzana A Casa 1',
        },
      },
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.data.products[0]).to.include({ id: 'p-test-1', qty: 3 });
      expect(res.body.data).to.have.property('observations', 'Sin azucar');
      expect(res.body.data).to.have.property('paymentMethod', 'Nequi');
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

describe('API — pedidos del vendedor (contrato)', () => {
  const sellerPhone = '3008887766';
  const buyerPhone = '3005550022';
  const outsiderPhone = '3007770022';
  let sellerToken = '';
  let businessId = '';

  before(() => {
    cy.request({
      method: 'POST',
      url: '/api/auth/entry',
      body: {
        phone: sellerPhone,
        manzana: '1',
        tower: '1',
        apartment: '101',
        role: 'seller',
        acceptedTerms: true,
      },
    }).then((res) => {
      sellerToken = res.body.data.token;
      return cy.request({
        method: 'POST',
        url: '/api/businesses',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: {
          name: 'Vitrina Cypress F4',
          category: 'comida',
          manzana: '1',
          phone: sellerPhone,
          products: [{ id: 'p-f4-1', name: 'Producto F4', price: '5.000' }],
        },
      });
    }).then((res) => {
      expect(res.status).to.eq(201);
      businessId = res.body.data.id;
    });
  });

  after(() => {
    if (businessId) cy.task('removeBusiness', businessId);
    cy.task('removeResident', sellerPhone);
    cy.task('removeResident', buyerPhone);
    cy.task('removeResident', outsiderPhone);
  });

  it('lista y actualiza solo los pedidos de mis vitrinas', () => {
    let orderId = '';

    cy.request({
      method: 'POST',
      url: '/api/orders',
      body: {
        businessId,
        products: [{ id: 'p-f4-1', name: 'Producto F4', price: '5.000', qty: 2 }],
        observations: 'Pedido F4',
        paymentMethod: 'Nequi',
        resident: {
          fullName: 'Comprador F4',
          phone: buyerPhone,
          tower: '1',
          apartment: '202',
          deliveryAddress: 'Manzana 1 Casa 202',
        },
      },
    }).then((res) => {
      expect(res.status).to.eq(201);
      orderId = res.body.data.id;

      return cy.request({
        method: 'GET',
        url: '/api/orders/mine',
        headers: { Authorization: `Bearer ${sellerToken}` },
      });
    }).then((res) => {
      expect(res.status).to.eq(200);
      const pedido = res.body.data.find((o) => o.id === orderId);
      expect(pedido).to.exist;
      expect(pedido).to.include({ businessId, estado: 'Recibido', observations: 'Pedido F4' });

      return cy.request({
        method: 'PUT',
        url: `/api/orders/mine/${orderId}/status`,
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: { estado: 'En Preparación' },
      });
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.include({ estado: 'En Preparación' });

      return cy.request({
        method: 'POST',
        url: '/api/auth/entry',
        body: {
          phone: outsiderPhone,
          manzana: '2',
          tower: '1',
          apartment: '101',
          role: 'buyer',
          acceptedTerms: true,
        },
      });
    }).then((res) => {
      const outsiderToken = res.body.data.token;
      return cy.request({
        method: 'GET',
        url: '/api/orders/mine',
        headers: { Authorization: `Bearer ${outsiderToken}` },
      }).then((mine) => {
        expect(mine.body.data.some((o) => o.id === orderId)).to.eq(false);
        return cy.request({
          method: 'PUT',
          url: `/api/orders/mine/${orderId}/status`,
          headers: { Authorization: `Bearer ${outsiderToken}` },
          body: { estado: 'Entregado' },
          failOnStatusCode: false,
        });
      });
    }).then((res) => {
      expect(res.status).to.eq(404);
      expect(res.body).to.have.property('success', false);
      cy.task('removeOrder', orderId);
    });
  });

  it('rechaza pedidos del vendedor sin sesión (401)', () => {
    cy.request({
      method: 'GET',
      url: '/api/orders/mine',
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
      expect(res.body).to.have.property('success', false);
    });
  });
});
