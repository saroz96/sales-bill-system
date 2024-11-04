const express = require('express')

const Account = require('../../models/wholeseller/Account')
const CompanyGroup = require('../../models/wholeseller/CompanyGroup')
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth')
const { ensureTradeType } = require('../../middleware/tradeType')
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear')
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange')
const FiscalYear = require('../../models/wholeseller/FiscalYear')
const Company = require('../../models/wholeseller/Company')
const Transaction = require('../../models/wholeseller/Transaction')
// const switchCompany = require('../middleware/switchCompany')
// const setCurrentCompany = require('../middleware/setCurrentCompany');
const router = express.Router()


// Company routes to get all companies (for select options)
router.get('/companies/get', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const currentCompanyName = req.session.currentCompanyName;

        try {
            const companyId = req.session.currentCompany;
            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }
            const accounts = await Account.find({ company: companyId }).populate('companyGroups');
            const companyGroups = await CompanyGroup.find({ company: companyId });
            res.json({ accounts, companyGroups, currentCompanyName });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch accounts and company groups' });
        }
    }
});


// Company routes to get all company
router.get('/companies', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName

        // Fetch the company and populate the fiscalYear
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


        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear
        }).populate('companyGroups');
        const companyGroups = await CompanyGroup.find({ company: companyId });
        res.render('wholeseller/company/companies', {
            company,
            accounts,
            companyGroups,
            companyId,
            currentCompanyName,
            currentFiscalYear,
            title: 'Account',
            body: 'wholeseller >> account',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
})

// Create a new company
router.post('/companies', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { name, address, phone, ward, pan, email, contactperson, openingBalance, companyGroups } = req.body;
            const companyId = req.session.currentCompany;

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

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

            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }

            // Validate the company group
            const accountGroup = await CompanyGroup.findOne({ _id: companyGroups, company: companyId });
            if (!accountGroup) {
                return res.status(400).json({ error: 'Invalid account group for this company' });
            }

            // Create a new account and include the fiscal year in the openingBalance field
            const newCompany = new Account({
                name,
                address,
                phone,
                ward,
                pan,
                email,
                contactperson,
                companyGroups,
                openingBalance: {
                    amount: parseFloat(openingBalance.amount),
                    type: openingBalance.type,
                    fiscalYear: fiscalYear // Record stock entry with fiscal year
                },

                openingBalanceByFiscalYear: [
                    {
                        amount: parseFloat(openingBalance.amount), // Ensure the amount is stored as a number
                        type: openingBalance.type, // 'Dr' or 'Cr'
                        date: new Date(),
                        fiscalYear: fiscalYear // Record stock entry with fiscal year
                    }
                ],
                openingBalanceDate: new Date(), // Use the date from the request
                company: companyId,
                fiscalYear: fiscalYear, // Associate the item with the current fiscal year
                createdAt: new Date()
            });

            await newCompany.save();
            console.log(newCompany);

            req.flash('success', 'Successfully created an account!');
            res.redirect('/companies');
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key error (unique index violation)
                req.flash('error', 'An account with this name already exists within the selected company.');
                return res.redirect('/companies');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});


// Route to render the view form
router.get('/companies/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const accountId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName
            const companyId = req.session.currentCompany;
            const companyGroups = await CompanyGroup.find({ company: req.session.currentCompany }); // Assuming you have a CompanyGroup model
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
            const accounts = await Account.findOne({ _id: accountId, fiscalYear: fiscalYear })
                .populate('companyGroups')
                .populate('company')

            // Ensure the account belongs to the current company
            if (!accounts.company._id.equals(req.session.currentCompany)) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            res.render('wholeseller/company/view', {
                company,
                accounts,
                companyGroups,
                currentCompanyName,
                currentFiscalYear,
                title: 'Account',
                body: 'wholeseller >> account >> view',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (err) {
            console.error('Error fetching company:', err);
            req.flash('error', 'Error fetching company');
            res.redirect('/companies');
        }
    }
});

// Route to render the edit form
router.get('/companies/:id/edit', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const accountId = req.params.id;
            const accounts = await Account.findById(accountId).populate('company');
            const companyGroups = await CompanyGroup.find({ company: req.session.currentCompany }); // Assuming you have a CompanyGroup model
            // Ensure the account belongs to the current company
            if (!accounts.company._id.equals(req.session.currentCompany)) {
                return res.status(403).json({ error: 'Unauthorized' });
            }
            res.render('wholeseller/company/editCompany', { accounts, companyGroups });
        } catch (err) {
            console.error('Error fetching company:', err);
            req.flash('error', 'Error fetching company');
            res.redirect('/companies');
        }
    }
});

// Route to handle form submission and update the company
router.put('/companies/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { name, address, ward, phone, pan, contactperson, email, companyGroups, openingBalance } = req.body;
            const companyId = req.session.currentCompany;

            const company = await Company.findById(companyId).populate('fiscalYear');

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

            const accountGroup = await CompanyGroup.findOne({ _id: companyGroups, company: companyId });
            if (!accountGroup) {
                return res.status(400).json({ error: 'Invalid account group for this company' });
            }

            await Account.findByIdAndUpdate(req.params.id, {
                name,
                address,
                ward,
                phone,
                pan,
                contactperson,
                email,
                companyGroups,
                openingBalance: {
                    amount: parseFloat(openingBalance.amount),
                    type: openingBalance.type,
                    fiscalYear: currentFiscalYear._id // Set the current fiscal year in openingBalance.fiscalYear
                },
                company: companyId,
                fiscalYear: currentFiscalYear._id // Set the current fiscal year in openingBalance.fiscalYear
            });
            req.flash('success', 'Account updated successfully');
            res.redirect('/companies');
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key error (unique index violation)
                req.flash('error_msg', 'An account with this name already exists within the selected company.');
                res.redirect(`/companies/${req.params.id}/edit`);
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});

// Route to handle form submission and delete the company
router.delete('/companies/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { id } = req.params;
        const companyId = req.session.currentCompany;

        // Check if the account is a default cash account
        const account = await Account.findById({ _id: id });
        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        if (account.defaultCashAccount) {
            return res.status(400).json({ message: 'Cannot delete default cash account' });
        }

        // Check for associated transactions
        const transactions = await Transaction.find({ account: id });

        if (transactions.length > 0) {
            // If transactions exist, send an error response
            return res.status(400).json({ message: 'Cannot delete account with associated transactions' });
        }

        await Account.findByIdAndDelete(id, { company: companyId });
        req.flash('success', 'Company deleted successfully');
        res.redirect('/companies');
    }
})
module.exports = router;