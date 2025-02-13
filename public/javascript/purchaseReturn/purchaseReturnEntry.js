let itemIndex = 0;
let currentFocus = 0;
let isFirstLoad = true;

async function fetchItems(query, vatStatus, existingItemIds) {
    try {
        const response = await fetch(`/items/search?q=${query}&isVatExempt=${vatStatus}`);
        const data = await response.json();

        console.log('Fetched items:', data);

        if (!Array.isArray(data)) {
            throw new Error('Invalid response format');
        }

        return data;
    } catch (error) {
        console.error('Error fetching items:', error);
        return [];
    }
}


document.getElementById('itemSearch').addEventListener('keydown', function (event) {
    const inputField = this;
    const dropdownMenu = document.getElementById('dropdownMenu');
    const items = dropdownMenu.getElementsByClassName('dropdown-item');

    if (event.key === 'ArrowDown') {
        // Navigate down the list
        currentFocus++;
        addActive(items);
        scrollToItem(items);
        updateInputWithHighlightedItem(items);
    } else if (event.key === 'ArrowUp') {
        // Navigate up the list
        currentFocus--;
        addActive(items);
        scrollToItem(items);
        updateInputWithHighlightedItem(items);
    } else if (event.key === 'Enter') {
        // Select the item
        event.preventDefault();

        if (currentFocus > -1) {
            if (items[currentFocus]) {
                items[currentFocus].click();


                // Clear the input field after selection
                inputField.value = '';
            }
        }
    }
});
function addActive(items) {
    if (!items) return false;
    removeActive(items);
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = items.length - 1;
    items[currentFocus].classList.add('active');
}

function removeActive(items) {
    for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
    }
}

function scrollToItem(items) {
    if (currentFocus >= 0 && currentFocus < items.length) {
        const item = items[currentFocus];
        item.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest' // Ensures the item is in view without scrolling too far
        });
    }
}

function updateInputWithHighlightedItem(items) {
    const inputField = document.getElementById('itemSearch');
    if (currentFocus > -1 && items[currentFocus]) {
        const itemName = items[currentFocus].querySelector('div:nth-child(3)').textContent;
        inputField.value = itemName; // Update the input field with the highlighted item's name
    }
}

async function showAllItems(input) {
    const dropdownMenu = input.nextElementSibling;
    const vatStatus = document.getElementById('isVatExempt').value;
    const existingItemIds = Array.from(document.querySelectorAll('input[name^="items["]'))
        .filter(input => input.name.includes('[item]'))
        .map(input => input.value);

    // Fetch all items with an empty query
    const items = await fetchItems('', vatStatus, existingItemIds);
    console.log('All items:', items);

    // Clear existing dropdown items
    dropdownMenu.innerHTML = '';

    if (items.length === 0) {
        const noItemsMessage = document.createElement('div');
        noItemsMessage.classList.add('dropdown-item');
        noItemsMessage.textContent = 'No items found';
        noItemsMessage.style.textAlign = 'center';
        noItemsMessage.style.color = 'white';
        noItemsMessage.style.backgroundColor = 'blue';
        dropdownMenu.appendChild(noItemsMessage);
        dropdownMenu.classList.add('show');
    } else {
        // Add header row
        const headerRow = document.createElement('div');
        headerRow.classList.add('dropdown-header');
        headerRow.innerHTML = `
    <div><strong>Item Code</strong></div>
    <div><strong>HS Code</strong></div>
    <div><strong>Name</strong></div>
    <div><strong>Stock</strong></div>
    <div><strong>Unit</strong></div>
    <div><strong>C.Rate</strong></div>
`;
        headerRow.style.backgroundColor = '#f0f0f0';
        headerRow.style.fontWeight = 'bold';
        dropdownMenu.appendChild(headerRow);

        // Add item rows
        items.forEach(item => {
            const dropdownItem = document.createElement('div');
            dropdownItem.classList.add('dropdown-item');
            dropdownItem.tabIndex = 0;

            if (item.vatStatus === 'vatable') {
                dropdownItem.classList.add('vatable-item');
            } else {
                dropdownItem.classList.add('non-vatable-item');
            }

            const totalStock = item.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);

            const latestStockEntry = item.stockEntries[item.stockEntries.length - 1];
            const puPrice = latestStockEntry ? latestStockEntry.puPrice : 0;

            dropdownItem.innerHTML = `
        <div>${item.uniqueNumber || 'N/A'}</div>
        <div>${item.hscode || 'N/A'}</div>
        <div>${item.name}</div>
        <div>${totalStock}</div>
        <div>${item.unit ? item.unit.name : ''}</div>
        <div>Rs.${puPrice.toFixed(2)}</div>
    `;

            dropdownItem.addEventListener('click', () => {
                addItemToBill(item, dropdownMenu);
                input.value = item.name;
                dropdownMenu.classList.remove('show');
            });
            dropdownMenu.appendChild(dropdownItem);
        });

        dropdownMenu.classList.add('show');
        currentFocus = 0;
        addActive(dropdownMenu.getElementsByClassName('dropdown-item'));

        // Auto-fill and auto-select the input field with the first item name on the first load
        if (isFirstLoad && items.length > 0) {
            input.value = items[0].name;
            input.select(); // Auto-select the input text
            isFirstLoad = false; // Set the flag to false after the first time
        }
    }

}

