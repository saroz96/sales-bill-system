const express = require('express')
const router = express.Router()
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const SalesBill = require('../../models/wholeseller/SalesBill');
const PurchaseBill = require('../../models/wholeseller/PurchaseBill');
const Item = require('../../models/wholeseller/Item');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const SalesReturn = require('../../models/wholeseller/SalesReturn');
const PurchaseReturns = require('../../models/wholeseller/PurchaseReturns');

router.get('/', (req, res) => res.render('welcome'));

// Home route
router.get('/wholesellerDashboard/indexv1', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, async (req, res) => {
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

        // // Log the current fiscal year for debugging purposes
        // console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));

        // // Fetch total sales and purchase amounts within the fiscal year date range
        // const totalSalesResult = await SalesBill.aggregate([
        //     { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
        //     { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        // ]);

        // const totalPurchaseResult = await PurchaseBill.aggregate([
        //     { $match: { company: new mongoose.Types.ObjectId(companyId), date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate } } },
        //     { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
        // ]);

        // const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        // const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;

        // Log the current fiscal year for debugging purposes
        console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));

        // Fetch total sales amount (excluding VAT) within the fiscal year date range
        const totalSalesResult = await SalesBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSales'] } }  // Corrected fields
                }
            }
        ]);

        // Fetch total sales return amount within the fiscal year
        const totalSalesReturnResult = await SalesReturn.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSalesReturn'] } } // Excluding VAT
                }
            }
        ]);

        // Fetch total purchase amount (excluding VAT) within the fiscal year date range
        const totalPurchaseResult = await PurchaseBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchase'] } }  // Corrected fields
                }
            }
        ]);

        // Fetch total purchase return amount within the fiscal year
        const totalPurchaseReturnResult = await PurchaseReturns.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchaseReturn'] } } // Excluding VAT
                }
            }
        ]);

        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;
        const totalSalesReturn = totalSalesReturnResult.length > 0 ? totalSalesReturnResult[0].totalAmount : 0;
        const totalPurchaseReturn = totalPurchaseReturnResult.length > 0 ? totalPurchaseReturnResult[0].totalAmount : 0;

        console.log('Total Sales (excluding VAT):', totalSales);
        console.log('Total Sales Return (excluding VAT):', totalSalesReturn);
        console.log('Total Purchase (excluding VAT):', totalPurchase);
        console.log('Total Purchase Return (excluding VAT):', totalPurchaseReturn);

        // Deduct sales returns and purchase returns
        const netSales = totalSales - totalSalesReturn;
        const netPurchase = totalPurchase - totalPurchaseReturn;



        res.render('wholeseller/index/indexv1', {
            netSales,
            company,
            netPurchase,
            currentFiscalYear,
            initialCurrentFiscalYear,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor' // Pass role info to the view
        });
    }
});



