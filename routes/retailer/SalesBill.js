const express = require('express');
const router = express.Router();

//npm install pdfkit fs
const PDFDocument = require('pdfkit');
//npm install pdfkit fs

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Item = require('../../models/retailer/Item');
const Unit = require('../../models/retailer/Unit');
const SalesBill = require('../../models/retailer/SalesBill');
const Transaction = require('../../models/retailer/Transaction');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const BillCounter = require('../../models/retailer/billCounter');
const Account = require('../../models/retailer/Account');
const Settings = require('../../models/retailer/Settings');
const Company = require('../../models/retailer/Company');
const NepaliDate = require('nepali-date');
const { ensureTradeType } = require('../../middleware/tradeType');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const FiscalYear = require('../../models/retailer/FiscalYear');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const CompanyGroup = require('../../models/retailer/CompanyGroup');
const Category = require('../../models/retailer/Category');


// Fetch all sales bills
router.get('/bills-list', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));


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

        const bills = await SalesBill.find({ company: companyId, fiscalYear: fiscalYear }).populate('account').populate('items.item').populate('user');
        res.render('retailer/sales-bills/allbills', {
            company,
            currentFiscalYear,
            bills,
            currentCompany,
            currentCompanyName,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});


router.get("/api/fetch/cashaccounts", async (req, res) => {
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
            name: { $in: ['Cash in Hand'] }
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


// Fetch items based on search query
router.get('/api/items/search', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const searchTerm = req.query.q;
            const items = await Item.find({ name: new RegExp(searchTerm, 'i'), company: companyId }).limit(10).populate('category').populate('unit'); // Limit results for performance
            res.json({ items: items });
        } catch (err) {
            res.status(500).send('Server error');
        }
    }
});

router.get('/bills', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const bills = await SalesBill.find({ company: companyId }).populate('account').populate('items.item');
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        console.log(company.renewalDate); // Debugging to see if renewalDate exists

        const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        const currentCompany = await Company.findById(new ObjectId(companyId));

        // Check if fiscal year is already in the session or available in the company
        const fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
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
                isActive: true
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        const items = await Item.find({
            company: companyId, fiscalYear: fiscalYear // Match items based on fiscalYearId
        })
            .populate('category')
            .populate('unit')
            .populate({
                path: 'stockEntries',
                match: { quantity: { $gt: 0 } }, // Only fetch stock entries with remaining quantity
                select: 'batchNumber expiryDate quantity', // Select only necessary fields
            });

        const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear }).populate('companyGroups');
        const companyGroups = await CompanyGroup.find({ company: companyId });

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter;
        try {
            billCounter = await BillCounter.findOne({
                company: companyId,
                fiscalYear: fiscalYear,
                transactionType: 'Sales' // Specify the transaction type for sales bill
            });
        } catch (error) {
            console.error('Error fetching bill counter:', error);
            return res.status(500).json({ error: 'An error occurred while fetching the bill counter.' });
        }

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }

        // // Extract openingStock and openingStockBalance if they exist for the current fiscal year
        // const itemsWithOpeningStock = items.map(item => {
        //     const openingStockEntry = item.openingStockByFiscalYear.find(entry => entry.fiscalYear.toString() === fiscalYear);
        //     return {
        //         ...item._doc,
        //         openingStock: openingStockEntry ? openingStockEntry.openingStock : 0,
        //         openingStockBalance: openingStockEntry ? openingStockEntry.openingStockBalance : 0
        //     };
        // });
        // Fetch categories and units for item creation
        const categories = await Category.find({ company: companyId });
        const units = await Unit.find({ company: companyId });

        res.render('retailer/sales-bills/bills', {
            company: company,
            companyGroups,
            companyId,
            accounts: accounts,
            items: items,
            categories,
            units,
            bills: bills,
            nextBillNumber: nextBillNumber, // Pass the next bill number to the view
            nepaliDate: nepaliDate,
            transactionDateNepali,
            companyDateFormat,
            initialCurrentFiscalYear,
            currentFiscalYear,
            currentCompany,
            vatEnabled: company.vatEnabled,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});


