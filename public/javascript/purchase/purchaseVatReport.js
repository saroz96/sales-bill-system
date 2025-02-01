
function refreshPage() {
// Reload the current page
window.location.reload();
}

function printReport() {
var printContents = document.querySelector('.report-container').innerHTML;
var originalContents = document.body.innerHTML;

// Add a class to hide totals by default for print, then display them on the last page.
document.body.innerHTML = '<html><head><title>Print Report</title><style>@media print { @page { margin: 10mm; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #000; padding: 8px; text-align: left; } th { background-color: #f2f2f2; } .totalsRow { display: none; page-break-before: always; } .totalsRow:last-child { display: table-row; } } </style></head><body>' + printContents + '</body></html>';

window.print();

document.body.innerHTML = originalContents;
}
function updateTotals() {
let totalPurchaseAmount = 0;
let totalDiscountAmount = 0;
let totalNonVatPurchase = 0;
let totalTaxableAmount = 0;
let totalVatAmount = 0;

const visibleRows = document.querySelectorAll('#billsList tbody tr');

visibleRows.forEach(row => {
totalPurchaseAmount += parseFloat(row.cells[4].textContent) || 0;
totalDiscountAmount += parseFloat(row.cells[5].textContent) || 0;
totalNonVatPurchase += parseFloat(row.cells[6].textContent) || 0;
totalTaxableAmount += parseFloat(row.cells[7].textContent) || 0;
totalVatAmount += parseFloat(row.cells[8].textContent) || 0;
});

document.getElementById('totalPurchaseAmount').textContent = totalPurchaseAmount.toFixed(2);
document.getElementById('totalDiscountAmount').textContent = totalDiscountAmount.toFixed(2);
document.getElementById('totalNonVatPurchase').textContent = totalNonVatPurchase.toFixed(2);
document.getElementById('totalTaxableAmount').textContent = totalTaxableAmount.toFixed(2);
document.getElementById('totalVatAmount').textContent = totalVatAmount.toFixed(2);
}

document.addEventListener('DOMContentLoaded', updateTotals);
