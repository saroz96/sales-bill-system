// document.addEventListener('DOMContentLoaded', function () {
//     document.querySelectorAll('.item-select').forEach(select => {
//         updateItemPrice(select);
//         select.addEventListener('change', function () {
//             updateItemPrice(this);
//         });
//     });
//     document.querySelectorAll('.quantity-input').forEach(input => {
//         input.addEventListener('input', calculateTotal);
//     });
//     document.getElementById('isVatExempt').addEventListener('change', () => {
//         toggleVatInputs();
//         filterItemsBasedOnVatStatus();
//         document.querySelectorAll('.item-search').forEach(input => {
//             filterItems(input);
//         });
//     });
//     document.getElementById('addItemButton').addEventListener('click', openItemModal);

//     toggleVatInputs();
//     filterItemsBasedOnVatStatus();

//     document.querySelectorAll('.item-search').forEach(input => {
//         input.addEventListener('input', function () {
//             filterItems(this);
//         });
//     });
// });
// function filterItems(input) {
//     // const filter = input.value.trim().toLowerCase();
//     const filter = input.value.toLowerCase();
//     const isVatExempt = document.getElementById('isVatExempt').checked;
//     const itemsDiv = input.closest('.item').querySelector('.item-select');
//     const options = itemsDiv.querySelectorAll('option');

//     options.forEach(option => {
//         const text = option.textContent.toLowerCase();
//         const vatStatus = option.getAttribute('data-vat');

//         if (text.includes(filter) && (isVatExempt && vatStatus === 'vatExempt' || !isVatExempt && vatStatus === 'vatable')) {
//             option.style.display = '';
//         } else {
//             option.style.display = 'none';
//         }
//     });

//     itemsDiv.value = ""; // Clear selection when searching
// }


// function filterItemsBasedOnVatStatus() {
//     const isVatExempt = document.getElementById('isVatExempt').value === 'true';
//     document.querySelectorAll('.item-select option').forEach(option => {
//         const vatStatus = option.getAttribute('data-vat');

//         if (isVatExempt && vatStatus === 'vatable') {
//             option.style.display = 'none';
//         } else if (!isVatExempt && vatStatus === 'vatExempt') {
//             option.style.display = 'none';
//         } else {
//             option.style.display = 'block';
//         }
//     });
// }

// function toggleVatInputs() {
//     const isVatExempt = document.getElementById('isVatExempt').value === 'true';
//     const vatInputs = document.getElementById('vatInputs');
//     if (isVatExempt) {
//         vatInputs.style.display = 'none';
//     } else {
//         vatInputs.style.display = 'block'
//     }
//     filterItemsBasedOnVatStatus();
//     calculateTotal();
// }

// async function fetchLastTransactions(select) {
//     const itemId = select.value;
//     const accountId = document.getElementById('account').value;
//     const transactionList = document.getElementById('transactionList');

//     try {
//         const response = await fetch(`/api/transactions/${itemId}/${accountId}`);
//         const transactions = await response.json();

//         // Create table header
//         let tableHtml = `
//             <table class="table table-sm">
//                 <thead>
//                     <tr>
//                         <th>Trans. Id</th>
//                         <th>Date</th>
//                         <th>Bill No.</th>
//                         <th>Type</th>
//                         <th>Pay.Mode</th>
//                         <th>Qty.</th>
//                         <th>Unit</th>
//                         <th>s.price</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//         `;

//         // Add table rows for each transaction
//         tableHtml += transactions.map(transaction => `
//             <tr onclick="window.location.href='/bills/${transaction.billId._id}/print'" style="cursor: pointer;">
//                 <td>${transaction._id}</td>
//                 <td>${new Date(transaction.transactionDate).toLocaleDateString()}</td>
//                 <td>${transaction.billNumber}</td>
//                 <td>${transaction.type}</td>
//                 <td>${transaction.paymentMode}</td>
//                 <td>${transaction.quantity}</td>
//                 <td>${transaction.unit}</td>
//                 <td>Rs.${transaction.price}</td>
//             </tr>
//         `).join('');

//         // Close table
//         tableHtml += `
//                 </tbody>
//             </table>
//         `;

//         // Set the innerHTML of the transaction list container
//         transactionList.innerHTML = tableHtml;

//         // Show the modal
//         $('#transactionModal').modal('show');
//     } catch (error) {
//         console.error('Error fetching transactions:', error);
//     }
// }

// function removeItem(button) {
//     const itemDiv = button.closest('.item');
//     itemDiv.remove();
//     calculateTotal();
// }

// function updateItemPrice(select) {
//     const price = select.options[select.selectedIndex].getAttribute('data-price');
//     const vatStatus = select.options[select.selectedIndex].getAttribute('data-vat');
//     const priceInput = select.closest('.row').querySelector('.price-input');
//     priceInput.value = price;
//     setRowColor(select, vatStatus);
//     calculateTotal();
// }

// function setRowColor(select, vatStatus) {
//     const row = select.closest('.row');
//     if (vatStatus === 'vatable') {
//         row.classList.add('vatable-item');
//         row.classList.remove('non-vatable-item');
//     } else {
//         row.classList.add('non-vatable-item');
//         row.classList.remove('vatable-item');
//     }
// }

