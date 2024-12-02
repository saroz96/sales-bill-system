const express = require('express');
const router = express.Router();

const StockAdjustment = require('../../models/wholeseller/StockAdjustment');
const Item = require('../../models/wholeseller/Item');
const NepaliDate = require('nepali-date');
const Company = require('../../models/wholeseller/Company');
// const BillCounter = require('../../models/wholeseller/stockAdjustmentBillCounter');

const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const BillCounter = require('../../models/wholeseller/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');

// Get all stock adjustments for the current company
router.get('/stockAdjustments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = req.session.currentCompany;
        // const today = new Date();
        // const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        // const company = await Company.findById(companyId);
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

        const stockAdjustments = await StockAdjustment.find({ company: companyId, fiscalYear: fiscalYear })
            .populate('items.item')
            .populate('items.unit') // Populate unit details
            .populate('user')
            .lean();

        // Sort adjustments by date in ascending order
        stockAdjustments.sort((a, b) => new Date(a.date) - new Date(b.date));

        const formattedAdjustments = stockAdjustments.map(adjustment => {
            return adjustment.items.map(item => ({
                date: adjustment.date,
                billNumber: adjustment.billNumber,
                itemName: item.item ? item.item.name : 'N/A',
                quantity: item.quantity,
                unitName: item.unit.name,
                puPrice: item.puPrice,
                adjustmentType: adjustment.adjustmentType,
                reason: item.reason.join(' '),
                vatStatus: item.vatStatus,
                userName: adjustment.user.name,
                adjustmentId: adjustment._id,
            }));
        }).flat(); // Flatten the nested array of items

        const items = await Item.find({ company: companyId });

        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        res.render('wholeseller/stockAdjustments/index', {
            company, currentFiscalYear,
            currentCompany,
            stockAdjustments: formattedAdjustments, items, companyDateFormat, currentCompanyName,
            title: 'Stock Adjustment',
            body: 'wholeseller >> stock adjustment >> list',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Get form to create a new stock adjustment
router.get('/stockAdjustments/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;

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
        const items = await Item.find({ company: companyId, fiscalYear: fiscalYear })

        // Get the next bill number
        // const billCounter = await BillCounter.findOne({ company: companyId });
        // const nextBillNumber = billCounter ? billCounter.count + 1 : 1;

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'StockAdjustment' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }

        res.render('wholeseller/stockAdjustments/new', {
            company, currentFiscalYear,
            items, nextBillNumber, transactionDateNepali, companyDateFormat, nepaliDate, currentCompanyName,
            vatEnabled: company.vatEnabled,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.get('/stockAdjustments/finds', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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

        res.render('wholeseller/stockAdjustments/billNumberForm', {
            company,
            currentFiscalYear,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


//Get stock adjustment form by bill number
router.get('/stockAdjustments/edit/billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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


        // Find the stock adjustment by ID
        const stockAdjustment = await StockAdjustment.findOne({ billNumber: billNumber })
            .populate('items.item') // Populate item details
            .populate('items.unit') // Populate unit details
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details


        if (!stockAdjustment || !stockAdjustment.items) {
            return res.status(404).send('Stock Adjustment or items not found');
        }

        res.render('wholeseller/stockAdjustments/edit', {
            stockAdjustment,
            // relatedItems,
            items: stockAdjustment.items,
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
        });
    }
});


router.post('/stockAdjustments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const {
                items,
                adjustmentType,
                note,
                nepaliDate,
                billDate,
                isVatExempt,
                vatPercentage,
                discountPercentage,
            } = req.body;

            const companyId = req.session.currentCompany;
            const userId = req.user._id;
            const currentFiscalYear = req.session.currentFiscalYear.id;

            const company = await Company.findById(companyId);
            if (!company) {
                req.flash('error', 'Company not found');
                return res.redirect('/stockAdjustments/new');
            }

            const dateFormat = company.dateFormat;
            const date = dateFormat === 'nepali' ? nepaliDate : new Date(billDate);

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let subTotal = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            const billNumber = await getNextBillNumber(companyId, currentFiscalYear, 'StockAdjustment');
            const itemsArray = [];

            for (const itemData of items) {
                const {
                    item,
                    unit,
                    batchNumber,
                    expiryDate,
                    marginPercentage,
                    mrp,
                    price,
                    quantity,
                    puPrice,
                    reason,
                    vatStatus,
                } = itemData;

                const product = await Item.findById(item);
                if (!product) {
                    req.flash('error', 'Item not found');
                    return res.redirect('/stockAdjustments/new');
                }

                const itemTotal = parseFloat(puPrice) * parseFloat(quantity);
                subTotal += itemTotal;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += itemTotal;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += itemTotal;
                }

                const itemToAdjust = await Item.findById(item);
                const parsedQuantity = parseInt(quantity);

                // Excess adjustment
                if (adjustmentType === 'xcess') {
                    itemToAdjust.stock += parsedQuantity;
                    let batchEntry = itemToAdjust.stockEntries.find(
                        (entry) => entry.batchNumber === batchNumber
                    );
                    if (batchEntry) {
                        batchEntry.quantity += parsedQuantity;
                    } else {
                        itemToAdjust.stockEntries.push({
                            date,
                            batchNumber,
                            expiryDate,
                            quantity: parsedQuantity,
                            price,
                            puPrice,
                            mrp,
                            marginPercentage,
                        });
                    }
                }

                // Short adjustment
                if (adjustmentType === 'short') {
                    let remainingQuantity = parsedQuantity;
                    for (const batch of itemToAdjust.stockEntries) {
                        if (batch.batchNumber === batchNumber && remainingQuantity > 0) {
                            const deductAmount = Math.min(batch.quantity, remainingQuantity);
                            batch.quantity -= deductAmount;
                            remainingQuantity -= deductAmount;

                            if (batch.quantity < 0) {
                                req.flash('error', 'Insufficient batch stock');
                                return res.redirect('/stockAdjustments/new');
                            }
                        }
                    }
                    itemToAdjust.stock -= parsedQuantity;
                    if (itemToAdjust.stock < 0) {
                        req.flash('error', 'Insufficient total stock');
                        return res.redirect('/stockAdjustments/new');
                    }
                }

                await itemToAdjust.save();
                itemsArray.push({
                    item,
                    unit,
                    quantity: parsedQuantity,
                    puPrice,
                    batchNumber,
                    expiryDate,
                    reason: Array.isArray(reason) ? reason : [reason],
                    vatStatus
                });

                console.log('Items Array Push:===>', itemsArray);
            }

            // Calculate discount
            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;
            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            // Calculate VAT
            const vatAmount =
                !isVatExemptBool || isVatAll
                    ? (finalTaxableAmount * vatPercentage) / 100
                    : 0;

            const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

            const newStockAdjustment = new StockAdjustment({
                items: itemsArray,
                billNumber,
                note,
                date,
                isVatAll,
                isVatExempt: isVatExemptBool,
                adjustmentType,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatAdjustment: finalNonTaxableAmount,
                taxableAmount: finalTaxableAmount,
                vatAmount,
                totalAmount,
                isActive: true,
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,
            });

            await newStockAdjustment.save();
            req.flash('success', 'Stock adjustment recorded successfully');
            res.redirect('/stockAdjustments/new');
        } catch (err) {
            console.error('Error recording stock adjustment:', err);
            req.flash('error', 'Error recording stock adjustment');
            res.redirect('/stockAdjustments/new');
        }
    }
});

router.get('/stockAdjustments/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const stockAdjustmentId = req.params.id; // Get the stock adjustment ID from the URL params
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

        // Find the stock adjustment by ID
        const stockAdjustment = await StockAdjustment.findById(stockAdjustmentId)
            .populate('items.item') // Populate item details
            .populate('items.unit') // Populate unit details
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details


        if (!stockAdjustment || !stockAdjustment.items) {
            return res.status(404).send('Stock Adjustment or items not found');
        }

        res.render('wholeseller/stockAdjustments/edit', {
            stockAdjustment,
            // relatedItems,
            items: stockAdjustment.items,
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
        });
    }
});


