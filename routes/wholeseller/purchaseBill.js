const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require("../../middleware/auth");
const { ensureTradeType } = require("../../middleware/tradeType");
const Account = require("../../models/wholeseller/Account");
const Item = require("../../models/wholeseller/Item");
const PurchaseBill = require("../../models/wholeseller/PurchaseBill");
const Company = require("../../models/wholeseller/Company");
// const PurchaseBillCounter = require('../../models/wholeseller/purchaseBillCounter');
const NepaliDate = require('nepali-date');
const Settings = require('../../models/wholeseller/Settings');
const Transaction = require('../../models/wholeseller/Transaction');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const BillCounter = require('../../models/wholeseller/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const CompanyGroup = require('../../models/wholeseller/CompanyGroup');


// Fetch all purchase bills
router.get('/purchase-bills-list', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');


        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        const bills = await PurchaseBill.find({ company: companyId, fiscalYear: currentFiscalYear }).populate('account').populate('items.item').populate('user');
        res.render('wholeseller/purchase/allbills', {
            company,
            currentFiscalYear,
            bills,
            currentCompany,
            currentCompanyName,
            title: 'Purchase',
            body: 'wholeseller >> purchase >> bills',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Purchase Bill routes
router.get('/purchase-bills', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const items = await Item.find({ company: companyId }).populate('category').populate('unit');
        const purchasebills = await PurchaseBill.find({ company: companyId }).populate('account').populate('items.item');
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        // Fetch the company and populate the fiscalYear
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'


        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }


        // Fetch only the required company groups: Cash in Hand, Sundry Debtors, Sundry Creditors
        const relevantGroups = await CompanyGroup.find({
            name: { $in: ['Cash in Hand', 'Sundry Debtors', 'Sundry Creditors'] }
        }).exec();

        // Convert relevant group IDs to an array of ObjectIds
        const relevantGroupIds = relevantGroups.map(group => group._id);

        // Fetch accounts that belong only to the specified groups
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            isActive: true,
            companyGroups: { $in: relevantGroupIds }
        }).exec();

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'Purchase' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }
        res.render('wholeseller/purchase/purchaseEntry', {
            company, accounts: accounts, items: items, purchasebills: purchasebills, nextPurchaseBillNumber: nextBillNumber,
            nepaliDate: nepaliDate, transactionDateNepali, companyDateFormat, currentFiscalYear, vatEnabled: company.vatEnabled,
            user: req.user, currentCompanyName: req.session.currentCompanyName,
            title: 'Purchase Entry',
            body: 'wholeseller >> purchase >> add',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }

});


