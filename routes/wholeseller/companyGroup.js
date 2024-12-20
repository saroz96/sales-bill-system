const express = require('express');
const router = express.Router();

const companyGroup = require('../../models/wholeseller/CompanyGroup');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const Company = require('../../models/wholeseller/Company');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const Account = require('../../models/wholeseller/Account');

// // Import the seeding script
// const seedDatabase = require('../seeds/seed');
// seedDatabase(); // Call the seed function

router.get('/account-group', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const companiesGroups = await companyGroup.find({ company: companyId });
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        console.log(companiesGroups);

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear
                .findById(fiscalYear);
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
        res.render('wholeseller/company/companyGroup', {
            company,
            currentFiscalYear,
            companiesGroups,
            companyId: req.session.currentCompany,
            currentCompanyName,
            title: 'Account Group',
            body: 'wholeseller >> account group',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
})

router.post('/account-group', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { name, type } = req.body;
            const companyId = req.session.currentCompany;
            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }
            const newCompanyGroup = new companyGroup({ name, type, company: companyId });
            await newCompanyGroup.save();
            req.flash('success', 'Groups added successfully');
            res.redirect('/account-group');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'An account group with this name already exists within the selected company.');
                return res.redirect('/account-group');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
})

router.get('/account-group/:id/edit', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companiesGroups = await companyGroup.findById(req.params.id);
            res.render('wholeseller/company/editCompanyGroup', {
                companiesGroups,
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            })
        } catch (err) {
            res.redirect('/account-group');
        }
    }
})

// Route to handle form submission and update the company
router.put('/account-group/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { name, type } = req.body;
            await companyGroup.findByIdAndUpdate(req.params.id, {
                name, type
            });
            req.flash('success', 'Groups updated successfully');
            res.redirect('/account-group');
        } catch (err) {
            console.error('Error updating group:', err);
            req.flash('error', 'Error updating group');
            res.redirect(`/account-group/${req.params.id}/edit`);
        }
    }
});

// Route to handle form submission and delete the company group
// router.delete('/account-group/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
//     if (req.tradeType === 'Wholeseller') {
//         const { id } = req.params;

//         await companyGroup.findByIdAndDelete(id);
//         req.flash('success', 'Groups deleted successfully');
//         res.redirect('/account-group');
//     }
// })

router.delete(
    '/account-group/:id',
    ensureAuthenticated,
    ensureCompanySelected,
    ensureTradeType,
    ensureFiscalYear,
    checkFiscalYearDateRange,
    async (req, res) => {
        if (req.tradeType === 'Wholeseller') {
            try {
                const { id } = req.params;

                // Check if the group is associated with any accounts
                const isGroupAssociated = await Account.exists({ companyGroups: id });
                if (isGroupAssociated) {
                    req.flash('error', 'This group is associated with accounts and cannot be deleted.');
                    return res.redirect('/account-group');
                }

                // Delete the group if no association exists
                await companyGroup.findByIdAndDelete(id);
                req.flash('success', 'Group deleted successfully');
                res.redirect('/account-group');
            } catch (err) {
                console.error('Error deleting group:', err);
                req.flash('error', 'An error occurred while trying to delete the group.');
                res.redirect('/account-group');
            }
        }
    }
);


module.exports = router;