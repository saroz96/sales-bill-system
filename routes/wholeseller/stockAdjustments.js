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

        const stockAdjustments = await StockAdjustment.find({ company: companyId })
            .populate('item')
            .populate('unit')
            .populate('user');
        const items = await Item.find({ company: companyId });
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
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

        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        res.render('wholeseller/stockAdjustments/index', {
            company, currentFiscalYear,
            currentCompany,
            stockAdjustments, items, nepaliDate, companyDateFormat, currentCompanyName,
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
            title: 'Stock Adjustment',
            body: 'wholeseller >> stock adjustment >> add',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Create a new stock adjustment
router.post('/stockAdjustments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const { items, adjustmentType, note, nepaliDate, billDate } = req.body;
            const companyId = req.session.currentCompany;
            const userId = req.user._id;
            const currentFiscalYear = req.session.currentFiscalYear.id
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;

            // Fetch company settings to determine date format
            const company = await Company.findById(companyId);
            if (!company) {
                return res.status(404).send('Company not found');
            }

            const dateFormat = company.dateFormat; // Assume company has a dateFormat field
            let date;

            if (dateFormat === 'nepali') {
                // Convert Nepali date to JavaScript Date object if needed
                date = nepaliDate ? nepaliDate : new Date(billDate);
            } else {
                date = new Date(billDate); // Convert billDate to JavaScript Date object
            }

            for (let i = 0; i < items.length; i++) {
                const { item, unit, batchNumber, expiryDate, mrp, marginPercentage, price, quantity, puPrice, reason } = items[i];

                const itemToAdjust = await Item.findById(item);
                if (!itemToAdjust) {
                    return res.status(404).send('Item not found');
                }

                const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'StockAdjustment')

                const newStockAdjustment = new StockAdjustment({
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    item,
                    unit,
                    quantity,
                    puPrice,
                    batchNumber,
                    expiryDate,
                    mrp,
                    marginPercentage,
                    price,
                    adjustmentType,
                    reason: Array.isArray(reason) ? reason : [reason], // Ensure reason is an array,
                    note,
                    date,
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,
                });
                console.log(newStockAdjustment);
                console.log(`Adjustment Type: ${adjustmentType}`);

                await newStockAdjustment.save();


                // Adjust stock based on the type
                if (adjustmentType === 'xcess') {
                    itemToAdjust.stock += parseInt(quantity);
                    itemToAdjust.stockEntries.push({ date, quantity: parseInt(quantity), batchNumber, expiryDate, mrp, marginPercentage, price, puPrice });

                } else if (adjustmentType === 'short') {
                    itemToAdjust.stock -= parseInt(quantity);
                    if (itemToAdjust.stock < 0) {
                        req.flash('error', 'Insufficient stock');
                        return res.redirect('/stockAdjustments/new');
                    }
                    // Update specific batch stock
                    const batchIndex = itemToAdjust.stockEntries.findIndex(entry => entry.batchNumber === batchNumber);
                    if (batchIndex > -1) {
                        itemToAdjust.stockEntries[batchIndex].quantity -= parseInt(quantity);
                        if (itemToAdjust.stockEntries[batchIndex].quantity < 0) {
                            req.flash('error', 'Insufficient batch stock');
                            return res.redirect('/stockAdjustments/new');
                        }
                    }

                }
                console.log(itemToAdjust);
                await itemToAdjust.save();
            }

            req.flash('success', 'Stock adjustment recorded successfully');
            res.redirect('/stockAdjustments/new');
        } catch (err) {
            console.error(err);
            req.flash('error', 'Error recording stock adjustment');
            res.redirect('/stockAdjustments/new');
        }
    }
});

module.exports = router;