// document.addEventListener('DOMContentLoaded', function () {
//     document.getElementById('discountPercentage').addEventListener('input', function () {
//         updateDiscountFromPercentage();
//         calculateTotal();
//     });

//     document.getElementById('discountAmount').addEventListener('input', function () {
//         updateDiscountFromAmount();
//         calculateTotal();
//     });

//     document.querySelectorAll('.price-input, .quantity-input, .item-select').forEach(element => {
//         element.addEventListener('input', calculateTotal);
//     });

//     document.getElementById('roundOffAmount').addEventListener('input', function () {
//         calculateTotal();
//     });

//     calculateTotal();
// });

// function updateDiscountFromPercentage() {
//     const subTotal = calculateSubTotal();
//     const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;
//     const discountAmount = (subTotal * discountPercentage) / 100;
//     document.getElementById('discountAmount').value = discountAmount.toFixed(2);
// }

// function updateDiscountFromAmount() {
//     const subTotal = calculateSubTotal();
//     const discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;
//     const discountPercentage = (discountAmount / subTotal) * 100;
//     document.getElementById('discountPercentage').value = discountPercentage.toFixed(2);
// }

// function calculateSubTotal() {
//     let subTotal = 0;

//     document.querySelectorAll('.row .price-input').forEach((priceInput, index) => {
//         const price = parseFloat(priceInput.value) || 0;
//         const quantity = parseFloat(document.querySelectorAll('.row .quantity-input')[index].value) || 0;
//         const itemTotal = document.querySelectorAll('.row .item-total')[index];
//         const total = price * quantity || 0;
//         itemTotal.textContent = total.toFixed(2);
//         subTotal += total;
//     });

//     return subTotal;
// }

// function calculateTotal() {
//     let subTotal = calculateSubTotal();
//     let vatAmount = 0;
//     let discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;
//     let taxableAmount = subTotal - discountAmount;
//     let roundOffAmount = parseFloat(document.getElementById('roundOffAmount').value) || 0;

//     document.querySelectorAll('.row .price-input').forEach((priceInput, index) => {
//         const vatStatus = document.querySelectorAll('.row .item-select')[index].options[document.querySelectorAll('.row .item-select')[index].selectedIndex].getAttribute('data-vat');
//         const vatPercentage = parseFloat(document.getElementById('vatPercentage').value) || 13;

//         if (!document.getElementById('isVatExempt').checked && vatStatus === 'vatable') {
//             vatAmount += (taxableAmount * vatPercentage) / 100;
//         }
//     });

//     // Update the totals in the DOM
//     const totalAmount = taxableAmount + vatAmount + roundOffAmount;
//     document.getElementById('subTotal').textContent = subTotal.toFixed(2);
//     document.getElementById('taxableAmount').textContent = taxableAmount.toFixed(2);
//     document.getElementById('vatAmount').textContent = vatAmount.toFixed(2);
//     document.getElementById('totalAmount').textContent = (totalAmount).toFixed(2);

//     document.getElementById('amountInWords').textContent = numberToWords(totalAmount);
// }

// //step by step going in input field when enter
// document.addEventListener('DOMContentLoaded', () => {
//     const inputs = [
//         'billDate',
//         'paymentMode',
//         'account',
//         'isVatExempt',
//         'item-search',
//         'item-quantity',
//         'item-price',
//         'addItemButton'
//         // Add more input IDs as needed
//     ];

//     inputs.forEach((inputId, index) => {
//         const inputElement = document.getElementById(inputId);
//         if (inputElement) {
//             inputElement.addEventListener('keydown', (event) => {
//                 if (event.key === 'Enter') {
//                     event.preventDefault();
//                     const nextInputId = inputs[index + 1];
//                     if (nextInputId) {
//                         document.getElementById(nextInputId).focus();
//                     }
//                 }
//             });
//         }
//     });
// });


// function numberToWords(num) {
//     const ones = [
//         '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
//         'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
//         'Seventeen', 'Eighteen', 'Nineteen'
//     ];

//     const tens = [
//         '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
//     ];

//     const scales = ['', 'Thousand', 'Million', 'Billion'];

//     function convertHundreds(num) {
//         let words = '';

//         if (num > 99) {
//             words += ones[Math.floor(num / 100)] + ' Hundred ';
//             num %= 100;
//         }

//         if (num > 19) {
//             words += tens[Math.floor(num / 10)] + ' ';
//             num %= 10;
//         }

//         if (num > 0) {
//             words += ones[num] + ' ';
//         }

//         return words.trim();
//     }

//     if (num === 0) return 'Zero';

//     if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

//     let words = '';

//     for (let i = 0; i < scales.length; i++) {
//         let unit = Math.pow(1000, scales.length - i - 1);
//         let currentNum = Math.floor(num / unit);

//         if (currentNum > 0) {
//             words += convertHundreds(currentNum) + ' ' + scales[scales.length - i - 1] + ' ';
//         }

//         num %= unit;
//     }

//     return words.trim();
// }
