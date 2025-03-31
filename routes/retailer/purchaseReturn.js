const express = require('express');
const router = express.Router();

//npm install pdfkit fs
const PDFDocument = require('pdfkit');
//npm install pdfkit fs

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Item = require('../../models/retailer/Item');
const PurchaseReturn = require('../../models/retailer/PurchaseReturns');
const Transaction = require('../../models/retailer/Transaction');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
// const BillCounter = require('../../models/retailer/purchaseReturnBillCounter');
const Account = require('../../models/retailer/Account');
const Settings = require('../../models/retailer/Settings');
const Company = require('../../models/retailer/Company');
const NepaliDate = require('nepali-date');
const { ensureTradeType } = require('../../middleware/tradeType');
const PurchaseBill = require('../../models/retailer/PurchaseBill');
const FiscalYear = require('../../models/retailer/FiscalYear');
const BillCounter = require('../../models/retailer/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');
const CompanyGroup = require('../../models/retailer/CompanyGroup');
const PurchaseReturns = require('../../models/retailer/PurchaseReturns');

// Fetch all purchase bills
router.get('/purchase-return/list', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

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


        const bills = await PurchaseReturn.find({ company: companyId }).populate('account').populate('items.item').populate('user');
        res.render('retailer/purchaseReturn/allPurchaseReturn', {
            company,
            currentFiscalYear,
            bills,
            currentCompany,
            currentCompanyName,
            user: req.user,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});


router.get("/api/accounts", async (req, res) => {
    try {
        const companyId = req.session.currentCompany;

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

        // Fetch only the required company groups: Cash in Hand, Sundry Debtors, Sundry Creditors
        const relevantGroups = await CompanyGroup.find({
            name: { $in: ['Cash in Hand', 'Sundry Debtors', 'Sundry Creditors'] }
        }).exec();

        // Convert relevant group IDs to an array of ObjectIds
        const relevantGroupIds = relevantGroups.map(group => group._id);

        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            isActive: true,
            companyGroups: { $in: relevantGroupIds }
        });
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch accounts" });
    }
});


// Purchase Return Bill routes
router.get('/purchase-return', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const items = await Item.find({ company: companyId }).populate('category').populate('unit');
        const bills = await PurchaseReturn.find({ company: companyId }).populate('account').populate('items.item');
        const purchaseInvoice = await PurchaseBill.find({ company: companyId });
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
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

        // const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear });

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
        // Get the next bill number
        // const billCounter = await BillCounter.findOne({ company: companyId });
        // const nextBillNumber = billCounter ? billCounter.count + 1 : 1;

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'PurchaseReturn' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }
        res.render('retailer/purchaseReturn/purchaseReturnEntry', {
            company, accounts: accounts, items: items, bills: bills, nextBillNumber: nextBillNumber,
            nepaliDate: nepaliDate, transactionDateNepali, companyDateFormat, purchaseInvoice,
            user: req.user, currentCompanyName: req.session.currentCompanyName, currentFiscalYear,
            vatEnabled: company.vatEnabled,
            user: req.user,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});