router.get('/sales-bills/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
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

        res.render('retailer/sales-bills/billNumberForm', {
            company,
            currentFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});

router.get('/sales-bills/edit/billNumber', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { billNumber } = req.query;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
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

        const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear })
            .populate('transactions')
            .populate('companyGroups');
        console.log('Accounts:', accounts);

        const bill = await SalesBill.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('items.item')
            .populate('items.unit')
            .populate('account')
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details

        if (!bill || !bill.items) {
            req.flash('error', 'Sales invoice not found!');
            return res.redirect('/sales-bills/finds')
        }

        // Check if the bill has an account field populated
        if (!bill.account) {
            req.flash('error', 'This bill is not associated with a credit account. Please search for a valid credit sales bill number.');
            return res.redirect('/sales-bills/finds');
        }

        res.render('retailer/sales-bills/edit', {
            bill,
            accounts,
            items: bill.items,
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


router.get('/cash-sales/sales-bills/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
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

        res.render('retailer/sales-bills/cash/billNumberForm', {
            company,
            currentFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


router.get('/cash-sales/sales-bills/edit/billNumber', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { billNumber } = req.query;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
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

        const bill = await SalesBill.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('items.item')
            .populate('items.unit')
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details

        if (!bill || !bill.items) {
            req.flash('error', 'Sales invoice not found!');
            return res.redirect('/cash-sales/sales-bills/finds')
        }

        // Check if the bill is associated with a cashAccount
        if (!bill.cashAccount) {
            req.flash('error', 'This bill is not associated with a cash account. Please search for a valid cash sales bill number.');
            return res.redirect('/cash-sales/sales-bills/finds');
        }

        res.render('retailer/sales-bills/cash/editCashSales', {
            bill,
            items: bill.items,
            billNumber: bill.billNumber,
            isVatExempt: bill.isVatExempt, // Pass isVatExempt to the template
            company,
            vatEnabled: company.vatEnabled,
            address: bill.address,
            subTotal: bill.subTotal,
            totalAmount: bill.totalAmount,
            discountPercentage: bill.discountPercentage,
            discountAmount: bill.discountAmount,
            taxableAmount: bill.taxableAmount,
            vatPercentage: bill.vatPercentage,
            vatAmount: bill.vatAmount,
            pan: bill.pan,
            companyDateFormat,
            billDate: bill.date,
            transactionDate: bill.transactionDate,
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
router.post('/bills', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { accountId, items, vatPercentage, transactionDateRoman, transactionDateNepali, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount, } = req.body;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id;
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

            console.log('Request Body:', req.body);

            if (!companyId) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Company ID is required.' });
            }
            if (!isVatExempt) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid vat selection.' });
            }
            if (!paymentMode) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid payment mode.' });
            }

            // Define date format regex pattern (e.g., YYYY-MM-DD)
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

            // Validate the date formats for English and Nepali dates
            if (
                (transactionDateRoman && !dateRegex.test(transactionDateRoman)) ||
                (transactionDateNepali && !dateRegex.test(transactionDateNepali)) ||
                (billDate && !dateRegex.test(billDate)) ||
                (nepaliDate && !dateRegex.test(nepaliDate))
            ) {
                await session.abortTransaction();
                session.endSession();
                req.flash('error', 'Invalid date format. Please use YYYY-MM-DD.');
                return res.redirect('/bills');
            }

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let subTotal = 0;
            let vatAmount = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            const accounts = await Account.findOne({ _id: accountId, company: companyId }).session(session);
            if (!accounts) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid account for this company' });
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/bills');
                }

                const itemTotal = parseFloat(item.price) * parseFloat(item.quantity, 10);
                subTotal += itemTotal;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += itemTotal;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += itemTotal;
                }
                // Check stock quantity using FIFO
                const availableStock = product.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
                if (availableStock < item.quantity) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Not enough stock for item: ${product.name}. Available: ${availableStock}, Required: ${item.quantity}`);
                    return res.redirect('/bills');
                }
            }

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    return res.redirect('/bills');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    return res.redirect('/bills');
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
            let roundOffForSales = await Settings.findOne({
                companyId, userId, fiscalYear: currentFiscalYear
            }).session(session);

            // Handle case where settings is null
            if (!roundOffForSales) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForSales = { roundOffSales: false };
            }
            let roundOffAmount = 0;
            if (roundOffForSales.roundOffSales) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSales.roundOffSales) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Create the bill number **after successful validation and processing**
            newBillNumber = await getNextBillNumber(companyId, fiscalYearId, 'Sales');

            // Create new bill
            const newBill = new SalesBill({
                billNumber: newBillNumber,
                account: accountId,
                purchaseSalesType: 'Sales',
                items: [], // We'll update this later
                isVatExempt: isVatExemptBool,
                isVatAll,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatSales: finalNonTaxableAmount,
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
            const accountTransaction = await Transaction.findOne({ account: accountId }).sort({ transactionDate: -1 }).session(session);
            if (accountTransaction) {
                previousBalance = accountTransaction.balance;
            }

            // Group items by (product, batchNumber) to aggregate quantities
            const groupedItems = {};
            for (const item of items) {
                const key = `${item.item}-${item.batchNumber || 'N/A'}`; // Handle batch numbers
                if (!groupedItems[key]) {
                    groupedItems[key] = { ...item, quantity: 0 }; // Ensure numeric quantity
                }
                groupedItems[key].quantity += Number(item.quantity); // Convert quantity to number before summing
            }

            async function reduceStock(product, quantity) {
                let remainingQuantity = quantity;
                const batchesUsed = []; // Array to track batches and quantities used

                // Sort stock entries FIFO (oldest first)
                product.stockEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

                for (let i = 0; i < product.stockEntries.length && remainingQuantity > 0; i++) {
                    let entry = product.stockEntries[i];

                    const quantityUsed = Math.min(entry.quantity, remainingQuantity);
                    batchesUsed.push({
                        batchNumber: entry.batchNumber,
                        quantity: quantityUsed,
                        uniqueUuId: entry.uniqueUuId, // Include the uniqueUuId of the batch
                    });

                    remainingQuantity -= quantityUsed;
                    entry.quantity -= quantityUsed;
                }

                // Remove depleted stock entries
                product.stockEntries = product.stockEntries.filter(entry => entry.quantity > 0);
                await product.save({ session });

                // If remainingQuantity > 0, it means there isn't enough stock
                if (remainingQuantity > 0) {
                    throw new Error(`Not enough stock for item: ${product.name}. Required: ${quantity}, Available: ${quantity - remainingQuantity}`);
                }

                return batchesUsed; // Return the batches and quantities used
            }

            // Process stock reduction and transaction recording
            const billItems = [];
            const transactions = [];

            // First process all stock reductions
            for (const item of Object.values(groupedItems)) {
                const product = await Item.findById(item.item).session(session);

                // Reduce stock using FIFO and get the batches used
                const batchesUsed = await reduceStock(product, item.quantity);

                // Create bill items for each batch used
                const itemsForBill = batchesUsed.map(batch => ({
                    item: product._id,
                    quantity: batch.quantity,
                    price: item.price,
                    unit: item.unit,
                    batchNumber: batch.batchNumber, // Use the actual batch number from stock reduction
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: fiscalYearId,
                    uniqueUuId: batch.uniqueUuId
                }));

                billItems.push(...itemsForBill);
            }

            // Now create a single transaction for the entire bill
            const transaction = new Transaction({
                account: accountId,
                billNumber: newBillNumber,
                isType: 'Sale',
                type: 'Sale',
                billId: newBill._id,
                purchaseSalesType: 'Sales',
                debit: finalAmount,
                credit: 0,
                paymentMode: paymentMode,
                balance: previousBalance - finalAmount,
                date: nepaliDate ? nepaliDate : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear
            });
            await transaction.save({ session });
            transactions.push(transaction);

            // Flatten the bill items array (since each item may have multiple batches)
            const flattenedBillItems = billItems.flat();

            // Create a transaction for the default Purchase Account
            const salesAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (salesAmount > 0) {
                const salesAccount = await Account.findOne({ name: 'Sales', company: companyId }).session(session);
                if (salesAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const salesTransaction = new Transaction({
                        account: salesAccount._id,
                        billNumber: newBillNumber,
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: salesAmount,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + salesAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await salesTransaction.save({ session });
                    console.log('Sales Transaction: ', salesTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId }).session(session);
                if (vatAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: newBillNumber,
                        isType: 'VAT',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: vatAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + vatAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save({ session });
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }

            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: newBillNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: roundOffAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: newBillNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: Math.abs(roundOffAmount),  // Debit the VAT account
                        credit: 0, // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }


            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId }).session(session);
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        // billNumber: billCounter.count,
                        billNumber: newBillNumber,
                        isType: 'Sale',
                        type: 'Sale',
                        billId: newBill._id,  // Set billId to the new bill's ID
                        purchaseSalesType: 'Sales',
                        debit: finalAmount,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: 0,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: previousBalance + finalAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear

                    });
                    await cashTransaction.save({ session });
                }
            }


            // Update bill with modified items
            newBill.items = flattenedBillItems;
            await newBill.save({ session });

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/bills/${newBill._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Bill saved successfully!');
                res.redirect('/bills');
            }
        } catch (error) {
            // Abort the transaction on error
            await session.abortTransaction();
            session.endSession();
            console.error('Error while creating sales bill:', error);
            req.flash('error', 'An error occurred while processing the bill.');
            return res.redirect('/bills');
        }
    }
});

router.get('/billsTrackBatchOpen', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const bills = await SalesBill.find({ company: companyId }).populate('account').populate('items.item');
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        const currentCompany = await Company.findById(new ObjectId(companyId));

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


        const items = await Item.find({
            company: companyId, fiscalYear: fiscalYear // Match items based on fiscalYearId
        })
            .populate('category')
            .populate('unit')
            .populate({
                path: 'stockEntries',
                match: { quantity: { $gt: 0 } }, // Only fetch stock entries with remaining quantity
                select: 'batchNumber expiryDate quantity', // Select only necessary fields
            });

        const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear }).populate('companyGroups');
        const companyGroups = await CompanyGroup.find({ company: companyId });

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'Sales' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }

        const categories = await Category.find({ company: companyId });
        const units = await Unit.find({ company: companyId });

        res.render('retailer/sales-bills/billsTrackBatchOpen', {
            company,
            companyId,
            currentFiscalYear,
            accounts: accounts,
            items: items,
            companyGroups,
            categories,
            units,
            bills: bills,
            nextBillNumber: nextBillNumber, // Pass the next bill number to the view
            nepaliDate: nepaliDate,
            transactionDateNepali,
            companyDateFormat,
            currentCompany,
            vatEnabled: company.vatEnabled,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Sales',
            body: 'retailer >> sales >> add',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// POST route to handle sales bill creation
router.post('/billsTrackBatchOpen', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const {
                accountId,
                items,
                vatPercentage,
                transactionDateRoman,
                transactionDateNepali,
                billDate,
                nepaliDate,
                isVatExempt,
                discountPercentage,
                paymentMode,
                roundOffAmount: manualRoundOffAmount,
            } = req.body;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id;
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

            console.log('Request Body:', req.body);

            if (!companyId) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Company ID is required.' });
            }
            if (!isVatExempt) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid vat selection.' });
            }
            if (!paymentMode) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid payment mode.' });
            }

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let subTotal = 0;
            let vatAmount = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            const accounts = await Account.findOne({ _id: accountId, company: companyId }).session(session);
            if (!accounts) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid account for this company' });
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/billsTrackBatchOpen');
                }

                const itemTotal = parseFloat(item.price) * parseFloat(item.quantity, 10);
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
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Batch number ${item.batchNumber} not found for item: ${product.name}`);
                    return res.redirect('/billsTrackBatchOpen');
                }

                // Check stock quantity using FIFO
                if (batchEntry.quantity < item.quantity) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Not enough stock for item: ${product.name}. Available: ${batchEntry.quantity}, Required: ${item.quantity}`);
                    return res.redirect('/billsTrackBatchOpen');
                }
            }

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    return res.redirect('/billsTrackBatchOpen');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    return res.redirect('/billsTrackBatchOpen');
                }
            }

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'Sales');

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
            let roundOffForSales = await Settings.findOne({
                companyId, userId, fiscalYear: currentFiscalYear
            }).session(session);

            // Handle case where settings is null
            if (!roundOffForSales) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForSales = { roundOffSales: false };
            }
            let roundOffAmount = 0;
            if (roundOffForSales.roundOffSales) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSales.roundOffSales) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Create new bill
            const newBill = new SalesBill({
                billNumber: billNumber,
                account: accountId,
                purchaseSalesType: 'Sales',
                items: [], // We'll update this later
                isVatExempt: isVatExemptBool,
                isVatAll,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatSales: finalNonTaxableAmount,
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
            const accountTransaction = await Transaction.findOne({ account: accountId }).sort({ transactionDate: -1 }).session(session);
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
                await product.save({ session });
            }

            // Process all items first to reduce stock and build bill items
            const billItems = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/billsTrackBatchOpen');
                }

                // Reduce stock for the specific batch
                await reduceStockBatchWise(product, item.batchNumber, item.quantity, item.uniqueUuId);

                // Update product stock
                product.stock -= item.quantity;
                await product.save({ session });

                billItems.push({
                    item: product._id,
                    quantity: item.quantity,
                    price: item.price,
                    unit: item.unit,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: fiscalYearId,
                    uniqueUuId: item.uniqueUuId,
                });
            }

            // Calculate the correct total amount from the bill (not from items)
            // Assuming newBill has the correct total amount already calculated
            const correctTotalAmount = newBill.totalAmount; // This should be 14125 in your example

            // Create a single transaction for the entire bill
            const transaction = new Transaction({
                account: accountId,
                billNumber: billNumber,
                quantity: items.reduce((sum, item) => sum + item.quantity, 0), // Total quantity
                price: items[0].price, // Assuming same price for all items
                unit: items[0].unit, // Assuming same unit for all items
                isType: 'Sale',
                type: 'Sale',
                billId: newBill._id,
                purchaseSalesType: 'Sales',
                debit: correctTotalAmount, // Use the bill's total amount directly
                credit: 0,
                paymentMode: paymentMode,
                balance: previousBalance - correctTotalAmount,
                date: nepaliDate ? nepaliDate : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear
            });

            await transaction.save({ session });
            console.log('Transaction amount:', correctTotalAmount);

            // Create a transaction for the default Sales Account
            const salesAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (salesAmount > 0) {
                const salesAccount = await Account.findOne({ name: 'Sales', company: companyId }).session(session);
                if (salesAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const salesTransaction = new Transaction({
                        account: salesAccount._id,
                        billNumber: billNumber,
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: salesAmount,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + salesAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await salesTransaction.save({ session });
                    console.log('Sales Transaction: ', salesTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId }).session(session);
                if (vatAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: billNumber,
                        isType: 'VAT',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: vatAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + vatAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save({ session });
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }

            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: roundOffAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(accountId).session(session); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: Math.abs(roundOffAmount),  // Debit the VAT account
                        credit: 0, // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId }).session(session);
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        billNumber: billNumber,
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: 'Sales',
                        debit: finalAmount,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: 0,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: previousBalance + finalAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await cashTransaction.save({ session });
                }
            }

            // Update bill with items
            newBill.items = billItems;
            await newBill.save({ session });

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/bills/${newBill._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Bill saved successfully!');
                res.redirect('/billsTrackBatchOpen');
            }
        } catch (error) {
            console.error("Error creating bill:", error);
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'Error creating bill');
            res.redirect('/billsTrackBatchOpen');
        }
    }
});


router.get('/cash/bills/add', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const bills = await SalesBill.find({ company: companyId }).populate('account').populate('items.item');
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        console.log(company.renewalDate); // Debugging to see if renewalDate exists

        const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        const currentCompany = await Company.findById(new ObjectId(companyId));

        // Check if fiscal year is already in the session or available in the company
        const fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
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
                isActive: true
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        const items = await Item.find({
            company: companyId, fiscalYear: fiscalYear // Match items based on fiscalYearId
        })
            .populate('category')
            .populate('unit')
            .populate({
                path: 'stockEntries',
                match: { quantity: { $gt: 0 } }, // Only fetch stock entries with remaining quantity
                select: 'batchNumber expiryDate quantity', // Select only necessary fields
            });

        const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear }).populate('companyGroups');
        const companyGroups = await CompanyGroup.find({ company: companyId });

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter;
        try {
            billCounter = await BillCounter.findOne({
                company: companyId,
                fiscalYear: fiscalYear,
                transactionType: 'Sales' // Specify the transaction type for sales bill
            });
        } catch (error) {
            console.error('Error fetching bill counter:', error);
            return res.status(500).json({ error: 'An error occurred while fetching the bill counter.' });
        }

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }

        // Fetch categories and units for item creation
        const categories = await Category.find({ company: companyId });
        const units = await Unit.find({ company: companyId });

        res.render('retailer/sales-bills/cash/add', {
            company: company,
            companyGroups,
            companyId,
            accounts: accounts,
            items: items,
            categories,
            units,
            bills: bills,
            nextBillNumber: nextBillNumber, // Pass the next bill number to the view
            nepaliDate: nepaliDate,
            transactionDateNepali,
            companyDateFormat,
            initialCurrentFiscalYear,
            currentFiscalYear,
            currentCompany,
            vatEnabled: company.vatEnabled,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// POST route to handle cash sales bill creation
router.post('/cash/bills/add', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { cashAccount, cashAccountAddress, cashAccountPan, cashAccountEmail, cashAccountPhone, items, vatPercentage, transactionDateRoman, transactionDateNepali, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount, } = req.body;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id;
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

            console.log('Request Body:', req.body);

            if (!companyId) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Company ID is required.' });
            }
            if (!isVatExempt) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid vat selection.' });
            }
            if (!paymentMode) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid payment mode.' });
            }

            // Define date format regex pattern (e.g., YYYY-MM-DD)
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

            // Validate the date formats for English and Nepali dates
            if (
                (transactionDateRoman && !dateRegex.test(transactionDateRoman)) ||
                (transactionDateNepali && !dateRegex.test(transactionDateNepali)) ||
                (billDate && !dateRegex.test(billDate)) ||
                (nepaliDate && !dateRegex.test(nepaliDate))
            ) {
                await session.abortTransaction();
                session.endSession();
                req.flash('error', 'Invalid date format. Please use YYYY-MM-DD.');
                return res.redirect('/bills');
            }

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let subTotal = 0;
            let vatAmount = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            if (!cashAccount) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid account for this company' });
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/bills');
                }

                const itemTotal = parseFloat(item.price) * parseFloat(item.quantity, 10);
                subTotal += itemTotal;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += itemTotal;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += itemTotal;
                }

                // Check stock quantity using FIFO
                const availableStock = product.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
                if (availableStock < item.quantity) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Not enough stock for item: ${product.name}. Available: ${availableStock}, Required: ${item.quantity}`);
                    return res.redirect('/bills');
                }
            }

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    return res.redirect('/bills');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    return res.redirect('/bills');
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
            let roundOffForSales = await Settings.findOne({
                companyId, userId, fiscalYear: currentFiscalYear
            }).session(session);

            // Handle case where settings is null
            if (!roundOffForSales) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForSales = { roundOffSales: false };
            }
            let roundOffAmount = 0;
            if (roundOffForSales.roundOffSales) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSales.roundOffSales) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Create the bill number **after successful validation and processing**
            newBillNumber = await getNextBillNumber(companyId, fiscalYearId, 'Sales');

            // Create new bill
            const newBill = new SalesBill({
                billNumber: newBillNumber,
                cashAccount: cashAccount,
                cashAccountAddress,
                cashAccountPan,
                cashAccountEmail,
                cashAccountPhone,
                purchaseSalesType: 'Sales',
                items: [], // We'll update this later
                isVatExempt: isVatExemptBool,
                isVatAll,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatSales: finalNonTaxableAmount,
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
            const accountTransaction = await Transaction.findOne({ cashAccount: cashAccount }).sort({ transactionDate: -1 }).session(session);
            if (accountTransaction) {
                previousBalance = accountTransaction.balance;
            }

            // Group items by (product, batchNumber) to aggregate quantities
            const groupedItems = {};
            for (const item of items) {
                const key = `${item.item}-${item.batchNumber || 'N/A'}`; // Handle batch numbers
                if (!groupedItems[key]) {
                    groupedItems[key] = { ...item, quantity: 0 }; // Ensure numeric quantity
                }
                groupedItems[key].quantity += Number(item.quantity); // Convert quantity to number before summing
            }

            async function reduceStock(product, quantity) {
                let remainingQuantity = quantity;
                const batchesUsed = []; // Array to track batches and quantities used

                // Sort stock entries FIFO (oldest first)
                product.stockEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

                for (let i = 0; i < product.stockEntries.length && remainingQuantity > 0; i++) {
                    let entry = product.stockEntries[i];

                    const quantityUsed = Math.min(entry.quantity, remainingQuantity);
                    batchesUsed.push({
                        batchNumber: entry.batchNumber,
                        quantity: quantityUsed,
                        uniqueUuId: entry.uniqueUuId, // Include the uniqueUuId of the batch
                    });

                    remainingQuantity -= quantityUsed;
                    entry.quantity -= quantityUsed;
                }

                // Remove depleted stock entries
                product.stockEntries = product.stockEntries.filter(entry => entry.quantity > 0);
                await product.save({ session });

                // If remainingQuantity > 0, it means there isn't enough stock
                if (remainingQuantity > 0) {
                    throw new Error(`Not enough stock for item: ${product.name}. Required: ${quantity}, Available: ${quantity - remainingQuantity}`);
                }

                return batchesUsed; // Return the batches and quantities used
            }

            // Process stock reduction and transaction recording
            const billItems = [];
            const transactions = [];

            // First process all stock reductions
            for (const item of Object.values(groupedItems)) {
                const product = await Item.findById(item.item).session(session);

                // Reduce stock using FIFO and get the batches used
                const batchesUsed = await reduceStock(product, item.quantity);

                // Create bill items for each batch used
                const itemsForBill = batchesUsed.map(batch => ({
                    item: product._id,
                    quantity: batch.quantity,
                    price: item.price,
                    unit: item.unit,
                    batchNumber: batch.batchNumber, // Use the actual batch number from stock reduction
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: fiscalYearId,
                    uniqueUuId: batch.uniqueUuId
                }));

                billItems.push(...itemsForBill);
            }

            // Now create a single transaction for the entire bill
            const transaction = new Transaction({
                account: accountId,
                billNumber: newBillNumber,
                isType: 'Sale',
                type: 'Sale',
                billId: newBill._id,
                purchaseSalesType: 'Sales',
                debit: finalAmount,
                credit: 0,
                paymentMode: paymentMode,
                balance: previousBalance - finalAmount,
                date: nepaliDate ? nepaliDate : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear
            });
            await transaction.save({ session });
            transactions.push(transaction);

            // Flatten the bill items array (since each item may have multiple batches)
            const flattenedBillItems = billItems.flat();
            // Create a transaction for the default Purchase Account
            const salesAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (salesAmount > 0) {
                const salesAccount = await Account.findOne({ name: 'Sales', company: companyId }).session(session);
                if (salesAccount) {
                    const salesTransaction = new Transaction({
                        account: salesAccount._id,
                        billNumber: newBillNumber,
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: salesAmount,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + salesAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await salesTransaction.save({ session });
                    console.log('Sales Transaction: ', salesTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId }).session(session);
                if (vatAccount) {
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: newBillNumber,
                        isType: 'VAT',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: vatAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + vatAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save({ session });
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }

            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: newBillNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: Math.abs(roundOffAmount),         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: newBillNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: Math.abs(roundOffAmount),  // Debit the round off ammout
                        credit: 0, // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId }).session(session);
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        cashAccount: cashAccount,
                        billNumber: newBillNumber,
                        isType: 'Sale',
                        type: 'Sale',
                        billId: newBill._id,  // Set billId to the new bill's ID
                        purchaseSalesType: 'Sales',
                        debit: finalAmount,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: 0,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: previousBalance + finalAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await cashTransaction.save({ session });
                }
            }

            // Update bill with modified items
            newBill.items = flattenedBillItems;
            await newBill.save({ session });

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/bills/${newBill._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Bill saved successfully!');
                res.redirect('/cash/bills/add');
            }
        } catch (error) {
            console.error('Error while creating sales bill:', error);
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'An error occurred while processing the bill.');
            return res.redirect('/bills');
        }
    }
});