router.get('/purchase-bills/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format Nepali date if necessary
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        res.render('wholeseller/purchase/billNumberForm', {
            company,
            currentFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


router.get('/purchase-bills/edit/billNumber', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { billNumber } = req.query;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format Nepali date if necessary
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Fetch only the required company groups: Cash in Hand, Sundry Debtors, Sundry Creditors
        const relevantGroups = await CompanyGroup.find({
            name: { $in: ['Cash in Hand', 'Sundry Debtors', 'Sundry Creditors'] }
        }).exec();

        // Convert relevant group IDs to an array of ObjectIds
        const relevantGroupIds = relevantGroups.map(group => group._id);

        // Fetch accounts that belong only to the specified groups
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            isActive: true,
            companyGroups: { $in: relevantGroupIds }
        }).exec();


        const purchaseInvoice = await PurchaseBill.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('items.item')
            .populate('items.unit')
            .populate('account')
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details

        if (!purchaseInvoice || !purchaseInvoice.items) {
            req.flash('error', 'Purchase invoice not found!');
            return res.redirect('/purchase-bills/finds')
        }

        res.render('wholeseller/purchase/edit', {
            purchaseInvoice,
            accounts,
            items: purchaseInvoice.items,
            company,
            vatEnabled: company.vatEnabled,
            currentFiscalYear,
            fiscalYear,
            currentCompanyName,
            companyDateFormat,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
})


router.post('/purchase-bills', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { account, items, vatPercentage, transactionDateNepali, transactionDateRoman, billDate, partyBillNumber, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount } = req.body;
            const companyId = req.session.currentCompany;
            const userId = req.user._id;
            const currentFiscalYear = req.session.currentFiscalYear.id
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;

            console.log('Request Body:', req.body);

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let subTotal = 0;
            let vatAmount = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required.' });
            }
            if (!isVatExempt) {
                return res.status(400).json({ error: 'Invalid vat selection.' });
            }
            if (!paymentMode) {
                return res.status(400).json({ error: 'Invalid payment mode.' });
            }

            if (!partyBillNumber) {
                return res.status(400).json({ error: 'Invalid suppliers invoice number.' });
            }

            const accounts = await Account.findOne({ _id: account, company: companyId });
            if (!accounts) {
                return res.status(400).json({ error: 'Invalid account for this company' });
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/purchase-bills');
                }

                const itemTotal = parseFloat(item.puPrice) * parseFloat(item.quantity, 10);
                subTotal += itemTotal;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += itemTotal;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += itemTotal;
                }
            }

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'Purchase')


            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    return res.redirect('/purchase-bills');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    return res.redirect('/purchase-bills');
                }
            }

            // Apply discount proportionally to vatable and non-vatable items
            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            // Calculate VAT only for vatable items
            if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
                vatAmount = (finalTaxableAmount * vatPercentage) / 100;
            } else {
                vatAmount = 0;
            }

            let totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;
            let finalAmount = totalAmount;

            // Check if round off is enabled in settings
            let roundOffForPurchase = await Settings.findOne({ companyId, userId }); // Assuming you have a single settings document

            // Handle case where settings is null
            if (!roundOffForPurchase) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForPurchase = { roundOffPurchase: false }; // Provide default settings or handle as needed
            }
            let roundOffAmount = 0;
            if (roundOffForPurchase.roundOffPurchase) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForPurchase.roundOffPurchase) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Create new purchase bill
            const newBill = new PurchaseBill({
                // billNumber: billCounter.count,
                billNumber: billNumber,
                partyBillNumber,
                account,
                purchaseSalesType: 'Purchase',
                items: [], // We'll update this later
                isVatExempt: isVatExemptBool,
                isVatAll,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatPurchase: finalNonTaxableAmount,
                taxableAmount: finalTaxableAmount,
                vatAmount,
                totalAmount: finalAmount,
                roundOffAmount: roundOffAmount,
                paymentMode,
                date: nepaliDate ? nepaliDate : new Date(billDate),
                transactionDate: transactionDateNepali ? transactionDateNepali : new Date(transactionDateRoman),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear
            });

            // Create transactions
            let previousBalance = 0;
            const accountTransaction = await Transaction.findOne({ account: account }).sort({ transactionDate: -1 });
            if (accountTransaction) {
                previousBalance = accountTransaction.balance;
            }


            //FIFO stock addition function
            async function addStock(product, batchNumber, expiryDate, quantity, price, puPrice, marginPercentage, mrp) {
                // Ensure quantity is treated as a number
                const quantityNumber = Number(quantity);

                const stockEntry = {
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    quantity: quantityNumber,
                    batchNumber: batchNumber,
                    expiryDate: expiryDate,
                    price: price,
                    puPrice: puPrice,
                    mrp: mrp,
                    marginPercentage: marginPercentage,
                };


                // Debug: log stock entry to ensure values are correct
                console.log('Stock Entry:', stockEntry);
                product.stockEntries.push(stockEntry); // Add entry to stockEntries array
                // Ensure stock is incremented correctly as a number
                product.stock = (product.stock || 0) + quantityNumber;
                await product.save();
            }


            // Create transactions and update stock
            const billItems = await Promise.all(items.map(async item => {
                const product = await Item.findById(item.item);

                // Create the transaction for this item
                const transaction = new Transaction({
                    item: product._id,
                    account: account,
                    // purchaseBillNumber: billCounter.count,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    partyBillNumber,
                    purchaseSalesType: 'Purchase',
                    quantity: item.quantity,
                    puPrice: item.puPrice,
                    unit: item.unit,  // Include the unit field
                    isType: 'Purc',
                    type: 'Purc',
                    purchaseBillId: newBill._id,  // Set billId to the new bill's ID
                    debit: 0,             // Debit is 0 for purchase transactions
                    credit: finalAmount,    // Set credit to the item's total amount
                    paymentMode: paymentMode,
                    balance: previousBalance + finalAmount, // Update the balance based on item total
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear
                });

                await transaction.save();
                console.log('Transaction', transaction);

                // Increment stock quantity using FIFO
                await addStock(product, item.batchNumber, item.expiryDate, item.quantity, item.price, item.puPrice, item.marginPercentage, item.mrp);

                return {
                    item: product._id,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    quantity: item.quantity,
                    price: item.price,
                    puPrice: item.puPrice,
                    mrp: item.mrp,
                    marginPercentage: item.marginPercentage,
                    unit: item.unit,
                    vatStatus: product.vatStatus
                };
            }));

            // Update bill with items
            newBill.items = billItems;
            console.log('New Purchase Bill', newBill);
            console.log('billItems', billItems);
            await newBill.save();

            // Create a transaction for the default Purchase Account
            const purchaseAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (purchaseAmount > 0) {
                const purchaseAccount = await Account.findOne({ name: 'Purchase', company: companyId });
                if (purchaseAccount) {
                    const partyAccount = await Account.findById(account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const purchaseTransaction = new Transaction({
                        account: purchaseAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        type: 'Purc',
                        purchaseBillId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: purchaseAmount,  // Debit the VAT account
                        credit: 0,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + purchaseAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await purchaseTransaction.save();
                    console.log('Purchase Transaction: ', purchaseTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
                if (vatAccount) {
                    const partyAccount = await Account.findById(account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        isType: 'VAT',
                        type: 'Purc',
                        purchaseBillId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: vatAmount,  // Debit the VAT account
                        credit: 0,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + vatAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save();
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }

            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        isType: 'RoundOff',
                        type: 'Purc',
                        purchaseBillId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: roundOffAmount,  // Debit the VAT account
                        credit: 0,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save();
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        isType: 'RoundOff',
                        type: 'Purc',
                        purchaseBillId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: Math.abs(roundOffAmount), // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save();
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId });
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        // billNumber: billCounter.count,
                        billNumber: billNumber,
                        partyBillNumber,
                        isType: 'Purc',
                        type: 'Purc',
                        purchaseBillId: newBill._id,  // Set billId to the new bill's ID
                        // billId: newBill._id,  // Set billId to the new bill's ID
                        purchaseSalesType: 'Purchase',
                        debit: 0,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: finalAmount,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: previousBalance + finalAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await cashTransaction.save();
                }
            }

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/purchase-bills/${newBill._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Purchase bill saved successfully!');
                res.redirect('/purchase-bills');
            }
        } catch (error) {
            console.error("Error creating purchase bill:", error);
            req.flash('error', 'Error creating purchase bill');
            res.redirect('/purchase-bills');
        }
    }
});

