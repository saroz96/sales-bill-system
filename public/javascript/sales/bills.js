let itemIndex = 0;

$(document).ready(function () {
    // Initialize Select2 for searchable dropdown
    $('#account').select2({
        placeholder: "Select a party name",
        allowClear: true,
        width: '100%', // Ensure it takes the full width of the container
    });

    // Listen for the change event on the account dropdown
    $('#account').on('change', function () {
        const selectedOption = $(this).find('option:selected');
        const address = selectedOption.data('address');

        // Set the address field with the selected account's address
        $('#address').val(address || 'Address not available');
    });

    // Listen for the change event on the account dropdown
    $('#account').on('change', function () {
        const selectedOption = $(this).find('option:selected');
        const pan = selectedOption.data('pan');

        // Set the address field with the selected account's address
        $('#pan').val(pan || 'Pan no. not available');
    });

    // Initialize Select2 for searchable dropdown
    $('#companyGroup').select2({
        placeholder: "Select a account group",
        allowClear: true,
        width: '100%', // Ensure it takes the full width of the container
    });

    // Initialize Select2 for searchable dropdown
    $('#category').select2({
        placeholder: "Select a category",
        allowClear: true,
        width: '100%', // Ensure it takes the full width of the container
    });
    // Initialize Select2 for searchable dropdown
    $('#unit').select2({
        placeholder: "Select a unit",
        allowClear: true,
        width: '100%', // Ensure it takes the full width of the container
    });
    // Initialize Select2 for searchable dropdown
    $('#vatStatus').select2({
        placeholder: "Select a vat status",
        allowClear: true,
        width: '100%', // Ensure it takes the full width of the container
    });
    // Initialize Select2 for searchable dropdown
    $('#isVatExempt').select2({
        placeholder: "Select a vat",
        allowClear: true,
        width: '100%', // Ensure it takes the full width of the container
    });
});

$(document).ready(function () {
    // Initialize Select2 for searchable dropdown
    $('#paymentMode').select2({
        placeholder: "Select mode",
        allowClear: true,
        width: '100%', // Ensure it takes the full width of the container
    });
});

let currentFocus = 0;
let isFirstLoad = true;