// Add event listener for focus to show all items
document.getElementById('itemSearch').addEventListener('focus', function () {
    showAllItems(this);
});

// Add event listener for input to fetch items dynamically
document.getElementById('itemSearch').addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();
    const vatStatus = document.getElementById('isVatExempt').value;
    const dropdownMenu = this.nextElementSibling;

    if (query.length === 0) {
        showAllItems(this);
        return;
    }

    const existingItemIds = Array.from(document.querySelectorAll('input[name^="items["]'))
        .filter(input => input.name.includes('[item]'))
        .map(input => input.value);

    fetchItems(query, vatStatus, existingItemIds).then(items => {
        dropdownMenu.innerHTML = '';

        if (items.length === 0) {
            const noItemsMessage = document.createElement('div');
            noItemsMessage.classList.add('dropdown-item');
            noItemsMessage.textContent = 'No items found';
            noItemsMessage.style.textAlign = 'center';
            noItemsMessage.style.color = 'white';
            noItemsMessage.style.backgroundColor = 'blue';
            dropdownMenu.appendChild(noItemsMessage);
            dropdownMenu.classList.add('show');
        } else {
            items.forEach(item => {
                const dropdownItem = document.createElement('div');
                dropdownItem.classList.add('dropdown-item');
                dropdownItem.tabIndex = 0;

                if (item.vatStatus === 'vatable') {
                    dropdownItem.classList.add('vatable-item');
                } else {
                    dropdownItem.classList.add('non-vatable-item');
                }

                const totalStock = item.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);

                const latestStockEntry = item.stockEntries[item.stockEntries.length - 1];
                const puPrice = latestStockEntry ? latestStockEntry.puPrice : 0;

                dropdownItem.innerHTML = `
            <div>${item.uniqueNumber || 'N/A'}</div>
            <div>${item.hscode || 'N/A'}</div>
            <div>${item.name}</div>
            <div>${item.category ? item.category.name : 'No Category'}</div>
            <div>${totalStock}</div>
            <div>${item.unit ? item.unit.name : ''}</div>
            <div>Rs.${puPrice.toFixed()}</div>
        `;

                dropdownItem.addEventListener('click', () => {
                    addItemToBill(item, dropdownMenu);
                    this.value = item.name;
                    dropdownMenu.classList.remove('show'); // Close the dropdown after selection
                });
                dropdownMenu.appendChild(dropdownItem);
            });

            dropdownMenu.classList.add('show');
            currentFocus = 0;
            addActive(dropdownMenu.getElementsByClassName('dropdown-item'));
        }
    });
});

// Close dropdown when user clicks outside
document.addEventListener('click', function (event) {
    const itemSearch = document.getElementById('itemSearch');
    const dropdownMenu = itemSearch.nextElementSibling;

    if (!itemSearch.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.classList.remove('show'); // Close the dropdown if clicked outside
    }
});


let selectedBatch = {}; // Store the selected batch information

