const express = require('express');
const router = express.Router();
const Company = require('../models/wholeseller/Company');
const User = require('../models/User');
const mongoose = require('mongoose');
const AccountGroup = require('../models/wholeseller/CompanyGroup');
// const addDefaultAccountGroups = require('../Seed/InsertDefaultAccountGroups');
const Account = require('../models/wholeseller/Account');
const NepaliDate = require('nepali-date');
const { ensureAuthenticated } = require('../middleware/auth');
const Category = require('../models/wholeseller/Category');
const Unit = require('../models/wholeseller/Unit');
const FiscalYear = require('../models/wholeseller/FiscalYear');
const Settings = require('../models/wholeseller/Settings');
const { ensureNotAdministrator } = require('../middleware/adminAuth');

router.get('/company/new', ensureAuthenticated, ensureNotAdministrator, async (req, res) => {
    const companyId = req.session.currentCompany;
    const currentCompanyName = req.session.currentCompanyName;
    const company = await Company.findById(companyId).populate('fiscalYear');
    const today = new Date();
    const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
    const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

    if (!req.user.isAdmin) {
        req.flash('error', 'Only admins can create a company');
        return res.redirect('/dashboard');
    }

    res.render('ownerCompany/createCompany', {
        currentCompanyName,
        nepaliDate,
        companyDateFormat,
        user: req.user,
        isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
    });
});

router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        let userCompanies;
        const companyDataSizes = {};

        // Check if the user is an admin
        if (req.user.isAdmin) {
            // Check if the admin has a company
            userCompanies = await Company.find({ owner: req.user._id });

            if (userCompanies.length === 0) {
                // Admin has no companies, prompt to create one
                return res.redirect('/company/new');
            }
        } else {
            // Non-admin users can only see the company they are associated with
            userCompanies = await Company.find({ _id: req.user.company });
        }

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established.');
        }

        // Calculate data size for each company
        for (const company of userCompanies) {
            let totalSize = 0;

            // List of collections related to the company
            const relatedCollections = [
                'sales',
                'purchases',
                'transactions',
                'accounts',
                'billcounters',
                'categories',
                'companies',
                'companygroups',
                'creditnotes',
                'debitnotes',
                'fiscalyears',
                'items',
                'journalvouchers',
                'payments',
                'receipts',
                'settings',
                'stockadjustments',
                'units',
                'users'
            ]; // Add your relevant collections

            for (const collectionName of relatedCollections) {
                const collection = db.collection(collectionName);

                // Use db.command to get collection stats
                const stats = await db.command({ collStats: collectionName });

                // Count documents for the specific company
                const companyDocsCount = await collection.countDocuments({ company: company._id });

                // Approximate size: (total size of the collection) * (docs for this company) / (total docs)
                const companySize = (stats.size * companyDocsCount) / stats.count;
                totalSize += companySize || 0;
            }

            companyDataSizes[company._id] = Math.round(totalSize / 1024); // Convert to KB
        }

        res.render('ownerCompany/dashboard', {
            user: req.user,
            companies: userCompanies,
            companyDataSizes,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});



// router.get('/dashboard', ensureAuthenticated, async (req, res) => {
//     try {
//         const userCompanies = await Company.find({ owner: req.user._id });
//         res.render('wholeseller/dashboard', { user: req.user, companies: userCompanies });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: err.message });
//     }
// });

