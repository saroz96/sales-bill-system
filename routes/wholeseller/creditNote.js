const express = require('express');
const router = express.Router();
const CreditNote = require('../../models/wholeseller/CreditNote');
const Account = require('../../models/wholeseller/Account');
const NepaliDate = require('nepali-date');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const Transaction = require('../../models/wholeseller/Transaction');
const BillCounter = require('../../models/wholeseller/creditNoteBillCounter');
const FiscalYear = require('../../models/wholeseller/FiscalYear');

// GET - Show form to create a new journal voucher
router.get('/credit-note/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const companyId = req.session.currentCompany;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format Nepali date if necessary
        const company = await Company.findById(companyId);
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
        const billCounter = await BillCounter.findOne({ company: companyId });
        const nextBillNumber = billCounter ? billCounter.count + 1 : 1;
        res.render('wholeseller/creditNote/new',
            {
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
            let billCounter = await BillCounter.findOne({ company: companyId });
            if (!billCounter) {
                billCounter = new BillCounter({ company: companyId });
            }
            billCounter.count += 1;
            await billCounter.save();

            // Create the Journal Voucher
            const creditNote = new CreditNote({
                billNumber: billCounter.count,
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
                    billNumber: billCounter.count,
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
                    billNumber: billCounter.count,
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

            req.flash('success', 'Credit note saved successfully!');
            res.redirect('/credit-note/new');
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
        const creditNote = await CreditNote.find({ company: req.session.currentCompany }).populate('debitAccount creditAccount');
        res.render('wholeseller/creditNote/list', {
            creditNote, currentCompanyName: req.session.currentCompanyName,
            title: 'View Credit Note',
            body: 'wholeseller >> credit note >> add credit note',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

module.exports = router;
