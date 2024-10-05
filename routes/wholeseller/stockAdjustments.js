const express = require('express');
const router = express.Router();

const StockAdjustment = require('../../models/wholeseller/StockAdjustment');
const Item = require('../../models/wholeseller/Item');
const NepaliDate = require('nepali-date');
const Company = require('../../models/wholeseller/Company');
const BillCounter = require('../../models/wholeseller/stockAdjustmentBillCounter');

const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');

// Get all stock adjustments for the current company
router.get('/stockAdjustments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;

        const stockAdjustments = await StockAdjustment.find({ company: companyId }).populate('item').populate('user');
        const items = await Item.find({ company: companyId });
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const company = await Company.findById(companyId);
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        res.render('wholeseller/stockAdjustments/index', {
            stockAdjustments, items, nepaliDate, companyDateFormat, currentCompanyName,
            title: 'Stock Adjustment',
            body: 'wholeseller >> stock adjustment >> list',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Get form to create a new stock adjustment
router.get('/stockAdjustments/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;

        const items = await Item.find({ company: companyId });
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId);
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // Get the next bill number
        const billCounter = await BillCounter.findOne({ company: companyId });
        const nextBillNumber = billCounter ? billCounter.count + 1 : 1;
        res.render('wholeseller/stockAdjustments/new', {
            items, nextBillNumber, transactionDateNepali, companyDateFormat, nepaliDate, currentCompanyName,
            title: 'Stock Adjustment',
            body: 'wholeseller >> stock adjustment >> add',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Create a new stock adjustment
router.post('/stockAdjustments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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
                const { item, unit, quantity, puPrice, reason } = items[i];

                const itemToAdjust = await Item.findById(item);
                if (!itemToAdjust) {
                    return res.status(404).send('Item not found');
                }
                // Find the counter for the company
                let billCounter = await BillCounter.findOne({ company: companyId });
                if (!billCounter) {
                    billCounter = new BillCounter({ company: companyId });
                }
                // Increment the counter
                billCounter.count += 1;
                await billCounter.save();

                const newStockAdjustment = new StockAdjustment({
                    billNumber: billCounter.count,
                    item,
                    unit,
                    quantity,
                    puPrice,
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
                    itemToAdjust.stockEntries.push({ date, quantity: parseInt(quantity) });
                } else if (adjustmentType === 'short') {
                    itemToAdjust.stock -= parseInt(quantity);
                    if (itemToAdjust.stock < 0) {
                        req.flash('error', 'Insufficient stock');
                        return res.redirect('/stockAdjustments/new');
                    }
                    itemToAdjust.stockEntries.push({ date, quantity: -parseInt(quantity) });
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