router.get('/purchase-bills/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { id: billId } = req.params;
            const companyId = req.session.currentCompany;

            // Check if fiscal year is already in the session or available in the company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                // Fetch the fiscal year from the database if available in the session
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            // If no fiscal year is found in session or currentCompany, throw an error
            if (!currentFiscalYear && company.fiscalYear) {
                currentFiscalYear = company.fiscalYear;

                // Set the fiscal year in the session for future requests
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };

                // Assign fiscal year ID for use
                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }

            // Fetch the current company with necessary fields
            const company = await Company.findById(companyId)
                .select('renewalDate fiscalYear dateFormat vatEnabled')
                .populate('fiscalYear');
            const currentCompanyName = req.session.currentCompanyName;

            if (!company) {
                req.flash('error', 'Company not found');
                return res.redirect('/purchase-bills-list');
            }

            const companyDateFormat = company.dateFormat || 'english';
            if (!currentFiscalYear) {
                req.flash('error', 'Fiscal year not found');
                return res.redirect('/purchase-bills-list');
            }

            // Fetch purchase bill
            const purchaseInvoice = await PurchaseBill.findOne({
                _id: billId,
                company: companyId,
                fiscalYear: currentFiscalYear._id,
            })
                .populate({ path: 'items.item' })
                .populate('items.unit')
                .populate('account');

            if (!purchaseInvoice) {
                req.flash('error', 'Purchase invoice not found or does not belong to the selected company');
                return res.redirect('/purchase-bills-list');
            }



            // Fetch accounts grouped by Sundry Debtors and Sundry Creditors
            const parties = await CompanyGroup.find({ name: { $in: ['Cash in Hand', 'Bank Accounts', 'Bank O/D Account'] } }).exec();

            // Convert bank group IDs to an array of ObjectIds
            const partiesIds = parties.map(group => group._id);

            // Fetch accounts excluding 'Cash in Hand' and 'Bank Accounts'
            const accounts = await Account.find({
                company: companyId,
                fiscalYear: fiscalYear,
                isActive: true,
                companyGroups: { $nin: [...partiesIds ? partiesIds : null] }
            }).exec();


            // Fetch items for the company
            const items = await Item.find({ company: companyId })
                .populate('category')
                .populate('unit')
                .populate({
                    path: 'stockEntries',
                    match: { quantity: { $gt: 0 } }, // Only fetch stock entries with remaining quantity
                    select: 'batchNumber expiryDate quantity', // Select only necessary fields
                });

            const selectedAccountId = purchaseInvoice.account ? purchaseInvoice.account._id.toString() : null;

            // Render the edit page with the data
            res.render('wholeseller/purchase/edit', {
                company,
                items: purchaseInvoice.items,
                purchaseInvoice,
                vatEnabled: company.vatEnabled,
                billId: purchaseInvoice._id,
                billNumber: purchaseInvoice.billNumber,
                paymentMode: purchaseInvoice.paymentMode,
                isVatExempt: purchaseInvoice.isVatExempt,
                selectedAccountId,
                accounts,
                selectedAccountAddress: purchaseInvoice.account?.address || '',
                selectedAccountPan: purchaseInvoice.account?.pan || '',
                address: purchaseInvoice.address,
                subTotal: purchaseInvoice.subTotal,
                totalAmount: purchaseInvoice.totalAmount,
                discountPercentage: purchaseInvoice.discountPercentage,
                discountAmount: purchaseInvoice.discountAmount,
                vatPercentage: purchaseInvoice.vatPercentage,
                vatAmount: purchaseInvoice.vatAmount,
                pan: purchaseInvoice.pan,
                currentCompany: company,
                currentCompanyName,
                companyDateFormat,
                currentFiscalYear,
                billDate: purchaseInvoice.date,
                transactionDate: purchaseInvoice.transactionDate,
                user: req.user,
                title: 'Edit Purchase Bill',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
            });
        } catch (error) {
            console.error('Error fetching bill for edit:', error);
            req.flash('error', 'Error fetching bill for edit');
            res.redirect('/purchase-bills-list');
        }
    }
}
);