async function fetchItems(query, vatStatus, existingItemIds) {
    try {
        const response = await fetch(`/items/search?q=${query}&isVatExempt=${vatStatus}&exclude=${existingItemIds.join(',')}`);
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
            <div><strong>S.Rate</strong></div>
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

            // Calculate total stock and fetch price from stock entries
            const totalStock = item.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
            const latestStockEntry = item.stockEntries[item.stockEntries.length - 1];
            const price = latestStockEntry ? latestStockEntry.price : 0;

            dropdownItem.innerHTML = `
                <div>${item.uniqueNumber || 'N/A'}</div>
                <div>${item.hscode || 'N/A'}</div>
                <div>${item.name}</div>
                <div>${totalStock}</div>
                <div>${item.unit ? item.unit.name : ''}</div>
                <div>Rs.${price.toFixed(2)}</div>
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

                dropdownItem.innerHTML = `
                    <div>${item.uniqueNumber || 'N/A'}</div>
                    <div>${item.hscode || 'N/A'}</div>
                    <div>${item.name}</div>
                    <div>${item.category ? item.category.name : 'No Category'}</div>
                    <div>${totalStock}</div>
                    <div>${item.unit ? item.unit.name : ''}</div>
                    <div>Rs.${item.price.toFixed()}</div>
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


async function shouldDisplayTransactions() {
    try {
        const response = await fetch(`/settings/get-display-transactions`);
        const { displayTransactions } = await response.json();
        return displayTransactions;
    } catch (error) {
        console.error('Error fetching settings:', error);
        return false;
    }
}

async function fetchLastTransactions(itemId) {
    // const itemId = select.value;
    const accountId = document.getElementById('account').value;
    const purchaseSalesType = document.getElementById('purchaseSalesType').value; // Ensure this element exists and has a value
    const transactionList = document.getElementById('transactionList');

    if (!purchaseSalesType) {
        console.error('Account Type is undefined. Please ensure it is set.');
        return;
    }

    try {

        const response = await fetch(`/api/transactions/${itemId}/${accountId}/${purchaseSalesType}`);
        const transactions = await response.json();
        // const { transactions, companyDateFormat } = await response.json();

        // Check if transactions are empty
        if (transactions.length === 0) {
            transactionList.innerHTML = '<p>No transactions to display.</p>';
            // Do not show the modal if there are no transactions
            return;
        }

        // Create table header
        let tableHtml = `
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Trans. Id</th>
                        <th>Date</th>
                        <th>Bill No.</th>
                        <th>Type</th>
                        <th>A/c Type</th>
                        <th>Pay.Mode</th>
                        <th>Qty.</th>
                        <th>Unit</th>
                        <th>S.price</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Add table rows for each transaction
        tableHtml += transactions.map(transaction => {
            return `
                <tr onclick="window.location.href='/bills/${transaction.billId._id}/print'" style="cursor: pointer;">
                    <td>${transaction._id}</td>
                    <td>${new Date(transaction.date).toLocaleDateString()}</td>
                    <td>${transaction.billNumber}</td>
                    <td>${transaction.type}</td>
                    <td>${transaction.purchaseSalesType}</td>
                    <td>${transaction.paymentMode}</td>
                    <td>${transaction.quantity}</td>
                    <td>${transaction.unit ? transaction.unit.name : 'N/A'}</td>
                    <td>Rs.${transaction.price}</td>
                </tr>
            `;
        }).join('');

        // Close table
        tableHtml += `
                </tbody>
            </table>
        `;

        // Set the innerHTML of the transaction list container
        transactionList.innerHTML = tableHtml;

        // Show the modal
        $('#transactionModal').modal('show');
    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}
async function handleFetchLastTransactions(itemId) {
    const displayTransactions = await shouldDisplayTransactions();
    if (displayTransactions) {
        await fetchLastTransactions(itemId);
    }
}

function addItemToBill(item, dropdownMenu) {
    const tbody = document.getElementById('items');
    const inputField = document.getElementById('itemSearch');

    if (!inputField.value.trim()) {
        return; // Do not add an item if the search field is blank
    }

    // Calculate total stock for the item
    const totalStock = item.stockEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);

    if (totalStock === 0) {
        alert(`Item "${item.name}" has zero stock and cannot be added to the bill.`);
        inputField.value = ''; // Clear the input field
        inputField.focus();    // Refocus the input field
        return; // Exit the function
    }

    // Sort stock entries by date (FIFO: First In First Out)
    const sortedStockEntries = item.stockEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Get the first stock entry (FIFO)
    const firstStockEntry = sortedStockEntries[0] || {}; // Defaults to an empty object if no stock entry exists

    const tr = document.createElement('tr');
    tr.classList.add('item', item.vatStatus ? 'vatable-item' : 'non-vatable-item');

    // Calculate the serial number based on the number of rows already in the table
    const serialNumber = tbody.rows.length + 1;

    // Use price from the first stock entry
    const batchPrice = firstStockEntry.price || 0;

    tr.innerHTML = `
        <td>${serialNumber}</td>
        <td>${item.uniqueNumber}</td>
        <td class="col-3">
            <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
            ${item.name}
        </td>
        <td>
            <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
            ${item.hscode}
        </td>
        <td>
            <input type="number" name="items[${itemIndex}][quantity]" value="0" class="form-control item-quantity" id="quantity-${itemIndex}" min="1" step="any" oninput="updateItemTotal(this)" onkeydown="handleQuantityKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
        </td>
        <td>
            ${item.unit ? item.unit.name : ''}
            <input type="hidden" name="items[${itemIndex}][unit]" value="${item.unit ? item.unit._id : ''}">
        </td>
        <td>
            <input type="text" name="items[${itemIndex}][batchNumber]" value="${firstStockEntry.batchNumber || ''}" class="form-control item-batchNumber" id="batchNumber-${itemIndex}" onkeydown="handleBatchKeydown(event, ${itemIndex})">
            <input type="date" name="items[${itemIndex}][expiryDate]" value="${firstStockEntry.expiryDate || ''}" class="form-control item-expiryDate" id="expiryDate-${itemIndex}" onkeydown="handleExpDateKeydown(event, ${itemIndex})">
        </td>
        <td>
            <input type="number" name="items[${itemIndex}][price]" value="${batchPrice}" class="form-control item-price" id="price-${itemIndex}" step="any" oninput="updateItemTotal(this)" onkeydown="handlePriceKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
        </td>
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

    // Fetch and display last transactions for the added item
    fetchLastTransactions(item._id);

    // Hide the dropdown menu after selecting an item
    dropdownMenu.classList.remove('show');

    // Clear the input field
    inputField.value = '';

    // Focus on the quantity input field of the newly added row
    document.getElementById(`quantity-${itemIndex - 1}`).focus();
}

function removeItem(button) {
    const row = button.closest('tr');
    row.remove();
    calculateTotal();
}

function updateItemTotal(input) {
    const row = input.closest('tr');
    const quantity = parseFloat(row.querySelector('input.item-quantity').value) || 0;
    const price = parseFloat(row.querySelector('input.item-price').value) || 0;
    const amount = quantity * price;
    row.querySelector('.item-amount').textContent = amount.toFixed(2);
    calculateTotal();
}

function updateDiscountFromPercentage() {
    const subTotal = calculateSubTotal();
    const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;
    const discountAmount = (subTotal * discountPercentage) / 100;
    document.getElementById('discountAmount').value = discountAmount.toFixed(2);
}

function updateDiscountFromAmount() {
    const subTotal = calculateSubTotal();
    const discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;
    const discountPercentage = (discountAmount / subTotal) * 100;
    document.getElementById('discountPercentage').value = discountPercentage.toFixed(2);
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

    const amountInWords = numberToWords(totalAmount) + ' Only.';
    document.getElementById('amountInWords').textContent = amountInWords;
}


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
    const vatInputs = document.getElementById('vatInputs'); // Group for VAT-related inputs
    const taxableAmountRow = document.getElementById('taxableAmountRow');
    const vatPercentageRow = document.getElementById('vatPercentageRow');
    const vatAmountRow = document.getElementById('vatAmountRow');

    // Toggle display based on VAT exemption
    if (isVatExempt) {
        taxableAmountRow.style.display = 'none';
        vatPercentageRow.style.display = 'none';
        vatAmountRow.style.display = 'none';
    } else {
        taxableAmountRow.style.display = 'table-row'; // Show taxable amount row
        vatPercentageRow.style.display = 'table-row'; // Show VAT 13% row
        vatAmountRow.style.display = 'table-row'; // Show VAT amount row
    }

    // Recalculate total when toggling VAT
    calculateTotal();
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
        // showPrintModal();
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
window.addEventListener('DOMContentLoaded', () => {
    toggleVatInputs();
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

    document.getElementById('roundOffAmount').addEventListener('input', function () {
        calculateTotal();
    });

    calculateTotal();
});

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
            // Prevent form submission and focus on the Save button

            // const submitBillForm = document.getElementById('saveBill')
            // submitBillForm.focus();
            const discountPercentageInput = document.getElementById('discountPercentage');
            if (discountPercentageInput) {
                discountPercentageInput.focus();
                discountPercentageInput.select();
            }
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
    }
}

function handleQuantityKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        const batchNumberInput = document.getElementById(`batchNumber-${itemIndex - 1}`);
        batchNumberInput.focus();
        batchNumberInput.select();
    }
}

function handleBatchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        const expDateInput = document.getElementById(`expiryDate-${itemIndex - 1}`);
        expDateInput.focus();
        expDateInput.select();
    }
}

function handleExpDateKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        const priceInput = document.getElementById(`price-${itemIndex - 1}`);
        priceInput.focus();
        priceInput.select();
    }
}

function handlePriceKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
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
function moveToNextInput(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        const form = event.target.form;
        const index = Array.prototype.indexOf.call(form, event.target);
        form.elements[index + 1].focus();
    }
}

// Get all the input elements within the form
const inputs = document.querySelectorAll('form input, form select form group');

// Attach the moveToNextInput function to the keydown event for each input field
inputs.forEach(input => {
    input.addEventListener('keydown', moveToNextInput);
});

function calculateTotalOpeningStockBalance(input) {
    const puPrice = parseFloat(document.getElementById('puPrice').value) || 0;
    const openingStock = parseFloat(document.getElementById('openingStock').value) || 0;

    const totalOpeningStockBalance = puPrice * openingStock;

    // Update the Opening Stock Balance field
    document.getElementById('openingStockBalance').value = totalOpeningStockBalance.toFixed(2);
}