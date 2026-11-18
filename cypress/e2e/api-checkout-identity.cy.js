// Contrato del checkout en dos toques: la identidad se toma del perfil guardado
// (registrado, nuevo o externo) y el pedido se crea sin volver a pedir esos datos.
describe('API — checkout en dos toques', () => {
  const businessId = 'biz_checkout_two_touch';
  const registeredPhone = '3001212121';
  const newPhone = '3002323232';
  const externalPhone = '3003434343';
  const orderIds = [];

  const orderBody = (phone, deliveryAddress, manzana) => ({
    businessId,
    products: [{ id: 'p-checkout', name: 'Producto de prueba', price: '5000', qty: 2 }],
    observations: 'Pedido de prueba checkout',
    paymentMethod: 'Transferencia',
    resident: {
      fullName: null,
      phone,
      tower: manzana ? '1' : null,
      apartment: manzana ? '201' : null,
      manzana,
      deliveryAddress,
      authType: 'entry',
    },
  });

  after(() => {
    orderIds.forEach((id) => cy.task('removeOrder', id));
    cy.task('removeResident', registeredPhone);
    cy.task('removeResident', newPhone);
    cy.task('removeResident', externalPhone);
  });

  it('comprador registrado: usa nombre y ubicación completa del perfil', () => {
    cy.request('POST', '/api/auth/resident/register', {
      fullName: 'Comprador Registrado',
      phone: registeredPhone,
      tower: '1',
      apartment: '201',
      birthDate: '1990-01-01',
      password: 'clave123',
    }).then((res) => {
      expect(res.status).to.eq(201);
      const token = res.body.data.token;
      return cy.request({
        method: 'POST',
        url: '/api/orders',
        headers: { Authorization: `Bearer ${token}` },
        body: orderBody(registeredPhone, 'Manzana 1 · Torre 1 · Apto 201', '1'),
      });
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.data.resident).to.include({
        fullName: 'Comprador Registrado',
        deliveryAddress: 'Manzana 1 · Torre 1 · Apto 201',
      });
      orderIds.push(res.body.data.id);
    });
  });

  it('comprador nuevo: usa la identidad de entrada sin pedirla de nuevo', () => {
    cy.request('POST', '/api/auth/entry', {
      phone: newPhone,
      manzana: '1',
      tower: '1',
      apartment: '202',
      role: 'buyer',
      acceptedTerms: true,
    }).then((res) => {
      expect(res.status).to.eq(201);
      return cy.request({
        method: 'POST',
        url: '/api/orders',
        headers: { Authorization: `Bearer ${res.body.data.token}` },
        body: orderBody(newPhone, 'Manzana 1 · Torre 1 · Apto 202', '1'),
      });
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.data.resident).to.include({
        fullName: 'Vecino',
        deliveryAddress: 'Manzana 1 · Torre 1 · Apto 202',
      });
      orderIds.push(res.body.data.id);
    });
  });

  it('comprador externo: solo guarda la dirección de entrega', () => {
    cy.request('POST', '/api/auth/entry', {
      phone: externalPhone,
      manzana: '2',
      role: 'guard',
      acceptedTerms: true,
    }).then((res) => {
      expect(res.status).to.eq(201);
      return cy.request({
        method: 'POST',
        url: '/api/orders',
        headers: { Authorization: `Bearer ${res.body.data.token}` },
        body: orderBody(externalPhone, 'Calle 10 # 2-3', null),
      });
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.data.resident).to.include({
        fullName: 'Visitante',
        deliveryAddress: 'Calle 10 # 2-3',
      });
      expect(res.body.data.resident.tower).to.eq(null);
      orderIds.push(res.body.data.id);
    });
  });
});