//router.put logic should be here
router.put('/purchase-bills/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const billId = req.params.id;
        const {
            account,
            items,
            vatPercentage,
            transactionDateRoman,
            transactionDateNepali,
            partyBillNumber,
            billDate,
            nepaliDate,
            isVatExempt,
            discountPercentage,
            paymentMode,
            roundOffAmount: manualRoundOffAmount,
        } = req.body;

        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear.id;
        const userId = req.user._id;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required.' });
        }
        if (!isVatExempt) {
            return res.status(400).json({ error: 'Invalid vat selection.' });
        }
        if (!paymentMode) {
            return res.status(400).json({ error: 'Invalid payment mode.' });
        }

        if (!partyBillNumber) {
            return res.status(400).json({ error: 'Invalid suppliers invoice number.' });
        }

        const accounts = await Account.findOne({ _id: account, company: companyId });
        if (!accounts) {
            return res.status(400).json({ error: 'Invalid account for this company' });
        }

        try {
            // Check if the purchase bill can be edited
            const isEditable = await PurchaseBill.isEditable(billId);

            if (!isEditable) {
                req.flash('error', 'Could not edit, Stock is used!');
                return res.redirect(`/purchase-bills/edit/${billId}`);
            }

            const existingBill = await PurchaseBill.findOne({ _id: billId, company: companyId });
            if (!existingBill) {
                req.flash('error', 'Purchase not found');
                return res.redirect('/purchase-bills-list');
            }

            try {
                for (const existingItem of existingBill.items) {
                    const product = await Item.findById(existingItem.item);

                    // Filter out the specific batch entry to completely remove it
                    product.stockEntries = product.stockEntries.filter(entry => entry.batchNumber !== existingItem.batchNumber);

                    // Recalculate the product's stock based on the remaining entries
                    product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);

                    await product.save(); // Save the updated product
                }
                console.log('Stock successfully reversed for existing bill items.');
            } catch (e) {
                console.error('Error during purchase bill update:', error.message);
                req.flash('error', 'An error occurred while updating the purchase bill.');
                res.redirect(`/purchase-bills/edit/${billId}`);
            }
            // Delete all associated transactions
            await Transaction.deleteMany({ purchaseBillId: billId });
            console.log('Existing transactions deleted successfully');

            // Calculate amounts based on the updated POST route logic
            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;

            for (const item of items) {
                const product = await Item.findById(item.item);
                if (product.vatStatus) {
                    totalTaxableAmount += item.quantity * item.puPrice;
                } else {
                    totalNonTaxableAmount += item.quantity * item.puPrice;
                }
            }

            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            let vatAmount = 0;
            if (!isVatExemptBool || isVatExempt === 'all') {
                vatAmount = (finalTaxableAmount * vatPercentage) / 100;
            }

            const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

            let finalAmount = totalAmount;
            let roundOffAmount = 0;

            const roundOffForPurchase = await Settings.findOne({ companyId, userId, fiscalYear: currentFiscalYear, }) || { roundOffPurchase: false };

            if (roundOffForPurchase.roundOffPurchase) {
                finalAmount = Math.round(finalAmount.toFixed(2));
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForPurchase.roundOffPurchase) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Update existing bill
            existingBill.account = account;
            existingBill.isVatExempt = isVatExemptBool;
            existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
            existingBill.partyBillNumber = partyBillNumber;
            existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
            existingBill.discountPercentage = discount;
            existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
            existingBill.nonVatSales = finalNonTaxableAmount;
            existingBill.taxableAmount = finalTaxableAmount;
            existingBill.vatAmount = vatAmount;
            existingBill.isVatAll = isVatAll;
            existingBill.totalAmount = finalAmount;
            existingBill.roundOffAmount = roundOffAmount;
            existingBill.paymentMode = paymentMode;
            existingBill.date = nepaliDate || new Date(billDate);
            existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

            //FIFO stock addition function
            async function addStock(product, batchNumber, expiryDate, quantity, price, puPrice, marginPercentage, mrp) {
                // Ensure quantity is treated as a number
                const quantityNumber = Number(quantity);

                const stockEntry = {
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    quantity: quantityNumber,
                    batchNumber: batchNumber,
                    expiryDate: expiryDate,
                    price: price,
                    puPrice: puPrice,
                    mrp: mrp,
                    marginPercentage: marginPercentage,
                };


                // Debug: log stock entry to ensure values are correct
                console.log('Stock Entry:', stockEntry);
                product.stockEntries.push(stockEntry); // Add entry to stockEntries array
                // Ensure stock is incremented correctly as a number
                product.stock = (product.stock || 0) + quantityNumber;
                await product.save();
            }

            const billItems = await Promise.all(items.map(async item => {
                const product = await Item.findById(item.item);

                // Increment stock quantity using FIFO
                await addStock(product, item.batchNumber, item.expiryDate, item.quantity, item.price, item.puPrice, item.marginPercentage, item.mrp);

                return {
                    item: product._id,
                    quantity: item.quantity,
                    price: item.price,
                    puPrice: item.puPrice,
                    unit: item.unit,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: currentFiscalYear,
                };
            }));

            existingBill.items = billItems;

            // After updating the existingBill.items, reinserting transactions
            const billItemsTransactions = await Promise.all(existingBill.items.map(async item => {
                const product = await Item.findById(item.item);

                if (!product) {
                    throw new Error(`Product with ID ${item.item} not found`);
                }

                // Create a transaction for each item
                const transaction = new Transaction({
                    item: product._id,
                    account: account,
                    billNumber: existingBill.billNumber,
                    partyBillNumber: existingBill.partyBillNumber,
                    quantity: item.quantity,
                    puPrice: item.puPrice,
                    unit: item.unit,
                    isType: 'Purc',
                    type: 'Purc',
                    purchaseBillId: existingBill._id,
                    purchaseSalesType: 'Purchase',
                    debit: 0, // Update as per your logic
                    credit: finalAmount, // Since it's a sale
                    paymentMode: paymentMode,
                    balance: 0, // Update with the correct balance logic if needed
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear
                });
                await transaction.save();
                console.log('Transaction created:', transaction);

                return transaction; // Optional, if you need to track the transactions created
            }));


            // Create a transaction for the default Purchase Account
            const purchaseAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (purchaseAmount > 0) {
                const purchaseAccount = await Account.findOne({ name: 'Purchase', company: companyId });
                if (purchaseAccount) {
                    const partyAccount = await Account.findById(account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const purchaseTransaction = new Transaction({
                        account: purchaseAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        type: 'Purc',
                        purchaseBillId: existingBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: purchaseAmount,  // Debit the VAT account
                        credit: 0,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: 0, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await purchaseTransaction.save();
                    console.log('Purchase Transaction: ', purchaseTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
                if (vatAccount) {
                    const partyAccount = await Account.findById(existingBill.account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'VAT',
                        type: 'Purc',
                        purchaseBillId: existingBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: vatAmount,  // Debit the VAT account
                        credit: 0,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: 0, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save();
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }


            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'RoundOff',
                        type: 'Purc',
                        purchaseBillId: existingBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: roundOffAmount,  // Debit the VAT account
                        credit: 0,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: 0, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save();
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(account); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'RoundOff',
                        type: 'Purc',
                        purchaseBillId: existingBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: Math.abs(roundOffAmount), // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: 0, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save();
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            console.log('All transactions successfully created for updated bill.');

            await existingBill.save();
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId });

                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        item: product._id,
                        account: cashAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'Purc',
                        type: 'Purc',
                        purchaseBillId: existingBill._id,
                        partyBillNumber: existingBill.partyBillNumber,
                        purchaseSalesType: 'Purchase',
                        debit: finalAmount, // The cash amount received
                        credit: 0,
                        paymentMode: paymentMode,
                        balance: 0, // Adjust with the correct balance logic
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await cashTransaction.save();
                    console.log('Cash transaction created:', cashTransaction);
                }
            }

            // req.flash('success', 'Purchase updated successfully');
            // res.redirect(`/purchase-bills/edit/${billId}`);

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/purchase-bills/${existingBill._id}/edit/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Purchase updated successfully.');
                res.redirect(`/purchase-bills/edit/${billId}`);
            }

        } catch (error) {
            console.error('Error during purchase bill update:', error.message);
            req.flash('error', 'An error occurred while updating the purchase bill.');
            res.redirect(`/purchase-bills/edit/${billId}`);
        }
    }

})


