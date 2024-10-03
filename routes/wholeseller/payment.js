const express = require('express');
const router = express.Router();
const Payment = require('../../models/wholeseller/Payment'); // Adjust the path as necessary

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Account = require('../../models/wholeseller/Account');
const Company = require('../../models/wholeseller/Company');
const CompanyGroup = require('../../models/wholeseller/CompanyGroup')
const Transaction = require('../../models/wholeseller/Transaction')
const NepaliDate = require('nepali-date');
const BillCounter = require('../../models/wholeseller/paymentBillCounter');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');

// Get payment form
router.get('/payments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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

        try {
            // Fetch company group IDs for 'Cash in Hand' and 'Bank Accounts'
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
                companyGroups: { $nin: [...cashGroupIds ? cashGroupIds : null, ...bankGroupIds] }
            }).exec();

            // Fetch accounts for 'Cash in Hand' and 'Bank Accounts'
            const cashAccounts = cashGroups
                ? await Account.find({
                    companyGroups: { $in: cashGroupIds },
                    company: companyId,
                    fiscalYear: fiscalYear
                }).exec()
                : [];
            const bankAccounts = bankGroups.length > 0
                ? await Account.find({
                    companyGroups: { $in: bankGroupIds },
                    company: companyId,
                    fiscalYear: fiscalYear
                }).exec()
                : [];

            // Check for fetched data
            console.log('Cash Accounts:', cashAccounts);
            console.log('Bank Accounts:', bankAccounts);

            // // Get the last payment voucher number and increment it
            // const lastPayment = await Payment.findOne({ company: companyId }).sort({ voucherNumber: -1 }).exec();
            // const newVoucherNumber = lastPayment ? lastPayment.voucherNumber + 1 : 1;

            // Get the next bill number
            const billCounter = await BillCounter.findOne({ company: companyId });
            const nextBillNumber = billCounter ? billCounter.count + 1 : 1;
            res.render('wholeseller/payment/payment', {
                accounts, // All accounts excluding 'Cash in Hand' and 'Bank Accounts'
                cashAccounts,
                bankAccounts,
                nextBillNumber,
                nepaliDate,
                companyDateFormat,
                currentCompanyName: req.session.currentCompanyName,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                company: companyId,
                user: req.user,
                title: 'Add Payment',
                body: 'wholeseller >> payment >> add payment',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error fetching data for payments form:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


// Create a new payment
router.post('/payments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { billDate, nepaliDate, paymentAccount, account, debit } = req.body;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

            if (!account || !debit || !paymentAccount) {
                return res.status(400).json({ message: 'All fields are required' });
            }

            if (!mongoose.Types.ObjectId.isValid(account) || !mongoose.Types.ObjectId.isValid(paymentAccount)) {
                return res.status(400).json({ message: 'Invalid account ID.' });
            }

            if (isNaN(debit) || debit <= 0) {
                return res.status(400).json({ message: 'Debit amount must be a positive number.' });
            }

            let billCounter = await BillCounter.findOne({ company: companyId });
            if (!billCounter) {
                billCounter = new BillCounter({ company: companyId });
            }
            billCounter.count += 1;
            await billCounter.save();

            const debitedAccount = await Account.findById(account);
            if (!debitedAccount) {
                return res.status(404).json({ message: 'Debited account not found.' });
            }

            const creditAccount = await Account.findById(paymentAccount);
            if (!creditAccount) {
                return res.status(404).json({ message: 'Payment account not found.' });
            }

            let previousDebitBalance = 0;
            const lastDebitTransaction = await Transaction.findOne({ account }).sort({ transactionDate: -1 });
            if (lastDebitTransaction) {
                previousDebitBalance = lastDebitTransaction.balance;
            }

            const payment = new Payment({
                billNumber: billCounter.count,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                account,
                debit,
                credit: 0,
                paymentAccount,
                user: userId,
                companyGroups: companyId,
                fiscalYear: currentFiscalYear,

            });

            const debitTransaction = new Transaction({
                account,
                type: 'Pymt',
                paymentAccountId: payment._id,
                billNumber: billCounter.count,
                accountType: paymentAccount,
                debit,
                credit: 0,
                paymentMode: 'Payment',
                // paymentAccount,
                balance: previousDebitBalance + debit,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,

            });

            await debitTransaction.save();
            await Account.findByIdAndUpdate(account, { $push: { transactions: debitTransaction._id } });

            let previousCreditBalance = 0;
            const lastCreditTransaction = await Transaction.findOne({ account: creditAccount._id }).sort({ transactionDate: -1 });
            if (lastCreditTransaction) {
                previousCreditBalance = lastCreditTransaction.balance;
            }

            const creditTransaction = new Transaction({
                receiptAccount: paymentAccount,
                type: 'Rcpt',
                paymentAccountId: payment._id,
                billNumber: billCounter.count,
                accountType: account,
                debit: 0,
                credit: debit,
                paymentMode: 'Receipt',
                // paymentAccount,
                balance: previousCreditBalance - debit,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,

            });

            await creditTransaction.save();
            await Account.findByIdAndUpdate(paymentAccount, { $push: { transactions: creditTransaction._id } });
            console.log(creditTransaction);
            console.log(debitTransaction);
            await payment.save();
            req.flash('success', 'Payment saved successfully!');
            res.redirect('/payments');
        } catch (error) {
            console.error('Error creating payment:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    } else {
        res.status(403).json({ message: 'Unauthorized trade type.' });
    }
});




module.exports = router;
