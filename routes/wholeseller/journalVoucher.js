const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const JournalVoucher = require('../../models/wholeseller/JournalVoucher');
const Account = require('../../models/wholeseller/Account');

const NepaliDate = require('nepali-date');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const Transaction = require('../../models/wholeseller/Transaction');
// const BillCounter = require('../../models/wholeseller/journalVoucherBillCounter');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const BillCounter = require('../../models/wholeseller/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');

// GET - Show form to create a new journal voucher
router.get('/journal/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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

        const accounts = await Account.find({ company: req.session.currentCompany, fiscalYear: fiscalYear });

        // Get the next bill number
        // const billCounter = await BillCounter.findOne({ company: companyId });
        // const nextBillNumber = billCounter ? billCounter.count + 1 : 1;

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'Journal' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }
        res.render('wholeseller/journalVoucher/new',
            {
                company,
                currentFiscalYear,
                accounts,
                nepaliDate,
                companyDateFormat,
                nextBillNumber,
                currentCompanyName: req.session.currentCompanyName,
                user: req.user,
                title: 'Add Journal',
                body: 'wholeseller >> journal >> add journal',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
    }
});


// POST - Create a new journal voucher with multiple debit and credit accounts
router.post('/journal/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { nepaliDate, billDate, debitAccounts, creditAccounts, description } = req.body;
        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear.id
        const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        const userId = req.user._id;

        try {
            // let billCounter = await BillCounter.findOne({ company: companyId });
            // if (!billCounter) {
            //     billCounter = new BillCounter({ company: companyId });
            // }
            // billCounter.count += 1;
            // await billCounter.save();

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'Journal')

            // Create the Journal Voucher
            const journalVoucher = new JournalVoucher({
                // billNumber: billCounter.count,
                billNumber: billNumber,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                debitAccounts,
                creditAccounts,
                description,
                user: userId,
                company: companyId,
                fiscalYear: currentFiscalYear,

            });

            await journalVoucher.save();

            // Process Debit Accounts
            for (let debit of debitAccounts) {
                let previousDebitBalance = 0;
                const lastDebitTransaction = await Transaction.findOne({ account: debit.account }).sort({ transactionDate: -1 });
                if (lastDebitTransaction) {
                    previousDebitBalance = lastDebitTransaction.balance;
                }

                // Save credit accounts in the drCrNoteAccountType field for debit transactions
                const creditAccountNames = creditAccounts.map(credit => {
                    return Account.findById(credit.account).then(account => account ? account.name : 'Debit Note');
                });

                const debitTransaction = new Transaction({
                    account: debit.account,
                    type: 'Jrnl',
                    journalBillId: journalVoucher._id,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    journalAccountDrCrType: 'Debit',
                    journalAccountType: (await Promise.all(creditAccountNames)).join(', '),
                    debit: debit.debit,
                    credit: 0,
                    paymentMode: 'Journal',
                    balance: previousDebitBalance + debit.debit,
                    date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,

                });

                await debitTransaction.save();
                console.log(debitTransaction);
                await Account.findByIdAndUpdate(debit.account, { $push: { transactions: debitTransaction._id } });
            }

            // Process Credit Accounts
            for (let credit of creditAccounts) {
                let previousCreditBalance = 0;
                const lastCreditTransaction = await Transaction.findOne({ account: credit.account }).sort({ transactionDate: -1 });
                if (lastCreditTransaction) {
                    previousCreditBalance = lastCreditTransaction.balance;
                }

                // Save debit accounts in the drCrNoteAccountType field for credit transactions
                const debitAccountNames = debitAccounts.map(debit => {
                    return Account.findById(debit.account).then(account => account ? account.name : 'Credit Note');
                });

                const creditTransaction = new Transaction({
                    account: credit.account,
                    type: 'Jrnl',
                    journalBillId: journalVoucher._id,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    journalAccountDrCrType: 'Credit',
                    journalAccountType: (await Promise.all(debitAccountNames)).join(', '),
                    debit: 0,
                    credit: credit.credit,
                    paymentMode: 'Journal',
                    balance: previousCreditBalance - credit.credit,
                    date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,

                });

                await creditTransaction.save();
                console.log(creditTransaction);
                await Account.findByIdAndUpdate(credit.account, { $push: { transactions: creditTransaction._id } });
            }

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/journal/${journalVoucher._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Journal voucher saved successfully!');
                res.redirect('/journal/new');

            }
        } catch (err) {
            console.error(err);
            req.flash('error', 'Error saving journal voucher!');
            res.redirect('/journal/new');
        }
    }
});