router.get('/purchase-return/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
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

        res.render('retailer/purchaseReturn/billNumberForm', {
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



router.get('/purchase-return/edit/billNumber', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
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


        const purchaseReturn = await PurchaseReturns.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('items.item')
            .populate('items.unit')
            .populate('account')
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details

        if (!purchaseReturn || !purchaseReturn.items) {
            req.flash('error', 'Purchase return voucher not found!');
            return res.redirect('/purchase-return/finds')
        }

        res.render('retailer/purchaseReturn/edit', {
            purchaseReturn,
            accounts,
            items: purchaseReturn.items,
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


// POST route to handle sales bill creation
router.post('/purchase-return', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { accountId, items, vatPercentage, transactionDateRoman, transactionDateNepali, billDate, partyBillNumber, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount, } = req.body;
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
            const currentFiscalYear = req.session.currentFiscalYear.id
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

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
                req.flash('error', `Company ID is required.`);
                await session.abortTransaction();
                return res.redirect(`/purchase-return`);
            }
            if (!isVatExempt) {
                req.flash('error', `Invalid vat selection.`);
                await session.abortTransaction();
                return res.redirect(`/purchase-return`);
            }
            if (!paymentMode) {
                req.flash('error', `Invalid payment mode.`);
                await session.abortTransaction();
                return res.redirect(`/purchase-return`);
            }
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
            if (companyDateFormat === 'nepali') {
                if (!transactionDateNepali) {
                    req.flash('error', `Invalid transaction date.`);
                    await session.abortTransaction();
                    return res.redirect(`/purchase-return`);
                }
                if (!nepaliDate) {
                    req.flash('error', `Invalid invoice date.`);
                    await session.abortTransaction();
                    return res.redirect(`/purchase-return`);
                }
            } else {
                if (!transactionDateRoman) {
                    req.flash('error', `Invalid transaction date.`);
                    await session.abortTransaction();
                    return res.redirect(`/purchase-return`);
                }
                if (!billDate) {
                    req.flash('error', `Invalid invoice date.`);
                    await session.abortTransaction();
                    return res.redirect(`/purchase-return`);
                }
            }
            const accounts = await Account.findOne({ _id: accountId, company: companyId }).session(session);
            if (!accounts) {
                req.flash('error', `Invalid account for this company`);
                await session.abortTransaction();
                return res.redirect('/purchase-return');
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-return');
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
                // Find the specific batch entry
                const batchEntry = product.stockEntries.find(entry => entry.batchNumber === item.batchNumber && entry.uniqueUuId === item.uniqueUuId);
                if (!batchEntry) {
                    req.flash('error', `Batch number ${item.batchNumber} not found for item: ${product.name}`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-return');
                }
                // Check stock quantity using FIFO
                // const availableStock = product.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
                // if (availableStock < item.quantity) {
                //     req.flash('error', `Not enough stock for item: ${product.name}. Available: ${availableStock}, Required: ${item.quantity}`);
                //     await session.abortTransaction();
                //     return res.redirect('/purchase-return');
                // }
                // Check if the batch has enough stock
                if (batchEntry.quantity < item.quantity) {
                    req.flash('error', `Not enough stock in batch ${item.batchNumber} for item: ${product.name}. Available: ${batchEntry.quantity}, Required: ${item.quantity}`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-return');
                }
            }

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    await session.abortTransaction();
                    return res.redirect('/purchase-return');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    await session.abortTransaction();
                    return res.redirect('/purchase-return');
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
            const roundOffForPurchaseReturn = await Settings.findOne({ companyId, userId }).session(session); // Assuming you have a single settings document

            // Handle case where settings is null
            if (!roundOffForPurchaseReturn) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForPurchaseReturn = { roundOffPurchaseReturn: false }; // Provide default settings or handle as needed
            }
            let roundOffAmount = 0;
            if (roundOffForPurchaseReturn.roundOffPurchaseReturn) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForPurchaseReturn.roundOffPurchaseReturn) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }
            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'PurchaseReturn');

            // Create new bill
            const newBill = new PurchaseReturn({
                // billNumber: billCounter.count,
                billNumber: billNumber,
                partyBillNumber: partyBillNumber,
                account: accountId,
                purchaseSalesReturnType: 'Purchase Return',
                items: [], // We'll update this later
                isVatExempt: isVatExemptBool,
                isVatAll,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatPurchaseReturn: finalNonTaxableAmount,
                taxableAmount: finalTaxableAmount,
                vatAmount,
                totalAmount: finalAmount,
                roundOffAmount: roundOffAmount,
                paymentMode,
                date: nepaliDate ? nepaliDate : new Date(billDate),
                transactionDate: transactionDateNepali ? transactionDateNepali : new Date(transactionDateRoman),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,

            });

            // Create transactions
            let previousBalance = 0;
            const accountTransaction = await Transaction.findOne({ account: accountId }).sort({ transactionDate: -1 });
            if (accountTransaction) {
                previousBalance = accountTransaction.balance;
            }

            async function reduceStockBatchWise(product, batchNumber, quantity, uniqueUuId) {
                let remainingQuantity = quantity;

                // Find all batch entries with the specific batch number
                const batchEntries = product.stockEntries.filter(entry => entry.batchNumber === batchNumber);

                if (batchEntries.length === 0) {
                    throw new Error(`Batch number ${batchNumber} not found for product: ${product.name}`);
                }

                // Find the specific stock entry using uniqueUuId
                const selectedBatchEntry = batchEntries.find(entry => entry.uniqueUuId === uniqueUuId);

                if (!selectedBatchEntry) {
                    throw new Error(`Selected stock entry with ID ${uniqueUuId} not found for batch number ${batchNumber}`);
                }

                // Reduce stock for the selected batch entry
                if (selectedBatchEntry.quantity <= remainingQuantity) {
                    remainingQuantity -= selectedBatchEntry.quantity;
                    selectedBatchEntry.quantity = 0; // All stock from this batch is used
                } else {
                    selectedBatchEntry.quantity -= remainingQuantity;
                    remainingQuantity = 0; // Stock is fully reduced for this batch
                }

                if (remainingQuantity > 0) {
                    throw new Error(`Not enough stock in the selected stock entry for batch number ${batchNumber} of product: ${product.name}`);
                }

                // Save the product with the updated stock entries
                await product.save();
            }

            // **Updated processing for billItems to allow multiple entries of the same item**
            const billItems = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-return');
                }

                // Create the transaction for this item
                const transaction = new Transaction({
                    item: product._id,
                    account: accountId,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    partyBillNumber: partyBillNumber,
                    quantity: item.quantity,
                    puPrice: item.puPrice,
                    unit: item.unit,  // Include the unit field                    type: 'Sale',
                    purchaseReturnBillId: newBill._id,  // Set billId to the new bill's ID
                    purchaseSalesReturnType: 'Purchase Return',
                    isType: 'PrRt',
                    type: 'PrRt',
                    debit: finalAmount,  // Set debit to the item's total amount
                    credit: 0,        // Credit is 0 for sales transactions
                    paymentMode: paymentMode,
                    balance: previousBalance - finalAmount, // Update the balance based on item total
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,

                });

                await transaction.save();
                console.log('Transaction', transaction);

                // Assuming reduceStockBatchWise is called here
                await reduceStockBatchWise(product, item.batchNumber, item.quantity, item.uniqueUuId);

                product.stock -= item.quantity;
                await product.save();

                billItems.push({
                    item: product._id,
                    quantity: item.quantity,
                    price: item.price,
                    puPrice: item.puPrice,
                    unit: item.unit,
                    batchNumber: item.batchNumber,  // Add batch number
                    expiryDate: item.expiryDate,  // Add expiry date
                    vatStatus: product.vatStatus,
                    fiscalYear: fiscalYearId,
                    uniqueUuId: item.uniqueUuId,
                });
            }
            // Create a transaction for the default Purchase Account
            const purchaseRtnAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (purchaseRtnAmount > 0) {
                const purchaseRtnAccount = await Account.findOne({ name: 'Purchase', company: companyId });
                if (purchaseRtnAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const purchaseRtnTransaction = new Transaction({
                        account: purchaseRtnAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        type: 'PrRt',
                        purchaseReturnBillId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: purchaseRtnAmount,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + purchaseRtnAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await purchaseRtnTransaction.save();
                    console.log('Purchase Return Transaction: ', purchaseRtnTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
                if (vatAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        isType: 'VAT',
                        type: 'PrRt',
                        purchaseReturnBillId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: vatAmount,         // Credit is 0 for VAT transactions
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
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        isType: 'RoundOff',
                        type: 'PrRt',
                        purchaseReturnBillId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
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
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        partyBillNumber,
                        isType: 'RoundOff',
                        type: 'PrRt',
                        purchaseReturnBillId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
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
                        partyBillNumber: partyBillNumber,
                        isType: 'PrRt',
                        type: 'PrRt',
                        purchaseReturnBillId: newBill._id,  // Set billId to the new bill's ID
                        purchaseSalesReturnType: 'Purchase Return',
                        debit: finalAmount,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: 0,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: previousBalance + finalAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear,
                    });
                    await cashTransaction.save();
                }
            }
            // Update bill with items
            newBill.items = billItems;
            console.log('New Bill', newBill);
            console.log('billItems', billItems);
            await newBill.save({ session });
            // If everything goes smoothly, commit the transaction
            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/purchase-return/${newBill._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Purchase return saved successfully!');
                res.redirect('/purchase-return');
            }
        } catch (error) {
            console.error("Error creating bill:", error);
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'Error creating bill');
            res.redirect('/purchase-return');
        }
    }
});


