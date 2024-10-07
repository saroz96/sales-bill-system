const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Item = require('../../models/wholeseller/Item'); // Path to your Item schema
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const Company = require('../../models/wholeseller/Company');
const PurchaseBill = require('../../models/wholeseller/PurchaseBill');
const SalesBill = require('../../models/wholeseller/SalesBill');
const StockAdjustment = require('../../models/wholeseller/StockAdjustment');
const SalesReturn = require('../../models/wholeseller/SalesReturn');
const PurchaseReturn = require('../../models/wholeseller/PurchaseReturns');

// Route to get stock status of all items
router.get('/stock-status', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    try {

        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).populate('fiscalYear');
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

        // Find all items and populate relevant fields
        // const items = await Item.find({ company: companyId, fiscalYear: fiscalYear })
        //     .populate('category', 'name') // Populate category name
        //     .populate('unit', 'name') // Populate unit name
        //     .populate('company', 'name') // Populate company name
        //     .populate('fiscalYear', 'year') // Populate fiscal year
        //     .exec();

        const items = await Item.find({ company: companyId, fiscalYear: fiscalYear })
            .populate('category', 'name') // Populate category name
            .populate('unit', 'name') // Populate unit name
            .populate('company', 'name') // Populate company name
            .populate('fiscalYear', 'year') // Populate fiscal year
            .exec();

        // Iterate over each item to calculate total Qty. In (excluding opening stock) and total Qty. Out
        for (let item of items) {
            // Fetch all purchase bills related to this item
            const purchaseBills = await PurchaseBill.find({
                'items.item': item._id // Find purchase bills that include this item
            });

            // Calculate total quantity in for this item (excluding opening stock)
            const totalQtyIn = purchaseBills.reduce((total, bill) => {
                const itemInBill = bill.items.find(purchaseItem => purchaseItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0);
            }, 0);

            //fetch all sales return bills related to this item
            const salesReturn = await SalesReturn.find({
                'items.item': item._id
            });

            //Calculate total quantity in for this item
            const totalSalesReturn = salesReturn.reduce((total, bill) => {
                const itemInBill = bill.items.find(salesReturnItem => salesReturnItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0)
            }, 0);

            // Fetch all stock adjustments related to this item
            const stockAdjustments = await StockAdjustment.find({
                item: item._id // Find stock adjustments for this item
            });

            // Calculate total quantities based on stock adjustments
            const totalStockAdjustments = stockAdjustments.reduce((acc, adj) => {
                if (adj.adjustmentType === 'xcess') {
                    acc.totalQtyIn += adj.quantity; // Excess stock increases totalQtyIn
                } else if (adj.adjustmentType === 'short') {
                    acc.totalQtyOut += adj.quantity; // Short stock increases totalQtyOut
                }
                return acc;
            }, { totalQtyIn: 0, totalQtyOut: 0 });

            // Fetch all sales bills related to this item
            const salesBills = await SalesBill.find({
                'items.item': item._id // Find sales bills that include this item
            });

            // Calculate total quantity out from sales
            const totalSalesOut = salesBills.reduce((total, bill) => {
                const itemInBill = bill.items.find(salesItem => salesItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0);
            }, 0);

            // Fetch all sales bills related to this item
            const purchaseReturnBills = await PurchaseReturn.find({
                'items.item': item._id // Find sales bills that include this item
            });

            // Calculate total quantity out from sales
            const totalPurchaseReturn = purchaseReturnBills.reduce((total, bill) => {
                const itemInBill = bill.items.find(purchaseReturnItem => purchaseReturnItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0);
            }, 0);

            // Calculate total Qty. Out (sales + stock adjustments of type 'short')
            item.totalQtyOut = totalSalesOut + totalPurchaseReturn + totalStockAdjustments.totalQtyOut;

            // Calculate total Qty. In (excluding opening stock + stock adjustments of type 'xcess')
            item.totalQtyIn = totalQtyIn + totalSalesReturn + totalStockAdjustments.totalQtyIn;
        }
        // Send the stock status to the client
        res.render('wholeseller/inventory/stock-status', {
            items,
            currentCompany,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Stock Status',
            body: 'wholeseller >> inventory >> stock status',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error('Error fetching stock status:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;