function addItemToBill(item, dropdownMenu) {
    const tbody = document.getElementById('items');
    const inputField = document.getElementById('itemSearch');

    if (!inputField.value.trim()) {
        return; // Do not add an item if the search field is blank
    }

    // Clear the item search field immediately after showing the modal
    inputField.value = '';

    // First, check if we should display last transactions
    shouldDisplayTransactions().then((displayTransactions) => {
        // If displayTransactions is true, fetch the last transactions
        if (displayTransactions) {
            handleFetchLastTransactions(item._id).then(() => {
                // Show batch modal after the transaction modal is closed
                $('#transactionModal').on('hidden.bs.modal', function () {
                    // Trigger the batch modal with batch details
                    showBatchModal(item, (batchInfo) => {
                        // This callback will be triggered when the user selects a batch from the modal
                        selectedBatch = batchInfo;

                        const tr = document.createElement('tr');
                        tr.classList.add('item', item.vatStatus ? 'vatable-item' : 'non-vatable-item');

                        const serialNumber = tbody.rows.length + 1;  // Calculate the serial number based on the number of rows already in the table
                        tr.innerHTML = `
    <td>${serialNumber}</td>
    <td>${item.uniqueNumber}</td>
     <td>
    <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
    ${item.hscode}
</td>
<td class="col-3">
    <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
    ${item.name}
</td>
<td><input type="number" name="items[${itemIndex}][quantity]" value="0" class="form-control item-quantity" id="quantity-${itemIndex}" min="1" step="any" oninput="updateItemTotal(this)" onkeydown="handleQuantityKeydown(event,${itemIndex})" onfocus="selectValue(this)"></td>
<td>
    ${item.unit ? item.unit.name : ''}
    <input type="hidden" name="items[${itemIndex}][unit]" value="${item.unit ? item.unit._id : ''}">
</td>
<td>
    <input type="text" name="items[${itemIndex}][batchNumber]" value="${selectedBatch.batchNumber}" class="form-control item-batchNumber" id="batchNumber-${itemIndex}" onkeydown="handleBatchKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
</td>
<td>
    <input type="date" name="items[${itemIndex}][expiryDate]" value="${selectedBatch.expiryDate}" class="form-control item-expiryDate" id="expiryDate-${itemIndex}" onkeydown="handleExpDateKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
</td>
<td><input type="number" name="items[${itemIndex}][puPrice]" value="${selectedBatch.puPrice}" class="form-control item-puPrice" id="puPrice-${itemIndex}" step="any" oninput="updateItemTotal(this)" onkeydown="handlePriceKeydown(event, ${itemIndex})" onfocus="selectValue(this)"></td>
<td class="item-amount">0.00</td>
<td>
     <button type="button" class="btn btn-danger" data-dismiss="modal" aria-label="Close" onclick="removeItem(this)">
        <span aria-hidden="true">&times;</span>
    </button>
</td>
<input type="hidden" name="items[${itemIndex}][vatStatus]" value="${item.vatStatus}">
`;

                        tbody.appendChild(tr);
                        itemIndex++;
                        calculateTotal();

                        // Focus on the newly added row's quantity input
                        document.getElementById(`quantity-${itemIndex - 1}`).focus();

                        // Hide the dropdown menu after selecting an item
                        dropdownMenu.classList.remove('show');
                    });
                });
            });
        } else {
            // Directly show the batch modal without fetching transactions
            showBatchModal(item, (batchInfo) => {
                // This callback will be triggered when the user selects a batch from the modal
                selectedBatch = batchInfo;

                const tr = document.createElement('tr');
                tr.classList.add('item', item.vatStatus ? 'vatable-item' : 'non-vatable-item');

                const serialNumber = tbody.rows.length + 1;  // Calculate the serial number based on the number of rows already in the table
                tr.innerHTML = `
    <td>${serialNumber}</td>
    <td>${item.uniqueNumber}</td>
    <td>
    <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
    ${item.hscode}
</td>
<td class="col-3">
    <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
    ${item.name}
</td>
<td><input type="number" name="items[${itemIndex}][quantity]" value="0" class="form-control item-quantity" id="quantity-${itemIndex}" min="1" step="any" oninput="updateItemTotal(this)" onkeydown="handleQuantityKeydown(event,${itemIndex})" onfocus="selectValue(this)"></td>
<td>
    ${item.unit ? item.unit.name : ''}
    <input type="hidden" name="items[${itemIndex}][unit]" value="${item.unit ? item.unit._id : ''}">
</td>
<!-- Hidden fields for batch and expiry -->
<td>
    <input type="text" name="items[${itemIndex}][batchNumber]" value="${selectedBatch.batchNumber}" class="form-control item-batchNumber" id="batchNumber-${itemIndex}" onkeydown="handleBatchKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
</td>
<td>
    <input type="date" name="items[${itemIndex}][expiryDate]" value="${selectedBatch.expiryDate}" class="form-control item-expiryDate" id="expiryDate-${itemIndex}" onkeydown="handleExpDateKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
</td>
<td><input type="number" name="items[${itemIndex}][puPrice]" value="${selectedBatch.puPrice}" class="form-control item-puPrice" id="puPrice-${itemIndex}" step="any" oninput="updateItemTotal(this)" onkeydown="handlePriceKeydown(event, ${itemIndex})" onfocus="selectValue(this)"></td>
<td class="item-amount">0.00</td>
<td>
     <button type="button" class="btn btn-danger" data-dismiss="modal" aria-label="Close" onclick="removeItem(this)">
        <span aria-hidden="true">&times;</span>
    </button>
</td>
<input type="hidden" name="items[${itemIndex}][vatStatus]" value="${item.vatStatus}">
`;

                tbody.appendChild(tr);
                itemIndex++;
                calculateTotal();

                // Focus on the newly added row's quantity input
                document.getElementById(`quantity-${itemIndex - 1}`).focus();

                // Hide the dropdown menu after selecting an item
                dropdownMenu.classList.remove('show');
            });
        }
    });
}