router.get('/purchase-bills/:id/print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const currentCompanyName = req.session.currentCompanyName;
        const companyId = req.session.currentCompany;
        console.log("Company ID from session:", companyId); // Debugging line
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // const { selectedDate } = req.query; // Assume selectedDate is passed as a query parameter



        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }


        // Validate the selectedDate
        if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
            throw new Error('Invalid date provided');
        }

        try {
            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            const purchaseBillId = req.params.id;
            const bill = await PurchaseBill.findById(purchaseBillId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/purchase-bills');
            }

            // Populate unit for each item in the bill
            for (const item of bill.items) {
                await item.item.populate('unit');
            }

            const firstBill = !bill.firstPrinted; // Inverse logic based on your implementation

            if (firstBill) {
                bill.firstPrinted = true;
                await bill.save();
            }
            let finalBalance = null;
            let balanceLabel = '';

            // Fetch the latest transaction for the current company and bill
            if (bill.paymentMode === 'credit') {
                const latestTransaction = await Transaction.findOne({
                    company: new ObjectId(companyId),
                    purchaseBillId: new ObjectId(purchaseBillId)
                }).sort({ transactionDate: -1 });

                let lastBalance = 0;

                // Calculate the last balance based on the latest transaction
                if (latestTransaction) {
                    lastBalance = Math.abs(latestTransaction.balance || 0); // Ensure balance is positive

                    // Determine if the amount is receivable (dr) or payable (cr)
                    if (latestTransaction.debit) {
                        balanceLabel = 'Dr'; // Receivable amount
                    } else if (latestTransaction.credit) {
                        balanceLabel = 'Cr'; // Payable amount
                    }
                }

                // Retrieve the opening balance from the account
                const openingBalance = bill.account ? bill.account.openingBalance : null;

                // Add opening balance if it exists
                if (openingBalance) {
                    lastBalance += (openingBalance.type === 'Dr' ? openingBalance.amount : -openingBalance.amount);
                    balanceLabel = openingBalance.type;
                }

                finalBalance = lastBalance;
            }

            res.render('wholeseller/purchase/print', {
                company,
                currentFiscalYear,
                bill,
                currentCompanyName,
                currentCompany,
                firstBill,
                lastBalance: finalBalance,
                balanceLabel,
                paymentMode: bill.paymentMode, // Pass paymentMode to the view if needed
                nepaliDate,
                transactionDateNepali,
                englishDate: bill.englishDate,
                companyDateFormat,
                title: 'Purchase Bill Print',
                body: 'wholeseller >> purchase >> print',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/purchase-bills-list');
        }
    }
});