// GET route to render the edit page for a purchase return
router.get('/purchase-return/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const billId = req.params.id;
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
            const currentCompanyName = req.session.currentCompanyName;
            const currentCompany = await Company.findById(new ObjectId(companyId));
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
            const today = new Date();
            console.log(company.renewalDate); // Debugging to see if renewalDate exists

            const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object


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

            // Find the bill by ID and populate relevant data
            const purchaseReturn = await PurchaseReturn.findById({ _id: billId, company: companyId, fiscalYear: fiscalYear })
                .populate('items.item')
                .populate('items.unit')
                .populate('account')
                .exec();
            if (!purchaseReturn) {
                req.flash('error', 'Bill not found or does not belong to the selected company');
                return res.redirect('/purchase-return/list');
            }

            console.log('Bill Account:', purchaseReturn.account);

            // Ensure selectedAccountId is set to the ID of the account linked to the purchaseReturn
            const selectedAccountId = purchaseReturn.account ? purchaseReturn.account._id.toString() : null;

            console.log('Fetched Accounts:', accounts);
            console.log('Fetched Bill:', purchaseReturn);
            console.log('Selected Account ID:', selectedAccountId);

            // Render the edit page with the bill data
            res.render('retailer/purchaseReturn/edit', {
                company,
                items: purchaseReturn.items,
                purchaseReturn,
                vatEnabled: company.vatEnabled,
                billId: purchaseReturn._id,
                billNumber: purchaseReturn.billNumber,
                paymentMode: purchaseReturn.paymentMode,
                isVatExempt: purchaseReturn.isVatExempt, // Pass isVatExempt to the template
                selectedAccountId: selectedAccountId, // Updated line
                accounts: accounts, // Pass accounts to the template
                selectedAccountId: accounts, // Add selected account ID if needed
                selectedAccountAddress: selectedAccountId.address || '',
                selectedAccountPan: selectedAccountId.pan || '',
                address: purchaseReturn.address,
                subTotal: purchaseReturn.subTotal,
                totalAmount: purchaseReturn.totalAmount,
                discountPercentage: purchaseReturn.discountPercentage,
                discountAmount: purchaseReturn.discountAmount,
                taxableAmount: purchaseReturn.taxableAmount,
                vatPercentage: purchaseReturn.vatPercentage,
                vatAmount: purchaseReturn.vatAmount,
                pan: purchaseReturn.pan,
                currentCompany,
                currentCompanyName,
                companyDateFormat,
                initialCurrentFiscalYear,
                currentFiscalYear,
                billDate: purchaseReturn.date,
                transactionDate: purchaseReturn.transactionDate,
                user: req.user,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });


        } catch (error) {
            console.error("Error fetching bill for edit:", error);
            req.flash('error', 'Error fetching bill for edit');
            res.redirect('/purchase-return/list');
        }
    }
});

// router.put('/purchase-return/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
//     if (req.tradeType === 'retailer') {
//         const session = await mongoose.startSession();
//         session.startTransaction();
//         const billId = req.params.id;

//         const { accountId, items, vatPercentage, transactionDateRoman, transactionDateNepali, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, partyBillNumber, roundOffAmount: manualRoundOffAmount, } = req.body;
//         const companyId = req.session.currentCompany;
//         const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
//         const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
//         const currentFiscalYear = req.session.currentFiscalYear.id;
//         const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
//         const userId = req.user._id;

//         if (!companyId) {
//             req.flash('error', `Company ID is required.`);
//             // await session.abortTransaction();
//             return res.redirect(`/purchase-return/edit/${billId}`);
//         }
//         if (!isVatExempt) {
//             req.flash('error', `Invalid vat selection.`);
//             // await session.abortTransaction();
//             return res.redirect(`/purchase-return/edit/${billId}`);
//         }
//         if (!paymentMode) {
//             req.flash('error', `Invalid payment mode.`);
//             // await session.abortTransaction();
//             return res.redirect(`/purchase-return/edit/${billId}`);
//         }

//         if (companyDateFormat === 'nepali') {
//             if (!transactionDateNepali) {
//                 req.flash('error', `Invalid transaction date.`);
//                 // await session.abortTransaction();
//                 return res.redirect(`/purchase-return/edit/${billId}`);
//             }
//             if (!nepaliDate) {
//                 req.flash('error', `Invalid invoice date.`);
//                 // await session.abortTransaction();
//                 return res.redirect(`/purchase-return/edit/${billId}`);
//             }
//         } else {
//             if (!transactionDateRoman) {
//                 req.flash('error', `Invalid transaction date.`);
//                 // await session.abortTransaction();
//                 return res.redirect(`/purchase-return/edit/${billId}`);
//             }
//             if (!billDate) {
//                 req.flash('error', `Invalid invoice date.`);
//                 // await session.abortTransaction();
//                 return res.redirect(`/purchase-return/edit/${billId}`);
//             }
//         }

//         const accounts = await Account.findOne({ _id: accountId, company: companyId });
//         if (!accounts) {
//             req.flash('error', `Invalid account for this company`);
//             // await session.abortTransaction();
//             return res.redirect(`/purchase-return/edit/${billId}`);
//         }

