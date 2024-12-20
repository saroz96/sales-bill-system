const express = require('express');
const router = express.Router();

const Account = require('../../models/wholeseller/Account');
const Transaction = require('../../models/wholeseller/Transaction');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const Company = require('../../models/wholeseller/Company');
const NepaliDate = require('nepali-date');
const { ensureCompanySelected, ensureAuthenticated } = require('../../middleware/auth');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const { ensureTradeType } = require('../../middleware/tradeType');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const CompanyGroup = require('../../models/wholeseller/CompanyGroup');

// Route to fetch all accounts
router.get('/aging/accounts', async (req, res) => {
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
        const cashGroups = await CompanyGroup.find({ name: 'Cash in Hand' }).exec();
        const bankGroups = await CompanyGroup.find({ name: { $in: ['Bank Accounts', 'Bank O/D Account'] } }).exec();

        if (!cashGroups) {
            console.warn('Cash in Hand group not found');
        }
        if (bankGroups.length === 0) {
            console.warn('No bank groups found');
        }
        // Convert bank group IDs to an array of ObjectIds
        const bankGroupIds = bankGroups.map(group => group._id);
        const cashGroupIds = cashGroups.map(group => group._id);

        // Fetch accounts excluding 'Cash in Hand' and 'Bank Accounts'
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            isActive: true,
            companyGroups: { $nin: [...cashGroupIds ? cashGroupIds : null, ...bankGroupIds] }
        })
            .populate('companyGroups')
            .exec();

        // const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear }).populate('companyGroups');

        res.render('wholeseller/outstanding/accounts', {
            company,
            currentFiscalYear,
            accounts,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Accounts',
            body: 'wholeseller >> account >> accounts',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


// Route to get aging report for a specific account
router.get('/aging/:accountId', ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
    try {
        const { accountId } = req.params;
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompany = await Company.findById(companyId);
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english'; // Default to 'english'

        let currentDate;

        if (companyDateFormat === 'nepali') {
            // Use NepaliDate if the company's date format is Nepali
            currentDate = nepaliDate; // Get current Nepali date
        } else {
            // Use regular Date for English date format
            currentDate = today;
        }

        // Fetch current fiscal year from session or company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;
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

        // Fetch the account
        const account = await Account.findById(accountId);

        // Fetch opening balance for the current fiscal year
        const openingBalance = account.openingBalance && account.openingBalance.fiscalYear
            ? account.openingBalance
            : { amount: 0, type: 'Cr' }; // Default to zero if not found

        let runningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

        const transactions = await Transaction.find({
            company: companyId,
            account: accountId,
            $or: [
                { billId: { $exists: true } }, // Sales
                { purchaseBillId: { $exists: true } }, // Purchase
                { purchaseReturnBillId: { $exists: true } },
                { salesReturnBillId: { $exists: true } }, // Sales Return
                { paymentAccountId: { $exists: true } },
                { receiptAccountId: { $exists: true } },
                { journalBillId: { $exists: true } },
                { debitNoteId: { $exists: true } },
                { creditNoteId: { $exists: true } },
            ],
        }).populate('billId')
            .populate('purchaseBillId')
            .populate('purchaseReturnBillId')
            .populate('salesReturnBillId')
            .populate('paymentAccountId')
            .populate('receiptAccountId')
            .populate('journalBillId')
            .populate('debitNoteId')
            .populate('creditNoteId')
            .sort({ date: 'asc' }) // Sort by date for better analysis
            .exec();

        // Initialize data for aging analysis
        const agingData = {
            totalOutstanding: 0,
            oneToThirty: 0,
            thirtyOneToSixty: 0,
            sixtyOneToNinety: 0,
            ninetyPlus: 0,
            openingBalance: openingBalance.amount, // Add opening balance
            transactions: []
        };

        // Helper function to apply receipt credit to outstanding sales transactions (FIFO)
        function applyReceiptFIFO(remainingCredit, agingData) {
            const periods = ['ninetyPlus', 'sixtyOneToNinety', 'thirtyOneToSixty', 'oneToThirty'];

            for (const period of periods) {
                if (remainingCredit <= 0) break; // Stop if no remaining credit

                if (agingData[period] > 0) { // Apply only to the current period if it has balance
                    const appliedAmount = Math.min(agingData[period], remainingCredit);
                    agingData[period] -= appliedAmount;  // Deduct the applied amount from the period balance
                    remainingCredit -= appliedAmount;  // Decrease remaining credit by applied amount

                    // Stop moving to the next period if there is no remaining credit after deduction
                    if (remainingCredit <= 0) break;
                }
            }
            return remainingCredit; // Return any remaining credit if any
        }

        // Loop through transactions to calculate outstanding amounts and balance
        transactions.forEach(transaction => {
            // Determine debit or credit effect on totalOutstanding
            if (transaction.billId) {
                // Sales
                runningBalance -= transaction.debit; // Debit increases outstanding
                agingData.totalOutstanding += transaction.debit; // Increase total outstanding for sales
            } else if (transaction.salesReturnBillId) {
                // Sales Return
                runningBalance += transaction.credit; // Credit decreases outstanding
                agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for sales return
            } else if (transaction.purchaseBillId) {
                // Purchase
                runningBalance += transaction.credit; // Credit for purchases
                agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for purchases
            } else if (transaction.purchaseReturnBillId) {
                // Purchase Return
                runningBalance -= transaction.debit; // Debit for purchases
                agingData.totalOutstanding += transaction.debit; // Increase total outstanding for purchase returns
            } else if (transaction.paymentAccountId) {
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit;
                    agingData.totalOutstanding += transaction.debit;
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit;
                    agingData.totalOutstanding -= transaction.credit;
                }
            } else if (transaction.receiptAccountId) {
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit;
                    agingData.totalOutstanding += transaction.debit;
                } else if (transaction.credit > 0) {
                    // Apply receipt credit to outstanding sales amounts using FIFO
                    const remainingCredit = applyReceiptFIFO(transaction.credit, agingData);
                    agingData.totalOutstanding -= (transaction.credit - remainingCredit); // Adjust total outstanding
                    runningBalance += transaction.credit;
                }
            } else if (transaction.debitNoteId) {
                // Journal Entry (can be either debit or credit)
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit; // Debit increases outstanding
                    agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit; // Credit decreases outstanding
                    agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
                }
            } else if (transaction.creditNoteId) {
                // Journal Entry (can be either debit or credit)
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit; // Debit increases outstanding
                    agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit; // Credit decreases outstanding
                    agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
                }
            } else if (transaction.journalBillId) {
                // Journal Entry (can be either debit or credit)
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit; // Debit increases outstanding
                    agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit; // Credit decreases outstanding
                    agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
                }
            }

            let transactionDate, age;

            if (companyDateFormat === 'nepali') {
                // Validate and convert the transaction date to NepaliDate
                try {
                    // Make sure the transaction date is valid before converting
                    const nepaliTransactionDate = transaction.date; // NepaliDate instance
                    const nepaliCurrentDate = nepaliDate; // NepaliDate instance

                    const nepaliTransactionDateObject = new Date(nepaliTransactionDate); // Date object from transaction.date
                    const nepaliCurrentDateObject = new Date(nepaliCurrentDate); // Convert string to Date object

                    // Check if both dates are valid
                    if (isNaN(nepaliTransactionDateObject) || isNaN(nepaliCurrentDateObject)) {
                        throw new Error('Invalid date for age calculation');
                    }
                    // Debug the values

                    console.log('Type of nepaliTransactionDate:', typeof nepaliTransactionDate);
                    console.log('nepaliTransactionDate:', nepaliTransactionDate);
                    console.log('Type of nepaliCurrentDate:', typeof nepaliCurrentDate);
                    console.log('nepaliCurrentDate:', nepaliCurrentDate);

                    // Calculate the difference in days using JavaScript date difference
                    age = (nepaliCurrentDateObject - nepaliTransactionDateObject) / (1000 * 60 * 60 * 24); // Age in days
                    console.log('Age in days:', age);
                    // Use the original Nepali date string without formatting
                    transactionDate = transaction.date;
                } catch (error) {
                    console.error('Error converting Nepali date:', error);
                    age = 0; // Default to 0 if the date conversion fails
                }
            } else {
                // Validate and handle English date format
                try {
                    const transactionDateObject = new Date(transaction.date); // Convert to Date object

                    if (isNaN(transactionDateObject)) {
                        throw new Error('Invalid English date');
                    }

                    // Calculate age in days using the difference between today's date and the transaction date
                    age = (today - transactionDateObject) / (1000 * 60 * 60 * 24); // Age in days

                    // Use the original English date string without formatting
                    transactionDate = transaction.date;
                } catch (error) {
                    console.error('Error converting English date:', error);
                    age = 0; // Default to 0 if the date conversion fails
                }
            }



            // Categorize the transaction into the correct aging period based on the calculated age
            if (age <= 30) {
                agingData.oneToThirty += transaction.debit - transaction.credit; // Consider only sales in aging
            } else if (age <= 60) {
                agingData.thirtyOneToSixty += transaction.debit - transaction.credit; // Consider only sales in aging
            } else if (age <= 90) {
                agingData.sixtyOneToNinety += transaction.debit - transaction.credit; // Consider only sales in aging
            } else {
                agingData.ninetyPlus += transaction.debit - transaction.credit; // Consider only sales in aging
            }

            // Attach the running balance to each transaction
            transaction.balance = runningBalance;
            // Add to transactions list for detailed view
            agingData.transactions.push(transaction);
        });

        // Include opening balance in the total outstanding calculation
        agingData.totalOutstanding += agingData.openingBalance;

        res.render('wholeseller/outstanding/ageing', {
            company,
            currentFiscalYear,
            account,
            agingData,
            currentCompany,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Outstanding Analysis',
            body: 'wholeseller >> account >> aging',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


// Route to get aging report for a specific account
router.get('/day-count-aging/:accountId', ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
    try {
        const { accountId } = req.params;
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompany = await Company.findById(companyId);
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

        let currentDate;
        if (companyDateFormat === 'nepali') {
            currentDate = nepaliDate;
        } else {
            currentDate = today;
        }

        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;
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

        // Fetch the account
        const account = await Account.findById(accountId);

        // Fetch opening balance for the current fiscal year
        const openingBalance = account.openingBalance && account.openingBalance.fiscalYear.equals(currentFiscalYear._id)
            ? account.openingBalance
            : { amount: 0, type: 'Cr' };

        let runningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

        const transactions = await Transaction.find({
            company: companyId,
            account: accountId,
            isActive: true,
            $or: [
                { billId: { $exists: true } },
                { purchaseBillId: { $exists: true } },
                { purchaseReturnBillId: { $exists: true } },
                { salesReturnBillId: { $exists: true } },
                { paymentAccountId: { $exists: true } },
                { receiptAccountId: { $exists: true } },
                { journalBillId: { $exists: true } },
                { debitNoteId: { $exists: true } },
                { creditNoteId: { $exists: true } },
            ],
        }).populate('billId')
            .populate('purchaseBillId')
            .populate('purchaseReturnBillId')
            .populate('salesReturnBillId')
            .populate('paymentAccountId')
            .populate('receiptAccountId')
            .populate('journalBillId')
            .populate('debitNoteId')
            .populate('creditNoteId')
            .sort({ date: 'asc' })
            .exec();

        // Custom sort: prioritize payment and receipt, then others by date
        transactions.sort((a, b) => {
            const isPaymentA = !!a.paymentAccountId;
            const isReceiptA = !!a.receiptAccountId;
            const isPaymentB = !!b.paymentAccountId;
            const isReceiptB = !!b.receiptAccountId;

            // If A is a payment or receipt and B is not, A should come first
            if ((isPaymentA || isReceiptA) && !(isPaymentB || isReceiptB)) {
                return -1;
            }
            // If B is a payment or receipt and A is not, B should come first
            if ((isPaymentB || isReceiptB) && !(isPaymentA || isReceiptA)) {
                return 1;
            }
            // Otherwise, sort by date (already sorted by date, so no change needed)
            return new Date(a.date) - new Date(b.date);
        });

        // Initialize data for aging analysis
        const agingData = {
            totalOutstanding: 0,
            current: 0,
            oneToThirty: 0,
            thirtyOneToSixty: 0,
            sixtyOneToNinety: 0,
            ninetyPlus: 0,
            openingBalance: openingBalance.amount,
            transactions: []
        };
        // Loop through transactions to calculate outstanding amounts and balance
        transactions.forEach(transaction => {
            // Determine debit or credit effect on totalOutstanding
            if (transaction.billId) {
                // Sales
                runningBalance -= transaction.debit; // Debit increases outstanding
                agingData.totalOutstanding += transaction.debit; // Increase total outstanding for sales
            } else if (transaction.salesReturnBillId) {
                // Sales Return
                runningBalance += transaction.credit; // Credit decreases outstanding
                agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for sales return
            } else if (transaction.purchaseBillId) {
                // Purchase
                runningBalance += transaction.credit; // Debit for purchases
                agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for purchases
            } else if (transaction.purchaseReturnBillId) {
                // Purchase Return
                runningBalance -= transaction.debit; // Debit for purchases
                agingData.totalOutstanding += transaction.debit; // Decrease total outstanding for purchases
            } else if (transaction.paymentAccountId) {
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit;
                    // agingData.totalOutstanding += transaction.debit;
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit;
                    // agingData.totalOutstanding -= transaction.credit;
                }
            } else if (transaction.receiptAccountId) {
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit;
                    agingData.totalOutstanding += transaction.debit;
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit;
                    agingData.totalOutstanding -= transaction.credit;
                }
            } else if (transaction.debitNoteId) {
                // Journal Entry (can be either debit or credit)
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit; // Debit increases outstanding
                    agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit; // Credit decreases outstanding
                    agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
                }
            } else if (transaction.creditNoteId) {
                // Journal Entry (can be either debit or credit)
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit; // Debit increases outstanding
                    agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit; // Credit decreases outstanding
                    agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
                }
            } else if (transaction.journalBillId) {
                // Journal Entry (can be either debit or credit)
                if (transaction.debit > 0) {
                    runningBalance -= transaction.debit; // Debit increases outstanding
                    agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
                } else if (transaction.credit > 0) {
                    runningBalance += transaction.credit; // Credit decreases outstanding
                    agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
                }
            }

            let transactionDate, age;
            if (companyDateFormat === 'nepali') {
                try {
                    const nepaliTransactionDate = transaction.date; // NepaliDate instance
                    const nepaliCurrentDate = nepaliDate; // NepaliDate instance

                    const nepaliTransactionDateObject = new Date(nepaliTransactionDate); // Date object from transaction.date
                    const nepaliCurrentDateObject = new Date(nepaliCurrentDate); // Convert string to Date object

                    age = (nepaliCurrentDateObject - nepaliTransactionDateObject) / (1000 * 60 * 60 * 24); // Age in days
                    transactionDate = transaction.date;
                } catch (error) {
                    age = 0; // Default to 0 if the date conversion fails
                }
            } else {
                try {
                    const transactionDateObject = new Date(transaction.date);
                    age = (today - transactionDateObject) / (1000 * 60 * 60 * 24); // Age in days
                    transactionDate = transaction.date;
                } catch (error) {
                    age = 0; // Default to 0 if the date conversion fails
                }
            }

            // Add age to transaction object for rendering
            transaction.age = Math.round(age); // Store as an integer
            transaction.ageCategory = age <= 30 ? '0-30 days' :
                age <= 60 ? '31-60 days' :
                    age <= 90 ? '61-90 days' : '90+ days';

            // Categorize the transaction into the correct aging period based on the calculated age
            if (age <= 30) {
                agingData.oneToThirty += transaction.debit - transaction.credit;
            } else if (age <= 60) {
                agingData.thirtyOneToSixty += transaction.debit - transaction.credit;
            } else if (age <= 90) {
                agingData.sixtyOneToNinety += transaction.debit - transaction.credit;
            } else {
                agingData.ninetyPlus += transaction.debit - transaction.credit;
            }

            // Attach the running balance to each transaction
            transaction.balance = runningBalance;
            agingData.transactions.push(transaction);
        });

        // Include opening balance in the total outstanding calculation
        agingData.totalOutstanding += agingData.openingBalance;

        res.render('wholeseller/outstanding/dayCountAgeing', {
            company,
            currentFiscalYear,
            account,
            agingData,
            currentCompany,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Outstanding Analysis',
            body: 'wholeseller >> account >> aging',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/aging/merged', ensureAuthenticated, async (req, res) => {
    try {
        const { accountIds } = req.body;

        if (!accountIds || accountIds.length === 0) {
            return res.status(400).json({ error: 'No accounts selected. Please select at least one account.' });
        }

        return res.status(200).json({ success: true, accountIds });

    } catch (error) {
        console.error('Error in merging accounts:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/aging/mergedReport', ensureAuthenticated, async (req, res) => {
    try {
        const accountIds = req.query.accountIds ? req.query.accountIds.split(',') : [];
        const companyId = req.session.currentCompany;


        if (!accountIds || accountIds.length === 0) {
            return res.status(400).send('No accounts selected.');
        }

        const accounts = await Account.find({ _id: { $in: accountIds } });
        if (!accounts || accounts.length === 0) {
            return res.status(404).send('No accounts found.');
        }

        let mergedAgingData = {
            totalOutstanding: 0,
            oneToThirty: 0,
            thirtyOneToSixty: 0,
            sixtyOneToNinety: 0,
            ninetyPlus: 0,
            transactions: []
        };

        const today = new Date();
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english';

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


        for (const accountId of accountIds) {
            const account = await Account.findById(accountId);
            if (!account) {
                console.error(`Account with ID ${accountId} not found.`);
                continue;
            }

            const openingBalance = account.openingBalance || { amount: 0, type: 'Cr' };
            let runningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

            const transactions = await Transaction.find({
                company: companyId,
                account: accountId,
                $or: [
                    { billId: { $exists: true } },
                    { purchaseBillId: { $exists: true } },
                    { purchaseReturnBillId: { $exists: true } },
                    { salesReturnBillId: { $exists: true } },
                    { paymentAccountId: { $exists: true } },
                    { receiptAccountId: { $exists: true } },
                    { journalBillId: { $exists: true } },
                    { debitNoteId: { $exists: true } },
                    { creditNoteId: { $exists: true } },
                ],
            }).sort({ date: 'asc' }).exec();

            let agingData = {
                totalOutstanding: 0,
                current: 0,
                oneToThirty: 0,
                thirtyOneToSixty: 0,
                sixtyOneToNinety: 0,
                ninetyPlus: 0,
                openingBalance: openingBalance.amount,
                transactions: [],
            };

            transactions.forEach((transaction) => {
                const transactionDateObject = new Date(transaction.date);
                const age = (today - transactionDateObject) / (1000 * 60 * 60 * 24);

                const transactionValue = transaction.debit - transaction.credit; // Calculate transaction value
                agingData.totalOutstanding += transactionValue;

                if (age <= 30) {
                    agingData.oneToThirty += transactionValue;
                } else if (age <= 60) {
                    agingData.thirtyOneToSixty += transactionValue;
                } else if (age <= 90) {
                    agingData.sixtyOneToNinety += transactionValue;
                } else {
                    agingData.ninetyPlus += transactionValue;
                }

                transaction.balance = runningBalance; // Update transaction balance
                runningBalance += transactionValue; // Update running balance
                agingData.transactions.push(transaction);
            });

            mergedAgingData.totalOutstanding += agingData.totalOutstanding;
            mergedAgingData.oneToThirty += agingData.oneToThirty;
            mergedAgingData.thirtyOneToSixty += agingData.thirtyOneToSixty;
            mergedAgingData.sixtyOneToNinety += agingData.sixtyOneToNinety;
            mergedAgingData.ninetyPlus += agingData.ninetyPlus;
            mergedAgingData.transactions.push(...agingData.transactions);
        }

        res.render('wholeseller/outstanding/mergedAging', {
            mergedAgingData,
            accounts,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Outstanding Analysis',
            body: 'wholeseller >> account >> aging',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (error) {
        console.error('Error in generating merged aging report:', error);
        res.status(500).send('Internal Server Error');
    }
});




module.exports = router;