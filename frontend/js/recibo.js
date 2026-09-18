import { API } from './api.js';
import { WhatsAppHelper } from './whatsapp.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const receiptId = params.get('id');

  if (!receiptId) {
    document.getElementById('rNum').innerText = 'No especificado';
    return;
  }

  try {
    const receipt = await API.getReceipt(receiptId);

    if (!receipt) {
      document.getElementById('rNum').innerText = 'Recibo no encontrado';
      return;
    }

    document.getElementById('rNum').innerText = receipt.receiptId;
    document.getElementById('rTrx').innerText = receipt.transactionId;
    document.getElementById('rBizName').innerText = receipt.businessName;
    document.getElementById('rLocation').innerText = `Manzana ${receipt.manzana} (Los Naranjos)`;
    document.getElementById('rMethod').innerText = receipt.paymentMethod;
    document.getElementById('rPayDate').innerText = new Date(receipt.paymentDate).toLocaleDateString('es-CO');

    const from = new Date(receipt.coverageStartDate).toLocaleDateString('es-CO');
    const to = new Date(receipt.coverageEndDate).toLocaleDateString('es-CO');
    document.getElementById('rCoverage').innerText = `${from} al ${to}`;
    document.getElementById('rAmount').innerHTML = `$${receipt.amountCOP.toLocaleString('es-CO')} <span class="text-xs font-normal text-slate-500">COP</span>`;
    document.getElementById('rCode').innerText = receipt.verificationCode;

    document.getElementById('btnShareWa').onclick = () => {
      const shareMsg = WhatsAppHelper.buildReceiptShareMessage(receipt);
      const waUrl = WhatsAppHelper.createUrl(receipt.phone, shareMsg);
      window.open(waUrl, '_blank');
    };
  } catch (e) {
    console.error('Fallo al cargar el recibo:', e);
    document.getElementById('rNum').innerText = 'Recibo no encontrado';
  }

  const printBtn = document.getElementById('printReceiptBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
});