// GET - Show list of journal vouchers
router.get('/journal/list', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
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

        const journalVouchers = await JournalVoucher.find({ company: req.session.currentCompany })
            .populate('debitAccounts.account creditAccounts.account');
        res.render('wholeseller/journalVoucher/list', {
            company,
            currentFiscalYear,
            journalVouchers,
            currentCompanyName,
            currentCompany,
            title: 'View Journal',
            body: 'wholeseller >> journal >> view journal',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Get payment edit form
router.get('/journal/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const journalId = req.params.id;
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

        // Find the payment document by ID
        const journals = await JournalVoucher.findById(journalId)
            .populate('debitAccounts.account')
            .populate('creditAccounts.account')
            .populate('user')
            .populate('company'); // Populate the paymentAccount field
        if (!journals) {
            return res.status(404).send('Journal voucher not found');
        }

        // Fetch accounts'
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
        }).exec();

        res.render('wholeseller/JournalVoucher/edit', {
            company,
            journals,
            currentFiscalYear,
            accounts, // All accounts excluding 'Cash in Hand' and 'Bank Accounts'
            nepaliDate,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            user: req.user,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    }
});

router.get('/journals/finds', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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

        res.render('wholeseller/JournalVoucher/billNumberForm', {
            company,
            currentFiscalYear,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            user: req.user,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
})

//get journal voucher edit for by bill number
router.get('/journal/edit/billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { billNumber } = req.query;
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

        //find the journal voucher document by Id
        const journals = await JournalVoucher.findOne({ billNumber: billNumber })
            .populate('debitAccounts.account')
            .populate('creditAccounts.account')
            .populate('user')
            .populate('company');

        // Fetch accounts excluding 'Cash in Hand' and 'Bank Accounts'
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
        }).exec();

        res.render('wholeseller/JournalVoucher/edit', {
            company,
            journals,
            currentFiscalYear,
            accounts, // All accounts excluding 'Cash in Hand' and 'Bank Accounts'
            nepaliDate,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            user: req.user,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});

// PUT - Update an existing journal voucher by ID with multiple debit and credit accounts
router.put('/journal/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { nepaliDate, billDate, debitAccounts, creditAccounts, description } = req.body;
        const { id } = req.params;
        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear._id;
        const userId = req.user._id;

        try {
            // Find the existing journal voucher by ID
            const journalVoucher = await JournalVoucher.findById(id);
            if (!journalVoucher) {
                req.flash('error', 'Journal Voucher not found');
                return res.status(404).redirect('/journal/new');
            }

            // List of current debit and credit accounts from the request
            const updatedDebitAccountIds = debitAccounts.map(debit => debit.account);
            const updatedCreditAccountIds = creditAccounts.map(credit => credit.account);

            // Remove outdated debit transactions
            await Transaction.deleteMany({
                journalBillId: journalVoucher._id,
                journalAccountDrCrType: 'Debit',
                account: { $nin: updatedDebitAccountIds }
            });

            // Remove outdated credit transactions
            await Transaction.deleteMany({
                journalBillId: journalVoucher._id,
                journalAccountDrCrType: 'Credit',
                account: { $nin: updatedCreditAccountIds }
            });

            // Update the journal voucher fields
            journalVoucher.date = nepaliDate ? new Date(nepaliDate) : new Date(billDate);
            journalVoucher.debitAccounts = debitAccounts;
            journalVoucher.creditAccounts = creditAccounts;
            journalVoucher.description = description;
            await journalVoucher.save();

            // Update or create Debit Transactions
            for (const debit of debitAccounts) {
                const existingDebitTransaction = await Transaction.findOne({
                    journalBillId: journalVoucher._id,
                    account: debit.account,
                    journalAccountDrCrType: 'Debit'
                });

                let previousDebitBalance = 0;
                const lastDebitTransaction = await Transaction.findOne({ account: debit.account }).sort({ transactionDate: -1 });
                if (lastDebitTransaction) {
                    previousDebitBalance = lastDebitTransaction.balance;
                }

                const creditAccountNames = await Promise.all(
                    creditAccounts.map(async credit => {
                        const account = await Account.findById(credit.account);
                        return account ? account.name : 'Journal Note';
                    })
                );

                if (existingDebitTransaction) {
                    // Update existing transaction
                    existingDebitTransaction.debit = debit.debit;
                    existingDebitTransaction.balance = previousDebitBalance + debit.debit;
                    existingDebitTransaction.date = journalVoucher.date;
                    existingDebitTransaction.journalAccountType = creditAccountNames.join(', ');
                    await existingDebitTransaction.save();
                } else {
                    // Create new transaction if it doesn't exist
                    const debitTransaction = new Transaction({
                        account: debit.account,
                        type: 'Jrnl',
                        journalBillId: journalVoucher._id,
                        billNumber: journalVoucher.billNumber,
                        journalAccountDrCrType: 'Debit',
                        journalAccountType: creditAccountNames.join(', '),
                        debit: debit.debit,
                        credit: 0,
                        paymentMode: 'Journal',
                        balance: previousDebitBalance + debit.debit,
                        date: journalVoucher.date,
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear,
                    });

                    await debitTransaction.save();
                    await Account.findByIdAndUpdate(debit.account, { $push: { transactions: debitTransaction._id } });
                }
            }

            // Update or create Credit Transactions
            for (const credit of creditAccounts) {
                const existingCreditTransaction = await Transaction.findOne({
                    journalBillId: journalVoucher._id,
                    account: credit.account,
                    journalAccountDrCrType: 'Credit'
                });

                let previousCreditBalance = 0;
                const lastCreditTransaction = await Transaction.findOne({ account: credit.account }).sort({ transactionDate: -1 });
                if (lastCreditTransaction) {
                    previousCreditBalance = lastCreditTransaction.balance;
                }

                const debitAccountNames = await Promise.all(
                    debitAccounts.map(async debit => {
                        const account = await Account.findById(debit.account);
                        return account ? account.name : 'Journal Note';
                    })
                );

                if (existingCreditTransaction) {
                    // Update existing transaction
                    existingCreditTransaction.credit = credit.credit;
                    existingCreditTransaction.balance = previousCreditBalance - credit.credit;
                    existingCreditTransaction.date = journalVoucher.date;
                    existingCreditTransaction.journalAccountType = debitAccountNames.join(', ');
                    await existingCreditTransaction.save();
                } else {
                    // Create new transaction if it doesn't exist
                    const creditTransaction = new Transaction({
                        account: credit.account,
                        type: 'Jrnl',
                        journalBillId: journalVoucher._id,
                        billNumber: journalVoucher.billNumber,
                        journalAccountDrCrType: 'Credit',
                        journalAccountType: debitAccountNames.join(', '),
                        debit: 0,
                        credit: credit.credit,
                        paymentMode: 'Journal',
                        balance: previousCreditBalance - credit.credit,
                        date: journalVoucher.date,
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear,
                    });

                    await creditTransaction.save();
                    await Account.findByIdAndUpdate(credit.account, { $push: { transactions: creditTransaction._id } });
                }
            }

            if (req.query.print === 'true') {
                res.redirect(`/journal/${journalVoucher._id}/direct-print-edit`);
            } else {
                req.flash('success', 'Journal voucher updated successfully!');
                res.redirect(`/journal/${journalVoucher._id}`);
            }
        } catch (err) {
            console.error('Error updating journal voucher:', err);
            req.flash('error', 'An error occurred while updating the journal voucher');
            res.redirect('/journal/new');
        }
    }
});


