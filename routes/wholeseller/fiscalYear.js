const express = require('express');
const router = express.Router();
const { switchFiscalYear } = require('../../services/fiscalYearService');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const NepaliDate = require('nepali-date');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const Item = require('../../models/wholeseller/Item');
const Transaction = require('../../models/wholeseller/Transaction');
const Account = require('../../models/wholeseller/Account');
const BillCounter = require('../../models/wholeseller/billCounter');

let progress = 0; // 0 to 100

// Route to render the page with all fiscal years for the current company
router.get('/switch-fiscal-year', isLoggedIn, ensureAuthenticated, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    try {
        const companyId = req.session.currentCompany; // Get the company ID from the session
        const currentCompanyName = req.session.currentCompanyName;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

        // Fetch all fiscal years for the company
        const fiscalYears = await FiscalYear.find({ company: companyId });
        const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object
        // If no current fiscal year is set in session, set the last one as current
        let currentFiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;

        if (!currentFiscalYear && fiscalYears.length > 0) {
            const lastFiscalYear = fiscalYears[fiscalYears.length - 1]; // Get the last fiscal year
            currentFiscalYear = lastFiscalYear._id.toString();
            req.session.currentFiscalYear = {
                id: currentFiscalYear,
                startDate: lastFiscalYear.startDate,
                endDate: lastFiscalYear.endDate,
                name: lastFiscalYear.name,
                dateFormat: lastFiscalYear.dateFormat,
                isActive: lastFiscalYear.isActive
            };
        }

        // Render the EJS template and pass the fiscal years data
        res.render('wholeseller/fiscalYear/list', {
            company,
            currentFiscalYear,
            initialCurrentFiscalYear,
            fiscalYears,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error('Error fetching fiscal years:', err);
        res.status(500).render('error', { error: 'Internal server error' });
    }
});


// Route to change the current fiscal year
router.post('/switch-fiscal-year', ensureAuthenticated, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    try {
        const { fiscalYearId } = req.body; // Get the selected fiscal year ID from the request
        const companyId = req.session.currentCompany; // Get the company ID from the session

        // Fetch the selected fiscal year
        const fiscalYear = await FiscalYear.findOne({ _id: fiscalYearId, company: companyId });
        if (!fiscalYear) {
            return res.status(404).json({ error: 'Fiscal Year not found' });
        }

        // Update the session with the new fiscal year
        req.session.currentFiscalYear = {
            id: fiscalYear._id,
            startDate: fiscalYear.startDate,
            endDate: fiscalYear.endDate,
            name: fiscalYear.name,
            dateFormat: fiscalYear.dateFormat
        };

        req.flash('success', 'Fiscal year changed successfully');
        res.redirect('/switch-fiscal-year');
    } catch (err) {
        console.error('Error switching fiscal year:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/change-fiscal-year', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
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

            let nextFiscalYearStartDate = null;
            if (currentFiscalYear) {
                const currentEndDate = currentFiscalYear.endDate; // Use the end date directly from session
                if (currentEndDate instanceof Date) {
                    // If endDate is a Date object
                    const nextDate = new Date(currentEndDate);
                    nextDate.setDate(nextDate.getDate() + 1); // Add one day
                    nextFiscalYearStartDate = nextDate.toISOString().split('T')[0]; // Convert to YYYY-MM-DD format
                } else if (typeof currentEndDate === 'string') {
                    // If endDate is a string
                    const [year, month, day] = currentEndDate.split('-').map(Number);
                    nextFiscalYearStartDate = `${year}-${String(month).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;
                } else {
                    throw new Error('Unsupported date format for currentFiscalYear.endDate');
                }
            }

            res.render('wholeseller/fiscalYear/fiscalYear', {
                company,
                nextFiscalYearStartDate,
                currentFiscalYear,
                currentCompanyName,
                nepaliDate,
                companyDateFormat,
                user: req.user,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (err) {
            console.error('Error fetching fiscal year:', err);
            req.flash('error', 'Failed to load fiscal year data.');
            res.redirect('/wholesellerDashboard');
        }
    }
});

// Route to switch fiscal year
router.post('/change-fiscal-year', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany;
            const { startDateEnglish, endDateEnglish, startDateNepali, endDateNepali, dateFormat } = req.body;

            let startDate, endDate;
            if (dateFormat === 'nepali') {
                startDate = startDateNepali;
                endDate = endDateNepali;
            } else if (dateFormat === 'english') {
                startDate = startDateEnglish;
                endDate = endDateEnglish;
            } else {
                return res.status(400).json({ error: 'Invalid date format' });
            }

            if (!endDate) {
                endDate = new Date(startDate);
                endDate.setFullYear(endDate.getFullYear() + 1);
                endDate.setDate(endDate.getDate() - 1);
            }

            const startDateObject = new Date(startDate);
            const endDateObject = new Date(endDate);
            const startYear = startDateObject.getFullYear();
            const endYear = endDateObject.getFullYear();
            const fiscalYearName = `${startYear}/${endYear.toString().slice(-2)}`;

            const existingFiscalYear = await FiscalYear.findOne({
                name: fiscalYearName,
                company: companyId
            });

            if (existingFiscalYear) {
                req.flash('error', `Fiscal Year ${fiscalYearName} already exists.`);
                return res.redirect('/wholesellerDashboard');
            }

            const newFiscalYear = await FiscalYear.create({
                name: fiscalYearName,
                startDate: startDateObject,
                endDate: endDateObject,
                dateFormat,
                company: companyId
            });

            // Update progress
            progress = 33;
            req.flash('info', 'Step 1: Created new fiscal year.');

            const currentFiscalYear = req.session.currentFiscalYear.id;
            const items = await Item.find({ company: companyId, fiscalYear: currentFiscalYear });

            for (let item of items) {
                const currentStock = item.stock;
                const purchases = await Transaction.find({
                    item: item._id,
                    company: companyId,
                    type: 'Purc',
                    date: { $lt: startDateObject },
                    fiscalYear: currentFiscalYear
                });

                let totalQuantity = 0;
                let totalPrice = 0;
                for (let purchase of purchases) {
                    totalQuantity += purchase.quantity;
                    totalPrice += purchase.quantity * purchase.puPrice;
                }

                const purchasePrice = totalQuantity > 0 ? (totalPrice / totalQuantity) : item.puPrice;
                const openingStockBalance = purchasePrice * currentStock;

                const newItem = new Item({
                    name: item.name,
                    hscode: item.hscode,
                    category: item.category,
                    unit: item.unit,
                    mainUnit: item.mainUnit,
                    price: item.price,
                    puPrice: purchasePrice,
                    stock: currentStock,
                    vatStatus: item.vatStatus,
                    company: companyId,
                    fiscalYear: newFiscalYear._id,
                    openingStockByFiscalYear: [{
                        fiscalYear: newFiscalYear._id,
                        openingStock: currentStock,
                        openingStockBalance: openingStockBalance,
                        purchasePrice: purchasePrice,
                        salesPrice: item.price,
                    }],
                    // Clone stock entries with the specified fields
                    stockEntries: item.stockEntries.map(stockEntry => ({
                        quantity: stockEntry.quantity,
                        batchNumber: stockEntry.batchNumber,
                        expiryDate: stockEntry.expiryDate,
                        price: stockEntry.price,
                        mainUnitPuPrice: stockEntry.mainUnitPuPrice,
                        puPrice: stockEntry.puPrice,
                        mrp: stockEntry.mrp,
                        marginPercentage: stockEntry.marginPercentage,
                        date: stockEntry.date || new Date(), // Keep original date or set to current date
                        fiscalYear: newFiscalYear._id
                    })),
                });

                try {
                    await newItem.save();
                    console.log(`Created new item for fiscal year ${newFiscalYear.name}: ${newItem.name} stock set to: ${newItem.stock}`);
                } catch (saveError) {
                    if (saveError.code === 11000) {
                        console.log(`Item ${newItem.name} already exists for fiscal year ${newFiscalYear.name}`);
                    } else {
                        throw saveError;
                    }
                }
            }

            // Update progress
            progress = 66;
            req.flash('info', 'Step 2: Created new items for the fiscal year.');

            const accounts = await Account.find({ company: companyId, fiscalYear: currentFiscalYear }).populate('transactions');

            for (let account of accounts) {
                // Fetch all transactions for the current fiscal year for the account
                const transactions = await Transaction.find({
                    account: account._id,
                    company: companyId,
                    fiscalYear: currentFiscalYear,
                    type: { $in: ['Purc', 'Sale', 'SlRt', 'PrRt', 'Pymt', 'Rcpt', 'Jrnl', 'DrNt', 'CrNt'] },
                    // Exclude transactions of Sale, Purc, Slrt, PrRt where payment mode is 'cash'
                    $or: [
                        { type: { $in: ['Sale', 'Purc', 'SlRt', 'PrRt'] }, paymentMode: { $ne: 'cash' } },
                        { type: { $in: ['Pymt', 'Rcpt', 'Jrnl', 'DrNt', 'CrNt'] } } // Include these types regardless of payment mode
                    ]
                });

                // Log transactions for debugging
                console.log(`Transactions for account ${account._id}:`, transactions);

                // Initialize total debits and credits
                let totalDebits = 0;
                let totalCredits = 0;

                // Calculate total debits and credits from all transactions
                transactions.forEach(transaction => {
                    console.log(`Transaction type: ${transaction.type}, debit: ${transaction.debit}, credit: ${transaction.credit}`);
                    switch (transaction.type) {
                        case 'Sale':
                            if (transaction.debit > 0 && transaction.isType === 'Sale') {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0 && transaction.isType === 'VAT') {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            } break;
                        case 'Purc':
                            if (transaction.debit > 0 && transaction.isType === 'VAT') {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0 && transaction.isType === 'Purc') {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            }
                            break;
                        case 'SlRt': // Sales Return
                            if (transaction.debit > 0 && transaction.isType === 'VAT') {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0 && transaction.isType === 'SlRt') {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            } break;
                        case 'PrRt': // Purchase Return
                            if (transaction.debit > 0 && transaction.isType === 'PrRt') {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0 && transaction.isType === 'VAT') {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            }
                            break;
                        // Handle other types as needed
                        case 'Pymt': //Party Payment
                            if (transaction.debit > 0) {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0) {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            } break;
                        case 'Rcpt': //Party Receipt
                            if (transaction.debit > 0) {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0) {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            } break;
                        case 'Jrnl': // Journal Entry - Handle both debit and credit
                            if (transaction.debit > 0) {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0) {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            }
                            break;
                        case 'DrNt': //Debit Note
                            if (transaction.debit > 0) {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0) {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            } break;
                        case 'CrNt': //Credit Note
                            if (transaction.debit > 0) {
                                totalDebits += transaction.debit; // Add to total debits if there's a debit value
                            }
                            if (transaction.credit > 0) {
                                totalCredits += transaction.credit; // Add to total credits if there's a credit value
                            } break;
                        // Handle these transaction types if needed
                        case 'Opening Balance':
                            // Opening balance transactions might not need to affect the calculation here
                            break;
                        default:
                            console.log(`Unexpected transaction type: ${transaction.type}`); // Log unexpected types
                            break;
                    }
                });

                // Get the account's original opening balance
                let openingBalance = account.openingBalance.amount;
                let openingBalanceType = account.openingBalance.type;

                // Calculate the total balance at the end of the fiscal year
                let totalBalance = totalDebits - totalCredits; // Adjusted to calculate total balance correctly

                // Adjust based on opening balance type (Dr/Cr)
                if (openingBalanceType === 'Cr') {
                    totalBalance = openingBalance - totalBalance;
                } else {
                    totalBalance = openingBalance + totalBalance;
                }

                console.log('Opening Balance:', openingBalance, 'Total Balance:', totalBalance);


                // Determine the new opening balance type
                const newBalanceType = totalBalance >= 0 ? 'Dr' : 'Cr';

                // Create a new account for the next fiscal year
                const newAccount = new Account({
                    name: account.name,
                    address: account.address,
                    ward: account.ward,
                    phone: account.phone,
                    pan: account.pan,
                    contactperson: account.contactperson,
                    email: account.email,
                    openingBalance: {
                        fiscalYear: newFiscalYear._id,
                        amount: Math.abs(totalBalance), // Use absolute value for opening balance
                        type: newBalanceType
                    },
                    openingBalanceDate: startDateObject,
                    companyGroups: account.companyGroups,
                    company: companyId,
                    fiscalYear: newFiscalYear._id,
                    transactions: [] // No transactions for the new year yet
                });

                try {
                    await newAccount.save();
                    console.log(`Created new account for fiscal year ${newFiscalYear.name}: ${newAccount.name} with opening balance: ${newAccount.openingBalance.amount}`);

                } catch (saveError) {
                    if (saveError.code === 11000) {
                        console.log(`Account ${newAccount.name} already exists for fiscal year ${newFiscalYear.name}`);
                    } else {
                        throw saveError;
                    }
                }
            }

            // Initialize bill counters for the new fiscal year
            const transactionTypes = [
                'Sales', 'Purchase', 'SalesReturn', 'PurchaseReturn',
                'Payment', 'Receipt', 'Journal', 'DebitNote', 'CreditNote', 'StockAdjustment'
            ];

            for (let transactionType of transactionTypes) {
                try {
                    await BillCounter.create({
                        company: companyId,
                        fiscalYear: newFiscalYear._id,
                        transactionType: transactionType,
                        currentBillNumber: 0 // Initialize to 1 for the new fiscal year
                    });
                    console.log(`Initialized ${transactionType} bill counter for fiscal year ${newFiscalYear.name}`);
                } catch (err) {
                    console.error(`Failed to initialize ${transactionType} bill counter:`, err);
                }
            }


            // Final progress update
            progress = 100;
            req.flash('info', 'Step 3: Created new accounts for the fiscal year.');

            req.session.currentFiscalYear = {
                id: newFiscalYear._id.toString(),
                startDate: newFiscalYear.startDate,
                endDate: newFiscalYear.endDate,
                name: newFiscalYear.name,
                dateFormat: newFiscalYear.dateFormat,
                isActive: true
            };

            // req.flash('success', `Fiscal Year switched to ${newFiscalYear.name} successfully.`);
            res.json({ success: true, message: `Fiscal year switched to ${newFiscalYear.name} successfully.` });
            // res.redirect('/wholesellerDashboard');
        } catch (err) {
            console.error('Error switching fiscal year:', err);
            // req.flash('error', 'Failed to switch fiscal year.');
            res.status(500).json({ error: 'Failed to switch fiscal year.' });
            // res.redirect('/wholesellerDashboard');
        }
    } else {
        res.redirect('/'); // Handle unauthorized access
    }
});
// Add this route to your Express server
router.get('/change-fiscal-year-stream', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType !== 'Wholeseller') {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Unauthorized access' })}\n\n`);
        return res.end();
    }

    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Function to send events
    const sendEvent = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear.id;

        // Get parameters from query string (since this is a GET request)
        const { startDateEnglish, endDateEnglish, startDateNepali, endDateNepali, dateFormat } = req.query;

        // let startDate, endDate;
        // if (dateFormat === 'nepali') {
        //     startDate = startDateNepali;
        //     endDate = endDateNepali;
        // } else if (dateFormat === 'english') {
        //     startDate = startDateEnglish;
        //     endDate = endDateEnglish;
        // } else {
        //     sendEvent('error', { message: 'Invalid date format' });
        //     return res.end();
        // }

        let startDate, endDate;
        if (dateFormat === 'nepali') {
            startDate = startDateNepali;
            endDate = endDateNepali;
        } else if (dateFormat === 'english') {
            startDate = startDateEnglish;
            endDate = endDateEnglish;
        } else {
            sendEvent('error', { message: 'Invalid date format' });
            return res.end();
        }


        if (!endDate) {
            endDate = new Date(startDate);
            endDate.setFullYear(endDate.getFullYear() + 1);
            endDate.setDate(endDate.getDate() - 1);
        }

        const startDateObject = new Date(startDate);
        const endDateObject = new Date(endDate);
        const startYear = startDateObject.getFullYear();
        const endYear = endDateObject.getFullYear();
        const fiscalYearName = `${startYear}/${endYear.toString().slice(-2)}`;

        // Step 1: Create fiscal year
        sendEvent('log', { message: `Creating new fiscal year ${fiscalYearName}...` });
        sendEvent('progress', { value: 10 });

        const existingFiscalYear = await FiscalYear.findOne({
            name: fiscalYearName,
            company: companyId
        });

        if (existingFiscalYear) {
            sendEvent('error', { message: `Fiscal Year ${fiscalYearName} already exists.` });
            return res.end();
        }

        const newFiscalYear = await FiscalYear.create({
            name: fiscalYearName,
            startDate: startDateObject,
            endDate: endDateObject,
            dateFormat,
            company: companyId
        });

        sendEvent('log', { message: `Created new fiscal year: ${fiscalYearName}` });
        sendEvent('progress', { value: 33 });

        // Step 2: Create items
        sendEvent('log', { message: 'Creating items for new fiscal year...' });
        const items = await Item.find({ company: companyId, fiscalYear: currentFiscalYear });

        let itemsProcessed = 0;
        const totalItems = items.length;
        const itemsProgressStep = 33 / Math.max(totalItems, 1); // Prevent division by zero

        for (let item of items) {
            const currentStock = item.stock;
            const purchases = await Transaction.find({
                item: item._id,
                company: companyId,
                type: 'Purc',
                date: { $lt: startDateObject },
                fiscalYear: currentFiscalYear
            });

            let totalQuantity = 0;
            let totalPrice = 0;
            for (let purchase of purchases) {
                totalQuantity += purchase.quantity;
                totalPrice += purchase.quantity * purchase.puPrice;
            }

            const purchasePrice = totalQuantity > 0 ? (totalPrice / totalQuantity) : item.puPrice;
            const openingStockBalance = purchasePrice * currentStock;

            const newItem = new Item({
                name: item.name,
                hscode: item.hscode,
                category: item.category,
                unit: item.unit,
                mainUnit: item.mainUnit,
                price: item.price,
                puPrice: purchasePrice,
                stock: currentStock,
                vatStatus: item.vatStatus,
                company: companyId,
                fiscalYear: newFiscalYear._id,
                openingStockByFiscalYear: [{
                    fiscalYear: newFiscalYear._id,
                    openingStock: currentStock,
                    openingStockBalance: openingStockBalance,
                    purchasePrice: purchasePrice,
                    salesPrice: item.price,
                }],
                stockEntries: item.stockEntries.map(stockEntry => ({
                    quantity: stockEntry.quantity,
                    batchNumber: stockEntry.batchNumber,
                    expiryDate: stockEntry.expiryDate,
                    price: stockEntry.price,
                    mainUnitPuPrice: stockEntry.mainUnitPuPrice,
                    puPrice: stockEntry.puPrice,
                    mrp: stockEntry.mrp,
                    marginPercentage: stockEntry.marginPercentage,
                    date: stockEntry.date || new Date(),
                    fiscalYear: newFiscalYear._id
                })),
            });

            try {
                await newItem.save();
                itemsProcessed++;
                sendEvent('log', { message: `Created item: ${newItem.name} with stock: ${newItem.stock}` });
                sendEvent('progress', { value: 33 + (itemsProcessed * itemsProgressStep) });
            } catch (saveError) {
                if (saveError.code === 11000) {
                    sendEvent('log', { message: `Item ${newItem.name} already exists` });
                } else {
                    throw saveError;
                }
            }
        }

        sendEvent('log', { message: `Completed creating ${itemsProcessed} items` });
        sendEvent('progress', { value: 66 });

        // Step 3: Create accounts
        sendEvent('log', { message: 'Creating accounts for new fiscal year...' });
        const accounts = await Account.find({ company: companyId, fiscalYear: currentFiscalYear }).populate('transactions');

        let accountsProcessed = 0;
        const totalAccounts = accounts.length;
        const accountsProgressStep = 34 / Math.max(totalAccounts, 1); // Remaining 34% of progress

        for (let account of accounts) {
            const transactions = await Transaction.find({
                account: account._id,
                company: companyId,
                fiscalYear: currentFiscalYear,
                type: { $in: ['Purc', 'Sale', 'SlRt', 'PrRt', 'Pymt', 'Rcpt', 'Jrnl', 'DrNt', 'CrNt'] },
                $or: [
                    { type: { $in: ['Sale', 'Purc', 'SlRt', 'PrRt'] }, paymentMode: { $ne: 'cash' } },
                    { type: { $in: ['Pymt', 'Rcpt', 'Jrnl', 'DrNt', 'CrNt'] } }
                ]
            });

            let totalDebits = 0;
            let totalCredits = 0;

            transactions.forEach(transaction => {
                sendEvent('log', { message: `Transaction type: ${transaction.type}, debit: ${transaction.debit}, credit: ${transaction.credit}` });
                // ... (same transaction processing logic as your POST route)
            });

            // Get the account's original opening balance
            let openingBalance = account.openingBalance.amount;
            let openingBalanceType = account.openingBalance.type;

            // Calculate the total balance at the end of the fiscal year
            let totalBalance = totalDebits - totalCredits;
            if (openingBalanceType === 'Cr') {
                totalBalance = openingBalance - totalBalance;
            } else {
                totalBalance = openingBalance + totalBalance;
            }

            sendEvent('log', { message: `Opening Balance: ${openingBalance} Total Balance: ${totalBalance}` });

            const newBalanceType = totalBalance >= 0 ? 'Dr' : 'Cr';

            const newAccount = new Account({
                name: account.name,
                address: account.address,
                ward: account.ward,
                phone: account.phone,
                pan: account.pan,
                contactperson: account.contactperson,
                email: account.email,
                openingBalance: {
                    fiscalYear: newFiscalYear._id,
                    amount: Math.abs(totalBalance),
                    type: newBalanceType
                },
                openingBalanceDate: startDateObject,
                companyGroups: account.companyGroups,
                company: companyId,
                fiscalYear: newFiscalYear._id,
                transactions: []
            });

            try {
                await newAccount.save();
                accountsProcessed++;
                sendEvent('log', { message: `Created account: ${newAccount.name} with opening balance: ${newAccount.openingBalance.amount}` });
                sendEvent('progress', { value: 66 + (accountsProcessed * accountsProgressStep) });
            } catch (saveError) {
                if (saveError.code === 11000) {
                    sendEvent('log', { message: `Account ${newAccount.name} already exists` });
                } else {
                    throw saveError;
                }
            }
        }

        sendEvent('log', { message: `Completed creating ${accountsProcessed} accounts` });

        // Initialize bill counters
        sendEvent('log', { message: 'Initializing bill counters...' });
        const transactionTypes = [
            'Sales', 'Purchase', 'SalesReturn', 'PurchaseReturn',
            'Payment', 'Receipt', 'Journal', 'DebitNote', 'CreditNote', 'StockAdjustment'
        ];

        for (let transactionType of transactionTypes) {
            try {
                await BillCounter.create({
                    company: companyId,
                    fiscalYear: newFiscalYear._id,
                    transactionType: transactionType,
                    currentBillNumber: 0
                });
                sendEvent('log', { message: `Initialized ${transactionType} bill counter` });
            } catch (err) {
                sendEvent('log', { message: `Failed to initialize ${transactionType} bill counter: ${err.message}` });
            }
        }

        // Update session
        req.session.currentFiscalYear = {
            id: newFiscalYear._id.toString(),
            startDate: newFiscalYear.startDate,
            endDate: newFiscalYear.endDate,
            name: newFiscalYear.name,
            dateFormat: newFiscalYear.dateFormat,
            isActive: true
        };

        sendEvent('progress', { value: 100 });
        sendEvent('complete', { message: `Fiscal year ${fiscalYearName} created successfully!` });
    } catch (err) {
        console.error('Error in fiscal year creation:', err);
        sendEvent('error', { message: `Failed to create fiscal year: ${err.message}` });
    } finally {
        res.end();
    }

    // Handle client disconnect
    req.on('close', () => {
        res.end();
    });
});
// Route to get progress
router.get('/progress', (req, res) => {
    res.status(200).json({ progress });
});

// Route to delete fiscal year and set the latest one active
router.delete('/delete-fiscal-year/:id', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    const fiscalYearId = req.params.id;
    const companyId = req.session.currentCompany;

    try {
        // Check the number of fiscal years for the company
        const fiscalYearCount = await FiscalYear.countDocuments({ company: companyId });

        // Prevent deletion if only one fiscal year exists
        if (fiscalYearCount === 1) {
            return res.status(400).json({ error: 'Cannot delete the only fiscal year.' });
        }

        // Find and delete the fiscal year
        const fiscalYear = await FiscalYear.findOneAndDelete({ _id: fiscalYearId, company: companyId });

        if (!fiscalYear) {
            return res.status(404).json({ error: 'Fiscal year not found.' });
        }

        // Optionally delete related items and accounts
        await Item.deleteMany({ fiscalYear: fiscalYearId, company: companyId });
        await Account.deleteMany({ fiscalYear: fiscalYearId, company: companyId });

        // After deletion, find the latest fiscal year (based on startDate or another relevant field)
        const latestFiscalYear = await FiscalYear.findOne({ company: companyId }).sort({ startDate: -1 });

        if (latestFiscalYear) {
            // Set the latest fiscal year as the active one
            await Company.findOneAndUpdate(
                { _id: companyId },
                { currentFiscalYear: latestFiscalYear._id }
            );
        }

        res.status(200).json({ success: true, message: 'Fiscal year deleted and latest fiscal year set as active.' });
    } catch (err) {
        console.error('Error deleting fiscal year or setting latest fiscal year:', err);
        res.status(500).json({ error: 'Failed to delete fiscal year or set latest fiscal year active.' });
    }
});


module.exports = router;