const express = require('express')
const router = express.Router()
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const SalesBill = require('../../models/wholeseller/SalesBill');
const PurchaseBill = require('../../models/wholeseller/PurchaseBill');

const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const FiscalYear = require('../../models/wholeseller/FiscalYear');

router.get('/', (req, res) => res.render('welcome'));

// Home route
router.get('/wholesellerDashboard/indexv1', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentFiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;

        // Fetch the company and its fiscal years
        const company = await Company.findById(companyId).select('renewalDate fiscalYear').populate('fiscalYear');
        const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object

        let currentFiscalYear = null;

        if (currentFiscalYearId) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(currentFiscalYearId);
        }

        // If current fiscal year is not set, use the default one
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear; // Use the fiscal year object directly
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: true
            };
        }

        // Log the current fiscal year for debugging purposes
        console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));

        // Fetch total sales and purchase amounts within the fiscal year date range
        const totalSalesResult = await SalesBill.aggregate([
            { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
            { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        ]);

        const totalPurchaseResult = await PurchaseBill.aggregate([
            { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
            { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        ]);

        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;

        res.render('wholeseller/index/indexv1', {
            totalSales,
            company,
            totalPurchase,
            currentFiscalYear,
            initialCurrentFiscalYear,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor' // Pass role info to the view
        });
    }
});



// Home route
router.get('/wholesellerDashboard/indexv2', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentFiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;

        // Fetch the company and its fiscal years
        const company = await Company.findById(companyId).select('renewalDate fiscalYear').populate('fiscalYear');
        const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object

        let currentFiscalYear = null;

        if (currentFiscalYearId) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(currentFiscalYearId);
        }

        // If current fiscal year is not set, use the default one
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear; // Use the fiscal year object directly
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: true
            };
        }

        // Log the current fiscal year for debugging purposes
        console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));

        // Fetch total sales and purchase amounts within the fiscal year date range
        const totalSalesResult = await SalesBill.aggregate([
            { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
            { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        ]);

        const totalPurchaseResult = await PurchaseBill.aggregate([
            { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
            { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        ]);

        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;

        res.render('wholeseller/index/indexv2', {
            totalSales,
            company,
            totalPurchase,
            currentFiscalYear,
            initialCurrentFiscalYear,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor' // Pass role info to the view
        });
    }
});


// Home route
router.get('/wholesellerDashboard/indexv3', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentFiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;

        // Fetch the company and its fiscal years
        const company = await Company.findById(companyId).select('renewalDate fiscalYear').populate('fiscalYear');
        const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object

        let currentFiscalYear = null;

        if (currentFiscalYearId) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(currentFiscalYearId);
        }

        // If current fiscal year is not set, use the default one
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear; // Use the fiscal year object directly
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: true
            };
        }

        // Log the current fiscal year for debugging purposes
        console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));

        // Fetch total sales and purchase amounts within the fiscal year date range
        const totalSalesResult = await SalesBill.aggregate([
            { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
            { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        ]);

        const totalPurchaseResult = await PurchaseBill.aggregate([
            { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
            { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        ]);

        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;

        res.render('wholeseller/index/indexv3', {
            totalSales,
            company,
            totalPurchase,
            currentFiscalYear,
            initialCurrentFiscalYear,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor' // Pass role info to the view
        });
    }
});




module.exports = router;