router.get('/retailerDashboard', ensureAuthenticated, async (req, res) => {
    try {
        const userCompanies = await Company.find({ owner: req.user._id });
        res.render('retailerDashboard', { user: req.user, companies: userCompanies });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/pharmacyDashboard', ensureAuthenticated, async (req, res) => {
    try {
        const userCompanies = await Company.find({ owner: req.user._id });
        res.render('pharmacyDashboard', { user: req.user, companies: userCompanies });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/defaultDashboard', ensureAuthenticated, async (req, res) => {
    try {
        const userCompanies = await Company.find({ owner: req.user._id });
        res.render('defaultDashboard', { user: req.user, companies: userCompanies });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const defaultCashAccount = {
    name: 'Cash in Hand',
    groupName: 'Cash in Hand',
    groupType: 'Current Assets', // Assuming Cash falls under Current Assets
    openingBalance: { amount: 0, type: 'Dr' },

};

// Default account groups
const defaultAccountGroups = [
    { name: 'Sundry Debtors', type: 'Current Assets' },
    { name: 'Sundry Creditors', type: 'Current Liabilities' },
    { name: 'Cash in Hand', type: 'Current Assets' },
    { name: 'Bank Accounts', type: 'Current Assets' },
    { name: 'Bank O/D Account', type: 'Loans(Liability)' },
    { name: 'Duties & Taxes', type: 'Current Liabilities' },
    { name: 'Fixed Assets', type: 'Fixed Assets' },
    { name: 'Reserves & Surplus', type: 'Capital Account' },
    { name: 'Secured Loans', type: 'Loans(Liability)' },
    { name: 'Securities & Deposits', type: 'Current Assets' },
    { name: 'Stock in hand', type: 'Current Assets' },
    { name: 'Unsecured Loans', type: 'Loans(Liability)' },
    { name: 'Expenses (Direct/Mfg.)', type: 'Revenue Accounts' },
    { name: 'Expenses (Indirect/Admn.)', type: 'Revenue Accounts' },
    { name: 'Income (Direct/Opr.)', type: 'Revenue Accounts' },
    { name: 'Income (Indirect)', type: 'Revenue Accounts' },
    { name: 'Loans & Advances', type: 'Current Assets' },
    { name: 'Provisions/Expenses Payable', type: 'Current Liabilities' },
    // Add more default groups as needed
];

// Function to add the default Cash account
async function addDefaultCashAccount(companyId) {
    try {
        // Find the company by ID and populate its fiscalYear
        const company = await Company.findById(companyId).populate('fiscalYear');

        if (!company) {
            throw new Error('Company not found');
        }

        // Fetch the fiscal year directly from the newly created company
        let currentFiscalYear = company.fiscalYear;

        // Ensure that the fiscal year exists
        if (!currentFiscalYear) {
            throw new Error('No fiscal year found for the newly created company.');
        }

        const cashGroup = await AccountGroup.findOne({
            name: defaultCashAccount.groupName,
            type: defaultCashAccount.groupType,
            company: companyId,
        });

        if (cashGroup) {
            const cashAccount = new Account({
                _id: new mongoose.Types.ObjectId(),
                name: defaultCashAccount.name,
                companyGroups: cashGroup._id, // Correct field for group reference
                openingBalance: {
                    amount: defaultCashAccount.openingBalance.amount,
                    type: defaultCashAccount.openingBalance.type
                },
                company: companyId,
                fiscalYear: currentFiscalYear._id, // Associate the fiscal year directly from company
                defaultCashAccount: true,
            });

            await cashAccount.save();
            console.log(`Default cash account "${defaultCashAccount.name}" added successfully.`);
        } else {
            console.error('Error: "Cash in Hand" group not found for the company.');
        }
    } catch (error) {
        console.error('Error adding default cash account:', error);
    }
}

// Function to add default account groups associated with the company
async function addDefaultAccountGroups(companyId) {
    try {
        const accountGroups = defaultAccountGroups.map(group => ({
            ...group,
            company: companyId // Associate with the newly created company
        }));

        await AccountGroup.insertMany(accountGroups);
        console.log('Default account groups added successfully.');

        // After adding groups, add the default Cash account under the "Cash in Hand" group
        await addDefaultCashAccount(companyId);
    } catch (error) {
        console.error('Error adding default account groups:', error);
    }
}

const defaultItemCategory = {
    name: 'General'
}
async function addDefaultItemCategory(companyId) {
    const categories = new Category({
        name: defaultItemCategory.name,
        company: companyId,
    });
    await categories.save();
}

const defaultItemUnit = [
    { name: 'Bott' },
    { name: 'Box' },
    { name: 'Dozen' },
    { name: 'Gms.' },
    { name: 'Jar' },
    { name: 'Kgs.' },
    { name: 'Kit' },
    { name: 'Test' },
    { name: 'Mtr' },
    { name: 'Pair' },
    { name: 'Pcs' },
    { name: 'Ph' },
    { name: 'Pkt' },
    { name: 'Roll' },
    { name: 'Set' },
    { name: 'Than' },
    { name: 'Tonne' },
    { name: 'Units' }
];

async function addDefaultAccountGroups(companyId) {
    try {
        const accountGroups = defaultAccountGroups.map(group => ({
            ...group,
            company: companyId // Associate with the newly created company
        }));

        await AccountGroup.insertMany(accountGroups);
        console.log('Default account groups added successfully.');

        // After adding groups, add the default Cash account under the "Cash in Hand" group
        await addDefaultCashAccount(companyId);
    } catch (error) {
        console.error('Error adding default account groups:', error);
    }
}
async function addDefaultItemUnit(companyId) {
    try {
        const units = defaultItemUnit.map(unit => ({
            ...unit,
            company: companyId,
        }));
        await Unit.insertMany(units);
        console.log('Default item units added successfully.');
    } catch (error) {
        console.error('Error adding default item unit:', error);
    }
}

// Route for creating a new company
router.post('/company', ensureAuthenticated, async (req, res) => {
    try {
        const {
            name,
            address,
            country,
            state,
            city,
            pan,
            phone,
            ward,
            email,
            dateFormat,
            tradeType,
            startDateEnglish,
            endDateEnglish,
            startDateNepali,
            endDateNepali,
            vatEnabled
        } = req.body;
        const owner = req.user._id;

        if (!tradeType) {
            return res.status(400).json({ error: 'Trade type is required' });
        }

        // Check the number of companies already created by the owner
        const companyCount = await Company.countDocuments({ owner });
        if (companyCount >= 3) {
            req.flash('error', 'You have reached the maximum limit of 3 companies.');
            return res.redirect('/company/new');
        }

        // Determine the start and end dates based on dateFormat
        let startDate, endDate;
        if (dateFormat === 'nepali') {
            startDate = startDateNepali;
            endDate = endDateNepali;
        } else if (dateFormat === 'english') {
            startDate = startDateEnglish;
            endDate = endDateEnglish;
        } else {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        // Set default end date to one year from the start date minus one day if not provided
        if (!endDate) {
            endDate = new Date(startDate);
            endDate.setFullYear(endDate.getFullYear() + 1);
            endDate.setDate(endDate.getDate() - 1);
        }

        // Determine the createdAt date based on the company's dateFormat
        let createdAt;
        if (dateFormat === 'nepali') {
            // Use NepaliDate to convert the Nepali date into an English (Gregorian) date
            const nepaliDate = new NepaliDate(startDateNepali); // Nepali date in BS (e.g., "2080-03-15")
            createdAt = nepaliDate; // Converts to JS Date (Gregorian)
        } else {
            // Use the English start date for createdAt
            createdAt = new Date(startDateEnglish);
        }

        // Check if the company already exists
        let companies = await Company.findOne({ name: name });

        if (companies) {
            req.flash('error', 'Company already exists');
            return res.redirect('/company/new');
        }
        // Create the new company
        const newCompany = new Company({
            name,
            address,
            country,
            state,
            city,
            pan,
            phone,
            ward,
            email,
            tradeType,
            dateFormat,
            fiscalYearStartDate: startDate,
            owner,
            createdAt, // Set the calculated createdAt date
            vatEnabled: vatEnabled === 'true'
        });

        const company = await newCompany.save();
        console.log(`${company}, company name: ${newCompany.name}`);

        // Create Fiscal Year entry
        const startDateObject = new Date(startDate);
        const endDateObject = new Date(endDate);

        // Extract the year from the start and end dates
        const startYear = startDateObject.getFullYear(); // Extracts the full year from the start date
        const endYear = endDateObject.getFullYear();     // Extracts the full year from the end date

        // Create the name in the "YYYY/YY" format
        const fiscalYearName = `${startYear}/${endYear.toString().slice(-2)}`;

        // Create the default fiscal year
        const defaultFiscalYear = new FiscalYear({
            name: fiscalYearName,
            startDate: startDateObject,
            endDate: endDateObject,
            isActive: true,
            dateFormat,
            company: company._id
        });
        await defaultFiscalYear.save();

        // Assign the default fiscal year to the company
        company.fiscalYear = defaultFiscalYear._id;
        await company.save();
        console.log(company);
        console.log(defaultFiscalYear);

        await addDefaultAccountGroups(company._id);
        await addDefaultItemCategory(company._id);
        await addDefaultItemUnit(company._id);
        await User.findByIdAndUpdate(req.user._id, { $push: { companies: company._id } });

        // Create default settings for the new company with all boolean values set to false
        const newSettings = new Settings({
            companyId: company._id,
            userId: req.user._id,
            roundOffSales: false,
            roundOffPurchase: false,
            roundOffSalesReturn: false,
            roundOffPurchaseReturn: false,
            displayTransactions: false,
            displayTransactionsForPurchase: false,
            displayTransactionsForSalesReturn: false,
            displayTransactionsForPurchaseReturn: false,
            fiscalYear: defaultFiscalYear._id,
            company: company._id
        });
        await newSettings.save();
        console.log('Default settings added successfully.', newSettings);

        // Redirect based on tradeType
        let redirectPath;
        switch (tradeType) {
            case 'Wholeseller':
                redirectPath = '/wholesellerDashboard';
                break;
            case 'Retailer':
                redirectPath = '/retailerDashboard';
                break;
            case 'Pharmacy':
                redirectPath = '/pharmacyDashboard';
                break;
            default:
                redirectPath = '/defaultDashboard';
                break;
        }

        req.flash('success', 'Company created successfully');
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Route to switch to a company and set the latest fiscal year
router.get('/switch/:id/', ensureAuthenticated, async (req, res) => {
    try {
        const companyId = req.params.id;
        const company = await Company.findById(companyId);

        if (!company) {
            req.flash('error', 'Company not found');
            return res.redirect('/dashboard');
        }

        // Fetch the latest fiscal year for the company
        const latestFiscalYear = await FiscalYear.findOne({ company: companyId })
            .sort({ startDate: -1 }); // Sort by start date to get the latest fiscal year

        if (latestFiscalYear) {
            // Set the latest fiscal year in the session
            req.session.currentFiscalYear = {
                id: latestFiscalYear._id.toString(),
                startDate: latestFiscalYear.startDate,
                endDate: latestFiscalYear.endDate,
                name: latestFiscalYear.name,
                dateFormat: latestFiscalYear.dateFormat
            };
        } else {
            req.flash('error', 'No active fiscal year found for this company. Please set a fiscal year.');
            return res.redirect('/switch-fiscal-year');
        }

        // Set the company and other session data
        req.session.currentCompany = company._id.toString();
        req.session.currentCompanyName = company.name;
        req.session.firstVisit = true; // Set the flag for the first visit

        // Determine the redirect path based on the company's trade type
        let redirectPath;
        switch (company.tradeType) {
            case 'Wholeseller':
                redirectPath = '/wholesellerDashboard';
                break;
            case 'Retailer':
                redirectPath = '/retailerDashboard';
                break;
            case 'Pharmacy':
                redirectPath = '/pharmacyDashboard';
                break;
            default:
                redirectPath = '/defaultDashboard';
                break;
        }

        req.flash('success', `Switched to: ${company.name}`);
        res.redirect(redirectPath);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// Route to view company details
router.get('/company/:id', async (req, res) => {
    try {
        const companyId = req.params.id;
        const company = await Company.findById(companyId)
            .populate('owner', 'name email') // Populate owner details (name, email)
            .populate('users', 'name email') // Populate user details (name, email)
            .populate('settings')
            .populate('fiscalYear');

        if (!company) {
            return res.status(404).send('Company not found');
        }

        res.render('ownerCompany/view', {
            user: req.user,
            company,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'

        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// Route to render the edit company page
router.get('/company/edit/:id', ensureAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.params.id)
            .populate('owner')
            .populate('users')
            .populate('settings')
            .populate('fiscalYear');

        if (!company) {
            req.flash('error', 'Company not found');
            return res.redirect('/dashboard');
        }

        res.render('ownerCompany/edit', {
            company,
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Route to update company information
router.put('/company/edit/:id', ensureAuthenticated, async (req, res) => {
    try {
        const {
            name,
            address,
            country,
            state,
            city,
            pan,
            phone,
            ward,
            email,
            tradeType,
            dateFormat,
            startDateEnglish,
            endDateEnglish,
            startDateNepali,
            endDateNepali,
            vatEnabled
        } = req.body;

        // Determine the start and end dates based on dateFormat
        let startDate, endDate;
        if (dateFormat === 'nepali') {
            startDate = startDateNepali;
            endDate = endDateNepali;
        } else {
            startDate = startDateEnglish;
            endDate = endDateEnglish;
        }

        // Set default end date if not provided
        if (!endDate) {
            endDate = new Date(startDate);
            endDate.setFullYear(endDate.getFullYear() + 1);
            endDate.setDate(endDate.getDate() - 1);
        }

        const company = await Company.findByIdAndUpdate(
            req.params.id,
            {
                name,
                address,
                country,
                state,
                city,
                pan,
                phone,
                ward,
                email,
                tradeType,
                dateFormat,
                fiscalYearStartDate: startDate,
                vatEnabled: vatEnabled === 'on'
            },
            { new: true }
        );

        console.log('Updated: ', company);

        // Update fiscal year if dateFormat or dates have changed
        const startDateObject = new Date(startDate);
        const endDateObject = new Date(endDate);
        const fiscalYearName = `${startDateObject.getFullYear()}/${endDateObject.getFullYear().toString().slice(-2)}`;

        let fiscalYear = await FiscalYear.findOneAndUpdate(
            { company: company._id },
            { name: fiscalYearName, startDate: startDateObject, endDate: endDateObject },
            { new: true }
        );

        if (!fiscalYear) {
            fiscalYear = new FiscalYear({
                name: fiscalYearName,
                startDate: startDateObject,
                endDate: endDateObject,
                company: company._id
            });
            await fiscalYear.save();
        }

        company.fiscalYear = fiscalYear._id;
        await company.save();

        // Redirect based on updated tradeType
        let redirectPath;
        switch (tradeType) {
            case 'Wholeseller':
                redirectPath = '/wholesellerDashboard';
                break;
            case 'Retailer':
                redirectPath = '/retailerDashboard';
                break;
            case 'Pharmacy':
                redirectPath = '/pharmacyDashboard';
                break;
            default:
                redirectPath = '/defaultDashboard';
                break;
        }

        req.flash('success', 'Company details updated successfully');
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Route to handle form submission and delete the category
router.delete('/company/delete/:id', ensureAuthenticated, async (req, res) => {
    const { id } = req.params;
    await Company.findByIdAndDelete(id);
    req.flash('success', 'Company deleted successfully');
    res.redirect('/dashboard');
})

module.exports = router;