//         try {
//             const existingBill = await PurchaseReturn.findOne({ _id: billId, company: companyId });
//             if (!existingBill) {
//                 req.flash('error', 'Purchase return not found!');
//                 return res.redirect('/purchase-return/list');
//             }

//             // Step 1: Validate New Quantities BEFORE Reversing Old Stock
//             for (let i = 0; i < items.length; i++) {
//                 const item = items[i];
//                 const product = await Item.findById(item.item);

//                 if (!product) {
//                     req.flash('error', `Item with ID ${item.item} not found`);
//                     return res.redirect(`/purchase-return/edit/${billId}`);
//                 }

//                 // Calculate current stock availability
//                 const availableStock = product.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);

//                 // Find the existing item from the bill
//                 const existingItem = existingBill.items.find(existing => existing.item.toString() === item.item.toString());

//                 let previousQuantity = existingItem ? existingItem.quantity : 0; // Stock being reversed
//                 let potentialStockAfterReversal = availableStock + previousQuantity; // Simulated stock after reversal

//                 // If the new requested quantity is more than what would be available, do NOT allow reversal
//                 if (potentialStockAfterReversal < item.quantity) {
//                     req.flash('error', `Not enough stock for item: ${product.name}. Available: ${availableStock}, Required: ${item.quantity}`);
//                     return res.redirect(`/purchase-return/edit/${billId}`);
//                 }
//             }

//             // Step 2: Reverse stock for existing bill items (Only if all validations pass)
//             for (const existingItem of existingBill.items) {
//                 const product = await Item.findById(existingItem.item);
//                 const batchEntry = product.stockEntries.find(entry => entry.batchNumber === existingItem.batchNumber);

//                 if (batchEntry) {
//                     batchEntry.quantity += existingItem.quantity; // Restore stock
//                 } else {
//                     console.warn(`Batch number ${existingItem.batchNumber} not found for product: ${product.name}`);
//                 }

//                 await product.save(); // Save updated stock
//             }

//             console.log('Stock successfully reversed for existing bill items.');

//             // Delete removed items from the PurchaseBill
//             existingBill.items = existingBill.items.filter(existingItem => {
//                 return items.some(item =>
//                     item.item.toString() === existingItem.item.toString());
//             });

//             // Delete all associated transactions
//             await Transaction.deleteMany({ purchaseReturnBillId: billId });
//             console.log('Existing transactions deleted successfully');

//             // Calculate amounts based on the updated POST route logic
//             const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
//             const isVatAll = isVatExempt === 'all';
//             const discount = parseFloat(discountPercentage) || 0;

//             let subTotal = 0;
//             let vatAmount = 0;
//             let totalTaxableAmount = 0;
//             let totalNonTaxableAmount = 0;
//             let hasVatableItems = false;
//             let hasNonVatableItems = false;

//             // Validate each item before processing
//             for (let i = 0; i < items.length; i++) {
//                 const item = items[i];
//                 const product = await Item.findById(item.item);

//                 if (!product) {
//                     req.flash('error', `Item with id ${item.item} not found`);
//                     return res.redirect('/purchase-return');
//                 }

//                 const itemTotal = parseFloat(item.puPrice) * parseFloat(item.quantity, 10);
//                 subTotal += itemTotal;

//                 if (product.vatStatus === 'vatable') {
//                     hasVatableItems = true;
//                     totalTaxableAmount += itemTotal;
//                 } else {
//                     hasNonVatableItems = true;
//                     totalNonTaxableAmount += itemTotal;
//                 }

//                 // // Find the specific batch entry
//                 // const batchEntry = product.stockEntries.find(entry => entry.batchNumber === item.batchNumber);
//                 // if (!batchEntry) {
//                 //     req.flash('error', `Batch number ${item.batchNumber} not found for item: ${product.name}`);
//                 //     // await session.abortTransaction();
//                 //     return res.redirect('/purchase-return');
//                 // }
//                 // // Check if the batch has enough stock
//                 // if (batchEntry.quantity < item.quantity) {
//                 //     req.flash('error', `Not enough stock in batch ${item.batchNumber} for item: ${product.name}. Available: ${batchEntry.quantity}, Required: ${item.quantity}`);
//                 //     // await session.abortTransaction();
//                 //     return res.redirect('/purchase-return');
//                 // }
//             }

//             // Check validation conditions after processing all items
//             if (isVatExempt !== 'all') {
//                 if (isVatExemptBool && hasVatableItems) {
//                     req.flash('error', 'Cannot save VAT exempt bill with vatable items');
//                     // await session.abortTransaction();
//                     return res.redirect(`/purchase-return/edit/${billId}`);
//                 }

//                 if (!isVatExemptBool && hasNonVatableItems) {
//                     req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
//                     // await session.abortTransaction();
//                     return res.redirect(`/purchase-return/edit/${billId}`);
//                 }
//             }

//             // Apply discount proportionally to vatable and non-vatable items
//             const discountForTaxable = (totalTaxableAmount * discount) / 100;
//             const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

//             const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
//             const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

//             // Calculate VAT only for vatable items
//             if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
//                 vatAmount = (finalTaxableAmount * vatPercentage) / 100;
//             } else {
//                 vatAmount = 0;
//             }

//             let totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;
//             let finalAmount = totalAmount;

//             // Check if round off is enabled in settings
//             const roundOffForPurchaseReturn = await Settings.findOne({ companyId, userId }); // Assuming you have a single settings document

//             // Handle case where settings is null
//             if (!roundOffForPurchaseReturn) {
//                 console.log('No settings found, using default settings or handling as required');
//                 roundOffForPurchaseReturn = { roundOffPurchaseReturn: false }; // Provide default settings or handle as needed
//             }
//             let roundOffAmount = 0;
//             if (roundOffForPurchaseReturn.roundOffPurchaseReturn) {
//                 finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
//                 roundOffAmount = finalAmount - totalAmount;
//             } else if (manualRoundOffAmount && !roundOffForPurchaseReturn.roundOffPurchaseReturn) {
//                 roundOffAmount = parseFloat(manualRoundOffAmount);
//                 finalAmount = totalAmount + roundOffAmount;
//             }


