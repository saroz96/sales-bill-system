// Function to handle search input changes
document.getElementById("searchInput").addEventListener("input", function () {
  filterBills();
});

// Function to handle payment mode filter changes
document
  .getElementById("paymentModeFilter")
  .addEventListener("change", function () {
    filterBills();
  });

// Function to filter bills based on search input and payment mode filter
function filterBills() {
  const searchQuery = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();
  const selectedPaymentMode = document
    .getElementById("paymentModeFilter")
    .value.trim()
    .toLowerCase();
  const billsList = document.getElementById("billsList");
  const rows = billsList.querySelectorAll("tbody tr.searchClass");

  rows.forEach((row) => {
    const billNumber = row.cells[1].textContent.trim().toLowerCase();
    const companyName = row.cells[2].textContent.trim().toLowerCase();
    const paymentMode = row.cells[3].textContent.trim().toLowerCase();
    const users = row.cells[10].textContent.trim().toLowerCase();

    const matchesSearch =
      companyName.includes(searchQuery) ||
      billNumber.includes(searchQuery) ||
      users.includes(searchQuery);
    const matchesPaymentMode =
      selectedPaymentMode === "" || paymentMode === selectedPaymentMode;

    if (matchesSearch && matchesPaymentMode) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });

  // Update totals based on visible rows
  updateTotals();
}

// Function to update totals based on visible rows
function updateTotals() {
  let totalSubTotal = 0;
  let totalDiscount = 0;
  let totalTaxable = 0;
  let totalVat = 0;
  let totalRoundOff = 0;
  let totalAmount = 0;

  const visibleRows = document.querySelectorAll(
    '#billsList tbody tr.searchClass:not([style*="display: none"])'
  );

  visibleRows.forEach((row) => {
    totalSubTotal += parseFloat(row.cells[4].textContent); // Sub Total
    totalDiscount += parseFloat(row.cells[5].textContent.split(" - Rs.")[1]); // Discount
    totalTaxable += parseFloat(row.cells[6].textContent); // Taxable
    totalVat += parseFloat(row.cells[7].textContent.split(" - Rs.")[1]); // Vat
    totalRoundOff += parseFloat(row.cells[8].textContent); // Round Off
    totalAmount += parseFloat(row.cells[9].textContent); // Total
  });

  // Update totals row in the footer
  document.getElementById("totalSubTotal").textContent =
    totalSubTotal.toFixed(2);
  document.getElementById("totalDiscount").textContent =
    totalDiscount.toFixed(2);
  document.getElementById("totalTaxable").textContent = totalTaxable.toFixed(2);
  document.getElementById("totalVat").textContent = totalVat.toFixed(2);
  document.getElementById("totalRoundOff").textContent =
    totalRoundOff.toFixed(2);
  document.getElementById("totalAmount").textContent = totalAmount.toFixed(2);
}

// Initial call to filterBills to apply any initial filters (if needed)
filterBills();

// //Handle scape buttons
// document.addEventListener('keydown', function (event) {
//     if (event.key === 'Escape') {
//         event.preventDefault(); // Prevent default escape behavior
//         var exitModal = new bootstrap.Modal(document.getElementById('exitConfirmationModal'));
//         exitModal.show();
//     }
// });

// // Handle the exit confirmation
// document.getElementById('confirmExit').addEventListener('click', function () {
//     // Redirect to the home page
//     window.location.href = '/wholesellerDashboard'; // Change '/' to your home page URL
// });

// Print all bills
document.getElementById("printAllBills").addEventListener("click", function () {
  printBills(document.querySelectorAll("#billsList tbody tr.searchClass"));
});

// Print filtered bills
document
  .getElementById("printFilteredBills")
  .addEventListener("click", function () {
    printBills(
      document.querySelectorAll(
        '#billsList tbody tr.searchClass:not([style*="display: none"])'
      )
    );
  });

