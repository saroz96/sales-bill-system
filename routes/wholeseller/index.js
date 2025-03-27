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
const companyGroup = require('../../models/wholeseller/CompanyGroup');
const Transaction = require('../../models/wholeseller/Transaction');
const Account = require('../../models/wholeseller/Account');
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

        // ====== NEW: Fetch Cash in Hand Balance ======
        // 1. Find the default Cash in Hand account (marked with `defaultCashAccount: true`)
        const cashAccount = await Account.findOne({
            company: companyId,
            defaultCashAccount: true,
            isActive: true,
        });

        let cashBalance = 0;

        if (cashAccount) {
            // 2. Get all transactions for this account up to the fiscal year end
            const cashTransactions = await Transaction.find({
                account: cashAccount._id,
                date: { $lte: currentFiscalYear.endDate }
            });

            // 3. Calculate the balance (Debit - Credit)
            cashTransactions.forEach(txn => {
                cashBalance += (txn.debit || 0) - (txn.credit || 0);
            });

            // 4. Add opening balance (if any)
            const openingBalanceEntry = cashAccount.openingBalanceByFiscalYear.find(
                entry => entry.fiscalYear.equals(currentFiscalYear._id)
            );

            if (openingBalanceEntry) {
                if (openingBalanceEntry.type === 'Dr') {
                    cashBalance += openingBalanceEntry.amount;
                } else {
                    cashBalance -= openingBalanceEntry.amount;
                }
            }
        }

        // ====== Bank Balance ======
        let bankBalance = 0;
        // 1. Find the Bank Accounts group
        const bankAccountsGroup = await companyGroup.findOne({
            company: companyId,
            name: 'Bank Accounts'
        });

        if (bankAccountsGroup) {
            // 2. Find all accounts in this group
            const bankAccounts = await Account.find({
                company: companyId,
                companyGroups: bankAccountsGroup._id,
                isActive: true,
                fiscalYear: currentFiscalYear._id // Only accounts from current fiscal year
            });

            // 3. Calculate balance for each bank account
            for (const account of bankAccounts) {
                const transactions = await Transaction.find({
                    account: account._id,
                    date: { $lte: currentFiscalYear.endDate }
                });

                let accountBalance = 0;
                transactions.forEach(txn => {
                    accountBalance += (txn.debit || 0) - (txn.credit || 0);
                });

                // Add opening balance
                const openingBalance = account.openingBalance
                if (openingBalance) {
                    accountBalance += openingBalance.type === 'Dr'
                        ? openingBalance.amount
                        : -openingBalance.amount;
                }

                bankBalance += accountBalance;
            }
        }

        // ====== (Optional) Bank OD Account ======
        let bankODBalance = 0;
        const bankODGroup = await companyGroup.findOne({
            company: companyId,
            name: 'Bank O/D Account',
        });

        if (bankODGroup) {
            const odAccounts = await Account.find({
                company: companyId,
                companyGroups: bankODGroup._id,
                isActive: true,
                fiscalYear: currentFiscalYear._id // Only accounts from current fiscal year
            });

            for (const account of odAccounts) {
                const transactions = await Transaction.find({
                    account: account._id,
                    date: { $lte: currentFiscalYear.endDate }
                });

                let accountBalance = 0;
                transactions.forEach(txn => {
                    accountBalance += (txn.debit || 0) - (txn.credit || 0);
                });

                const openingBalance = account.openingBalance
                if (openingBalance) {
                    accountBalance += openingBalance.type === 'Dr'
                        ? openingBalance.amount
                        : -openingBalance.amount;
                }

                bankODBalance += accountBalance;
            }
        }

        // Net bank balance (Bank Accounts - Bank OD)
        const netBankBalance = bankBalance + bankODBalance;

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



        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalAmount : 0;
        const totalPurchase = totalPurchaseResult.length > 0 ? totalPurchaseResult[0].totalAmount : 0;
        const totalSalesReturn = totalSalesReturnResult.length > 0 ? totalSalesReturnResult[0].totalAmount : 0;
        const totalPurchaseReturn = totalPurchaseReturnResult.length > 0 ? totalPurchaseReturnResult[0].totalAmount : 0;

        console.log('Total Sales (excluding VAT):', totalSales);
        console.log('Total Sales Return (excluding VAT):', totalSalesReturn);
        console.log('Total Purchase (excluding VAT):', totalPurchase);
        console.log('Total Purchase Return (excluding VAT):', totalPurchaseReturn);
        console.log('Cash in Hand Balance:', cashBalance);

        // Deduct sales returns and purchase returns
        const netSales = totalSales - totalSalesReturn;
        const netPurchase = totalPurchase - totalPurchaseReturn;

        // Fetch monthly sales data
        const monthlySalesData = await SalesBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$date" },
                        month: { $month: "$date" }
                    },
                    totalSales: { $sum: { $add: ["$taxableAmount", "$nonVatSales"] } }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Fetch monthly returns data
        const monthlyReturnsData = await SalesReturn.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: currentFiscalYear.startDate, $lte: currentFiscalYear.endDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$date" },
                        month: { $month: "$date" }
                    },
                    totalReturns: { $sum: { $add: ["$taxableAmount", "$nonVatSalesReturn"] } }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Create a map for returns data for easy lookup
        const returnsMap = new Map();
        monthlyReturnsData.forEach(item => {
            const key = `${item._id.year}-${item._id.month}`;
            returnsMap.set(key, item.totalReturns);
        });

        // Process data for chart
        const categories = [];
        const netSalesData = [];
        const isNepaliFormat = company?.dateFormat === 'nepali';
        const nepaliMonths = ['Baisakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

        monthlySalesData.forEach(monthData => {
            if (!monthData._id) {
                console.warn('Invalid monthData:', monthData);
                return;
            }

            const { year, month } = monthData._id;
            const key = `${year}-${month}`;
            const returns = returnsMap.get(key) || 0;
            const netSales = monthData.totalSales - returns;

            // Format date based on company preference
            let formattedDate;
            if (isNepaliFormat) {
                const nepaliMonthIndex = (month + 8) % 12; // Approximate conversion
                formattedDate = `${nepaliMonths[nepaliMonthIndex]} ${year}`;
            } else {
                const date = new Date(year, month - 1);
                formattedDate = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            }

            categories.push(formattedDate);
            netSalesData.push(netSales);
        });

        // Handle case when no data is available
        if (categories.length === 0) {
            categories.push(isNepaliFormat ? 'कुनै डाटा उपलब्ध छैन' : 'No Data Available');
            netSalesData.push(0);
        }

        res.render('wholeseller/index/indexv1', {
            cashBalance, // Pass cash balance to the view
            bankBalance: netBankBalance,
            totalStock: totalStockValue,
            netSales,
            netPurchase,
            chartData: {
                categories,
                series: [{
                    name: 'Net Sales (Sales - Returns)',
                    data: netSalesData
                }]
            },
            company,
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