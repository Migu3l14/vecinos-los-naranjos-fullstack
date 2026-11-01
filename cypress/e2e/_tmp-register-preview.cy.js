describe('Registro · vista previa antes del pago', () => {
  it('muestra la vista previa y NO crea la vitrina todavia', () => {
    cy.visit('/');
    cy.wait(700);
    cy.window().then((win) => win.closeEntryModal && win.closeEntryModal());

    cy.get('#openRegisterModalBtn').click();
    cy.get('#registerWizardModal').should('not.have.class', 'hidden');

    cy.get('#regName').type('Vitrina Prueba Cypress');
    cy.get('#regPhone').type('3001234567');
    cy.get('#regMz').select('2');
    cy.get('#regCat').find('option').its('length').should('be.greaterThan', 1);
    cy.get('#regCat').select(1);
    cy.get('#step1NextBtn').click();

    cy.get('#wizardStep2').should('not.have.class', 'hidden');
    cy.get('#prod1Name').type('Producto Test');
    cy.get('#prod1Price').type('$15.000');
    cy.get('#regTerms').check();
    cy.get('#step2NextBtn').click();

    cy.get('#wizardStepPreview').should('not.have.class', 'hidden');
    cy.get('#vitrinaPreview').should('contain', 'Vitrina Prueba Cypress');
    cy.get('#vitrinaPreview').should('contain', 'Producto Test');
    cy.get('#wizardStep3').should('have.class', 'hidden');

    cy.get('#previewBackBtn').click();
    cy.get('#wizardStep2').should('not.have.class', 'hidden');
    cy.get('#wizardStepPreview').should('have.class', 'hidden');
  });

  it('al confirmar crea la vitrina y pasa al pago', () => {
    cy.visit('/');
    cy.wait(700);
    cy.window().then((win) => win.closeEntryModal && win.closeEntryModal());

    cy.get('#openRegisterModalBtn').click();
    cy.get('#regName').type('Vitrina Pago Cypress');
    cy.get('#regPhone').type('3007654321');
    cy.get('#regMz').select('3');
    cy.get('#regCat').select(1);
    cy.get('#step1NextBtn').click();
    cy.get('#regTerms').check();
    cy.get('#step2NextBtn').click();

    cy.get('#wizardStepPreview').should('not.have.class', 'hidden');
    cy.get('#previewPayBtn').click();

    cy.get('#wizardStep3', { timeout: 10000 }).should('not.have.class', 'hidden');
    cy.get('#checkoutBizName').should('contain', 'Vitrina Pago Cypress');
  });
});
