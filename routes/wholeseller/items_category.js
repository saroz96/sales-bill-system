const express = require('express');
const router = express.Router();

const Category = require('../../models/wholeseller/Category');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');


// Category routes
router.get('/categories', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const categories = await Category.find({ company: companyId });
        res.render('wholeseller/category/categories', {
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