//for direct print purchase:
router.get('/purchase-bills/:id/direct-print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const currentCompanyName = req.session.currentCompanyName;
        const companyId = req.session.currentCompany;
        console.log("Company ID from session:", companyId); // Debugging line

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }
        // Validate the selectedDate
        if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
            throw new Error('Invalid date provided');
        }

        try {
            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            const purchaseBillId = req.params.id;
            const bill = await PurchaseBill.findById(purchaseBillId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/purchase-bills');
            }

            // Populate unit for each item in the bill
            for (const item of bill.items) {
                await item.item.populate('unit');
            }

            const firstBill = !bill.firstPrinted; // Inverse logic based on your implementation

            if (firstBill) {
                bill.firstPrinted = true;
                await bill.save();
            }
            let finalBalance = null;
            let balanceLabel = '';

            // Fetch the latest transaction for the current company and bill
            if (bill.paymentMode === 'credit') {
                const latestTransaction = await Transaction.findOne({
                    company: new ObjectId(companyId),
                    purchaseBillId: new ObjectId(purchaseBillId)
                }).sort({ transactionDate: -1 });

                let lastBalance = 0;

                // Calculate the last balance based on the latest transaction
                if (latestTransaction) {
                    lastBalance = Math.abs(latestTransaction.balance || 0); // Ensure balance is positive

                    // Determine if the amount is receivable (dr) or payable (cr)
                    if (latestTransaction.debit) {
                        balanceLabel = 'Dr'; // Receivable amount
                    } else if (latestTransaction.credit) {
                        balanceLabel = 'Cr'; // Payable amount
                    }
                }

                // Retrieve the opening balance from the account
                const openingBalance = bill.account ? bill.account.openingBalance : null;

                // Add opening balance if it exists
                if (openingBalance) {
                    lastBalance += (openingBalance.type === 'Dr' ? openingBalance.amount : -openingBalance.amount);
                    balanceLabel = openingBalance.type;
                }

                finalBalance = lastBalance;
            }

            res.render('wholeseller/purchase/directPrint', {
                company,
                currentFiscalYear,
                bill,
                currentCompanyName,
                currentCompany,
                firstBill,
                lastBalance: finalBalance,
                balanceLabel,
                paymentMode: bill.paymentMode, // Pass paymentMode to the view if needed
                nepaliDate,
                englishDate: bill.englishDate,
                companyDateFormat,
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/purchase-bills-list');
        }
    }
});


