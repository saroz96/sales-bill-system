const express = require('express');
const router = express.Router();

const companyGroup = require('../../models/wholeseller/CompanyGroup');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');

// // Import the seeding script
// const seedDatabase = require('../seeds/seed');
// seedDatabase(); // Call the seed function

router.get('/account-group', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const companiesGroups = await companyGroup.find({ company: companyId });
        console.log(companiesGroups);
        res.render('wholeseller/company/companyGroup', {
            companiesGroups,
            companyId: req.session.currentCompany,
            currentCompanyName,
            title: 'Account Group',
            body: 'wholeseller >> account group',
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
            res.render('wholeseller/company/editCompanyGroup', { companiesGroups })
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
router.delete('/account-group/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { id } = req.params;
        await companyGroup.findByIdAndDelete(id);
        req.flash('success', 'Groups deleted successfully');
        res.redirect('/account-group');
    }
})

module.exports = router;