// View individual journal voucher
router.get('/journal/:id/print', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const journalId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName;
            const companyId = req.session.currentCompany;
            console.log("Company ID from session:", companyId); // Debugging line

            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
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

            // Validate the selectedDate
            if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
                throw new Error('Invalid invoice date provided');
            }

            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate journal voucher ID
            if (!mongoose.Types.ObjectId.isValid(journalId)) {
                return res.status(400).json({ message: 'Invalid journal voucher ID.' });
            }

            // Find the journal voucher
            const journalVoucher = await JournalVoucher.findById(journalId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!journalId) {
                return res.status(404).json({ message: 'Journal voucher not found.' });
            }

            const debitTransactions = await Transaction.find({
                journalBillId: journalVoucher._id,
                type: 'Jrnl',
                journalAccountDrCrType: 'Debit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const creditTransactions = await Transaction.find({
                journalBillId: journalVoucher._id,
                type: 'Jrnl',
                journalAccountDrCrType: 'Credit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('wholeseller/journalVoucher/print', {
                company,
                currentFiscalYear,
                journalVoucher,
                debitTransactions,
                creditTransactions,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                nepaliDate,
                user: req.user,
                title: 'Print Journal Voucher',
                body: 'wholeseller >> journal >> print',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error retrieving journal voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

// View individual journal voucher
router.get('/journal/:id/direct-print', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const journalId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName;
            const companyId = req.session.currentCompany;
            console.log("Company ID from session:", companyId); // Debugging line

            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
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


            // Validate the selectedDate
            if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
                throw new Error('Invalid invoice date provided');
            }

            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate journal voucher ID
            if (!mongoose.Types.ObjectId.isValid(journalId)) {
                return res.status(400).json({ message: 'Invalid journal voucher ID.' });
            }

            // Find the journal voucher
            const journalVoucher = await JournalVoucher.findById(journalId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!journalId) {
                return res.status(404).json({ message: 'Journal voucher not found.' });
            }

            const debitTransactions = await Transaction.find({
                journalBillId: journalVoucher._id,
                type: 'Jrnl',
                journalAccountDrCrType: 'Debit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const creditTransactions = await Transaction.find({
                journalBillId: journalVoucher._id,
                type: 'Jrnl',
                journalAccountDrCrType: 'Credit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('wholeseller/journalVoucher/direct-print', {
                journalVoucher,
                debitTransactions,
                creditTransactions,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                nepaliDate,
                company,
                currentFiscalYear,
                user: req.user,
                title: 'Print Journal Voucher',
                body: 'wholeseller >> journal >> print',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error retrieving journal voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

// View individual journal voucher
router.get('/journal/:id/direct-print-edit', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const journalId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName;
            const companyId = req.session.currentCompany;
            console.log("Company ID from session:", companyId); // Debugging line

            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
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


            // Validate the selectedDate
            if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
                throw new Error('Invalid invoice date provided');
            }

            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate journal voucher ID
            if (!mongoose.Types.ObjectId.isValid(journalId)) {
                return res.status(400).json({ message: 'Invalid journal voucher ID.' });
            }

            // Find the journal voucher
            const journalVoucher = await JournalVoucher.findById(journalId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!journalId) {
                return res.status(404).json({ message: 'Journal voucher not found.' });
            }

            const debitTransactions = await Transaction.find({
                journalBillId: journalVoucher._id,
                type: 'Jrnl',
                journalAccountDrCrType: 'Debit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const creditTransactions = await Transaction.find({
                journalBillId: journalVoucher._id,
                type: 'Jrnl',
                journalAccountDrCrType: 'Credit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('wholeseller/journalVoucher/direct-editPrint', {
                journalVoucher,
                debitTransactions,
                creditTransactions,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                nepaliDate,
                company,
                currentFiscalYear,
                user: req.user,
                title: 'Print Journal Voucher',
                body: 'wholeseller >> journal >> print',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error retrieving journal voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


//route to cancel the journal voucher and related transactions
router.post('/journals/cancel/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { billNumber } = req.params;
            //Update the journal Voucher status to 'canceled'
            const updateJournalVoucherStatus = await JournalVoucher.updateOne(
                { billNumber },
                { status: 'canceled', isActive: false }
            );
            console.log('Journal Voucher Canceled Update Result: ', updateJournalVoucherStatus);

            //Mark related transactions as 'canceled' and set isActive to false
            const updateTransactionsStatus = await Transaction.updateMany(
                { billNumber, type: 'Jrnl' },
                { status: 'canceled', isActive: false }
            )
            console.log('Related transaction update result: ', updateTransactionsStatus);
            req.flash('success', 'Journal and related transactions have been canceled.');
            res.redirect(`/journal/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            req.flash('error', 'An error occured while canceling the journal.')
            res.redirect('/journal/list')
        }
    }
});


// Route to reactivate the journal and related transactions
router.post('/journals/reactivate/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const { billNumber } = req.params;

            // Update the receipt status to 'active'
            const updateJournalVoucherStatus = await JournalVoucher.updateOne({ billNumber }, { status: 'active', isActive: true });
            console.log('Update journal voucher status:', updateJournalVoucherStatus);
            // Reactivate related transactions and set isActive to true
            const updateTransactionsStatus = await Transaction.updateMany(
                {
                    billNumber, type: 'Jrnl',
                },
                { status: 'active', isActive: true }  // Add isActive: true if you have added this field
            );
            console.log('Update Transactions Status:', updateTransactionsStatus);

            req.flash('success', 'Journal and related transactions have been reactivated.');
            res.redirect(`/journal/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error reactivating journal:", error);
            req.flash('error', 'An error occurred while reactivating the journal.');
            res.redirect(`/journal/list`);
        }
    }
});

module.exports = router;