function showBatchModal(item, callback) {
    const modal = document.getElementById('batchModal');
    const modalBody = document.getElementById('batchModalBody');

    // Check if all stock entries are out of stock
    const outOfStock = item.stockEntries.every((entry) => entry.quantity === 0);

    let modalContent = `<h5>Batch Information for ${item.name}</h5>`;

    if (outOfStock) {
        // Display 'Out of Stock' message
        modalContent += `<div class="alert alert-warning" role="alert">Out of Stock</div>`;
    } else {
        // Populate the modal with batch information if stock is available
        modalContent += `
<table class="table" id="batchTable">
    <thead>
        <tr>
            <th>Batch Number</th>
            <th>Expiry Date</th>
            <th>Quantity</th>
            <th>S.P</th>
            <th>C.P</th>
            <th>%</th>
            <th>Mrp</th>
        </tr>
    </thead>
    <tbody>
`;

        item.stockEntries.forEach((entry) => {
            if (entry.quantity > 0) { // Only show entries with stock
                modalContent += `
        <tr tabindex="0">
            <td>${entry.batchNumber || 'N/A'}</td>
            <td>${entry.expiryDate || 'N/A'}</td>
            <td>${entry.quantity}</td>
            <td>${entry.price}</td>
            <td>${entry.puPrice}</td>
            <td>${entry.marginPercentage}</td>
            <td>${entry.mrp}</td>
        </tr>
    `;
            }
        });

        modalContent += '</tbody></table>';
    }

    modalBody.innerHTML = modalContent;

    // Show the modal
    $(modal).modal('show');

    // Wait for the modal to be shown, then focus on the first row
    $(modal).on('shown.bs.modal', function () {
        const firstRow = modalBody.querySelector('tbody tr');
        if (firstRow) {
            firstRow.focus(); // Set focus on the first row
        }
    });

    // Handle keyboard navigation and selection
    const rows = modalBody.querySelectorAll('tbody tr');
    let selectedIndex = 0;

    rows.forEach((row, index) => {
        row.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                selectedIndex = (index + 1) % rows.length; // Move down
                rows[selectedIndex].focus();
            } else if (event.key === 'ArrowUp') {
                selectedIndex = (index - 1 + rows.length) % rows.length; // Move up
                rows[selectedIndex].focus();
            } else if (event.key === 'Enter') {
                const batchNumber = row.cells[0].textContent; // Assuming batch number is in the first cell
                const expiryDate = row.cells[1].textContent; // Expiry date in the second cell
                const puPrice = row.cells[4].textContent;
                callback({ batchNumber, expiryDate, puPrice });

                // Hide the modal after selection
                $(modal).modal('hide');
            }
        });
    });

    // Optional: Close the modal on clicking outside or the close button
    modal.addEventListener('hidden.bs.modal', function () {
        modalBody.innerHTML = ''; // Clear modal content
    });
}


function removeItem(button) {
    const row = button.closest('tr');
    row.remove();
    calculateTotal();
}


function updateItemTotal(input) {
    const row = input.closest('tr');
    const quantity = parseFloat(row.querySelector('input.item-quantity').value) || 0;
    const puPrice = parseFloat(row.querySelector('input.item-puPrice').value) || 0;
    const amount = quantity * puPrice;

    // Update the item's total amount
    row.querySelector('.item-amount').textContent = amount.toFixed(2);

    // Recalculate total, discounts, and update live
    calculateTotal();
    updateDiscountFromPercentage(); // Ensure discount is updated live
}

function updateDiscountFromPercentage() {
    const subTotal = calculateSubTotal();
    const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;

    // Calculate the discount amount based on the percentage
    const discountAmount = (subTotal * discountPercentage) / 100;

    // Update the discount amount field
    document.getElementById('discountAmount').value = discountAmount.toFixed(2);

    // Recalculate the total with the updated discount
    calculateTotal();
}

function updateDiscountFromAmount() {
    const subTotal = calculateSubTotal();
    const discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;

    // Calculate the discount percentage based on the amount
    const discountPercentage = (discountAmount / subTotal) * 100;

    // Update the discount percentage field
    document.getElementById('discountPercentage').value = discountPercentage.toFixed(2);

    // Recalculate the total with the updated discount
    calculateTotal();
}


