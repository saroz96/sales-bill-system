const express = require('express');
const router = express.Router();
const JournalVoucher = require('../../models/wholeseller/JournalVoucher');
const Account = require('../../models/wholeseller/Account');

const NepaliDate = require('nepali-date');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const Transaction = require('../../models/wholeseller/Transaction');
const BillCounter = require('../../models/wholeseller/journalVoucherBillCounter');
const FiscalYear = require('../../models/wholeseller/FiscalYear');

// GET - Show form to create a new journal voucher
router.get('/journal/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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
        res.render('wholeseller/journalVoucher/new',
            {
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
            let billCounter = await BillCounter.findOne({ company: companyId });
            if (!billCounter) {
                billCounter = new BillCounter({ company: companyId });
            }
            billCounter.count += 1;
            await billCounter.save();

            // Create the Journal Voucher
            const journalVoucher = new JournalVoucher({
                billNumber: billCounter.count,
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
                    billNumber: billCounter.count,
                    journalAccountType: (await Promise.all(creditAccountNames)).join(', '),  // Save credit account names as a string
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
                    billNumber: billCounter.count,
                    journalAccountType: (await Promise.all(debitAccountNames)).join(', '),  // Save debit account names as a string
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
                await Account.findByIdAndUpdate(credit.account, { $push: { transactions: creditTransaction._id } });
            }

            req.flash('success', 'Journal voucher saved successfully!');
            res.redirect('/journal/new');
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
        const journalVouchers = await JournalVoucher.find({ company: req.session.currentCompany })
            .populate('debitAccounts.account creditAccounts.account');
        res.render('wholeseller/journalVoucher/list', {
            journalVouchers, currentCompanyName: req.session.currentCompanyName,
            title: 'View Journal',
            body: 'wholeseller >> journal >> view journal',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

module.exports = router;