//             // Update existing bill
//             existingBill.account = accountId;
//             existingBill.partyBillNumber = partyBillNumber;
//             existingBill.isVatExempt = isVatExemptBool;
//             existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
//             existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
//             existingBill.discountPercentage = discount;
//             existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
//             existingBill.nonVatPurchaseReturn = finalNonTaxableAmount;
//             existingBill.taxableAmount = finalTaxableAmount;
//             existingBill.vatAmount = vatAmount;
//             existingBill.totalAmount = finalAmount;
//             existingBill.roundOffAmount = roundOffAmount;
//             existingBill.isVatAll = isVatAll;
//             existingBill.paymentMode = paymentMode;
//             existingBill.date = nepaliDate || new Date(billDate);
//             existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

//             async function reduceStockBatchWise(product, batchNumber, quantity) {
//                 let remainingQuantity = quantity;

//                 // Find all batch entries with the specific batch number
//                 const batchEntries = product.stockEntries.filter(entry => entry.batchNumber === batchNumber);

//                 if (batchEntries.length === 0) {
//                     throw new Error(`Batch number ${batchNumber} not found for product: ${product.name}`);
//                 }

//                 // Iterate through all matching batch entries and reduce stock
//                 for (const batchEntry of batchEntries) {
//                     if (remainingQuantity <= 0) break; // Stop if the required quantity is fully reduced

//                     if (batchEntry.quantity <= remainingQuantity) {
//                         remainingQuantity -= batchEntry.quantity;
//                         batchEntry.quantity = 0; // All stock from this batch is used
//                     } else {
//                         batchEntry.quantity -= remainingQuantity;
//                         remainingQuantity = 0; // Stock is fully reduced for this batch
//                     }
//                 }

//                 // if (remainingQuantity > 0) {
//                 //     throw new Error(`Not enough stock for batch number ${batchNumber} of product: ${product.name}`);
//                 // }

//                 // Save the product with the updated stock entries
//                 await product.save();
//             }
//             // **Updated processing for billItems to allow multiple entries of the same item**
//             const billItems = [];
//             for (let i = 0; i < items.length; i++) {
//                 const item = items[i];
//                 const product = await Item.findById(item.item);

//                 if (!product) {
//                     req.flash('error', `Item with id ${item.item} not found`);
//                     // await session.abortTransaction();
//                     return res.redirect(`/purchase-return/edit/${billId}`);
//                 }

//                 // Create the transaction for this item
//                 const transaction = new Transaction({
//                     item: product._id,
//                     account: accountId,
//                     billNumber: existingBill.billNumber,
//                     partyBillNumber: existingBill.partyBillNumber,
//                     quantity: item.quantity,
//                     puPrice: item.puPrice,
//                     unit: item.unit,  // Include the unit field                    type: 'Sale',
//                     purchaseReturnBillId: existingBill._id,  // Set billId to the new bill's ID
//                     purchaseSalesReturnType: 'Purchase Return',
//                     isType: 'PrRt',
//                     type: 'PrRt',
//                     debit: finalAmount,  // Set debit to the item's total amount
//                     credit: 0,        // Credit is 0 for sales transactions
//                     paymentMode: paymentMode,
//                     balance: 0, // Update the balance based on item total
//                     date: nepaliDate ? nepaliDate : new Date(billDate),
//                     company: companyId,
//                     user: userId,
//                     fiscalYear: currentFiscalYear,

//                 });

//                 await transaction.save();
//                 console.log('Transaction created:', transaction);

//                 await reduceStockBatchWise(product, item.batchNumber, item.quantity);

//                 billItems.push({
//                     item: product._id,
//                     quantity: item.quantity,
//                     price: item.price,
//                     puPrice: item.puPrice,
//                     unit: item.unit,
//                     batchNumber: item.batchNumber,  // Add batch number
//                     expiryDate: item.expiryDate,  // Add expiry date
//                     vatStatus: product.vatStatus,
//                     fiscalYear: fiscalYearId,
//                 });
//             }

//             existingBill.items = billItems;

//             // Create a transaction for the default Purchase Account
//             const purchaseRtnAmount = finalTaxableAmount + finalNonTaxableAmount;
//             if (purchaseRtnAmount > 0) {
//                 const purchaseRtnAccount = await Account.findOne({ name: 'Purchase', company: companyId });
//                 if (purchaseRtnAccount) {
//                     const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                     if (!partyAccount) {
//                         return res.status(400).json({ error: 'Party account not found.' });
//                     }
//                     const purchaseRtnTransaction = new Transaction({
//                         account: purchaseRtnAccount._id,
//                         billNumber: existingBill.billNumber,
//                         partyBillNumber: existingBill.partyBillNumber,
//                         type: 'PrRt',
//                         purchaseReturnBillId: existingBill._id,
//                         purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                         debit: 0,  // Debit the VAT account
//                         credit: purchaseRtnAmount,// Credit is 0 for VAT transactions
//                         paymentMode: paymentMode,
//                         balance: 0, // Update the balance
//                         date: nepaliDate ? nepaliDate : new Date(billDate),
//                         company: companyId,
//                         user: userId,
//                         fiscalYear: currentFiscalYear
//                     });
//                     await purchaseRtnTransaction.save();
//                     console.log('Purchase Return Transaction: ', purchaseRtnTransaction);
//                 }
//             }

