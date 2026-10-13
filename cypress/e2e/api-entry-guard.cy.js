// Prueba de contrato de la API — ingreso del rol "guarda de seguridad" (externo).
// El guarda no pertenece a una torre/apartamento: solo requiere celular y manzana.
// Solo se ejecuta en local (baseUrl = http://localhost:4000).

describe('API · ingreso de guarda (contrato)', () => {
  const guardPhone = '3009998877';

  afterEach(() => {
    cy.task('removeResident', guardPhone);
  });

  it('POST /api/auth/entry con rol guard responde 201 sin torre/apartamento', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/entry',
      body: { phone: guardPhone, manzana: '3', role: 'guard', acceptedTerms: true },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body).to.have.property('success', true);
      expect(res.body.data.resident).to.include({ role: 'guard', manzana: '3' });
      expect(res.body.data.resident.tower).to.eq(null);
      expect(res.body.data.resident.apartment).to.eq(null);
    });
  });

  it('POST /api/auth/entry sin manzana responde 400', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/entry',
      body: { phone: guardPhone, role: 'guard', acceptedTerms: true },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body).to.have.property('success', false);
    });
  });
});
