const express = require('express');
const { ensureAuthenticated, isLoggedIn } = require('../../middleware/auth');
const Company = require('../../models/wholeseller/Company');
const router = express.Router();
const NepaliDate = require('nepali-date'); // Adjust if using a different library


// System admin dashboard route
router.get('/admin-dashboard', isLoggedIn, ensureAuthenticated, async (req, res) => {

    res.render('systemAdmin/adminDashboard', {
        user: req.user,
    });
});

// Route to fetch and display all companies
router.get('/admin/clients', isLoggedIn, ensureAuthenticated, async (req, res) => {
    try {
        const clients = await Company.find({});
        res.render('systemAdmin/clients', {
            user: req.user,
            clients
        });
    } catch (err) {
        console.error('Error fetching companies:', err);
        req.flash('error', 'Could not fetch clients. Please try again.');
        res.redirect('/admin/dashboard');
    }
});

// Route to view client details
router.get('/admin/clients/:id', isLoggedIn, ensureAuthenticated, async (req, res) => {
    try {
        // Find the company by ID
        const client = await Company.findById(req.params.id)
            .populate('owner')
            .populate('settings')
            .populate('fiscalYear');

        if (!client) {
            req.flash('error', 'Client not found.');
            return res.redirect('/admin/clients');
        }

        res.render('systemAdmin/clientDetails', {
            client
        });
    } catch (err) {
        req.flash('error', 'An error occurred while retrieving client details.');
        res.redirect('/admin/clients');
    }
});

// Route to view client details
router.get('/admin/clients/:id/renew', isLoggedIn, ensureAuthenticated, async (req, res) => {
    try {
        // Find the company by ID
        const client = await Company.findById(req.params.id)
            .populate('owner')
            .populate('settings')
            .populate('fiscalYear');

        if (!client) {
            req.flash('error', 'Client not found.');
            return res.redirect('/admin/clients');
        }

        res.render('systemAdmin/renewClient', {
            user: req.user,
            client,
            title: '',
            body: '',
        });
    } catch (err) {
        req.flash('error', 'An error occurred while retrieving client details.');
        res.redirect('/admin/clients');
    }
});

// Route to renew demo period for a company
router.post('/admin/clients/:id/renew', isLoggedIn, ensureAuthenticated, async (req, res) => {
    try {
        if (req.user.role !== 'ADMINISTRATOR') {
            return res.status(403).json({ error: 'Only administrators can renew the demo period.' });
        }

        const companyId = req.params.id;
        const company = await Company.findById(companyId);

        if (!company) {
            return res.status(404).json({ error: 'Company not found.' });
        }

        const { dateFormat } = company;
        let renewalDate;

        // Set renewalDate to 1 year from now
        if (dateFormat === 'nepali') {
            // Convert the current date to Nepali date and add 1 year
            const nepaliDate = new NepaliDate();
            nepaliDate.setYear(nepaliDate.getYear() + 1);
            renewalDate = nepaliDate.format('YYYY-MM-DD'); // Adjust format as needed
        } else if (dateFormat === 'english') {
            // Use the standard JavaScript Date object for English date
            renewalDate = new Date();
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);
            renewalDate = renewalDate.toISOString().split('T')[0]; // Format to YYYY-MM-DD
        } else {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        // Save the renewalDate to the company
        company.renewalDate = renewalDate;
        await company.save();

        req.flash('success', 'Company access renewed for one year.');
        res.redirect(`/admin/clients/${companyId}/renew`); // Redirect or send a success response
    } catch (err) {
        console.error('Error renewing demo period:', err);
        req.flash('error', 'Failed to renew company access.');
        res.redirect('/admin/clients');
    }
});

module.exports = router;