//for direct print after purchase edit:
router.get('/purchase-bills/:id/edit/direct-print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const currentCompanyName = req.session.currentCompanyName;
        const companyId = req.session.currentCompany;
        console.log("Company ID from session:", companyId); // Debugging line

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }
        // Validate the selectedDate
        if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
            throw new Error('Invalid date provided');
        }

        try {
            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            const purchaseBillId = req.params.id;
            const bill = await PurchaseBill.findById(purchaseBillId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/purchase-bills');
            }

            // Populate unit for each item in the bill
            for (const item of bill.items) {
                await item.item.populate('unit');
            }

            const firstBill = !bill.firstPrinted; // Inverse logic based on your implementation

            if (firstBill) {
                bill.firstPrinted = true;
                await bill.save();
            }
            let finalBalance = null;
            let balanceLabel = '';

            // Fetch the latest transaction for the current company and bill
            if (bill.paymentMode === 'credit') {
                const latestTransaction = await Transaction.findOne({
                    company: new ObjectId(companyId),
                    purchaseBillId: new ObjectId(purchaseBillId)
                }).sort({ transactionDate: -1 });

                let lastBalance = 0;

                // Calculate the last balance based on the latest transaction
                if (latestTransaction) {
                    lastBalance = Math.abs(latestTransaction.balance || 0); // Ensure balance is positive

                    // Determine if the amount is receivable (dr) or payable (cr)
                    if (latestTransaction.debit) {
                        balanceLabel = 'Dr'; // Receivable amount
                    } else if (latestTransaction.credit) {
                        balanceLabel = 'Cr'; // Payable amount
                    }
                }

                // Retrieve the opening balance from the account
                const openingBalance = bill.account ? bill.account.openingBalance : null;

                // Add opening balance if it exists
                if (openingBalance) {
                    lastBalance += (openingBalance.type === 'Dr' ? openingBalance.amount : -openingBalance.amount);
                    balanceLabel = openingBalance.type;
                }

                finalBalance = lastBalance;
            }

            res.render('wholeseller/purchase/directPrintEdit', {
                company,
                currentFiscalYear,
                bill,
                currentCompanyName,
                currentCompany,
                firstBill,
                lastBalance: finalBalance,
                balanceLabel,
                paymentMode: bill.paymentMode, // Pass paymentMode to the view if needed
                nepaliDate,
                englishDate: bill.englishDate,
                companyDateFormat,
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/purchase-bills-list');
        }
    }
});


