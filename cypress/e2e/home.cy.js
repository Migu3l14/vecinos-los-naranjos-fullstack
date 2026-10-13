describe('Smoke: la app carga', () => {
  it('la vitrina responde y muestra la marca', () => {
    cy.visit('/');
    cy.title().should('include', 'Los Naranjos');
  });

  it('las páginas demo de las sesiones cargan (200)', () => {
    cy.visit('/testing-demo.html');
    cy.contains('calidad del software').should('be.visible');

    cy.visit('/cache-demo.html');
    cy.contains('impacto real del caché').should('be.visible');
  });
});