// Function to print the selected bills
function printBills(billRows) {
  const printWindow = window.open("", "_blank");

  // Basic HTML and styling for the print view
  const headerHTML = `
<html>
    <head>
        <title>Print Bills</title>
        <style>
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px; text-align: left; border: 1px solid black; white-space: nowrap; }
            th { background-color: #f2f2f2; }
        </style>
    </head>
    <body>
        ${document.getElementById("printHeader").innerHTML}
        <h1 style="text-align: center; text-decoration:underline;">Purchase Voucher's</h1>
`;

  // Table header for the printed bills
  const tableHeaderHTML = `
<table>
    <thead>
        <tr>
            <th>Date</th>
            <th>Vch. No.</th>
            <th>Supplier's Name</th>
            <th>Pay.Mode</th>
            <th>Sub Total</th>
            <th>Discount</th>
            <th>Taxable</th>
            <th>Vat</th>
            <th>Off(-/+)</th>
            <th>Total</th>
            <th>User</th>
        </tr>
    </thead>
    <tbody>
`;

  // Initialize variables for totals
  let totalSubTotal = 0;
  let totalDiscount = 0;
  let totalTaxable = 0;
  let totalVat = 0;
  let totalRoundOff = 0;
  let totalAmount = 0;

  // Construct table rows and calculate totals
  let tableRowsHTML = "";
  billRows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    tableRowsHTML += "<tr>";

    // Exclude the last cell (Actions) from printing
    for (let i = 0; i < cells.length - 1; i++) {
      const cellText = cells[i]?.textContent || "";
      tableRowsHTML += `<td>${cellText}</td>`;

      // Calculate totals for visible rows
      if (row.style.display !== "none") {
        switch (i) {
          case 4: // Sub Total
            totalSubTotal += parseFloat(cellText) || 0;
            break;
          case 5: // Discount
            totalDiscount += parseFloat(cellText.split(" - Rs.")[1]) || 0;
            break;
          case 6: // Taxable
            totalTaxable += parseFloat(cellText) || 0;
            break;
          case 7: // Vat
            totalVat += parseFloat(cellText.split(" - Rs.")[1]) || 0;
            break;
          case 8: // Round Off
            totalRoundOff += parseFloat(cellText) || 0;
            break;
          case 9: // Total Amount
            totalAmount += parseFloat(cellText) || 0;
            break;
        }
      }
    }

    tableRowsHTML += "</tr>";
  });

  // Add a totals row at the end of the table
  const totalsRowHTML = `
<tr style="font-weight: bold; background-color: #f9f9f9;">
    <td colspan="4">Totals</td>
    <td>${totalSubTotal.toFixed(2)}</td>
    <td>${totalDiscount.toFixed(2)}</td>
    <td>${totalTaxable.toFixed(2)}</td>
    <td>${totalVat.toFixed(2)}</td>
    <td>${totalRoundOff.toFixed(2)}</td>
    <td>${totalAmount.toFixed(2)}</td>
    <td></td> <!-- Empty cell for the User column -->
</tr>
`;

  // Construct the final HTML for printing
  const finalHTML = `
${headerHTML}
${tableHeaderHTML}
${tableRowsHTML}
${totalsRowHTML}
</tbody></table>
</body></html>
`;

  // Write to the print window and initiate print
  printWindow.document.write(finalHTML);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

const panVatNo = "<%= currentCompany.pan %>";
const container = document.getElementById("pan-vat-container");

for (let i = 0; i < panVatNo.length; i++) {
  const digit = document.createElement("span");
  digit.className = "bordered-digit";
  digit.textContent = panVatNo[i];
  container.appendChild(digit);
}

document.getElementById("clearSearch").addEventListener("click", () => {
  const inputField = document.getElementById("searchInput");

  // Check if the input field has a value
  if (inputField.value !== "") {
    inputField.value = ""; // Clear the input field
  } else {
    alert("Input field is already empty.");
  }
});

//to make scrolling by arrow key
document.addEventListener("DOMContentLoaded", function () {
  let billRows = document.querySelectorAll(".bill-row");
  let currentBillIndex = -1;

  // Update rows highlighting and scroll to selected row
  function updateBillRowHighlight() {
    const visibleRows = getVisibleRows();
    visibleRows.forEach((row) => row.classList.remove("selected-row"));
    if (currentBillIndex >= 0 && currentBillIndex < visibleRows.length) {
      visibleRows[currentBillIndex].classList.add("selected-row");
      visibleRows[currentBillIndex].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  // Get only the visible rows after filtering
  function getVisibleRows() {
    return Array.from(document.querySelectorAll(".bill-row")).filter(
      (row) => row.style.display !== "none"
    );
  }

  document.addEventListener("keydown", function (event) {
    let visibleRows = getVisibleRows();

    if (event.key === "ArrowDown") {
      if (currentBillIndex < visibleRows.length - 1) {
        currentBillIndex++;
        updateBillRowHighlight();
      }
    } else if (event.key === "ArrowUp") {
      if (currentBillIndex > 0) {
        currentBillIndex--;
        updateBillRowHighlight();
      }
    } else if (event.key === "Enter" && currentBillIndex >= 0) {
      window.location.href =
        visibleRows[currentBillIndex].getAttribute("data-url");
    }
  });

  // Highlight row on mouse click
  billRows.forEach((row, index) => {
    row.addEventListener("click", function () {
      let visibleRows = getVisibleRows();
      currentBillIndex = visibleRows.indexOf(row);
      updateBillRowHighlight();
    });

    row.addEventListener("dblclick", function () {
      window.location.href = row.getAttribute("data-url");
    });
  });
});