function calculateSubTotal() {
    const rows = document.querySelectorAll('#items tr.item');
    let subTotal = 0;

    rows.forEach(row => {
        const amount = parseFloat(row.querySelector('.item-amount').textContent) || 0;
        const vatStatus = row.querySelector('input[name$="[vatStatus]"]').value === 'true';

        subTotal += amount;
        if (vatStatus) {
            taxableAmount += amount;
            vatAmount += amount * 0.13; // VAT is 13%
        }
    });

    return subTotal;
}

function calculateTotal() {
    const rows = document.querySelectorAll('#items tr.item');
    let subTotal = calculateSubTotal();
    let vatAmount = 0;
    let totalTaxableAmount = 0;
    let totalNonTaxableAmount = 0;

    // Separate amounts for vatable and non-vatable items
    rows.forEach(row => {
        const amount = parseFloat(row.querySelector('.item-amount').textContent) || 0;
        const vatStatus = row.querySelector('input[name$="[vatStatus]"]').value;

        if (vatStatus === 'vatable') {
            totalTaxableAmount += amount;
        } else {
            totalNonTaxableAmount += amount;
        }
    });

    const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;
    const discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;

    // Calculate total amount before discount
    const totalAmountBeforeDiscount = totalTaxableAmount + totalNonTaxableAmount;

    // Apply discount proportionally to vatable and non-vatable items
    // const totalDiscount = (totalAmountBeforeDiscount * discountPercentage / 100) + discountAmount;
    const discountForTaxable = (totalTaxableAmount * discountPercentage / 100);
    const discountForNonTaxable = (totalNonTaxableAmount * discountPercentage / 100)

    const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
    const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

    // Calculate VAT only for vatable items
    const vatSelection = document.getElementById('isVatExempt').value;
    if (vatSelection === 'false' || vatSelection === 'all') {
        vatAmount = finalTaxableAmount * 0.13; // VAT is 13%
    } else {
        vatAmount = 0;
    }
    const roundOffAmount = parseFloat(document.getElementById('roundOffAmount').value) || 0;
    const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount + roundOffAmount;

    document.getElementById('subTotal').textContent = subTotal.toFixed(2);
    document.getElementById('taxableAmount').textContent = finalTaxableAmount.toFixed(2);
    document.getElementById('vatAmount').textContent = vatAmount.toFixed(2);
    document.getElementById('totalAmount').textContent = totalAmount.toFixed(2);

    // Convert total amount to words including paisa
    const amountInWords = convertToRupeesAndPaisa(totalAmount) + ' Only.';
    document.getElementById('amountInWords').textContent = amountInWords;
}

// Attach event listeners for live updates
document.addEventListener('DOMContentLoaded', () => {
    // Update discount fields dynamically
    document.getElementById('discountPercentage').addEventListener('input', updateDiscountFromPercentage);
    document.getElementById('discountAmount').addEventListener('input', updateDiscountFromAmount);

    // Ensure item inputs update totals live
    document.querySelectorAll('input.item-quantity, input.item-puPrice').forEach(input => {
        input.addEventListener('input', () => updateItemTotal(input));
    });
});



function toggleCreditPartyOptions() {
    const paymentMode = document.getElementById('paymentMode').value;
    const creditPartyOptions = document.querySelectorAll('.credit-party');
    creditPartyOptions.forEach(option => {
        option.style.display = paymentMode === 'credit' ? 'block' : 'none';
    });
}

function toggleVatInputs() {
    const isVatExempt = document.getElementById('isVatExempt').value === 'true';

    // VAT-related fields
    const taxableAmountRow = document.getElementById('taxableAmountRow');
    const vatPercentageRow = document.getElementById('vatPercentageRow');

    // Toggle display based on VAT exemption
    if (isVatExempt) {
        taxableAmountRow.style.display = 'none';
        vatPercentageRow.style.display = 'none';
        // Move focus to the next available input field
        moveToNextVisibleInput(document.getElementById('isVatExempt'));
    } else {
        taxableAmountRow.style.display = 'table-row'; // Show taxable amount row
        vatPercentageRow.style.display = 'table-row'; // Show VAT 13% row
    }

    // Recalculate total when toggling VAT
    calculateTotal();
}


function moveToNextVisibleInput(currentElement) {
    const formElements = Array.from(document.querySelectorAll('input, select, textarea, button'));

    // Find the current element's index in the form
    const currentIndex = formElements.indexOf(currentElement);

    // Iterate through the remaining elements to find the next visible one
    for (let i = currentIndex + 1; i < formElements.length; i++) {
        if (formElements[i].offsetParent !== null) { // Check if the element is visible
            formElements[i].focus();
            break;
        }
    }
}


function showPrintModal() {
    $('#printModal').modal('show');
}

