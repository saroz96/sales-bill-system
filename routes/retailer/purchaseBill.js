const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const { v4: uuidv4 } = require('uuid');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require("../../middleware/auth");
const { ensureTradeType } = require("../../middleware/tradeType");
const Account = require("../../models/retailer/Account");
const Item = require("../../models/retailer/Item");
const PurchaseBill = require("../../models/retailer/PurchaseBill");
const Company = require("../../models/retailer/Company");
// const PurchaseBillCounter = require('../../models/retailer/purchaseBillCounter');
const NepaliDate = require('nepali-date');
const Settings = require('../../models/retailer/Settings');
const Transaction = require('../../models/retailer/Transaction');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');
const FiscalYear = require('../../models/retailer/FiscalYear');
const BillCounter = require('../../models/retailer/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const CompanyGroup = require('../../models/retailer/CompanyGroup');


// Fetch all purchase bills
router.get('/purchase-bills-list', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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

        const bills = await PurchaseBill.find({ company: companyId, fiscalYear: currentFiscalYear }).populate('account').populate('items.item').populate('user');
        res.render('retailer/purchase/allbills', {
            company,
            currentFiscalYear,
            bills,
            currentCompany,
            currentCompanyName,
            title: 'Purchase',
            body: 'retailer >> purchase >> bills',
            user: req.user,
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
            name: { $in: ['Sundry Debtors', 'Sundry Creditors'] }
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

router.get('/api/last-item-values/:itemId', async (req, res) => {
    try {
        const itemId = req.params.itemId;

        // Validate itemId
        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ message: 'Invalid itemId' });
        }

        // Use aggregation to fetch the latest entry for the selected item
        const result = await PurchaseBill.aggregate([
            // Unwind the items array to treat each item as a separate document
            { $unwind: "$items" },

            // Match the specific item by its itemId
            { $match: { "items.item": new mongoose.Types.ObjectId(itemId) } },

            // Sort by billNumber in descending order (most recent first)
            { $sort: { billNumber: -1 } },

            // Limit the result to 1 (latest entry)
            { $limit: 1 },

            // Project only the required fields
            {
                $project: {
                    mrp: "$items.mrp",
                    marginPercentage: "$items.marginPercentage",
                    price: "$items.price",
                    currency: "$items.currency"
                },
            },
        ]);

        // Check if result is empty
        if (!result.length) {
            return res.status(404).json({ message: 'No purchase history found for this item.' });
        }

        // Extract the last values for the item
        const lastItemValues = result[0];
        res.json({
            mrp: lastItemValues.mrp,
            marginPercentage: lastItemValues.marginPercentage,
            price: lastItemValues.price,
            currency: lastItemValues.currency,
        });
    } catch (error) {
        console.error('Error in /api/last-item-values:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// Purchase Bill routes
router.get('/purchase-bills', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const items = await Item.find({ company: companyId }).populate('category').populate('unit').populate('mainUnit');
        const purchasebills = await PurchaseBill.find({ company: companyId }).populate('account').populate('items.item').populate('items.unit');
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
        res.render('retailer/purchase/purchaseEntry', {
            company, items: items, purchasebills: purchasebills, nextPurchaseBillNumber: nextBillNumber,
            nepaliDate: nepaliDate, transactionDateNepali, companyDateFormat, currentFiscalYear, vatEnabled: company.vatEnabled,
            user: req.user, currentCompanyName: req.session.currentCompanyName,
            title: 'Purchase Entry',
            body: 'retailer >> purchase >> add',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }

});


router.get('/purchase-bills/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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

        res.render('retailer/purchase/billNumberForm', {
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

        res.render('retailer/purchase/edit', {
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
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { accountId, items, vatPercentage, transactionDateNepali, transactionDateRoman, billDate, partyBillNumber, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount } = req.body;
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
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
                req.flash('error', `Company ID is required.`);
                await session.abortTransaction();
                return res.redirect('/purchase-bills');
            }
            if (!isVatExempt) {
                req.flash('error', `Invalid vat selection.`);
                await session.abortTransaction();
                return res.redirect('/purchase-bills');
            }
            if (!paymentMode) {
                req.flash('error', `Invalid payment mode.`);
                await session.abortTransaction();
                return res.redirect('/purchase-bills');
            }
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
            if (companyDateFormat === 'nepali') {
                if (!transactionDateNepali) {
                    req.flash('error', `Invalid transaction date.`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }
                if (!nepaliDate) {
                    req.flash('error', `Invalid invoice date.`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }
            } else {
                if (!transactionDateRoman) {
                    req.flash('error', `Invalid transaction date.`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }
                if (!billDate) {
                    req.flash('error', `Invalid invoice date.`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }
            }


            const accounts = await Account.findOne({ _id: accountId, company: companyId }).session(session);

            if (!accounts) {
                req.flash('error', `Invalid account for this company`);
                await session.abortTransaction();
                return res.redirect('/purchase-bills');
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    await session.abortTransaction();
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

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    await session.abortTransaction();
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
            let roundOffForPurchase = await Settings.findOne({ companyId, userId }).session(session); // Assuming you have a single settings document

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
            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'Purchase')

            // Create new purchase bill
            const newBill = new PurchaseBill({
                // billNumber: billCounter.count,
                billNumber: billNumber,
                partyBillNumber,
                account: accountId,
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
            const accountTransaction = await Transaction.findOne({ account: accountId }).sort({ transactionDate: -1 });
            if (accountTransaction) {
                previousBalance = accountTransaction.balance;
            }

            // Generate a unique ID for the stock entry
            const uniqueId = uuidv4();

            //FIFO stock addition function
            async function addStock(product, batchNumber, expiryDate, WSUnit, quantity, bonus, price, puPrice, marginPercentage, mrp, currency, uniqueId) {
                // Ensure quantity is treated as a number
                const quantityNumber = Number(quantity) + Number(bonus);
                const bonusNumber = Number(bonus);
                const parsedPrice = price !== undefined && price !== "" ? parseFloat(price) : 0;
                const parsedPuPrice = puPrice !== undefined && puPrice !== "" ? parseFloat(puPrice) : 0;
                const parsedMrp = mrp !== undefined && mrp !== "" ? parseFloat(mrp) : 0;

                // const WSUnitNumber = Number(WSUnit);
                const WSUnitNumber = WSUnit !== undefined && WSUnit !== "" && WSUnit !== null ? Number(WSUnit) : 1;

                const stockEntry = {
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    WSUnit: WSUnitNumber,
                    quantity: WSUnitNumber ? quantityNumber * WSUnitNumber : 0,
                    bonus: bonusNumber,
                    batchNumber: batchNumber,
                    expiryDate: expiryDate,
                    price: WSUnitNumber ? parsedPrice / WSUnitNumber : 0,
                    puPrice: WSUnitNumber ? parsedPuPrice / WSUnitNumber : 0,
                    mainUnitPuPrice: parsedPuPrice, // Keeps the original value before division
                    mrp: WSUnitNumber ? parsedMrp / WSUnitNumber : 0,
                    marginPercentage: marginPercentage,
                    currency: currency,
                    purchaseBillId: newBill._id, // Add the purchase bill ID
                    uniqueUuId: uniqueId
                };


                // Debug: log stock entry to ensure values are correct
                console.log('Stock Entry:', stockEntry);
                product.stockEntries.push(stockEntry); // Add entry to stockEntries array
                // Ensure stock is incremented correctly as a number
                product.stock = (product.stock || 0) + (quantityNumber * WSUnitNumber);

                // Also update the WSUnit value in the product schema if it has changed
                product.WSUnit = WSUnitNumber; // Update WSUnit in the database

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
                    return res.redirect('/purchase-bills');
                }
                // Create the transaction for this item
                const transaction = new Transaction({
                    item: product._id,
                    account: accountId,
                    billNumber: billNumber,
                    partyBillNumber,
                    purchaseSalesType: 'Purchase',
                    WSUnit: item.WSUnit,
                    quantity: item.quantity,
                    bonus: item.bonus,
                    puPrice: item.puPrice,
                    unit: item.unit,  // Include the unit field
                    currency: item.currency,
                    mainUnit: item.mainUnit,
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
                await addStock(product, item.batchNumber, item.expiryDate, item.WSUnit, item.quantity, item.bonus, item.price, item.puPrice, item.marginPercentage, item.mrp, item.currency, uniqueId);

                billItems.push({
                    item: product._id,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    WSUnit: item.WSUnit,
                    quantity: item.quantity,
                    bonus: item.bonus,
                    Altbonus: item.bonus,
                    price: item.price,
                    puPrice: item.puPrice,
                    Altquantity: item.quantity,
                    Altprice: item.price,
                    AltpuPrice: item.puPrice,
                    mainUnitPuPrice: item.puPrice,
                    mrp: item.mrp,
                    marginPercentage: item.marginPercentage,
                    currency: item.currency,
                    unit: item.unit,
                    vatStatus: product.vatStatus,
                    uniqueUuId: uniqueId
                });
            }

            // Create a transaction for the default Purchase Account
            const purchaseAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (purchaseAmount > 0) {
                const purchaseAccount = await Account.findOne({ name: 'Purchase', company: companyId });
                if (purchaseAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
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
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
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
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
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
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
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

            // Update bill with items
            newBill.items = billItems;
            await newBill.save({ session });
            // If everything goes smoothly, commit the transaction
            await session.commitTransaction();
            session.endSession();

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
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'Error creating purchase bill');
            res.redirect('/purchase-bills');
        }
    }
});

router.get('/purchase-bills/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
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
            }).populate('items.item')
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
            res.render('retailer/purchase/edit', {
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
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();

        const billId = req.params.id;
        const { accountId, items, vatPercentage, transactionDateRoman, transactionDateNepali, partyBillNumber, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount, } = req.body;

        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const currentFiscalYear = req.session.currentFiscalYear.id;
        const userId = req.user._id;

        if (!companyId) {
            req.flash('error', `Company ID is required.`);
            await session.abortTransaction();
            return res.redirect(`/purchase-bills/edit/${billId}`);
        }
        if (!isVatExempt) {
            req.flash('error', `Invalid vat selection.`);
            await session.abortTransaction();
            return res.redirect(`/purchase-bills/edit/${billId}`);
        }
        if (!paymentMode) {
            req.flash('error', `Invalid payment mode.`);
            await session.abortTransaction();
            return res.redirect(`/purchase-bills/edit/${billId}`);
        }
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        if (companyDateFormat === 'nepali') {
            if (!transactionDateNepali) {
                req.flash('error', `Invalid transaction date.`);
                await session.abortTransaction();
                return res.redirect(`/purchase-bills/edit/${billId}`);
            }
            if (!nepaliDate) {
                req.flash('error', `Invalid invoice date.`);
                await session.abortTransaction();
                return res.redirect(`/purchase-bills/edit/${billId}`);
            }
        } else {
            if (!transactionDateRoman) {
                req.flash('error', `Invalid transaction date.`);
                await session.abortTransaction();
                return res.redirect(`/purchase-bills/edit/${billId}`);
            }
            if (!billDate) {
                req.flash('error', `Invalid invoice date.`);
                await session.abortTransaction();
                return res.redirect(`/purchase-bills/edit/${billId}`);
            }
        }

        const accounts = await Account.findOne({ _id: accountId, company: companyId }).session(session);
        if (!accounts) {
            req.flash('error', `Invalid account for this company`);
            await session.abortTransaction();
            return res.redirect(`/purchase-bills/edit/${billId}`);
        }


        try {
            const existingBill = await PurchaseBill.findOne({ _id: billId, company: companyId }).session(session);
            if (!existingBill) {
                req.flash('error', 'Purchase not found');
                await session.abortTransaction();
                return res.redirect('/purchase-bills-list');
            }

            // Check if stock is used fully or partially
            let isStockUsed = false;

            for (const existingItem of existingBill.items) {
                const product = await Item.findById(existingItem.item).session(session);

                if (!product) continue; // Skip if product not found

                // Find the exact stock entry matching the batch number, date and uniqueUuId
                const stockEntry = product.stockEntries.find(entry =>
                    entry.batchNumber === existingItem.batchNumber &&
                    new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
                    entry.purchaseBillId.toString() === existingBill._id.toString() && entry.uniqueUuId === existingItem.uniqueUuId // Match the purchase bill ID
                );

                console.log('Stock Entry:', stockEntry);
                console.log('Stock Entry Quantity:', stockEntry.quantity);
                console.log('Existing Item Quantity:', existingItem.quantity * (existingItem.WSUnit || 1));

                if (!stockEntry || stockEntry.quantity < existingItem.quantity * (existingItem.WSUnit || 1)) {
                    isStockUsed = true;
                    break;
                }
            }

            // If stock is used, prevent editing
            if (isStockUsed) {
                req.flash('error', 'Could not edit, Stock is used!');
                await session.abortTransaction();
                return res.redirect(`/purchase-bills/edit/${billId}`);
            }

            // Process stock updates only if stock is not used
            for (const existingItem of existingBill.items) {
                const product = await Item.findById(existingItem.item).session(session);

                if (!product) continue;

                const stockEntryIndex = product.stockEntries.findIndex(entry =>
                    entry.batchNumber === existingItem.batchNumber &&
                    new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
                    entry.purchaseBillId.toString() === existingBill._id.toString() && entry.uniqueUuId === existingItem.uniqueUuId // Match the purchase bill ID
                );

                if (stockEntryIndex !== -1) {
                    const stockEntry = product.stockEntries[stockEntryIndex];
                    const convertedQuantity = existingItem.quantity * (existingItem.WSUnit || 1);
                    stockEntry.quantity -= convertedQuantity;

                    if (stockEntry.quantity <= 0) {
                        product.stockEntries.splice(stockEntryIndex, 1);
                    }

                    product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);
                    await product.save({ session });
                }
            }

            const removedItems = existingBill.items.filter(existingItem => {
                return !items.some(item =>
                    item.item.toString() === existingItem.item.toString() &&
                    item.uniqueUuId === existingItem.uniqueUuId
                );
            });

            for (const removedItem of removedItems) {
                const product = await Item.findById(removedItem.item).session(session);

                if (!product) continue;

                // Find the stock entry for the removed item
                const stockEntryIndex = product.stockEntries.findIndex(entry =>
                    entry.batchNumber === removedItem.batchNumber &&
                    new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
                    entry.purchaseBillId.toString() === existingBill._id.toString() &&
                    entry.uniqueUuId === existingItem.uniqueUuId
                );

                if (stockEntryIndex !== -1) {
                    const stockEntry = product.stockEntries[stockEntryIndex];
                    const convertedQuantity = removedItem.quantity * (removedItem.WSUnit || 1);

                    // Add the removed quantity back to the stock entry
                    stockEntry.quantity += convertedQuantity;

                    // If the stock entry quantity is zero or negative, remove it
                    if (stockEntry.quantity <= 0) {
                        product.stockEntries.splice(stockEntryIndex, 1);
                    }

                    // Update the total stock
                    product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);

                    await product.save({ session });
                }
            }

            // Delete removed items from the PurchaseBill
            existingBill.items = existingBill.items.filter(existingItem => {
                return items.some(item =>
                    item.item.toString() === existingItem.item.toString() &&
                    item.uniqueUuId === existingItem.uniqueUuId
                );
            });

            // Delete all associated transactions
            await Transaction.deleteMany({ purchaseBillId: billId }).session(session);
            console.log('Existing transactions deleted successfully');


            // Calculate amounts based on the updated POST route logic
            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            for (const item of items) {
                const product = await Item.findById(item.item).session(session);
                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += item.quantity * item.puPrice;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += item.quantity * item.puPrice;
                }
            }

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }
            }

            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            let vatAmount = 0;
            // Calculate VAT only for vatable items
            if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
                vatAmount = (finalTaxableAmount * vatPercentage) / 100;
            } else {
                vatAmount = 0;
            }
            let roundOffAmount = 0;

            let totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;
            let finalAmount = totalAmount;

            const roundOffForPurchase = await Settings.findOne({ companyId, userId, fiscalYear: currentFiscalYear, }) || { roundOffPurchase: false };

            if (roundOffForPurchase.roundOffPurchase) {
                finalAmount = Math.round(finalAmount.toFixed(2));
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForPurchase.roundOffPurchase) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Update existing bill
            existingBill.account = accountId;
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

            async function addStock(product, batchNumber, expiryDate, WSUnit, quantity, bonus, price, puPrice, marginPercentage, mrp, currency, uniqueUuId, isUpdate = false) {
                // Ensure numeric values
                const quantityNumber = Number(quantity);
                const bonusNumber = Number(bonus);
                const WSUnitNumber = WSUnit !== undefined && WSUnit !== "" && WSUnit !== null ? Number(WSUnit) : 1;
                const parsedPrice = price !== undefined && price !== "" ? parseFloat(price) : 0;
                const parsedPuPrice = puPrice !== undefined && puPrice !== "" ? parseFloat(puPrice) : 0;
                const parsedMrp = mrp !== undefined && mrp !== "" ? parseFloat(mrp) : 0;
                const parsedMarginPercentage = marginPercentage !== undefined && marginPercentage !== "" ? parseFloat(marginPercentage) : 0;

                // Convert quantity to pieces - handle quantity and bonus separately
                const convertedQuantity = quantityNumber * WSUnitNumber;
                const convertedBonus = bonusNumber * WSUnitNumber;
                const totalQuantity = convertedQuantity + convertedBonus
                const stockEntry = {
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    WSUnit: WSUnitNumber,
                    quantity: totalQuantity,
                    bonus: convertedBonus,
                    batchNumber: batchNumber,
                    expiryDate: expiryDate,
                    price: parsedPrice !== undefined ? parsedPrice / WSUnitNumber : undefined,
                    puPrice: parsedPuPrice / WSUnitNumber,
                    mainUnitPuPrice: parsedPuPrice,
                    mrp: parsedMrp !== undefined ? parsedMrp / WSUnitNumber : undefined,
                    marginPercentage: parsedMarginPercentage,
                    currency: currency,
                    purchaseBillId: existingBill._id,
                    uniqueUuId: uniqueUuId,
                };

                console.log("Stock Entry:", stockEntry);

                if (isUpdate) {
                    // Find existing stock entry
                    const stockEntryIndex = product.stockEntries.findIndex(
                        (entry) => entry.batchNumber === batchNumber && entry.expiryDate === expiryDate
                    );
                    if (stockEntryIndex !== -1) {
                        // Update existing stock entry
                        const existingStockEntry = product.stockEntries[stockEntryIndex];
                        const updatedUniqueUuId = uniqueUuId !== undefined ? uniqueUuId : existingStockEntry.uniqueUuId;

                        product.stockEntries[stockEntryIndex] = {
                            ...existingStockEntry,
                            date: nepaliDate ? nepaliDate : new Date(billDate),
                            batchNumber: batchNumber,
                            expiryDate: expiryDate,
                            quantity: totalQuantity,
                            bonus: convertedBonus,
                            price: parsedPrice !== undefined ? parsedPrice / WSUnitNumber : existingStockEntry.price,
                            puPrice: parsedPuPrice / WSUnitNumber,
                            mainUnitPuPrice: parsedPuPrice,
                            mrp: parsedMrp !== undefined ? parsedMrp / WSUnitNumber : existingStockEntry.mrp,
                            marginPercentage: parsedMarginPercentage !== undefined ? parsedMarginPercentage : existingStockEntry.marginPercentage,
                            currency: currency !== undefined ? currency : existingStockEntry.currency,
                            purchaseBillId: existingBill._id,
                            uniqueUuId: updatedUniqueUuId,
                        };
                    } else {
                        product.stockEntries.push(stockEntry);
                    }
                } else {
                    product.stockEntries.push(stockEntry);
                }

                // Update total stock (quantity + bonus)
                product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity + entry.bonus, 0);
                product.WSUnit = WSUnitNumber;

                await product.save();
            }

            const billItems = [...existingBill.items]; // Retain existing items
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }

                const existingBillItemIndex = billItems.findIndex(billItem =>
                    billItem.item && billItem.item.toString() === item.item
                );

                if (existingBillItemIndex !== -1) {
                    // If item exists, update fields but retain existing values if not provided
                    const existingBillItem = billItems[existingBillItemIndex];
                    billItems[existingBillItemIndex] = {
                        ...existingBillItem, // Retain existing properties
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        batchNumber: item.batchNumber, // Update to new batch number
                        expiryDate: item.expiryDate,
                        WSUnit: item.WSUnit,
                        quantity: Number(item.quantity),
                        price: item.price !== undefined && item.price !== "" ? item.price : existingBillItem.price, // Retain existing price if not provided
                        puPrice: item.puPrice,
                        Altquantity: Number(item.quantity),
                        Altbonus: Number(item.bonus),
                        Altprice: item.price !== undefined && item.price !== "" ? item.price : existingBillItem.Altprice, // Retain existing Altprice if not provided
                        AltpuPrice: item.puPrice,
                        mainUnitPuPrice: item.puPrice,
                        mrp: item.mrp !== undefined && item.mrp !== "" ? item.mrp : existingBillItem.mrp, // Retain existing MRP if not provided
                        marginPercentage: item.marginPercentage !== undefined && item.marginPercentage !== "" ? item.marginPercentage : existingBillItem.marginPercentage, // Retain existing margin if not provided
                        currency: item.currency !== undefined && item.currency !== "" ? item.currency : existingBillItem.currency,
                        uniqueUuId: item.uniqueUuId !== undefined && item.uniqueUuId !== "" ? item.uniqueUuId : existingBillItem.uniqueUuId,
                        bonus: Number(item.bonus),
                        unit: item.unit,
                        vatStatus: product.vatStatus
                    };
                } else {
                    // Add new item to the bill
                    // Generate new uniqueUuId for new item
                    const newUniqueId = uuidv4();
                    billItems.push({
                        item: product._id,
                        batchNumber: item.batchNumber,
                        expiryDate: item.expiryDate,
                        WSUnit: item.WSUnit,
                        quantity: item.quantity,
                        Altbonus: item.bonus,
                        price: item.price,
                        puPrice: item.puPrice,
                        Altquantity: item.quantity,
                        Altprice: item.price,
                        AltpuPrice: item.puPrice,
                        mainUnitPuPrice: item.puPrice,
                        mrp: item.mrp,
                        marginPercentage: item.marginPercentage,
                        currency: item.currency,
                        unit: item.unit,
                        vatStatus: product.vatStatus,
                        uniqueUuId: newUniqueId,
                        bonus: item.bonus,
                    });
                    // Use the same uniqueUuId for the stock entry
                    item.uniqueUuId = newUniqueId;
                }

                const existingTransaction = await Transaction.findOne({
                    item: product._id,
                    purchaseBillId: existingBill._id,
                }).session(session);

                if (existingTransaction) {
                    // If transaction exists, update it instead of adding a new row
                    existingTransaction.batchNumber = item.batchNumber; // Update batch number
                    existingTransaction.quantity = item.quantity;
                    existingTransaction.bonus = item.bonus;
                    existingTransaction.puPrice = item.puPrice;
                    existingTransaction.unit = item.unit;
                    existingTransaction.credit = finalAmount;
                    existingTransaction.paymentMode = paymentMode;
                    existingTransaction.date = nepaliDate ? nepaliDate : new Date(billDate);

                    await existingTransaction.save({ session });
                } else {
                    // If no existing transaction, create a new one
                    const transaction = new Transaction({
                        item: product._id,
                        batchNumber: item.batchNumber, // Add batch number field
                        account: accountId,
                        billNumber: existingBill.billNumber,
                        partyBillNumber: existingBill.partyBillNumber,
                        quantity: item.quantity,
                        puPrice: item.puPrice,
                        unit: item.unit,
                        isType: 'Purc',
                        type: 'Purc',
                        purchaseBillId: existingBill._id,
                        purchaseSalesType: 'Purchase',
                        debit: 0,
                        credit: finalAmount,
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });

                    await transaction.save({ session });
                }


                // Increment stock quantity using FIFO
                await addStock(
                    product,
                    item.batchNumber,
                    item.expiryDate,
                    item.WSUnit,
                    item.quantity,
                    item.bonus || 0,
                    item.price,
                    item.puPrice,
                    item.marginPercentage,
                    item.mrp,
                    item.currency,
                    item.uniqueUuId, // Use the same uniqueUuId for stock entry
                    existingBillItemIndex !== -1 // isUpdate flag
                );

                // Create a transaction for the default Purchase Account
                const purchaseAmount = finalTaxableAmount + finalNonTaxableAmount;
                if (purchaseAmount > 0) {
                    const purchaseAccount = await Account.findOne({ name: 'Purchase', company: companyId });
                    if (purchaseAccount) {
                        const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
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
                        const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
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
                        const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
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

            }


            existingBill.items = billItems;
            await existingBill.save({ session });

            // If everything goes smoothly, commit the transaction
            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/purchase-bills/${existingBill._id}/edit/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Purchase updated successfully.');
                res.redirect(`/purchase-bills/edit/${billId}`);
            }


        } catch (error) {
            console.error('Error during edit:', error);
            req.flash('error', 'An error occurred while processing your request');
            return res.redirect(`/purchase-bills/edit/${billId}`);
        }
    }
});


router.get('/purchase-bills/:id/print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

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

            res.render('retailer/purchase/print', {
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
                body: 'retailer >> purchase >> print',
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

            res.render('retailer/purchase/directPrint', {
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

            res.render('retailer/purchase/directPrintEdit', {
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
    if (req.tradeType === 'retailer') {
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
            return res.render('retailer/purchase/purchaseVatReport', {
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

        res.render('retailer/purchase/purchaseVatReport', {
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
            body: 'retailer >> report >> statement',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } else {
        res.status(403).send('Access denied');
    }
});

module.exports = router;