const express = require('express');
const router = express.Router();

const Category = require('../../models/retailer/Category');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/retailer/Company');
const FiscalYear = require('../../models/retailer/FiscalYear');
const Item = require('../../models/retailer/Item');


// Category routes
router.get('/categories', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
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
        res.render('retailer/category/categories', {
            company,
            currentFiscalYear,
            categories,
            currentCompanyName,
            companyId,
            title: 'Item Category',
            body: 'retailer >> item >> category',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.post('/categories', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
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
    if (req.tradeType === 'retailer') {
        try {
            const categories = await Category.findById(req.params.id);
            res.render('retailer/category/editCategory', {
                categories,
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            })
        } catch (err) {
            res.redirect('/categories');
        }
    }
})

// Route to handle form submission and update the items category
router.put('/categories/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
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

// // Route to handle form submission and delete the category
// router.delete('/categories/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
//     if (req.tradeType === 'retailer') {
//         const { id } = req.params;
//         await Category.findByIdAndDelete(id);
//         req.flash('success', 'Category deleted successfully');
//         res.redirect('/categories');
//     }
// })

// Route to handle form submission and delete the category
router.delete('/categories/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { id } = req.params;

        try {
            // Check if the category is the default "general" category
            const category = await Category.findById(id);
            if (!category) {
                req.flash('error', 'Category not found');
                return res.redirect('/categories');
            }
            if (category.name === 'General') {
                req.flash('error', 'The default "General" category cannot be deleted');
                return res.redirect('/categories');
            }

            // Check if any items are associated with the category
            const associatedItems = await Item.findOne({ category: id });
            if (associatedItems) {
                req.flash('error', 'Category cannot be deleted because it is associated with items');
                return res.redirect('/categories');
            }

            // If no restrictions, proceed with deletion
            await Category.findByIdAndDelete(id);
            req.flash('success', 'Category deleted successfully');
            res.redirect('/categories');
        } catch (error) {
            console.error('Error deleting category:', error);
            req.flash('error', 'An error occurred while deleting the category');
            res.redirect('/categories');
        }
    }
});


module.exports = router;