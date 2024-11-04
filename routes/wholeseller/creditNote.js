const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const CreditNote = require('../../models/wholeseller/CreditNote');
const Account = require('../../models/wholeseller/Account');
const NepaliDate = require('nepali-date');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const Transaction = require('../../models/wholeseller/Transaction');
// const BillCounter = require('../../models/wholeseller/creditNoteBillCounter');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const BillCounter = require('../../models/wholeseller/billCounter');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');

// GET - Show form to create a new journal voucher
router.get('/credit-note/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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
            transactionType: 'CreditNote' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }
        res.render('wholeseller/creditNote/new',
            {
                company,
                currentFiscalYear,
                accounts,
                nepaliDate,
                companyDateFormat,
                nextBillNumber,
                currentCompanyName: req.session.currentCompanyName,
                user: req.user,
                title: 'Add Credit Note',
                body: 'wholeseller >> credit note >> add credit note',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
    }
});

// POST - Create a new journal voucher with multiple debit and credit accounts
router.post('/credit-note/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { nepaliDate, billDate, creditAccounts, debitAccounts, description } = req.body;
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

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'CreditNote')

            // Create the Journal Voucher
            const creditNote = new CreditNote({
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

            await creditNote.save();
            console.log(creditNote);

            // Process Credit Accounts
            for (let credit of creditAccounts) {
                // Fetch the account details to get the account name
                // const accountDetails = await Account.findById(credit.account);

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
                    type: 'CrNt',
                    creditNoteId: creditNote._id,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    drCrNoteAccountTypes: 'Credit',
                    drCrNoteAccountType: (await Promise.all(debitAccountNames)).join(', '),  // Save debit account names as a string
                    debit: 0,
                    credit: credit.credit,
                    paymentMode: 'Cr Note',
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

            // Process Debit Accounts
            for (let debit of debitAccounts) {
                // // Fetch the account details to get the account name
                // const accountDetails = await Account.findById(debit.account);
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
                    type: 'DrNt',
                    creditNoteId: creditNote._id,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    drCrNoteAccountTypes: 'Debit',
                    drCrNoteAccountType: (await Promise.all(creditAccountNames)).join(', '),  // Save credit account names as a string
                    debit: debit.debit,
                    credit: 0,
                    paymentMode: 'Dr Note',
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

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/credit-note/${creditNote._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Credit Note saved successfully!');
                res.redirect('/credit-note/new');
            }
        } catch (err) {
            console.error(err);
            req.flash('error', 'Error saving debit note!');
            res.redirect('/credit-note/new');
        }
    }
});


// GET - Show list of journal vouchers
router.get('/credit-note/list', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
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
        const creditNotes = await CreditNote.find({ company: req.session.currentCompany }).populate('debitAccounts.account creditAccounts.account');
        res.render('wholeseller/creditNote/list', {
            company, currentFiscalYear, currentCompany,
            creditNotes, currentCompanyName: req.session.currentCompanyName,
            title: 'View Credit Note',
            body: 'wholeseller >> credit note >> add credit note',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// View individual journal voucher
router.get('/credit-note/:id/print', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const creditNoteId = req.params.id;
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
            if (!mongoose.Types.ObjectId.isValid(creditNoteId)) {
                return res.status(400).json({ message: 'Invalid debit note ID.' });
            }

            // Find the journal voucher
            const creditNotes = await CreditNote.findById(creditNoteId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!creditNoteId) {
                return res.status(404).json({ message: 'Debit note not found.' });
            }

            const creditTransactions = await Transaction.find({
                creditNoteId: creditNotes._id,
                type: 'CrNt',
                drCrNoteAccountTypes: 'Credit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const debitTransactions = await Transaction.find({
                creditNoteId: creditNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Debit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('wholeseller/creditNote/print', {
                creditNotes,
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
router.get('/credit-note/:id/direct-print', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        try {
            const creditNoteId = req.params.id;
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
            if (!mongoose.Types.ObjectId.isValid(creditNoteId)) {
                return res.status(400).json({ message: 'Invalid debit note ID.' });
            }

            // Find the journal voucher
            const creditNotes = await CreditNote.findById(creditNoteId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!creditNoteId) {
                return res.status(404).json({ message: 'Debit note not found.' });
            }

            const creditTransactions = await Transaction.find({
                creditNoteId: creditNotes._id,
                type: 'CrNt',
                drCrNoteAccountTypes: 'Credit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const debitTransactions = await Transaction.find({
                creditNoteId: creditNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Debit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('wholeseller/creditNote/direct-print', {
                creditNotes,
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

module.exports = router;
