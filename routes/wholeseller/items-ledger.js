// routes/itemsLedger.js
const express = require('express');
const router = express.Router();
const SalesBill = require('../../models/wholeseller/SalesBill');

const StockAdjustment = require('../../models/wholeseller/StockAdjustment');
const Item = require('../../models/wholeseller/Item');
const PurchaseBill = require('../../models/wholeseller/PurchaseBill');


const NepaliDate = require('nepali-date');
const Company = require('../../models/wholeseller/Company');

const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const SalesReturn = require('../../models/wholeseller/SalesReturn');
const purchaseReturn = require('../../models/wholeseller/PurchaseReturns');


router.get('/items-ledger/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
            const company = await Company.findById(companyId);
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

            const itemId = req.params.id;
            const item = await Item.findById(itemId).populate('fiscalYear').populate('openingStockByFiscalYear.fiscalYear');

            if (!item) {
                return res.status(404).send('Item not found');
            }

            // Retrieve the opening stock for the current fiscal year
            const currentFiscalYearId = item.fiscalYear._id.toString();
            const openingStockEntry = item.openingStockByFiscalYear.find(entry => entry.fiscalYear._id.toString() === currentFiscalYearId);

            // let openingStock = 0;
            // if (openingStockEntry) {
            //     openingStock = openingStockEntry.openingStock;
            // }

            // Set opening stock according to the current fiscal year
            const openingStock = openingStockEntry ? openingStockEntry.openingStock : 0;

            const purchaseEntries = await PurchaseBill.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const purchaseReturnEntries = await purchaseReturn.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const salesEntries = await SalesBill.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const salesReturnEntries = await SalesReturn.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const stockAdjustmentEntries = await StockAdjustment.find({ item: itemId, company: companyId }).populate({
                path: 'item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            let itemsLedger = {};

            itemsLedger[itemId] = {
                item: item,
                entries: [],
                qtyBalance: openingStock || 0,  // Initialize balance with opening stock
            };

            // Process purchase entries
            purchaseEntries.forEach(purchaseBill => {
                purchaseBill.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: purchaseBill.date,
                            partyName: purchaseBill.account ? purchaseBill.account.name : 'N/A',
                            billNumber: purchaseBill.billNumber,
                            type: 'Purchase',
                            qtyIn: itemEntry.quantity,
                            qtyOut: 0,
                            price: itemEntry.puPrice,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance += itemEntry.quantity;
                    }
                });
            });

            // Process purchase return entries
            purchaseReturnEntries.forEach(purchaseReturn => {
                purchaseReturn.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: purchaseReturn.date,
                            partyName: purchaseReturn.account ? purchaseReturn.account.name : 'N/A',
                            billNumber: purchaseReturn.billNumber,
                            type: 'Purchase Return',
                            qtyIn: 0,
                            qtyOut: itemEntry.quantity,
                            price: itemEntry.puPrice,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance -= itemEntry.quantity;
                    }
                });
            });

            // Process sales entries
            salesEntries.forEach(salesBill => {
                salesBill.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: salesBill.date,
                            partyName: salesBill.account ? salesBill.account.name : 'N/A',
                            billNumber: salesBill.billNumber,
                            type: 'Sales',
                            qtyIn: 0,
                            qtyOut: itemEntry.quantity,
                            price: itemEntry.price,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance -= itemEntry.quantity;
                    }
                });
            });

            // Process sales return entries
            salesReturnEntries.forEach(salesReturn => {
                salesReturn.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: salesReturn.date,
                            partyName: salesReturn.account ? salesReturn.account.name : 'N/A',
                            billNumber: salesReturn.billNumber,
                            type: 'Sales Return',
                            qtyIn: itemEntry.quantity,
                            qtyOut: 0,
                            price: itemEntry.price,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance += itemEntry.quantity;
                    }
                });
            });

            // Process stock adjustment entries
            stockAdjustmentEntries.forEach(adjustment => {
                const qtyIn = adjustment.adjustmentType === 'xcess' ? adjustment.quantity : 0;
                const qtyOut = adjustment.adjustmentType === 'short' ? adjustment.quantity : 0;
                itemsLedger[itemId].entries.push({
                    date: adjustment.date,
                    partyName: 'Stock Adjustments',
                    billNumber: adjustment.billNumber,
                    type: adjustment.adjustmentType,
                    qtyIn: qtyIn,
                    qtyOut: qtyOut,
                    unit: adjustment.item.unit.name,
                    price: adjustment.puPrice,
                    batchNumber: adjustment.batchNumber || 'N/A',
                    expiryDate: adjustment.expiryDate ? itemEntry.expiryDate : "N/A",
                    balance: 0,
                });
                itemsLedger[itemId].qtyBalance += qtyIn;
                itemsLedger[itemId].qtyBalance -= qtyOut;
            });

            // Sort entries by date
            itemsLedger[itemId].entries.sort((a, b) => a.date - b.date);

            // Calculate balance after each transaction
            let balance = openingStock || 0;
            itemsLedger[itemId].entries.forEach(entry => {
                if (entry.qtyIn) {
                    balance += entry.qtyIn;
                } else if (entry.qtyOut) {
                    balance -= entry.qtyOut;
                }
                entry.balance = balance;
            });

            res.render('wholeseller/itemsLedger/items-ledger', {
                itemsLedger: itemsLedger,
                item,
                companyId,
                nepaliDate,
                companyDateFormat,
                currentCompanyName,
                title: 'Items List',
                body: 'wholeseller >> Items >> all items',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
                openingStock: openingStock,
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Server error');
        }
    }
});


module.exports = router;