//             // Create a transaction for the VAT amount
//             if (vatAmount > 0) {
//                 const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
//                 if (vatAccount) {
//                     const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                     if (!partyAccount) {
//                         return res.status(400).json({ error: 'Party account not found.' });
//                     }
//                     const vatTransaction = new Transaction({
//                         account: vatAccount._id,
//                         billNumber: existingBill.billNumber,
//                         partyBillNumber: existingBill.partyBillNumber,
//                         isType: 'VAT',
//                         type: 'PrRt',
//                         purchaseReturnBillId: existingBill._id,
//                         purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                         debit: 0,  // Debit the VAT account
//                         credit: vatAmount,         // Credit is 0 for VAT transactions
//                         paymentMode: paymentMode,
//                         balance: 0, // Update the balance
//                         date: nepaliDate ? nepaliDate : new Date(billDate),
//                         company: companyId,
//                         user: userId,
//                         fiscalYear: currentFiscalYear
//                     });
//                     await vatTransaction.save();
//                     console.log('Vat Transaction: ', vatTransaction);
//                 }
//             }

//             // Create a transaction for the round-off amount
//             if (roundOffAmount > 0) {
//                 const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
//                 if (roundOffAccount) {
//                     const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                     if (!partyAccount) {
//                         return res.status(400).json({ error: 'Party account not found.' });
//                     }
//                     const roundOffTransaction = new Transaction({
//                         account: roundOffAccount._id,
//                         billNumber: existingBill.billNumber,
//                         partyBillNumber: existingBill.partyBillNumber,
//                         isType: 'RoundOff',
//                         type: 'PrRt',
//                         purchaseReturnBillId: existingBill._id,
//                         purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                         debit: roundOffAmount,  // Debit the VAT account
//                         credit: 0,         // Credit is 0 for VAT transactions
//                         paymentMode: paymentMode,
//                         balance: 0, // Update the balance
//                         date: nepaliDate ? nepaliDate : new Date(billDate),
//                         company: companyId,
//                         user: userId,
//                         fiscalYear: currentFiscalYear
//                     });
//                     await roundOffTransaction.save();
//                     console.log('Round-off Transaction: ', roundOffTransaction);
//                 }
//             }

//             if (roundOffAmount < 0) {
//                 const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
//                 if (roundOffAccount) {
//                     const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                     if (!partyAccount) {
//                         return res.status(400).json({ error: 'Party account not found.' });
//                     }
//                     const roundOffTransaction = new Transaction({
//                         account: roundOffAccount._id,
//                         billNumber: existingBill.billNumber,
//                         partyBillNumber: existingBill.partyBillNumber,
//                         isType: 'RoundOff',
//                         type: 'PrRt',
//                         purchaseReturnBillId: existingBill._id,
//                         purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                         debit: 0,  // Debit the VAT account
//                         credit: Math.abs(roundOffAmount), // Ensure roundOffAmount is not saved as a negative value
//                         paymentMode: paymentMode,
//                         balance: 0, // Update the balance
//                         date: nepaliDate ? nepaliDate : new Date(billDate),
//                         company: companyId,
//                         user: userId,
//                         fiscalYear: currentFiscalYear
//                     });
//                     await roundOffTransaction.save();
//                     console.log('Round-off Transaction: ', roundOffTransaction);
//                 }
//             }

//             console.log('All transactions successfully created for updated bill.');
//             await existingBill.save();

//             // If payment mode is cash, also create a transaction for the "Cash in Hand" account
//             if (paymentMode === 'cash') {
//                 const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId });
//                 if (cashAccount) {
//                     const cashTransaction = new Transaction({
//                         account: cashAccount._id,
//                         // billNumber: billCounter.count,
//                         billNumber: existingBill.billNumber,
//                         partyBillNumber: existingBill.partyBillNumber,
//                         isType: 'PrRt',
//                         type: 'PrRt',
//                         purchaseReturnBillId: existingBill._id,  // Set billId to the new bill's ID
//                         purchaseSalesReturnType: 'Purchase Return',
//                         debit: finalAmount,  // Debit is 0 for cash-in-hand as we're receiving cash
//                         credit: 0,  // Credit is the total amount since we're receiving cash
//                         paymentMode: paymentMode,
//                         balance: 0, // Update the balance
//                         date: nepaliDate ? nepaliDate : new Date(billDate),
//                         company: companyId,
//                         user: userId,
//                         fiscalYear: currentFiscalYear,
//                     });
//                     await cashTransaction.save();
//                     console.log('Cash transaction created:', cashTransaction);
//                 }
//             }

//             // // If everything goes smoothly, commit the transaction
//             // await session.commitTransaction();
//             // session.endSession();

//             if (req.query.print === 'true') {
//                 // Redirect to the print route
//                 res.redirect(`/purchase-return/${existingBill._id}/edit/direct-print`);
//             } else {
//                 // Redirect to the bills list or another appropriate page
//                 req.flash('success', 'Purchase return updated successfully.');
//                 res.redirect(`/purchase-return/edit/${billId}`);
//             }
//         } catch (error) {
//             console.error("Error creating bill:", error);
//             await session.abortTransaction();
//             session.endSession();
//             req.flash('error', 'Error creating bill');
//             res.redirect(`/purchase-return/edit/${billId}`);
//         }
//     }
// });