// Home route
router.get('/wholesellerDashboard/indexv2', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, async (req, res) => {
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

        console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));

        // Fetch total sales amount (excluding VAT) within the fiscal year date range
        const totalSalesResult = await SalesBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSales'] } }  // Corrected fields
                }
            }
        ]);

        // Fetch total sales return amount within the fiscal year
        const totalSalesReturnResult = await SalesReturn.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSalesReturn'] } } // Excluding VAT
                }
            }
        ]);

        // Fetch total purchase amount (excluding VAT) within the fiscal year date range
        const totalPurchaseResult = await PurchaseBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchase'] } }  // Corrected fields
                }
            }
        ]);

        // Fetch total purchase return amount within the fiscal year
        const totalPurchaseReturnResult = await PurchaseReturns.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchaseReturn'] } } // Excluding VAT
                }
            }
        ]);

        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;
        const totalSalesReturn = totalSalesReturnResult.length > 0 ? totalSalesReturnResult[0].totalAmount : 0;
        const totalPurchaseReturn = totalPurchaseReturnResult.length > 0 ? totalPurchaseReturnResult[0].totalAmount : 0;

        console.log('Total Sales (excluding VAT):', totalSales);
        console.log('Total Sales Return (excluding VAT):', totalSalesReturn);
        console.log('Total Purchase (excluding VAT):', totalPurchase);
        console.log('Total Purchase Return (excluding VAT):', totalPurchaseReturn);

        // Deduct sales returns and purchase returns
        const netSales = totalSales - totalSalesReturn;
        const netPurchase = totalPurchase - totalPurchaseReturn;

        totalProfit = netSales - netPurchase;
        totalProfitPercentage = (totalProfit / netSales) * 100

        //----------------------------------------------------------------
        // Fetch previous fiscal year details (assuming stored in session)
        const previousFiscalYear = await FiscalYear.findOne({
            company: new mongoose.Types.ObjectId(companyId),
            endDate: { $lt: currentFiscalYear.startDate }
        }).sort({ endDate: -1 }); // Get the most recent previous fiscal year

        // Fetch total net sales for the previous fiscal year
        let previousNetSales = 0;
        let previousNetPurchase = 0;

        if (previousFiscalYear) {
            const previousSalesResult = await SalesBill.aggregate([
                {
                    $match: {
                        company: new mongoose.Types.ObjectId(companyId),
                        date: { $gte: previousFiscalYear.startDate, $lte: previousFiscalYear.endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSales'] } }
                    }
                }
            ]);

            const previousSalesReturnResult = await SalesReturn.aggregate([
                {
                    $match: {
                        company: new mongoose.Types.ObjectId(companyId),
                        date: { $gte: previousFiscalYear.startDate, $lte: previousFiscalYear.endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSalesReturn'] } }
                    }
                }
            ]);

            // Fetch previous fiscal year's net purchase
            const previousPurchaseResult = await PurchaseBill.aggregate([
                {
                    $match: {
                        company: new mongoose.Types.ObjectId(companyId),
                        date: { $gte: previousFiscalYear.startDate, $lte: previousFiscalYear.endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchase'] } }
                    }
                }
            ]);

            const previousPurchaseReturnResult = await PurchaseReturns.aggregate([
                {
                    $match: {
                        company: new mongoose.Types.ObjectId(companyId),
                        date: { $gte: previousFiscalYear.startDate, $lte: previousFiscalYear.endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchaseReturn'] } }
                    }
                }
            ]);

            const totalPreviousSales = previousSalesResult.length > 0 ? previousSalesResult[0].totalAmount : 0;
            const totalPreviousSalesReturn = previousSalesReturnResult.length > 0 ? previousSalesReturnResult[0].totalAmount : 0;

            previousNetSales = totalPreviousSales - totalPreviousSalesReturn;

            const totalPreviousPurchase = previousPurchaseResult.length > 0 ? previousPurchaseResult[0].totalAmount : 0;
            const totalPreviousPurchaseReturn = previousPurchaseReturnResult.length > 0 ? previousPurchaseReturnResult[0].totalAmount : 0;
            previousNetPurchase = totalPreviousPurchase - totalPreviousPurchaseReturn;
        }

        // Calculate percentage change
        let salesPercentageChange = 0;
        let purchasePercentageChange = 0;

        if (previousNetSales > 0) {
            salesPercentageChange = ((netSales - previousNetSales) / previousNetSales) * 100;
        }

        if (previousNetPurchase > 0) {
            purchasePercentageChange = ((netPurchase - previousNetPurchase) / previousNetPurchase) * 100;
        }

        //------------------------------------------------------------------------------------

        //---------------------------------------------------------------------------------------
        // Assuming you have the current fiscal year ID, you can get it using:
// const currentFiscalYear = await FiscalYear.findOne({ startDate: { $lte: new Date() }, endDate: { $gte: new Date() } });

if (!currentFiscalYear) {
    console.log('No current fiscal year found');
    return;
}

const totalStockValueResult = await Item.aggregate([
    {
        $match: {
            company: new mongoose.Types.ObjectId(companyId),
            fiscalYear: currentFiscalYear._id // Filter by the current fiscal year
        }
    },
    {
        $unwind: '$stockEntries' // Unwind the stockEntries array to process each entry
    },
    {
        $project: {
            stockValue: { 
                $multiply: ['$stockEntries.quantity', { $toDouble: '$stockEntries.puPrice' }] // Calculate stock value per batch
            }
        }
    },
    {
        $group: {
            _id: null,
            totalStockValue: { $sum: '$stockValue' } // Sum the stock value across all entries
        }
    }
]);

const totalStockValue = totalStockValueResult.length > 0 ? totalStockValueResult[0].totalStockValue : 0;
console.log('Total Stock Value for Current Fiscal Year:', totalStockValue);

        
        //----------------------------------------------------------------------------------------------------------------        

        res.render('wholeseller/index/indexv2', {
            netSales,
            company,
            netPurchase,
            totalProfit,
            salesPercentageChange,
            purchasePercentageChange,
            totalProfitPercentage,
            totalStockValue,
            currentFiscalYear,
            initialCurrentFiscalYear,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor' // Pass role info to the view
        });
    }
});


// Home route
router.get('/wholesellerDashboard/indexv3', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, async (req, res) => {
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

        console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));

        // Fetch total sales amount (excluding VAT) within the fiscal year date range
        const totalSalesResult = await SalesBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSales'] } }  // Corrected fields
                }
            }
        ]);

        // Fetch total sales return amount within the fiscal year
        const totalSalesReturnResult = await SalesReturn.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatSalesReturn'] } } // Excluding VAT
                }
            }
        ]);

        // Fetch total purchase amount (excluding VAT) within the fiscal year date range
        const totalPurchaseResult = await PurchaseBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchase'] } }  // Corrected fields
                }
            }
        ]);

        // Fetch total purchase return amount within the fiscal year
        const totalPurchaseReturnResult = await PurchaseReturns.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $add: ['$taxableAmount', '$nonVatPurchaseReturn'] } } // Excluding VAT
                }
            }
        ]);

        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;
        const totalSalesReturn = totalSalesReturnResult.length > 0 ? totalSalesReturnResult[0].totalAmount : 0;
        const totalPurchaseReturn = totalPurchaseReturnResult.length > 0 ? totalPurchaseReturnResult[0].totalAmount : 0;

        console.log('Total Sales (excluding VAT):', totalSales);
        console.log('Total Sales Return (excluding VAT):', totalSalesReturn);
        console.log('Total Purchase (excluding VAT):', totalPurchase);
        console.log('Total Purchase Return (excluding VAT):', totalPurchaseReturn);

        // Deduct sales returns and purchase returns
        const netSales = totalSales - totalSalesReturn;
        const netPurchase = totalPurchase - totalPurchaseReturn;

        res.render('wholeseller/index/indexv3', {
            netSales,
            company,
            netPurchase,
            currentFiscalYear,
            initialCurrentFiscalYear,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor' // Pass role info to the view
        });
    }
});




module.exports = router;