function submitBillForm(print) {
    shouldPrint = print;
    const billForm = document.getElementById('billForm');
    const saveButton = document.getElementById('saveBill');

    // Change button text and disable it
    saveButton.innerText = 'Saving...';
    saveButton.disabled = true;

    if (print) {
        const url = new URL(billForm.action);
        url.searchParams.append('print', 'true');
        billForm.action = url.toString();
    }

    // Simulate form submission (replace this with actual form submission logic)
    setTimeout(() => {
        billForm.submit();

        // Reset button text and enable it after submission
        saveButton.innerText = 'Save Bill';
        saveButton.disabled = false;
    }, 2000); // Simulating a delay; adjust or remove as needed
}

document.getElementById('billForm').addEventListener('submit', function (event) {
    if (!shouldPrint && event.submitter && event.submitter.innerText === 'Save & Print Bill') {
        event.preventDefault();
        showPrintModal();
    }
});


function numberToWords(num) {
    const ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'
    ];

    const tens = [
        '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
    ];

    const scales = ['', 'Thousand', 'Million', 'Billion'];

    function convertHundreds(num) {
        let words = '';

        if (num > 99) {
            words += ones[Math.floor(num / 100)] + ' Hundred ';
            num %= 100;
        }

        if (num > 19) {
            words += tens[Math.floor(num / 10)] + ' ';
            num %= 10;
        }

        if (num > 0) {
            words += ones[num] + ' ';
        }

        return words.trim();
    }

    if (num === 0) return 'Zero';

    if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

    let words = '';

    for (let i = 0; i < scales.length; i++) {
        let unit = Math.pow(1000, scales.length - i - 1);
        let currentNum = Math.floor(num / unit);

        if (currentNum > 0) {
            words += convertHundreds(currentNum) + ' ' + scales[scales.length - i - 1] + ' ';
        }

        num %= unit;
    }

    return words.trim();
}

function convertToRupeesAndPaisa(amount) {
    const rupees = Math.floor(amount); // Integer part (Rupees)
    const paisa = Math.round((amount - rupees) * 100); // Fractional part (Paisa)

    let words = '';

    if (rupees > 0) {
        words += numberToWords(rupees) + ' Rupees';
    }

    if (paisa > 0) {
        words += (rupees > 0 ? ' and ' : '') + numberToWords(paisa) + ' Paisa';
    }

    return words || 'Zero Rupees';
}

window.addEventListener('DOMContentLoaded', () => {
    // toggleVatInputs();
    toggleCreditPartyOptions();
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('discountPercentage').addEventListener('input', function () {
        updateDiscountFromPercentage();
        calculateTotal();
    });

    document.getElementById('discountAmount').addEventListener('input', function () {
        updateDiscountFromAmount();
        calculateTotal();
    });

    // document.querySelectorAll('.price-input, .quantity-input, .item-select').forEach(element => {
    //     element.addEventListener('input', calculateTotal);
    // });

    document.getElementById('roundOffAmount').addEventListener('input', function () {
        calculateTotal();
    });

    calculateTotal();
});

async function shouldDisplayTransactions() {
    try {
        const response = await fetch(`/settings/get-display-purchase-return-transactions`);
        const { displayTransactionsForPurchaseReturn } = await response.json();
        return displayTransactionsForPurchaseReturn;
    } catch (error) {
        console.error('Error fetching settings:', error);
        return false;
    }
}

// async function fetchLastTransactions(itemId) {
//     // const itemId = select.value;
//     const accountId = document.getElementById('account').value;
//     const purchaseSalesType = document.getElementById('purchaseSalesType').value; // Ensure this element exists and has a value
//     const transactionList = document.getElementById('transactionList');

//     if (!purchaseSalesType) {
//         console.error('Account Type is undefined. Please ensure it is set.');
//         return;
//     }

//     try {

//         const response = await fetch(`/api/transactions/${itemId}/${accountId}/${purchaseSalesType}`);
//         const transactions = await response.json();
//         // const { transactions, companyDateFormat } = await response.json();
//         console.log('Fetched Transactions:', transactions);

//         // Check if transactions are empty
//         if (transactions.length === 0) {
//             transactionList.innerHTML = '<p>No transactions to display.</p>';
//             // Do not show the modal if there are no transactions
//             return;
//         }

//         // Create table header
//         let tableHtml = `
//     <table class="table table-sm">
//         <thead>
//             <tr>
//                 <th>Date</th>
//                 <th>Vch. No.</th>
//                 <th>Type</th>
//                 <th>A/c Type</th>
//                 <th>Pay.Mode</th>
//                 <th>Qty.</th>
//                 <th>Unit</th>
//                 <th>Rate</th>
//             </tr>
//         </thead>
//         <tbody>
// `;

//         // Add table rows for each transaction
//         tableHtml += transactions.map(transaction => {