router.put('/purchase-return/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        const billId = req.params.id;

        const { accountId, items, vatPercentage, transactionDateRoman, transactionDateNepali, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, partyBillNumber, roundOffAmount: manualRoundOffAmount } = req.body;
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        const currentFiscalYear = req.session.currentFiscalYear.id;
        const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        const userId = req.user._id;

        if (!companyId) {
            req.flash('error', `Company ID is required.`);
            return res.redirect(`/purchase-return/edit/${billId}`);
        }
        if (!isVatExempt) {
            req.flash('error', `Invalid vat selection.`);
            return res.redirect(`/purchase-return/edit/${billId}`);
        }
        if (!paymentMode) {
            req.flash('error', `Invalid payment mode.`);
            return res.redirect(`/purchase-return/edit/${billId}`);
        }

        if (companyDateFormat === 'nepali') {
            if (!transactionDateNepali) {
                req.flash('error', `Invalid transaction date.`);
                return res.redirect(`/purchase-return/edit/${billId}`);
            }
            if (!nepaliDate) {
                req.flash('error', `Invalid invoice date.`);
                return res.redirect(`/purchase-return/edit/${billId}`);
            }
        } else {
            if (!transactionDateRoman) {
                req.flash('error', `Invalid transaction date.`);
                return res.redirect(`/purchase-return/edit/${billId}`);
            }
            if (!billDate) {
                req.flash('error', `Invalid invoice date.`);
                return res.redirect(`/purchase-return/edit/${billId}`);
            }
        }

        const accounts = await Account.findOne({ _id: accountId, company: companyId });
        if (!accounts) {
            req.flash('error', `Invalid account for this company`);
            return res.redirect(`/purchase-return/edit/${billId}`);
        }

        try {
            const existingBill = await PurchaseReturn.findOne({ _id: billId, company: companyId });
            if (!existingBill) {
                req.flash('error', 'Purchase return not found!');
                return res.redirect('/purchase-return/list');
            }

            // Step 1: Validate New Quantities BEFORE Reversing Old Stock
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item);

                if (!product) {
                    req.flash('error', `Item with ID ${item.item} not found`);
                    return res.redirect(`/purchase-return/edit/${billId}`);
                }

                // Validate batch number and uniqueUuId
                const batchEntry = product.stockEntries.find(
                    entry => entry.batchNumber === item.batchNumber && entry.uniqueUuId === item.uniqueUuId
                );

                if (!batchEntry) {
                    req.flash('error', `Batch with batchNumber ${item.batchNumber} and uniqueUuId ${item.uniqueUuId} not found for product: ${product.name}`);
                    return res.redirect(`/purchase-return/edit/${billId}`);
                }

                // Calculate current stock availability
                const availableStock = batchEntry.quantity;

                // Find the existing item from the bill
                const existingItem = existingBill.items.find(
                    existing => existing.item.toString() === item.item.toString() &&
                        existing.batchNumber === item.batchNumber &&
                        existing.uniqueUuId === item.uniqueUuId
                );

                let previousQuantity = existingItem ? existingItem.quantity : 0; // Stock being reversed
                let potentialStockAfterReversal = availableStock + previousQuantity; // Simulated stock after reversal

                // If the new requested quantity is more than what would be available, do NOT allow reversal
                if (potentialStockAfterReversal < item.quantity) {
                    req.flash('error', `Not enough stock for item: ${product.name}. Available: ${availableStock}, Required: ${item.quantity}`);
                    return res.redirect(`/purchase-return/edit/${billId}`);
                }
            }
            // Step 2: Reverse stock for existing bill items (Only if all validations pass)
            for (const existingItem of existingBill.items) {
                const product = await Item.findById(existingItem.item);
                const batchEntry = product.stockEntries.find(
                    entry => entry.batchNumber === existingItem.batchNumber && entry.uniqueUuId === existingItem.uniqueUuId
                );

                if (batchEntry) {
                    batchEntry.quantity += existingItem.quantity; // Restore stock
                } else {
                    console.warn(`Batch with batchNumber ${existingItem.batchNumber} and uniqueUuId ${existingItem.uniqueUuId} not found for product: ${product.name}`);
                }

                await product.save(); // Save updated stock
            }

            console.log('Stock successfully reversed for existing bill items.');

            // Delete removed items from the PurchaseBill
            existingBill.items = existingBill.items.filter(existingItem => {
                return items.some(
                    item => item.item.toString() === existingItem.item.toString() &&
                            item.batchNumber === existingItem.batchNumber &&
                            item.uniqueUuId === existingItem.uniqueUuId
                );
            });

            // Delete all associated transactions
            await Transaction.deleteMany({ purchaseReturnBillId: billId });
            console.log('Existing transactions deleted successfully');

            // Calculate amounts based on the updated POST route logic
            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let subTotal = 0;
            let vatAmount = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/purchase-return');
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

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    return res.redirect(`/purchase-return/edit/${billId}`);
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    return res.redirect(`/purchase-return/edit/${billId}`);
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
            const roundOffForPurchaseReturn = await Settings.findOne({ companyId, userId }); // Assuming you have a single settings document

            // Handle case where settings is null
            if (!roundOffForPurchaseReturn) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForPurchaseReturn = { roundOffPurchaseReturn: false }; // Provide default settings or handle as needed
            }
            let roundOffAmount = 0;
            if (roundOffForPurchaseReturn.roundOffPurchaseReturn) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForPurchaseReturn.roundOffPurchaseReturn) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Update existing bill
            existingBill.account = accountId;
            existingBill.partyBillNumber = partyBillNumber;
            existingBill.isVatExempt = isVatExemptBool;
            existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
            existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
            existingBill.discountPercentage = discount;
            existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
            existingBill.nonVatPurchaseReturn = finalNonTaxableAmount;
            existingBill.taxableAmount = finalTaxableAmount;
            existingBill.vatAmount = vatAmount;
            existingBill.totalAmount = finalAmount;
            existingBill.roundOffAmount = roundOffAmount;
            existingBill.isVatAll = isVatAll;
            existingBill.paymentMode = paymentMode;
            existingBill.date = nepaliDate || new Date(billDate);
            existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

            async function reduceStockBatchWise(product, batchNumber, uniqueUuId, quantity) {
                let remainingQuantity = quantity;

                // Find the exact batch entry using both batchNumber and uniqueUuId
                const batchEntry = product.stockEntries.find(
                    entry => entry.batchNumber === batchNumber && entry.uniqueUuId === uniqueUuId
                );

                if (!batchEntry) {
                    console.warn(`Batch with batchNumber ${batchNumber} and uniqueUuId ${uniqueUuId} not found for product: ${product.name}`);
                    return; // Skip this batch
                }

                // Reduce the stock for the batch
                if (batchEntry.quantity <= remainingQuantity) {
                    remainingQuantity -= batchEntry.quantity;
                    batchEntry.quantity = 0; // All stock from this batch is used
                } else {
                    batchEntry.quantity -= remainingQuantity;
                    remainingQuantity = 0; // Stock is fully reduced for this batch
                }

                // Save the product with the updated stock entries
                await product.save();
            }

            // **Updated processing for billItems to allow multiple entries of the same item**
            const billItems = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect(`/purchase-return/edit/${billId}`);
                }

                // Create the transaction for this item
                const transaction = new Transaction({
                    item: product._id,
                    account: accountId,
                    billNumber: existingBill.billNumber,
                    partyBillNumber: existingBill.partyBillNumber,
                    quantity: item.quantity,
                    puPrice: item.puPrice,
                    unit: item.unit,
                    type: 'Sale',
                    purchaseReturnBillId: existingBill._id,
                    purchaseSalesReturnType: 'Purchase Return',
                    isType: 'PrRt',
                    type: 'PrRt',
                    debit: finalAmount,
                    credit: 0,
                    paymentMode: paymentMode,
                    balance: 0,
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,
                });

                await transaction.save();
                console.log('Transaction created:', transaction);

                // Reduce stock for the batch using both batchNumber and uniqueUuId
                await reduceStockBatchWise(product, item.batchNumber, item.uniqueUuId, item.quantity);

                billItems.push({
                    item: product._id,
                    quantity: item.quantity,
                    price: item.price,
                    puPrice: item.puPrice,
                    unit: item.unit,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: fiscalYearId,
                    uniqueUuId: item.uniqueUuId, // Include uniqueUuId
                });
            }

            existingBill.items = billItems;

            // Create a transaction for the default Purchase Account
            const purchaseRtnAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (purchaseRtnAmount > 0) {
                const purchaseRtnAccount = await Account.findOne({ name: 'Purchase', company: companyId });
                if (purchaseRtnAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const purchaseRtnTransaction = new Transaction({
                        account: purchaseRtnAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        type: 'PrRt',
                        purchaseReturnBillId: existingBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: purchaseRtnAmount,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: 0, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await purchaseRtnTransaction.save();
                    console.log('Purchase Return Transaction: ', purchaseRtnTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
                if (vatAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'VAT',
                        type: 'PrRt',
                        purchaseReturnBillId: existingBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: vatAmount,         // Credit is 0 for VAT transactions
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
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'RoundOff',
                        type: 'PrRt',
                        purchaseReturnBillId: existingBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
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
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'RoundOff',
                        type: 'PrRt',
                        purchaseReturnBillId: existingBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
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

            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId });
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        isType: 'PrRt',
                        type: 'PrRt',
                        purchaseReturnBillId: existingBill._id,  // Set billId to the new bill's ID
                        purchaseSalesReturnType: 'Purchase Return',
                        debit: finalAmount,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: 0,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: 0, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear,
                    });
                    await cashTransaction.save();
                    console.log('Cash transaction created:', cashTransaction);
                }
            }

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/purchase-return/${existingBill._id}/edit/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Purchase return updated successfully.');
                res.redirect(`/purchase-return/edit/${billId}`);
            }
        } catch (error) {
            console.error("Error creating bill:", error);
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'Error creating bill');
            res.redirect(`/purchase-return/edit/${billId}`);
        }
    }
});