router.get('/cash/bills/addOpen', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const bills = await SalesBill.find({ company: companyId }).populate('account').populate('items.item');
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        const currentCompany = await Company.findById(new ObjectId(companyId));

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


        const items = await Item.find({
            company: companyId, fiscalYear: fiscalYear // Match items based on fiscalYearId
        })
            .populate('category')
            .populate('unit')
            .populate({
                path: 'stockEntries',
                match: { quantity: { $gt: 0 } }, // Only fetch stock entries with remaining quantity
                select: 'batchNumber expiryDate quantity', // Select only necessary fields
            });

        const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear }).populate('companyGroups');
        const companyGroups = await CompanyGroup.find({ company: companyId });

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'Sales' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }

        const categories = await Category.find({ company: companyId });
        const units = await Unit.find({ company: companyId });

        res.render('retailer/sales-bills/cash/addOpen', {
            company,
            companyId,
            currentFiscalYear,
            accounts: accounts,
            items: items,
            companyGroups,
            categories,
            units,
            bills: bills,
            nextBillNumber: nextBillNumber, // Pass the next bill number to the view
            nepaliDate: nepaliDate,
            transactionDateNepali,
            companyDateFormat,
            currentCompany,
            vatEnabled: company.vatEnabled,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Sales',
            body: 'retailer >> sales >> add',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// POST route to handle sales bill creation
router.post('/cash/bills/addOpen', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const {
                cashAccount,
                cashAccountAddress,
                cashAccountPan,
                cashAccountEmail,
                cashAccountPhone,
                items,
                vatPercentage,
                transactionDateRoman,
                transactionDateNepali,
                billDate,
                nepaliDate,
                isVatExempt,
                discountPercentage,
                paymentMode,
                roundOffAmount: manualRoundOffAmount,
            } = req.body;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id;
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

            console.log('Request Body:', req.body);

            if (!companyId) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Company ID is required.' });
            }
            if (!isVatExempt) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid vat selection.' });
            }
            if (!paymentMode) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid payment mode.' });
            }

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
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Company ID is required' });
            }

            if (!cashAccount) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Invalid account for this company' });
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/billsTrackBatchOpen');
                }

                const itemTotal = parseFloat(item.price) * parseFloat(item.quantity, 10);
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
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Batch number ${item.batchNumber} not found for item: ${product.name}`);
                    return res.redirect('/billsTrackBatchOpen');
                }

                // Check stock quantity using FIFO
                if (batchEntry.quantity < item.quantity) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Not enough stock for item: ${product.name}. Available: ${batchEntry.quantity}, Required: ${item.quantity}`);
                    return res.redirect('/billsTrackBatchOpen');
                }
            }

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    return res.redirect('/billsTrackBatchOpen');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    return res.redirect('/billsTrackBatchOpen');
                }
            }

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'Sales');

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
            let roundOffForSales = await Settings.findOne({
                companyId, userId, fiscalYear: currentFiscalYear
            }).session(session);

            // Handle case where settings is null
            if (!roundOffForSales) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForSales = { roundOffSales: false };
            }
            let roundOffAmount = 0;
            if (roundOffForSales.roundOffSales) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSales.roundOffSales) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Create new bill
            const newBill = new SalesBill({
                billNumber: billNumber,
                cashAccount: cashAccount,
                cashAccountAddress,
                cashAccountPan,
                cashAccountEmail,
                cashAccountPhone,
                purchaseSalesType: 'Sales',
                items: [], // We'll update this later
                isVatExempt: isVatExemptBool,
                isVatAll,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatSales: finalNonTaxableAmount,
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
            const accountTransaction = await Transaction.findOne({ cashAccount: cashAccount }).sort({ transactionDate: -1 }).session(session);
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
                await product.save({ session });
            }

            // Process all items first to reduce stock and build bill items
            const billItems = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/billsTrackBatchOpen');
                }

                // Reduce stock for the specific batch
                await reduceStockBatchWise(product, item.batchNumber, item.quantity, item.uniqueUuId);

                // Update product stock
                product.stock -= item.quantity;
                await product.save({ session });

                billItems.push({
                    item: product._id,
                    quantity: item.quantity,
                    price: item.price,
                    unit: item.unit,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: fiscalYearId,
                    uniqueUuId: item.uniqueUuId,
                });
            }

            // Calculate the correct total amount from the bill (not from items)
            // Assuming newBill has the correct total amount already calculated
            const correctTotalAmount = newBill.totalAmount; // This should be 14125 in your example

            // Create a single transaction for the entire bill
            const transaction = new Transaction({
                cashAccount: cashAccount,
                billNumber: billNumber,
                quantity: items.reduce((sum, item) => sum + item.quantity, 0), // Total quantity
                price: items[0].price, // Assuming same price for all items
                unit: items[0].unit, // Assuming same unit for all items
                isType: 'Sale',
                type: 'Sale',
                billId: newBill._id,
                purchaseSalesType: 'Sales',
                debit: correctTotalAmount, // Use the bill's total amount directly
                credit: 0,
                paymentMode: paymentMode,
                balance: previousBalance - correctTotalAmount,
                date: nepaliDate ? nepaliDate : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear
            });

            await transaction.save({ session });
            console.log('Transaction amount:', correctTotalAmount);


            // Update bill with items
            newBill.items = billItems;
            await newBill.save({ session });

            // Create a transaction for the default Sales Account
            const salesAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (salesAmount > 0) {
                const salesAccount = await Account.findOne({ name: 'Sales', company: companyId }).session(session);
                if (salesAccount) {
                    const salesTransaction = new Transaction({
                        account: salesAccount._id,
                        billNumber: billNumber,
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: salesAmount,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + salesAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await salesTransaction.save({ session });
                    console.log('Sales Transaction: ', salesTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId }).session(session);
                if (vatAccount) {
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: billNumber,
                        isType: 'VAT',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: vatAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + vatAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save({ session });
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }

            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: roundOffAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: newBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: Math.abs(roundOffAmount),  // Debit the VAT account
                        credit: 0, // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId }).session(session);
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        cashAccount: cashAccount,
                        billNumber: billNumber,
                        isType: 'Sale',
                        type: 'Sale',
                        billId: newBill._id,  // Set billId to the new bill's ID
                        purchaseSalesType: 'Sales',
                        debit: finalAmount,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: 0,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: previousBalance + finalAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await cashTransaction.save({ session });
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
                res.redirect(`/bills/${newBill._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Bill saved successfully!');
                res.redirect('/cash/bills/addOpen');
            }
        } catch (error) {
            console.error("Error creating bill:", error);
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'Error creating bill');
            res.redirect('/cash/bills/addOpen');
        }
    }
});

// GET route to render the edit page for a sales bill
router.get('/bills/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const billId = req.params.id;
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
            const currentCompanyName = req.session.currentCompanyName;
            const currentCompany = await Company.findById(new ObjectId(companyId));
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

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

            const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear })
                .populate('transactions')
                .populate('companyGroups');
            console.log('Accounts:', accounts);

            // Find the bill by ID and populate relevant data
            const bill = await SalesBill.findById({ _id: billId, company: companyId, fiscalYear: fiscalYear })
                .populate({ path: 'items.item' })
                .populate('items.unit')
                .populate('account')
                .exec();
            if (!bill || bill.company.toString() !== companyId) {
                req.flash('error', 'Bill not found or does not belong to the selected company');
                return res.redirect('/billsTrackBatchOpen');
            }
            console.log('Bill Account:', bill.account);

            // Ensure selectedAccountId is set to the ID of the account linked to the bill
            const selectedAccountId = bill.account ? bill.account._id.toString() : null;

            console.log('Fetched Accounts:', accounts);
            console.log('Fetched Bill:', bill);
            console.log('Selected Account ID:', selectedAccountId);


            // Render the edit page with the bill data
            res.render('retailer/sales-bills/edit', {
                company,
                items: bill.items,
                bill,
                vatEnabled: company.vatEnabled,
                billId: bill._id,
                billNumber: bill.billNumber,
                paymentMode: bill.paymentMode,
                isVatExempt: bill.isVatExempt, // Pass isVatExempt to the template
                selectedAccountId: selectedAccountId, // Updated line
                accounts: accounts, // Pass accounts to the template
                selectedAccountId: accounts, // Add selected account ID if needed
                // selectedAccountAddress: selectedAccountId.address || '',
                // selectedAccountPan: selectedAccountId.pan || '',
                address: bill.address,
                subTotal: bill.subTotal,
                totalAmount: bill.totalAmount,
                discountPercentage: bill.discountPercentage,
                discountAmount: bill.discountAmount,
                taxableAmount: bill.taxableAmount,
                vatPercentage: bill.vatPercentage,
                vatAmount: bill.vatAmount,
                pan: bill.pan,
                currentCompany,
                currentCompanyName,
                companyDateFormat,
                initialCurrentFiscalYear,
                currentFiscalYear,
                billDate: bill.date,
                transactionDate: bill.transactionDate,
                user: req.user,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'

            });
        } catch (error) {
            console.error("Error fetching bill for edit:", error);
            req.flash('error', 'Error fetching bill for edit');
            res.redirect('/billsTrackBatchOpen');
        }
    }
});


//for cash account edit
// GET route to render the edit page for a sales bill
router.get('/bills/editCashAccount/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const billId = req.params.id;
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
            const currentCompanyName = req.session.currentCompanyName;
            const currentCompany = await Company.findById(new ObjectId(companyId));
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

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

            // const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear })
            //     .populate('transactions')
            //     .populate('companyGroups');
            // console.log('Accounts:', accounts);

            // Find the bill by ID and populate relevant data
            const bill = await SalesBill.findById({ _id: billId, company: companyId, fiscalYear: fiscalYear })
                .populate({ path: 'items.item' })
                .populate('items.unit')
                .exec();
            if (!bill || bill.company.toString() !== companyId) {
                req.flash('error', 'Bill not found or does not belong to the selected company');
                return res.redirect('/billsTrackBatchOpen');
            }
            // console.log('Bill Account:', bill.account);

            // Ensure selectedAccountId is set to the ID of the account linked to the bill
            // const selectedAccountId = bill.account ? bill.account._id.toString() : null;

            // console.log('Fetched Accounts:', accounts);
            // console.log('Fetched Bill:', bill);
            // console.log('Selected Account ID:', selectedAccountId);


            // Render the edit page with the bill data
            res.render('retailer/sales-bills/cash/editCashSales', {
                company,
                items: bill.items,
                bill,
                vatEnabled: company.vatEnabled,
                billId: bill._id,
                billNumber: bill.billNumber,
                paymentMode: bill.paymentMode,
                isVatExempt: bill.isVatExempt, // Pass isVatExempt to the template
                // selectedAccountId: selectedAccountId, // Updated line
                // accounts: accounts, // Pass accounts to the template
                // selectedAccountId: accounts, // Add selected account ID if needed
                // selectedAccountAddress: selectedAccountId.address || '',
                // selectedAccountPan: selectedAccountId.pan || '',
                cashAccountAddress: bill.cashAccountAddress,
                subTotal: bill.subTotal,
                totalAmount: bill.totalAmount,
                discountPercentage: bill.discountPercentage,
                discountAmount: bill.discountAmount,
                taxableAmount: bill.taxableAmount,
                vatPercentage: bill.vatPercentage,
                vatAmount: bill.vatAmount,
                cashAccountPan: bill.cashAccountPan,
                currentCompany,
                currentCompanyName,
                companyDateFormat,
                initialCurrentFiscalYear,
                currentFiscalYear,
                billDate: bill.date,
                transactionDate: bill.transactionDate,
                user: req.user,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'

            });
        } catch (error) {
            console.error("Error fetching bill for edit:", error);
            req.flash('error', 'Error fetching bill for edit');
            res.redirect('/billsTrackBatchOpen');
        }
    }
});

// PUT route to update a sales bill
router.put('/bills/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        const billId = req.params.id;
        try {
            const {
                accountId,
                items,
                vatPercentage,
                transactionDateRoman,
                transactionDateNepali,
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
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Company ID is required' });
            }

            // Fetch the existing bill
            const existingBill = await SalesBill.findOne({ _id: billId, company: companyId }).session(session);
            if (!existingBill) {
                await session.abortTransaction();
                session.endSession();
                req.flash('error', 'Bill not found');
                return res.redirect(`/bills/edit/${billId}`);
            }

            const account = await Account.findById(accountId).session(session);
            if (!account) {
                await session.abortTransaction();
                session.endSession();
                req.flash('error', 'Account not found');
                return res.redirect(`/bills/edit/${billId}`);
            }

            // Step 1: Identify removed items and restore stock
            const removedItems = existingBill.items.filter(existingItem =>
                !items.some(item =>
                    item.item === existingItem.item.toString() &&
                    item.batchNumber === existingItem.batchNumber &&
                    item.uniqueUuId === existingItem.uniqueUuId
                )
            );

            for (const removedItem of removedItems) {
                const product = await Item.findById(removedItem.item).session(session);
                if (!product) {
                    console.warn(`Product with ID ${removedItem.item} not found`);
                    continue;
                }

                const batchEntry = product.stockEntries.find(entry =>
                    entry.batchNumber === removedItem.batchNumber &&
                    entry.uniqueUuId === removedItem.uniqueUuId
                );

                if (batchEntry) {
                    batchEntry.quantity += removedItem.quantity; // Restore stock
                    await product.save({ session });
                } else {
                    console.warn(`Batch number ${removedItem.batchNumber} not found for product: ${product.name}`);
                }
            }

            console.log('Stock successfully restored for removed items.');

            // // Reverse stock from existing bill items
            // for (const existingItem of existingBill.items) {
            //     const product = await Item.findById(existingItem.item).session(session);
            //     if (!product) {
            //         console.warn(`Product with ID ${existingItem.item} not found`);
            //         continue;
            //     }

            //     const batchEntry = product.stockEntries.find(entry => entry.batchNumber === existingItem.batchNumber && entry.uniqueUuId === existingItem.uniqueUuId);
            //     if (batchEntry) {
            //         batchEntry.quantity += existingItem.quantity; // Restore stock
            //         await product.save({ session });
            //     } else {
            //         console.warn(`Batch number ${existingItem.batchNumber} not found for product: ${product.name}`);
            //     }
            // }

            // console.log('Stock successfully reversed for existing bill items.');

            // Step 1: Identify updated items
            const updatedItems = existingBill.items.filter(existingItem =>
                items.some(item =>
                    item.item === existingItem.item.toString() &&
                    item.batchNumber === existingItem.batchNumber &&
                    item.uniqueUuId === existingItem.uniqueUuId
                )
            );

            // Step 2: Reverse stock for updated items
            for (const updatedItem of updatedItems) {
                const product = await Item.findById(updatedItem.item).session(session);
                if (!product) {
                    console.warn(`Product with ID ${updatedItem.item} not found`);
                    continue;
                }

                // Find the exact batch entry using both batchNumber and uniqueUuId
                const batchEntry = product.stockEntries.find(entry =>
                    entry.batchNumber === updatedItem.batchNumber &&
                    entry.uniqueUuId === updatedItem.uniqueUuId
                );

                if (batchEntry) {
                    // Restore stock for the old quantity
                    batchEntry.quantity += updatedItem.quantity;
                    await product.save({ session });
                    console.log(`Stock restored for batch ${updatedItem.batchNumber} with uniqueUuId ${updatedItem.uniqueUuId} for product: ${product.name}`);
                } else {
                    console.warn(`Batch number ${updatedItem.batchNumber} with uniqueUuId ${updatedItem.uniqueUuId} not found for product: ${product.name}`);
                }
            }

            console.log('Stock successfully reversed for updated items.');

            // Delete all associated transactions
            await Transaction.deleteMany({ billId: existingBill._id }).session(session);
            console.log('Existing transactions deleted successfully');


            // Calculate amounts based on the updated items
            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;

            for (const item of items) {
                const product = await Item.findById(item.item).session(session);
                if (!product) {
                    throw new Error(`Product with ID ${item.item} not found`);
                }

                if (product.vatStatus === 'vatable') {
                    totalTaxableAmount += item.quantity * item.price;
                } else {
                    totalNonTaxableAmount += item.quantity * item.price;
                }
            }

            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            let vatAmount = 0;
            if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
                vatAmount = (finalTaxableAmount * vatPercentage) / 100;
            }

            const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

            let finalAmount = totalAmount;

            // Check if round off is enabled in settings
            let roundOffForSales = await Settings.findOne({
                companyId, userId, fiscalYear: currentFiscalYear
            }).session(session);

            // Handle case where settings is null
            if (!roundOffForSales) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForSales = { roundOffSales: false };
            }
            let roundOffAmount = 0;
            if (roundOffForSales.roundOffSales) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSales.roundOffSales) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Update existing bill
            existingBill.account = accountId;
            existingBill.isVatExempt = isVatExemptBool;
            existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
            existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
            existingBill.discountPercentage = discount;
            existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
            existingBill.nonVatSales = finalNonTaxableAmount;
            existingBill.taxableAmount = finalTaxableAmount;
            existingBill.vatAmount = vatAmount;
            existingBill.totalAmount = finalAmount;
            existingBill.roundOffAmount = roundOffAmount;
            existingBill.isVatAll = isVatAll;
            existingBill.paymentMode = paymentMode;
            existingBill.date = nepaliDate || new Date(billDate);
            existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

            // Reduce stock for new items
            const billItems = await Promise.all(items.map(async item => {
                const product = await Item.findById(item.item).session(session);
                if (!product) {
                    throw new Error(`Product with ID ${item.item} not found`);
                }

                // Reduce stock for the specific batch
                const batchEntry = product.stockEntries.find(entry => entry.batchNumber === item.batchNumber && entry.uniqueUuId === item.uniqueUuId);
                if (!batchEntry) {
                    throw new Error(`Batch number ${item.batchNumber} not found for product: ${product.name}`);
                }

                if (batchEntry.quantity < item.quantity) {
                    throw new Error(`Not enough stock for batch number ${item.batchNumber} of product: ${product.name}`);
                }

                batchEntry.quantity -= item.quantity; // Reduce stock
                await product.save({ session });

                return {
                    item: product._id,
                    quantity: item.quantity,
                    price: item.price,
                    unit: item.unit,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: currentFiscalYear,
                    uniqueUuId: item.uniqueUuId
                };
            }));

            existingBill.items = billItems;
            await existingBill.save({ session });

            // Recreate transactions for the updated bill
            await Promise.all(billItems.map(async item => {
                const product = await Item.findById(item.item).session(session);
                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    throw new Error(`Product with ID ${item.item} not found`);
                }

                const transaction = new Transaction({
                    item: product._id,
                    account: accountId,
                    billNumber: existingBill.billNumber,
                    quantity: item.quantity,
                    price: item.price,
                    unit: item.unit,
                    type: 'Sale',
                    billId: existingBill._id,
                    purchaseSalesType: 'Sales',
                    debit: finalAmount,
                    credit: 0,
                    paymentMode: paymentMode,
                    balance: 0, // Adjust with the correct balance logic
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear
                });

                await transaction.save({ session });
            }));

            console.log('All transactions successfully created for updated bill.');

            // Create additional transactions (Sales, VAT, Round-off, Cash)
            const salesAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (salesAmount > 0) {
                const salesAccount = await Account.findOne({ name: 'Sales', company: companyId }).session(session);
                if (salesAccount) {
                    const salesTransaction = new Transaction({
                        account: salesAccount._id,
                        billNumber: existingBill.billNumber,
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: account.name,
                        debit: 0,
                        credit: salesAmount,
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await salesTransaction.save({ session });
                    console.log('Sales Transaction: ', salesTransaction);
                }
            }

            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId }).session(session);
                if (vatAccount) {
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: existingBill.billNumber,
                        isType: 'VAT',
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: account.name,
                        debit: 0,
                        credit: vatAmount,
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save({ session });
                    console.log('VAT Transaction: ', vatTransaction);
                }
            }

            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: account.name,
                        debit: 0,
                        credit: roundOffAmount,
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: account.name,
                        debit: roundOffAmount,
                        credit: 0,
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId }).session(session);
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        billNumber: existingBill.billNumber,
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: 'Sales',
                        debit: finalAmount,
                        credit: 0,
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await cashTransaction.save({ session });
                    console.log('Cash Transaction: ', cashTransaction);
                }
            }

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/bills/${billId}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Bill updated successfully');
                res.redirect(`/bills/edit/${billId}`);
            }
        } catch (error) {
            console.error("Error updating bill:", error);
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'Error updating bill');
            res.redirect(`/bills/edit/${billId}`);
        }
    }
});

// PUT route to update a cash sales bill
router.put('/bills/editCashAccount/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();
        const billId = req.params.id;
        try {
            const {
                cashAccount,
                cashAccountAddress,
                cashAccountPan,
                cashAccountEmail,
                cashAccountPhone,
                items,
                vatPercentage,
                transactionDateRoman,
                transactionDateNepali,
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
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'Company ID is required' });
            }

            // Fetch the existing bill
            const existingBill = await SalesBill.findOne({ _id: billId, company: companyId }).session(session);
            if (!existingBill) {
                await session.abortTransaction();
                session.endSession();
                req.flash('error', 'Bill not found');
                return res.redirect(`/bills/editCashAccount/${billId}`);
            }

            // // Reverse stock from existing bill items
            // for (const existingItem of existingBill.items) {
            //     const product = await Item.findById(existingItem.item).session(session);
            //     if (!product) {
            //         console.warn(`Product with ID ${existingItem.item} not found`);
            //         continue;
            //     }

            //     const batchEntry = product.stockEntries.find(entry => entry.batchNumber === existingItem.batchNumber);
            //     if (batchEntry) {
            //         batchEntry.quantity += existingItem.quantity; // Restore stock
            //         await product.save({ session });
            //     } else {
            //         console.warn(`Batch number ${existingItem.batchNumber} not found for product: ${product.name}`);
            //     }
            // }

            // console.log('Stock successfully reversed for existing bill items.');
            // Step 1: Identify removed items and restore stock
            const removedItems = existingBill.items.filter(existingItem =>
                !items.some(item =>
                    item.item === existingItem.item.toString() &&
                    item.batchNumber === existingItem.batchNumber &&
                    item.uniqueUuId === existingItem.uniqueUuId
                )
            );
            for (const removedItem of removedItems) {
                const product = await Item.findById(removedItem.item).session(session);
                if (!product) {
                    console.warn(`Product with ID ${removedItem.item} not found`);
                    continue;
                }

                const batchEntry = product.stockEntries.find(entry =>
                    entry.batchNumber === removedItem.batchNumber &&
                    entry.uniqueUuId === removedItem.uniqueUuId
                );

                if (batchEntry) {
                    batchEntry.quantity += removedItem.quantity; // Restore stock
                    await product.save({ session });
                } else {
                    console.warn(`Batch number ${removedItem.batchNumber} not found for product: ${product.name}`);
                }
            }
            // Step 1: Identify updated items
            const updatedItems = existingBill.items.filter(existingItem =>
                items.some(item =>
                    item.item === existingItem.item.toString() &&
                    item.batchNumber === existingItem.batchNumber &&
                    item.uniqueUuId === existingItem.uniqueUuId
                )
            );

            // Step 2: Reverse stock for updated items
            for (const updatedItem of updatedItems) {
                const product = await Item.findById(updatedItem.item).session(session);
                if (!product) {
                    console.warn(`Product with ID ${updatedItem.item} not found`);
                    continue;
                }

                // Find the exact batch entry using both batchNumber and uniqueUuId
                const batchEntry = product.stockEntries.find(entry =>
                    entry.batchNumber === updatedItem.batchNumber &&
                    entry.uniqueUuId === updatedItem.uniqueUuId
                );

                if (batchEntry) {
                    // Restore stock for the old quantity
                    batchEntry.quantity += updatedItem.quantity;
                    await product.save({ session });
                    console.log(`Stock restored for batch ${updatedItem.batchNumber} with uniqueUuId ${updatedItem.uniqueUuId} for product: ${product.name}`);
                } else {
                    console.warn(`Batch number ${updatedItem.batchNumber} with uniqueUuId ${updatedItem.uniqueUuId} not found for product: ${product.name}`);
                }
            }

            console.log('Stock successfully reversed for updated items.');

            // Delete all associated transactions
            await Transaction.deleteMany({ billId: existingBill._id }).session(session);
            console.log('Existing transactions deleted successfully');

            // Calculate amounts based on the updated POST route logic
            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;

            for (const item of items) {
                const product = await Item.findById(item.item).session(session);
                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    throw new Error(`Product with ID ${item.item} not found`);
                }

                if (product.vatStatus === 'vatable') {
                    totalTaxableAmount += item.quantity * item.price;
                } else {
                    totalNonTaxableAmount += item.quantity * item.price;
                }
            }

            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            let vatAmount = 0;
            if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
                vatAmount = (finalTaxableAmount * vatPercentage) / 100;
            }

            const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

            let finalAmount = totalAmount;
            let roundOffAmount = 0;

            const roundOffForSales = await Settings.findOne({ companyId, userId, fiscalYear: currentFiscalYear }).session(session) || { roundOffSales: false };

            if (roundOffForSales.roundOffSales) {
                finalAmount = Math.round(finalAmount.toFixed(2));
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSales.roundOffSales) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }

            // Update existing bill
            existingBill.cashAccount = cashAccount;
            existingBill.cashAccountAddress = cashAccountAddress;
            existingBill.cashAccountPan = cashAccountPan;
            existingBill.cashAccountEmail = cashAccountEmail;
            existingBill.cashAccountPhone = cashAccountPhone;
            existingBill.isVatExempt = isVatExemptBool;
            existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
            existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
            existingBill.discountPercentage = discount;
            existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
            existingBill.nonVatSales = finalNonTaxableAmount;
            existingBill.taxableAmount = finalTaxableAmount;
            existingBill.vatAmount = vatAmount;
            existingBill.totalAmount = finalAmount;
            existingBill.roundOffAmount = roundOffAmount;
            existingBill.isVatAll = isVatAll;
            existingBill.paymentMode = paymentMode;
            existingBill.date = nepaliDate || new Date(billDate);
            existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

            // Reduce stock for new items
            const billItems = await Promise.all(items.map(async item => {
                const product = await Item.findById(item.item).session(session);
                if (!product) {
                    throw new Error(`Product with ID ${item.item} not found`);
                }

                // Reduce stock for the specific batch
                const batchEntry = product.stockEntries.find(entry => entry.batchNumber === item.batchNumber && entry.uniqueUuId === item.uniqueUuId);
                if (!batchEntry) {
                    throw new Error(`Batch number ${item.batchNumber} not found for product: ${product.name}`);
                }

                if (batchEntry.quantity < item.quantity) {
                    throw new Error(`Not enough stock for batch number ${item.batchNumber} of product: ${product.name}`);
                }

                batchEntry.quantity -= item.quantity; // Reduce stock
                await product.save({ session });

                return {
                    item: product._id,
                    quantity: item.quantity,
                    price: item.price,
                    unit: item.unit,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    vatStatus: product.vatStatus,
                    fiscalYear: currentFiscalYear,
                    uniqueUuId: item.uniqueUuId
                };
            }));

            // Recreate transactions for the updated bill
            await Promise.all(billItems.map(async item => {
                const product = await Item.findById(item.item).session(session);
                if (!product) {
                    await session.abortTransaction();
                    session.endSession();
                    throw new Error(`Product with ID ${item.item} not found`);
                }

                // Create a transaction for each item
                const transaction = new Transaction({
                    item: product._id,
                    cashAccount: cashAccount,
                    billNumber: existingBill.billNumber,
                    quantity: item.quantity,
                    price: item.price,
                    unit: item.unit,
                    type: 'Sale',
                    billId: existingBill._id,
                    purchaseSalesType: 'Sales',
                    debit: finalAmount, // Update as per your logic
                    credit: 0, // Since it's a sale
                    paymentMode: paymentMode,
                    balance: 0, // Update with the correct balance logic if needed
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear
                });

                await transaction.save({ session });
            }));

            console.log('All transactions successfully created for updated bill.');

            // Create a transaction for the default Purchase Account
            const salesAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (salesAmount > 0) {
                const salesAccount = await Account.findOne({ name: 'Sales', company: companyId }).session(session);
                if (salesAccount) {
                    const salesTransaction = new Transaction({
                        account: salesAccount._id,
                        billNumber: existingBill.billNumber,
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: salesAmount,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await salesTransaction.save({ session });
                    console.log('Sales Transaction: ', salesTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId }).session(session);
                if (vatAccount) {
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: existingBill.billNumber,
                        isType: 'VAT',
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: vatAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save({ session });
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }

            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: roundOffAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                if (roundOffAccount) {
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: existingBill.billNumber,
                        isType: 'RoundOff',
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: cashAccount,  // Save the party account name in purchaseSalesType,
                        debit: Math.abs(roundOffAmount),  // Debit the VAT account
                        credit: 0, // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save({ session });
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId }).session(session);
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        cashAccount: cashAccount,
                        billNumber: existingBill.billNumber,
                        type: 'Sale',
                        billId: existingBill._id,
                        purchaseSalesType: 'Sales',
                        debit: finalAmount, // The cash amount received
                        credit: 0,
                        paymentMode: paymentMode,
                        balance: 0, // Adjust with the correct balance logic
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });

                    await cashTransaction.save({ session });
                    console.log('Cash transaction created:', cashTransaction);
                }
            }

            // Update bill with modified items
            existingBill.items = billItems;
            await existingBill.save({ session });

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/bills/${billId}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Bill updated successfully');
                res.redirect(`/bills/editCashAccount/${billId}`);
            }
        } catch (error) {
            console.error("Error updating bill:", error);
            await session.abortTransaction();
            session.endSession();
            req.flash('error', 'Error updating bill');
            res.redirect(`/bills/editCashAccount/${billId}`);
        }
    }
});

router.get('/bills/:id/print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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
            throw new Error('Invalid invoice date provided');
        }
        if (!transactionDateNepali || isNaN(new Date(transactionDateNepali).getTime())) {
            throw new Error('Invalid transaction date provided ')
        }
        try {
            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            const billId = req.params.id;
            const bill = await SalesBill.findById(billId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/bills');
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
                    billId: new ObjectId(billId)
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

            res.render('retailer/sales-bills/print', {
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
                title: 'Sales Bill Print',
                body: 'retailer >> sales >> print',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/bills');
        }
    }
});

//directPrint for sales bill
router.get('/bills/:id/direct-print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const currentCompanyName = req.session.currentCompanyName;
        const companyId = req.session.currentCompany;
        console.log("Company ID from session:", companyId); // Debugging line

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const company = await Company.findById(companyId);
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // const { selectedDate } = req.query; // Assume selectedDate is passed as a query parameter

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

            const billId = req.params.id;
            const bill = await SalesBill.findById(billId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/bills');
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
                    billId: new ObjectId(billId)
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

            res.render('retailer/sales-bills/directPrint', {
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
            res.redirect('/bills');
        }
    }
});

// Route to generate PDF
router.get('/bills/:id/pdf', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const billId = req.params.id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;

            // Fetch the bill data with populated account and item details
            const bill = await SalesBill.findOne({ _id: billId, company: companyId })
                .populate('account')
                .populate('items.item');

            if (!bill) {
                req.flash('error', 'Bill not found');
                return res.redirect('/bills');
            }

            // Populate unit for each item in the bill
            for (const item of bill.items) {
                await item.item.populate('unit');
            }

            // Log the bill object for debugging
            console.log('Bill Object:', bill);

            // Create a new PDF document with A4 size
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const filename = `bill_${bill.billNumber}.pdf`;

            // Set HTTP headers for PDF download
            res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-type', 'application/pdf');

            // Pipe the PDF content to the response stream
            doc.pipe(res);

            // Add content to the PDF
            doc.fontSize(20).text('Tax Invoice', { underline: true, align: 'center' });
            doc.fontSize(16).text(`${currentCompanyName}`, { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Date: ${new Date(bill.date).toLocaleDateString()}`, { align: 'right' });

            // Add payment mode and invoice number on the same row
            doc.fontSize(12);
            const paymentModeText = `Payment Mode: ${bill.paymentMode}`;
            const invoiceNumberText = `Invoice No: ${bill.billNumber}`;
            const pageWidth = doc.page.width - doc.options.margin * 3.25; // Page width without margins

            const paymentModeWidth = doc.widthOfString(paymentModeText);
            const invoiceNumberWidth = doc.widthOfString(invoiceNumberText);

            doc.text(paymentModeText, { continued: true, align: 'left' })
                .text(invoiceNumberText, pageWidth - invoiceNumberWidth, doc.y, { align: 'left' });
            doc.moveDown();

            // Company details section
            doc.fontSize(12).text('A/c Details:', { underline: true });
            doc.text(`${bill.account.name}`, { align: 'left' });

            // Add items table
            const tableTop = doc.y + 15;
            const itemHeaders = [
                { label: 'S.N.', align: 'left', width: 50 }, // Serial Number (S.N.) column
                { label: 'Description of Goods', align: 'left', width: 150 },
                { label: 'Quantity', align: 'right', width: 80 },
                { label: 'Unit', align: 'right', width: 80 },
                { label: 'Price (Rs.)', align: 'right', width: 80 },
                { label: 'Total (Rs.)', align: 'right', width: 80 },
            ];

            let currentPosition = 50; // Adjust starting X position if needed

            // Draw table header
            let y = tableTop;
            itemHeaders.forEach(header => {
                doc.text(header.label, currentPosition, y, { width: header.width, align: header.align });
                currentPosition += header.width;
            });

            y += 15;
            doc.moveTo(50, y)
                .lineTo(570, y)
                .stroke();

            // Draw table rows
            let serialNumber = 1;
            bill.items.forEach(item => {
                currentPosition = 50;
                y += 25;
                doc.text(serialNumber.toString(), currentPosition, y, { width: itemHeaders[0].width, align: 'left' });
                currentPosition += itemHeaders[0].width;
                doc.text(item.item.name, currentPosition, y, { width: itemHeaders[1].width, align: 'left' });
                currentPosition += itemHeaders[1].width;
                doc.text(item.quantity, currentPosition, y, { width: itemHeaders[2].width, align: 'right' });
                currentPosition += itemHeaders[2].width;
                doc.text(item.item.unit ? item.item.unit.name : '', currentPosition, y, { width: itemHeaders[3].width, align: 'right' });
                currentPosition += itemHeaders[3].width;
                doc.text(item.price.toFixed(2), currentPosition, y, { width: itemHeaders[4].width, align: 'right' });
                currentPosition += itemHeaders[4].width;
                doc.text((item.quantity * item.price).toFixed(2), currentPosition, y, { width: itemHeaders[5].width, align: 'right' });
                serialNumber++;
            });

            y += 15;
            doc.moveTo(50, y)
                .lineTo(570, y)
                .stroke();

            // Calculate remaining space on the page
            // const remainingSpace = doc.page.height - y - 50; // 50 is the bottom margin

            // if (remainingSpace > 100) { // Ensure there's enough space for totals
            //     y = doc.page.height - 100;
            // }

            // Add totals at the bottom of the page if space is available
            doc.y = y + 15;
            // y += 15;
            // doc.moveTo(50, y)
            //     .lineTo(570, y)
            //     .stroke();
            const subTotalText = `Sub-Total: Rs.${bill.subTotal.toFixed(2)}`;
            const discountPercentageText = `Discount ${bill.discountPercentage.toFixed(2)}% : ${bill.discountAmount.toFixed(2)}`;
            const taxableAmountText = `Taxable Amount : ${bill.taxableAmount.toFixed(2)}`;
            const vatText = !bill.isVatExempt ? `VAT (${bill.vatPercentage}%): Rs.${(bill.totalAmount * bill.vatPercentage / 100).toFixed(2)}` : '';
            const totalText = !bill.isVatExempt ? `Net Total: Rs.${bill.totalAmount.toFixed(2)}` : `Net Total: Rs.${bill.totalAmount.toFixed(2)}`;

            const subTotalWidth = doc.widthOfString(subTotalText);
            const discountPercentageWidth = doc.widthOfString(discountPercentageText);
            const taxableAmountWidth = doc.widthOfString(taxableAmountText);
            const vatWidth = doc.widthOfString(vatText);
            const totalWidth = doc.widthOfString(totalText);

            const totalRowStartX = doc.page.width - doc.options.margin - totalWidth - 50;

            doc.fontSize(12).text(subTotalText, totalRowStartX, doc.y + 10, { align: 'right' });
            doc.fontSize(12).text(discountPercentageText, totalRowStartX, doc.y + 10, { align: 'right' });
            doc.fontSize(12).text(taxableAmountText, totalRowStartX, doc.y + 5, { align: 'right' });
            doc.fontSize(12).text(vatText, totalRowStartX, doc.y + 10, { align: 'right' });
            // y += 100;
            // doc.moveTo(50, y)
            //     .lineTo(570, y)
            //     .stroke();
            doc.fontSize(12).text(totalText, totalRowStartX, doc.y + 10, { align: 'right' });
            y += 200;
            doc.moveTo(50, y)
                .lineTo(570, y)
                .stroke();

            // Convert amount to words function
            const numberToWords = (num) => {
                const ones = [
                    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                    'Seventeen', 'Eighteen', 'Nineteen'
                ];

                const tens = [
                    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
                ];

                const scales = ['', 'Thousand', 'Lakh', 'Crore'];

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

                function convertSection(num) {
                    let words = '';
                    if (num > 0) {
                        words = convertHundreds(num) + ' ';
                    }
                    return words;
                }

                if (num === 0) return 'Zero Rupees and Zero Paisa Only';

                if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

                let rupees = Math.floor(num);
                let paise = Math.round((num - rupees) * 100);

                // Rounding off logic
                if (paise > 50) {
                    rupees += 1;
                    paise = 0;
                }

                let words = '';

                for (let i = scales.length - 1; i >= 0; i--) {
                    let unit = Math.pow(100, i + 1);
                    if (rupees >= unit) {
                        words += convertSection(Math.floor(rupees / unit)) + scales[i] + ' ';
                        rupees %= unit;
                    }
                }
                words += convertSection(rupees) + ' Rupees';

                if (paise > 0) {
                    words += ' and ' + convertSection(paise) + ' Paisa';
                } else {
                    words += ' and Zero Paisa';
                }

                words += ' Only';

                return words.trim();
            };

            doc.moveDown();
            doc.text(`In Words: ${numberToWords(bill.totalAmount)}`, 50, doc.y, { align: 'left' });

            // Finalize the PDF and end the stream
            doc.end();

        } catch (error) {
            console.error("Error generating PDF:", error);
            req.flash('error', 'Error generating PDF');
            res.redirect('/bills');
        }
    }
});