//             if (!transaction || !transaction.purchaseBillId || !transaction.purchaseBillId._id) {
//                 console.error('Invalid transaction:', transaction);
//                 return ''; // Return an empty string for invalid transactions
//             }

//             return `
//         <tr onclick="window.location.href='/bills/${transaction.purchaseBillId._id}/print'" style="cursor: pointer;">
//             <td>${new Date(transaction.date).toLocaleDateString()}</td>
//             <td>${transaction.billNumber}</td>
//             <td>${transaction.type}</td>
//             <td>${transaction.purchaseSalesType}</td>
//             <td>${transaction.paymentMode}</td>
//             <td>${transaction.quantity}</td>
//             <td>${transaction.unit ? transaction.unit.name : 'N/A'}</td>
//             <td>Rs.${transaction.puPrice.toFixed(2)}</td>
//         </tr>
//     `;
//         }).join('');

//         // Close table
//         tableHtml += `
//         </tbody>
//     </table>
// `;

//         // Set the innerHTML of the transaction list container
//         transactionList.innerHTML = tableHtml;
//         console.log('Transactions:', transactions);

//         // Show the modal
//         $('#transactionModal').modal('show');
//     } catch (error) {
//         console.error('Error fetching transactions:', error);
//     }
// }


async function fetchLastTransactions(itemId) {
    const accountId = document.getElementById('account').value;
    const purchaseSalesType = document.getElementById('purchaseSalesType').value;
    const transactionList = document.getElementById('transactionList');

    if (!purchaseSalesType) {
        console.error('Account Type is undefined. Please ensure it is set.');
        return;
    }

    console.log('Fetching transactions for:', { itemId, accountId, purchaseSalesType });

    try {
        const response = await fetch(`/api/transactions/${itemId}/${accountId}/${purchaseSalesType}`);
        const { transactions, companyDateFormat, nepaliDate } = await response.json();
        console.log('Fetched Transactions:', transactions);

        // Check if transactions are empty
        if (!transactions || transactions.length === 0) {
            transactionList.innerHTML = '<p>No transactions to display.</p>';
            console.warn('No transactions found for the given parameters.');
            return;
        }

        // Create table HTML
        let tableHtml = `
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Vch. No.</th>
                        <th>Type</th>
                        <th>A/c Type</th>
                        <th>Pay.Mode</th>
                        <th>Qty.</th>
                        <th>Unit</th>
                        <th>Rate</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Add rows for each transaction
        tableHtml += transactions.map(transaction => {
            if (!transaction || !transaction.purchaseBillId || !transaction.purchaseBillId._id) {
                console.error('Invalid transaction:', transaction);
                return '';
            }

            return `
                <tr onclick="window.location.href='/bills/${transaction.purchaseBillId._id}/print'" style="cursor: pointer;">
                    <td>${new Date(transaction.date).toLocaleDateString()}</td>
                    <td>${transaction.billNumber}</td>
                    <td>${transaction.type}</td>
                    <td>${transaction.purchaseSalesType}</td>
                    <td>${transaction.paymentMode}</td>
                    <td>${transaction.quantity}</td>
                    <td>${transaction.unit ? transaction.unit.name : 'N/A'}</td>
                    <td>Rs.${transaction.puPrice.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        // Close table
        tableHtml += `
                </tbody>
            </table>
        `;

        // Render the table in the modal
        transactionList.innerHTML = tableHtml;

        // Show the modal
        $('#transactionModal').modal('show');
    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}
async function handleFetchLastTransactions(itemId) {
    const displayTransactionsForPurchaseReturn = await shouldDisplayTransactions();
    if (displayTransactionsForPurchaseReturn) {
        await fetchLastTransactions(itemId);
    }
}


// Assuming you have a batch modal with an ID 'batchModal' and an input field inside it
const batchModal = document.getElementById('batchModal');

// Add keydown event listener to the batch modal to detect "Enter" press
batchModal.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission or modal close

        // Focus on the quantity field of the last added row after pressing "Enter"
        focusOnLastQuantityField();
    }
});