router.get('/purchase-return/:id/print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const currentCompanyName = req.session.currentCompanyName;
        const companyId = req.session.currentCompany;
        console.log("Company ID from session:", companyId); // Debugging line

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
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

            const purchaseReturnBillId = req.params.id;
            const bill = await PurchaseReturn.findById(purchaseReturnBillId)
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
                    purchaseReturnBillId: new ObjectId(purchaseReturnBillId)
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

            res.render('retailer/purchaseReturn/print', {
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
                user: req.user,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/purchase-bills-list');
        }
    }
});

//direct print for purchase return
router.get('/purchase-return/:id/direct-print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

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

            const purchaseReturnBillId = req.params.id;
            const bill = await PurchaseReturn.findById(purchaseReturnBillId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/purchase-return');
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
                    purchaseReturnBillId: new ObjectId(purchaseReturnBillId)
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

            res.render('retailer/purchaseReturn/directPrint', {
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
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/purchase-bills-list');
        }
    }
});


//direct print purchase return for edit
router.get('/purchase-return/:id/edit/direct-print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

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

            const purchaseReturnBillId = req.params.id;
            const bill = await PurchaseReturn.findById(purchaseReturnBillId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/purchase-return/list');
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
                    purchaseReturnBillId: new ObjectId(purchaseReturnBillId)
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

            res.render('retailer/purchaseReturn/directPrintEdit', {
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
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/purchase-bills-list');
        }
    }
});

router.get('/purchaseReturn-vat-report', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : '';
        const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
        const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
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

        // Build the query to filter transactions within the date range
        let query = { company: companyId };

        if (fromDate && toDate) {
            query.date = { $gte: fromDate, $lte: toDate };
        } else if (fromDate) {
            query.date = { $gte: fromDate };
        } else if (toDate) {
            query.date = { $lte: toDate };
        }

        const purchaseReturn = await PurchaseReturn.find(query).populate('account').sort({ date: 1 });

        // Prepare VAT report data
        const purchaseReturnVatReport = await Promise.all(purchaseReturn.map(async bill => {
            const account = await Account.findById(bill.account);
            return {
                billNumber: bill.billNumber,
                date: bill.date,
                account: account.name,
                panNumber: account.pan,
                totalAmount: bill.totalAmount,
                discountAmount: bill.discountAmount,
                nonVatPurchaseReturn: bill.nonVatPurchaseReturn,
                taxableAmount: bill.taxableAmount,
                vatAmount: bill.vatAmount,
            };
        }));

        res.render('retailer/purchaseReturn/purchaseReturnVatReport', {
            company,
            currentFiscalYear,
            purchaseReturnVatReport,
            companyDateFormat,
            nepaliDate,
            currentCompany,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            currentCompanyName,
            user: req.user,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } else {
        res.status(403).send('Access denied');
    }
});

module.exports = router;