router.put('/stockAdjustments/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const stockAdjustmentId = req.params.id;
            const {
                items,
                adjustmentType,
                note,
                nepaliDate,
                billDate,
                isVatExempt,
                vatPercentage,
                discountPercentage,
            } = req.body;

            const companyId = req.session.currentCompany;
            const userId = req.user._id;
            const currentFiscalYear = req.session.currentFiscalYear.id;

            const company = await Company.findById(companyId);
            if (!company) {
                req.flash('error', 'Company not found');
                return res.redirect('/stockAdjustments');
            }

            const dateFormat = company.dateFormat;
            const date = dateFormat === 'nepali' ? nepaliDate : new Date(billDate);

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            // Fetch and delete existing stock adjustment
            const existingStockAdjustment = await StockAdjustment.findById(stockAdjustmentId);
            if (!existingStockAdjustment) {
                req.flash('error', 'Stock adjustment not found');
                return res.redirect('/stockAdjustments');
            }

            // Reverse stock changes for existing items
            for (const existingItem of existingStockAdjustment.items) {
                const itemToAdjust = await Item.findById(existingItem.item);
                if (adjustmentType === 'xcess') {
                    itemToAdjust.stock -= existingItem.quantity;
                } else if (adjustmentType === 'short') {
                    itemToAdjust.stock += existingItem.quantity;
                }
                // Restore batch stock
                const batch = itemToAdjust.stockEntries.find(
                    (entry) => entry.batchNumber === existingItem.batchNumber
                );
                if (batch) {
                    if (adjustmentType === 'xcess') {
                        batch.quantity -= existingItem.quantity;
                    } else if (adjustmentType === 'short') {
                        batch.quantity += existingItem.quantity;
                    }
                }
                await itemToAdjust.save();
            }

            // Delete the existing stock adjustment
            await StockAdjustment.findByIdAndDelete(stockAdjustmentId);

            // Initialize new stock adjustment values
            let subTotal = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;
            const itemsArray = [];

            for (const itemData of items) {
                const {
                    item,
                    unit,
                    batchNumber,
                    expiryDate,
                    marginPercentage,
                    mrp,
                    price,
                    quantity,
                    puPrice,
                    reason,
                } = itemData;

                const product = await Item.findById(item);
                if (!product) {
                    req.flash('error', 'Item not found');
                    return res.redirect(`/stockAdjustments/${stockAdjustmentId}/edit`);
                }

                const itemTotal = parseFloat(puPrice) * parseFloat(quantity);
                subTotal += itemTotal;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += itemTotal;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += itemTotal;
                }

                const itemToAdjust = await Item.findById(item);
                const parsedQuantity = parseInt(quantity);

                // Update stock based on adjustmentType
                if (adjustmentType === 'xcess') {
                    itemToAdjust.stock += parsedQuantity;
                    let batchEntry = itemToAdjust.stockEntries.find(
                        (entry) => entry.batchNumber === batchNumber
                    );
                    if (batchEntry) {
                        batchEntry.quantity += parsedQuantity;
                    } else {
                        itemToAdjust.stockEntries.push({
                            date,
                            batchNumber,
                            expiryDate,
                            quantity: parsedQuantity,
                            price,
                            puPrice,
                            mrp,
                            marginPercentage,
                        });
                    }
                }

                if (adjustmentType === 'short') {
                    let remainingQuantity = parsedQuantity;
                    for (const batch of itemToAdjust.stockEntries) {
                        if (batch.batchNumber === batchNumber && remainingQuantity > 0) {
                            const deductAmount = Math.min(batch.quantity, remainingQuantity);
                            batch.quantity -= deductAmount;
                            remainingQuantity -= deductAmount;

                            if (batch.quantity < 0) {
                                req.flash('error', 'Insufficient batch stock');
                                return res.redirect(`/stockAdjustments/${stockAdjustmentId}/edit`);
                            }
                        }
                    }
                    itemToAdjust.stock -= parsedQuantity;
                    if (itemToAdjust.stock < 0) {
                        req.flash('error', 'Insufficient total stock');
                        return res.redirect(`/stockAdjustments/${stockAdjustmentId}/edit`);
                    }
                }

                await itemToAdjust.save();
                itemsArray.push({
                    item,
                    unit,
                    quantity: parsedQuantity,
                    puPrice,
                    batchNumber,
                    expiryDate,
                    reason: Array.isArray(reason) ? reason : [reason],
                });
            }

            // Calculate discount and VAT
            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;
            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;
            const vatAmount =
                !isVatExemptBool || isVatAll
                    ? (finalTaxableAmount * vatPercentage) / 100
                    : 0;

            const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

            // Save updated stock adjustment
            const updatedStockAdjustment = new StockAdjustment({
                items: itemsArray,
                billNumber: existingStockAdjustment.billNumber,
                note,
                date,
                isVatAll,
                isVatExempt: isVatExemptBool,
                adjustmentType,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatAdjustment: finalNonTaxableAmount,
                taxableAmount: finalTaxableAmount,
                vatAmount,
                totalAmount,
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,
            });

            await updatedStockAdjustment.save();
            req.flash('success', 'Stock adjustment updated successfully');
            res.redirect('/stockAdjustments');
        } catch (err) {
            console.error('Error updating stock adjustment:', err);
            req.flash('error', 'Error updating stock adjustment');
            res.redirect('/stockAdjustments');
        }
    }
});


// Route to cancel the payment and related transactions
router.post('/stockAdjustments/cancel/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const { billNumber } = req.params;

            // Update the payment status to 'canceled'
            const updateStockAdjustmentStatus = await StockAdjustment.updateOne(
                { billNumber },
                { status: 'canceled', isActive: false }
            );
            console.log('Stock adjustment status update result:', updateStockAdjustmentStatus);

            req.flash('success', 'Stock adjustment have been canceled.');
            res.redirect(`/stockAdjustments/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error canceling stock adjustment:", error);
            req.flash('error', 'An error occurred while canceling the stock adjustment.');
            res.redirect(`/stockAdjustments`);
        }
    }
});

// Route to reactivate the payment and related transactions
router.post('/stockAdjustments/reactivate/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const { billNumber } = req.params;

            // Update the payment status to 'active'
            await StockAdjustment.updateOne({ billNumber }, { status: 'active', isActive: true });

            req.flash('success', 'Stock adjustment have been reactivated.');
            res.redirect(`/stockAdjustments/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error reactivating stock adjustments:", error);
            req.flash('error', 'An error occurred while reactivating the stock adjustments.');
            res.redirect(`/stockAdjustments`);
        }
    }
});



module.exports = router;