// Function to focus on the quantity field of the last added item
function focusOnLastQuantityField() {
    const tbody = document.getElementById('items');

    // Get the last row's quantity field
    const lastRow = tbody.querySelector('tr.item:last-child');

    if (lastRow) {
        const lastQuantityField = lastRow.querySelector('.item-quantity');

        if (lastQuantityField) {
            lastQuantityField.focus();
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const itemSearchInput = document.getElementById('itemSearch'); // Initial focus on item search input
});

async function handleItemSearchKeydown(event) {
    const itemSearchInput = document.getElementById('itemSearch');
    const itemsTable = document.getElementById('itemsTable');
    const itemsAvailable = itemsTable && itemsTable.querySelectorAll('.item').length > 0;

    if (itemSearchInput.value.length > 0) {
        if (event.key === 'Enter') {
            // Fetch and check if transactions should be displayed
            const displayTransactions = await shouldDisplayTransactions();

            // Only open the modal if displayTransactions is true
            if (displayTransactions) {
                openModalAndFocusCloseButton();

            } else {
                focusOnLastRow('item-quantity');
            }
        }
    } else if (itemSearchInput.value.length < 0 || itemsAvailable) {
        if (event.key === 'Enter') {
            const submitBillForm = document.getElementById('saveBill')
            submitBillForm.focus();
        }
    }
}
function openModalAndFocusCloseButton() {
    // Open the modal
    $('#transactionModal').modal('show');

    // Wait until the modal is fully shown before focusing the close button
    $('#transactionModal').on('shown.bs.modal', function () {
        document.getElementById('closeModalButton').focus();
    });
}

function handleCloseButtonKeydown(event) {
    if (event.key === 'Enter') {
        // Close the modal (optional, depending on your implementation)
        $('#transactionModal').modal('hide');

        // Focus on the quantity input field
        document.getElementById(`quantity-${itemIndex - 1}`).focus();
        // focusOnLastRow('quantity');
    }
}

function handleQuantityKeydown(event) {
    if (event.key === 'Enter') {
        const batchNumberInput = document.getElementById(`batchNumber-${itemIndex - 1}`);
        batchNumberInput.focus();
        batchNumberInput.select();

    }
}

function handleBatchKeydown(event) {
    if (event.key === 'Enter') {
        const expDateInput = document.getElementById(`expiryDate-${itemIndex - 1}`);
        expDateInput.focus();
        expDateInput.select();
    }
}

function handleExpDateKeydown(event) {
    if (event.key === 'Enter') {
        const priceInput = document.getElementById(`puPrice-${itemIndex - 1}`);
        priceInput.focus();
        priceInput.select();
    }
}

function handlePriceKeydown(event) {
    if (event.key === 'Enter') {
        // Focus back on the item search input field
        const itemSearchInput = document.getElementById('itemSearch');
        itemSearchInput.focus();
        itemSearchInput.select();

    }
}

function selectValue(input) {
    input.select(); // Select the value of the input field when it is focused
}

function focusOnLastRow(fieldClass) {
    const rows = document.querySelectorAll('.item');
    if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const inputField = lastRow.querySelector(`.${fieldClass}`);
        if (inputField) {
            inputField.focus();
            inputField.select();
        }
    }
}

// Function to move focus to the next input field
// function moveToNextInput(event) {
//     if (event.key === 'Enter') {
//         event.preventDefault(); // Prevent form submission
//         const form = event.target.form;
//         const index = Array.prototype.indexOf.call(form, event.target);
//         form.elements[index + 1].focus();
//     }
// }

function moveToNextInput(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission

        // Move to the next visible input
        moveToNextVisibleInput(event.target);
    }
}

// Get all the input elements within the form
const inputs = document.querySelectorAll('form input, form select form group');

// Attach the moveToNextInput function to the keydown event for each input field
inputs.forEach(input => {
    input.addEventListener('keydown', moveToNextInput);
});


// Get the input field and the custom alert div
const billNumber = document.getElementById('billNumber');
const customAlertForBillNumber = document.getElementById('customAlertForBillNumber');

// Function to show the custom alert and focus on the input field
function showCustomAlertForBillNumber() {
    customAlertForBillNumber.style.display = 'block'; // Show the custom alert
    billNumber.focus(); // Focus on the input field
}

// Function to hide the custom alert when the user types
function hideCustomAlertOnInput() {
    if (billNumber.value.trim() !== '') {
        customAlertForBillNumber.style.display = 'none'; // Hide the alert
    }
}

// Function to hide the custom alert if Enter key is pressed
function hideCustomAlertForBillNumber(event) {
    if (event.key === 'Enter') {
        // If the input is valid, hide the custom alert
        if (billNumber.value.trim() !== '') {
            customAlertForBillNumber.style.display = 'none';
        } else {
            // Show the alert again if the field is still empty
            showCustomAlertForBillNumber();
        }
    }
}

// Add a blur event listener to the input field
billNumber.addEventListener('blur', function (event) {
    const input = event.target;

    // Check if the field is empty
    if (input.value.trim() === '') {
        // Show the custom alert
        showCustomAlertForBillNumber();
    }
});


// Add an input event listener to hide the alert when the user starts typing
billNumber.addEventListener('input', hideCustomAlertOnInput);

// Add a keypress event listener to detect Enter key
billNumber.addEventListener('keypress', hideCustomAlertForBillNumber);