router.get('/purchase-vat-report', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : '';

        // Extract dates from query parameters
        let fromDate = req.query.fromDate ? req.query.fromDate : null;
        let toDate = req.query.toDate ? req.query.toDate : null;

        // Log the query parameters
        console.log('Query Parameters:', req.query);

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        if (!fromDate || !toDate) {
            return res.render('wholeseller/purchase/purchaseVatReport', {
                company,
                currentFiscalYear,
                companyDateFormat,
                nepaliDate,
                currentCompany,
                purchaseVatReport: '',
                fromDate: req.query.fromDate || '',
                toDate: req.query.toDate || '',
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        }

        // Build the query to filter transactions within the date range
        let query = { company: companyId };

        if (fromDate && toDate) {
            query.date = { $gte: fromDate, $lte: toDate };
        } else if (fromDate) {
            query.date = { $gte: fromDate };
        } else if (toDate) {
            query.date = { $lte: toDate };
        }

        const Bills = await PurchaseBill.find(query).populate('account').sort({ date: 1 });

        // Prepare VAT report data
        const purchaseVatReport = await Promise.all(Bills.map(async bill => {
            const account = await Account.findById(bill.account);
            return {
                company,
                currentFiscalYear,
                billNumber: bill.billNumber,
                date: bill.date,
                account: account.name,
                panNumber: account.pan,
                totalAmount: bill.totalAmount,
                discountAmount: bill.discountAmount,
                nonVatPurchase: bill.nonVatPurchase,
                taxableAmount: bill.taxableAmount,
                vatAmount: bill.vatAmount,
            };
        }));

        res.render('wholeseller/purchase/purchaseVatReport', {
            company,
            currentFiscalYear,
            purchaseVatReport,
            companyDateFormat,
            nepaliDate,
            currentCompany,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            currentCompanyName,
            title: 'Statement',
            body: 'wholeseller >> report >> statement',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } else {
        res.status(403).send('Access denied');
    }
});

module.exports = router;