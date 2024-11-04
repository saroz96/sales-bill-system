const express = require('express');
const router = express.Router();

const Category = require('../../models/wholeseller/Category');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/wholeseller/Company');
const FiscalYear = require('../../models/wholeseller/FiscalYear');


// Category routes
router.get('/categories', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const categories = await Category.find({ company: companyId });
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
        res.render('wholeseller/category/categories', {
            company,
            currentFiscalYear,
            categories,
            currentCompanyName,
            companyId,
            title: 'Item Category',
            body: 'wholeseller >> item >> category',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.post('/categories', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { name } = req.body;
            const companyId = req.session.currentCompany;
            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }
            const newCategory = new Category({ name, company: companyId });
            await newCategory.save();
            req.flash('success', 'Successfully saved a category');
            res.redirect('/categories');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'An account group with this name already exists within the selected company.');
                return res.redirect('/categories');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});


router.get('/categories/:id/edit', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const categories = await Category.findById(req.params.id);
            res.render('wholeseller/category/editCategory', { categories })
        } catch (err) {
            res.redirect('/categories');
        }
    }
})

// Route to handle form submission and update the items category
router.put('/categories/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { name } = req.body;
            await Category.findByIdAndUpdate(req.params.id, {
                name,
                company: req.session.currentCompany
            });
            req.flash('success', 'category updated successfully');
            res.redirect('/categories');
        } catch (err) {
            console.error('Error updating category:', err);
            req.flash('error', 'Error updating category');
            res.redirect(`/categories/${req.params.id}/edit`);
        }
    }
});

// Route to handle form submission and delete the category
router.delete('/categories/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { id } = req.params;
        await Category.findByIdAndDelete(id);
        req.flash('success', 'Category deleted successfully');
        res.redirect('/categories');
    }
})

module.exports = router;