router.get('/sales-vat-report', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

        // Extract dates from query parameters
        let fromDate = req.query.fromDate ? req.query.fromDate : null;
        let toDate = req.query.toDate ? req.query.toDate : null;

        // Log the query parameters
        console.log('Query Parameters:', req.query);

        // const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
        // const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
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
            return res.render('retailer/sales-bills/salesVatReport', {
                company,
                currentFiscalYear,
                companyDateFormat,
                nepaliDate,
                currentCompany,
                salesVatReport: '',
                fromDate: req.query.fromDate || '',
                toDate: req.query.toDate || '',
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        }


        // Build the query based on the company's date format
        let query = { company: companyId };

        if (fromDate && toDate) {
            query.date = { $gte: fromDate, $lte: toDate };
        } else if (fromDate) {
            query.date = { $gte: fromDate };
        } else if (toDate) {
            query.date = { $lte: toDate };
        }

        console.log('Query:', query);

        const Bills = await SalesBill.find(query)
            .populate('account')
            .sort({ billNumber: 1 })

        // Prepare VAT report data
        const salesVatReport = await Promise.all(Bills.map(async bill => {
            const account = await Account.findById(bill.account);
            return {
                billNumber: bill.billNumber,
                date: bill.date,
                account: account.name,
                panNumber: account.pan,
                totalAmount: bill.totalAmount,
                discountAmount: bill.discountAmount,
                nonVatSales: bill.nonVatSales,
                taxableAmount: bill.taxableAmount,
                vatAmount: bill.vatAmount,
            };
        }));

        res.render('retailer/sales-bills/salesVatReport', {
            company,
            currentFiscalYear,
            salesVatReport,
            companyDateFormat,
            nepaliDate,
            currentCompany,
            fromDate: req.query.fromDate || '',
            toDate: req.query.toDate || '',
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


router.get('/statement', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompany = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat address ward pan city country email phone').populate('fiscalYear');;
            const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english'; // Default to 'english'
            const selectedCompany = req.query.account || '';
            const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
            const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
            const paymentMode = req.query.paymentMode || 'all'; // New parameter for payment mode
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed

            // Retrieve the fiscal year from the session
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                // Fetch the fiscal year from the database if available in the session
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            // If no fiscal year is found in session, use the company's fiscal year
            if (!currentFiscalYear && currentCompany.fiscalYear) {
                currentFiscalYear = currentCompany.fiscalYear;
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };
                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }


            // Fetch accounts that belong to the current fiscal year
            const accounts = await Account.find({
                company: companyId,
                fiscalYear: fiscalYear,
                isActive: true // Filter for active accounts
            }).sort({ name: 1 });

            if (!selectedCompany) {
                return res.render('retailer/statements/statement', {
                    company: currentCompany, currentFiscalYear,
                    statement: [], accounts, selectedCompany: null, fromDate: '',
                    toDate: '', paymentMode, companyDateFormat, nepaliDate, currentCompanyName,
                    currentCompany,
                    title: '',
                    body: '',
                    user: req.user,
                    isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
                });
            }

            // Fetch the selected account based on the fiscal year and company
            const account = await Account.findOne({
                _id: selectedCompany,
                company: companyId,
                isActive: true // Filter for active accounts
            });

            if (!account) {
                return res.status(404).json({ error: 'Account not found for the current fiscal year' });
            }

            // Query to filter transactions based on the selected company and fiscal year
            let query = {
                company: companyId,
                isActive: true, // Ensure only active transactions
            };

            if (selectedCompany) {
                query.$or = [
                    { account: selectedCompany },
                    { paymentAccount: selectedCompany },
                    { receiptAccount: selectedCompany },
                    { debitAccount: selectedCompany },
                    { creditAccount: selectedCompany },
                ];
            }

            if (paymentMode === 'exclude-cash') {
                query.paymentMode = { $ne: 'cash' };
            } else if (paymentMode !== 'all') {
                query.paymentMode = paymentMode;
            }

            let openingBalance = 0;

            if (paymentMode !== 'cash') {
                // Fetch transactions before the 'fromDate' to calculate the opening balance
                const transactionsBeforeFromDate = await Transaction.find({
                    ...query,
                    date: { $lt: fromDate }
                }).sort({ date: 1 });

                // Calculate the opening balance based on the account's opening balance
                openingBalance = account.openingBalance.type === 'Dr' ? account.openingBalance.amount : -account.openingBalance.amount;
                transactionsBeforeFromDate.forEach(tx => {
                    openingBalance += (tx.debit || 0) - (tx.credit || 0);
                });
            }

            if (fromDate && toDate) {
                query.date = { $gte: fromDate, $lte: toDate };
            } else if (fromDate) {
                query.date = { $gte: fromDate };
            } else if (toDate) {
                query.date = { $lte: toDate };
            }

            const filteredTransactions = await Transaction.find(query)
                .sort({ date: 1 })
                .populate('paymentAccount', 'name')
                .populate('receiptAccount', 'name')
                .populate('debitAccount', 'name')
                .populate('creditAccount', 'name')
                .populate('account', 'name')
                .populate('accountType', 'name')
                .lean();

            const cleanTransactions = filteredTransactions.map(tx => ({
                ...tx,
                paymentAccount: tx.paymentAccount ? { name: tx.paymentAccount.name } : null,
                receiptAccount: tx.receiptAccount ? { name: tx.receiptAccount.name } : null,
                debitAccount: tx.debitAccount ? { name: tx.debitAccount.name } : null,
                creditAccount: tx.creditAccount ? { name: tx.creditAccount.name } : null,
                account: tx.account ? { name: tx.account.name } : null,
                accountType: tx.accountType ? { name: tx.accountType.name } : 'Opening Balance'
            }));

            const { statement, totalDebit, totalCredit } = prepareStatementWithOpeningBalanceAndTotals(openingBalance, cleanTransactions, fromDate);

            const partyName = account.name;

            res.render('retailer/statements/statement', {
                currentFiscalYear,
                statement, accounts, partyName, selectedCompany, account, fromDate: req.query.fromDate, toDate: req.query.toDate, paymentMode,
                company: currentCompany, totalDebit, totalCredit, finalBalance: openingBalance + totalDebit - totalCredit,
                currentCompanyName, companyDateFormat, nepaliDate, currentCompany,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching statement:", error);
            res.status(500).json({ error: 'Error fetching statement' });
        }
    }
});



// Function to calculate opening balance based on opening balance date
function calculateOpeningBalance(account, transactions, fromDate) {
    const openingBalanceDate = fromDate || account.openingBalanceDate || new Date('July 17, 2023'); // Use fromDate if available
    let openingBalance = account.openingBalance.type === 'Dr' ? account.openingBalance.amount : -account.openingBalance.amount;

    transactions.forEach(tx => {
        if (tx.date < openingBalanceDate) {
            openingBalance += (tx.debit || 0) - (tx.credit || 0);
        }
    });

    return openingBalance;
}

function prepareStatementWithOpeningBalanceAndTotals(openingBalance, transactions, fromDate, paymentMode) {
    let balance = openingBalance;
    let totalDebit = paymentMode !== 'cash' && openingBalance > 0 ? openingBalance : 0;
    let totalCredit = paymentMode !== 'cash' && openingBalance < 0 ? -openingBalance : 0;

    const statement = paymentMode !== 'cash' ? [
        {
            date: fromDate ? fromDate.toISOString().split('T')[0] : 'July 17, 2023',
            type: '',
            billNumber: '',
            paymentMode: '',
            paymentAccount: '',
            receiptAccount: '',
            debitAccount: '',
            creditAccount: '',
            accountType: 'Opening Balance',
            purchaseSalesType: '',
            purchaseSalesReturnType: '',
            journalAccountType: '',
            drCrNoteAccountType: '',
            account: '',
            debit: openingBalance > 0 ? openingBalance : null,
            credit: openingBalance < 0 ? -openingBalance : null,
            balance: formatBalance(openingBalance),
            billId: '' // Ensure billId is included
        }
    ] : [];


    const transactionsByBill = transactions.reduce((acc, tx) => {
        let billId = tx.billId || tx.purchaseBillId || tx.salesReturnBillId || tx.purchaseReturnBillId || tx.journalBillId || tx.debitNoteId || tx.creditNoteId || tx.paymentAccountId || tx.receiptAccountId; // Use billId for sales and purchaseBillId for purchases

        if (!acc[billId]) {
            acc[billId] = {
                date: tx.date,
                type: tx.type,
                billNumber: tx.billNumber,
                paymentMode: tx.paymentMode,
                partyBillNumber: tx.partyBillNumber,
                paymentAccount: tx.paymentAccount,
                receiptAccount: tx.receiptAccount,
                debitAccount: tx.debitAccount,
                creditAccount: tx.creditAccount,
                accountType: tx.accountType,
                purchaseSalesType: tx.purchaseSalesType,
                purchaseSalesReturnType: tx.purchaseSalesReturnType,
                journalAccountType: tx.journalAccountType,
                drCrNoteAccountType: tx.drCrNoteAccountType,
                account: tx.account,
                debit: 0,
                credit: 0,
                balance: 0,
                billId: tx.billId
            };
        }
        acc[billId].debit = tx.debit || 0;
        acc[billId].credit = tx.credit || 0;
        return acc;
    }, {});

    // Iterate over grouped transactions to prepare the final statement
    Object.values(transactionsByBill).forEach(tx => {
        balance += (tx.debit || 0) - (tx.credit || 0);
        totalDebit += tx.debit || 0;
        totalCredit += tx.credit || 0;
        statement.push({
            date: tx.date,
            type: tx.type,
            billNumber: tx.billNumber,
            paymentMode: tx.paymentMode,
            partyBillNumber: tx.partyBillNumber,
            paymentAccount: tx.paymentAccount,
            receiptAccount: tx.receiptAccount,
            debitAccount: tx.debitAccount,
            creditAccount: tx.creditAccount,
            accountType: tx.accountType,
            purchaseSalesType: tx.purchaseSalesType,
            purchaseSalesReturnType: tx.purchaseSalesReturnType,
            journalAccountType: tx.journalAccountType,
            drCrNoteAccountType: tx.drCrNoteAccountType,
            account: tx.account,
            debit: tx.debit,
            credit: tx.credit,
            balance: formatBalance(balance),
            billId: tx.billId,
        });
    });

    return { statement, totalDebit, totalCredit };
}

function formatBalance(amount) {
    return amount > 0 ? `${amount.toFixed(2)} Dr` : `${(-amount).toFixed(2)} Cr`;
}

// GET route to generate PDF statement
router.get('/statement/pdf', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const selectedCompany = req.query.account;
            const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
            const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
            const paymentMode = req.query.paymentMode || 'all'; // New parameter for payment mode
            const currentCompanyName = req.session.currentCompanyName;
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

            if (!selectedCompany) {
                req.flash('error', 'No company selected');
                return res.redirect('/statement');
            }

            let query = { account: selectedCompany };

            // Filter by payment mode
            if (paymentMode !== 'all') {
                query.paymentMode = paymentMode;
            }

            const transactions = await Transaction.find(query).sort({ transactionDate: 1 });

            // Fetch company details including opening balance and opening balance date
            const account = await Account.findById(selectedCompany);

            if (!account) {
                req.flash('error', 'Company not found');
                return res.redirect('/statement');
            }

            // Calculate the opening balance based on opening balance date
            const openingBalance = paymentMode !== 'cash' ? calculateOpeningBalance(account, transactions, fromDate) : 0;

            // Filter transactions within the date range
            if (fromDate && toDate) {
                query.transactionDate = { $gte: fromDate, $lte: toDate };
            } else if (fromDate) {
                query.transactionDate = { $gte: fromDate };
            } else if (toDate) {
                query.transactionDate = { $lte: toDate };
            }

            const filteredTransactions = await Transaction.find(query).sort({ transactionDate: 1 });

            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const filename = `statement_${account.name.replace(/ /g, '_')}.pdf`;

            res.setHeader('Content-disposition', `attachment; filename=${filename}`);
            res.setHeader('Content-type', 'application/pdf');

            doc.pipe(res);

            doc.fontSize(25).text('Financial Statement', { align: 'center' }).moveDown(0.5);
            doc.fontSize(20).text(`${currentCompanyName}`, { align: 'center' }).moveDown(0.5);

            doc.fontSize(10).text(`A/c : ${account.name}       Payment Mode: ${paymentMode.charAt(0).toUpperCase() + paymentMode.slice(1)}       From: ${fromDate ? fromDate.toLocaleDateString() : 'N/A'} to ${toDate ? toDate.toLocaleDateString() : 'N/A'}`);

            doc.moveDown();

            // Table Header
            const tableTop = 150;
            const rowHeight = 20;
            const marginLeft = 10;

            doc.fontSize(12).text('Date', marginLeft, tableTop);
            doc.text('Type', marginLeft + 80, tableTop);
            doc.text('Vch/Bill', marginLeft + 125, tableTop);
            doc.text('Mode', marginLeft + 175, tableTop);
            doc.text('Account', marginLeft + 250, tableTop);
            doc.text('Debit (Rs.)', marginLeft + 325, tableTop);
            doc.text('Credit (Rs.)', marginLeft + 400, tableTop);
            doc.text('Balance (Rs.)', marginLeft + 465, tableTop);

            // Draw horizontal line after header
            doc.moveTo(marginLeft, tableTop + 15)
                .lineTo(590, tableTop + 15)
                .stroke();

            let balance = openingBalance;
            let totalDebit = paymentMode !== 'cash' && openingBalance > 0 ? openingBalance : 0;
            let totalCredit = paymentMode !== 'cash' && openingBalance < 0 ? -openingBalance : 0;
            let rowIndex = 1;

            // Add opening balance as the first row
            if (paymentMode !== 'cash') {
                doc.fontSize(12).text('Opening Balance', marginLeft + 200, tableTop + rowIndex * rowHeight);
                doc.text('', marginLeft + 75, tableTop + rowIndex * rowHeight);
                doc.text('', marginLeft + 160, tableTop + rowIndex * rowHeight);
                doc.text(balance > 0 ? balance.toFixed(2) : '', marginLeft + 325, tableTop + rowIndex * rowHeight);
                doc.text(balance < 0 ? (-balance).toFixed(2) : '', marginLeft + 400, tableTop + rowIndex * rowHeight);
                doc.text(`${formatBalance(balance)}`, marginLeft + 475, tableTop + rowIndex * rowHeight);
                rowIndex++;
            } else {
                balance = 0;
            }

            filteredTransactions.forEach(tx => {
                const y = tableTop + rowIndex * rowHeight;
                const debit = tx.debit || 0;
                const credit = tx.credit || 0;
                balance += (debit - credit);
                totalDebit += debit;
                totalCredit += credit;

                doc.text(tx.transactionDate.toLocaleDateString(), marginLeft, y);
                doc.text(tx.type, marginLeft + 80, y);
                doc.text(tx.billNumber, marginLeft + 135, y);
                doc.text(tx.paymentMode, marginLeft + 175, y);
                doc.text(tx.accountType, marginLeft + 250, y);
                doc.text(debit ? `${debit.toFixed(2)}` : '', marginLeft + 325, y);
                doc.text(credit ? `${credit.toFixed(2)}` : '', marginLeft + 400, y);
                doc.text(`${formatBalance(balance)}`, marginLeft + 475, y);

                // Draw horizontal line after each row
                doc.moveTo(marginLeft, y + 15)
                    .lineTo(590, y + 15)
                    .stroke();

                rowIndex++;
            });

            // Final totals row
            doc.fontSize(12).text('Total', marginLeft + 200, tableTop + rowIndex * rowHeight);
            doc.text('', marginLeft + 75, tableTop + rowIndex * rowHeight);
            doc.text('', marginLeft + 160, tableTop + rowIndex * rowHeight);
            doc.text(totalDebit.toFixed(2), marginLeft + 325, tableTop + rowIndex * rowHeight);
            doc.text(totalCredit.toFixed(2), marginLeft + 400, tableTop + rowIndex * rowHeight);
            doc.text(`${formatBalance(balance)}`, marginLeft + 475, tableTop + rowIndex * rowHeight);

            // Draw horizontal line after totals row
            doc.moveTo(marginLeft, tableTop + (rowIndex + 1) * rowHeight)
                .lineTo(590, tableTop + (rowIndex + 1) * rowHeight)
                .stroke();

            doc.end();
        } catch (error) {
            console.error("Error generating PDF:", error);
            req.flash('error', 'Error generating PDF');
            res.redirect('/statement');
        }
    }
});

// Function to calculate opening balance based on opening balance date
function calculateOpeningBalance(account, transactions, fromDate) {
    const openingBalanceDate = fromDate || account.openingBalanceDate || new Date('July 17, 2023'); // Use fromDate if available
    let openingBalance = account.openingBalance.type === 'Dr' ? account.openingBalance.amount : -account.openingBalance.amount;

    transactions.forEach(tx => {
        if (tx.transactionDate < openingBalanceDate) {
            openingBalance += (tx.debit || 0) - (tx.credit || 0);
        }
    });

    return openingBalance;
}

// Function to format balance with Dr/Cr
function formatBalance(amount) {
    return amount > 0 ? `${amount.toFixed(2)} Dr` : `${(-amount).toFixed(2)} Cr`;
}

module.exports = router;