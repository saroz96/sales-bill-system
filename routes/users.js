const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { forwardAuthenticated, ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../middleware/auth');
const Company = require('../models/retailer/Company');
const FiscalYear = require('../models/retailer/FiscalYear');
const ensureAdminOrSupervisor = require('../middleware/isAdminMiddleware');


//register Page
router.get('/register', forwardAuthenticated, (req, res) => res.render('register'));
// Register

// router.post('/register', forwardAuthenticated, async (req, res) => {
//     const { name, email, password, password2 } = req.body;

//     // Check if all fields are filled
//     if (!name || !email || !password || !password2) {
//         req.flash('error', 'Please enter all fields');
//         return res.redirect('/register'); // Redirect back to registration form
//     }

//     // Check if passwords match
//     if (password !== password2) {
//         req.flash('error', 'Passwords do not match');
//         return res.redirect('/register'); // Redirect back to registration form
//     }

//     // Check if password is long enough
//     if (password.length < 5) {
//         req.flash('error', 'Password must be at least 5 characters');
//         return res.redirect('/register'); // Redirect back to registration form
//     }

//     try {
//         // Check if user already exists
//         const existingUser = await User.findOne({ email }); // Ensure you are checking by email
//         if (existingUser) {
//             req.flash('error', 'Email already exists');
//             return res.redirect('/register'); // Redirect back to registration form
//         }

//         // Proceed with registration
//         const hashedPassword = await bcrypt.hash(password, 10);

//         const newUser = new User({
//             name,
//             email,
//             password: hashedPassword,
//             isAdmin: true,
//             role: 'Admin'  // Assign the "Admin" role
//         });

//         await newUser.save();
//         console.log(newUser);
//         req.flash('success', 'You are now registered and can log in');
//         res.redirect('/login');
//     } catch (err) {
//         console.error(err);
//         req.flash('error', 'An error occurred during registration');
//         res.redirect('/register'); // Redirect back to registration form on error
//     }
// });

router.post('/register', forwardAuthenticated, async (req, res) => {
    const { name, email, password, password2 } = req.body;

    // Validation checks remain the same...

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('error', 'Email already exists');
            return res.redirect('/register');
        }

        // Create user with plain password - the pre-save hook will hash it
        const newUser = new User({
            name,
            email,
            password, // <-- No manual hashing here
            isAdmin: true,
            role: 'Admin'
        });

        await newUser.save();
        req.flash('success', 'You are now registered and can log in');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred during registration');
        res.redirect('/register');
    }
});

router.get('/admin/create-user/new', isLoggedIn, ensureAdminOrSupervisor, async (req, res) => {
    const companyId = req.session.currentCompany;

    const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
    // Fetch the company and populate the fiscalYear

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


    res.render('retailer/users/user', {
        company,
        currentFiscalYear,
        currentCompanyName: req.session.currentCompanyName,
        title: '',
        body: '',
        user: req.user,
        isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
    })

})

// // Route to create a new user by the company admin
// router.post('/admin/create-user/new', ensureAdminOrSupervisor, async (req, res) => {
//     const { name, email, password, password2, role } = req.body;

//     try {
//         const companyId = req.session.currentCompany;
//         const currentFiscalYear = req.session.currentFiscalYear.id
//         const userId = req.user._id;
//         let errors = [];


//         if (!name || !email || !password || !password2) {
//             errors.push({ msg: 'Please enter all fields' });
//         }

//         if (password !== password2) {
//             errors.push({ msg: 'Passwords do not match' });
//         }

//         if (password.length < 5) {
//             errors.push({ msg: 'Password must be at least 5 characters' });
//         }


//         if (!companyId) {
//             req.flash('error', 'No company associated with your session');
//             return res.redirect('/admin/create-user/new');
//         }

//         // Check if the role is valid
//         if (!['Admin', 'Sales', 'Purchase', 'Supervisor'].includes(role)) {
//             req.flash('error', 'Invalid role');
//             return res.redirect('/admin/create-user/new');
//         }

//         // Find the company to associate the user with
//         const company = await Company.findById(companyId);

//         if (!company) {
//             req.flash('error', 'Company not found');
//             return res.redirect('/admin/create-user/new');
//         }

//         // Check if a user with the same email already exists
//         const existingUser = await User.findOne({ email });

//         if (existingUser) {
//             req.flash('error', 'User with this email already exists');
//             return res.redirect('/admin/create-user/new');
//         }

//         if (errors.length > 0) {
//             errors.push({ msg: 'Errors' });
//             res.render('retailer/users/user', {
//                 errors,
//                 name,
//                 email,
//                 password,
//                 password2,
//                 role
//             });
//         } else {

//             // Create a new user
//             const newUser = new User({
//                 name,
//                 email,
//                 password: await bcrypt.hash(password, 10),  // Hash the password
//                 role,
//                 company: companyId,
//                 user: userId,
//                 fiscalYear: currentFiscalYear
//             });

//             // Save the new user
//             await newUser.save();
//             console.log(newUser);

//             req.flash('success', `User ${name} created successfully with role ${role}`);
//             res.redirect('/admin/create-user/new');
//         }
//     } catch (err) {
//         console.error(err);
//         req.flash('error', 'An error occurred while creating the user');
//         res.redirect('/admin/create-user/new');
//     }
// });

router.post('/admin/create-user/new', ensureAdminOrSupervisor, async (req, res) => {
    const { name, email, password, password2, role } = req.body;

    try {
        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear.id;
        const userId = req.user._id;
        let errors = [];

        // Validation
        if (!name || !email || !password || !password2) {
            errors.push({ msg: 'Please enter all fields' });
        }

        if (password !== password2) {
            errors.push({ msg: 'Passwords do not match' });
        }

        if (password.length < 5) {
            errors.push({ msg: 'Password must be at least 5 characters' });
        }

        if (!companyId) {
            req.flash('error', 'No company associated with your session');
            return res.redirect('/admin/create-user/new');
        }

        // Check if the role is valid
        if (!['Admin', 'Sales', 'Purchase', 'Supervisor'].includes(role)) {
            req.flash('error', 'Invalid role');
            return res.redirect('/admin/create-user/new');
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('error', 'User with this email already exists');
            return res.redirect('/admin/create-user/new');
        }

        if (errors.length > 0) {
            return res.render('retailer/users/user', {
                errors,
                name,
                email,
                password,
                password2,
                role
            });
        }

        // Create new user - let the pre-save hook handle password hashing
        const newUser = new User({
            name,
            email,
            password, // <-- Pass plain password here
            role,
            company: companyId,
            user: userId,
            fiscalYear: currentFiscalYear
        });

        await newUser.save();

        req.flash('success', `User ${name} created successfully with role ${role}`);
        res.redirect('/admin/create-user/new');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while creating the user');
        res.redirect('/admin/create-user/new');
    }
});


// Admin route to view user details by ID
router.get('/admin/users/view/:id', ensureAuthenticated, ensureCompanySelected, ensureAdminOrSupervisor, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
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
        // Ensure that only the admin or supervisor of the current company can view the users
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }

        // Fetch the user by ID
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        // Render the view page with user details
        res.render('retailer/users/view', {
            company,
            currentFiscalYear,
            user,
            currentCompanyName: req.session.currentCompanyName,
            title: 'User',
            body: 'retailer >> user >> view',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching user details.');
        res.redirect('/admin/users/list');
    }
});

// Normal user route to view self user details by ID
router.get('/account/users/view/:id', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
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

        // Fetch the user by ID
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/retailerDashboard');
        }

        // Render the view page with user details
        res.render('retailer/users/view', {
            company,
            currentFiscalYear,
            user,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching user details.');
        res.redirect('/retailerDashboard');
    }
});

// Admin route to display user edit form
router.get('/admin/users/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureAdminOrSupervisor, async (req, res) => {
    try {
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
        // Ensure that only the admin or supervisor of the current company can view the edit form
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }

        // Fetch the user by ID
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        // Render the edit page with user details
        res.render('retailer/users/edit', {
            company,
            currentFiscalYear,
            user,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Edit User',
            body: 'retailer >> user >> edit',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching user details.');
        res.redirect('/admin/users/list');
    }
});

// Admin route to update user details
router.post('/admin/users/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureAdminOrSupervisor, async (req, res) => {
    try {
        // Ensure that only the admin or supervisor of the current company can update user details
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to perform this action.');
            return res.redirect('/dashboard');
        }

        const userId = req.params.id;
        const { name, email } = req.body;

        // Validate input
        if (!name || !email) {
            req.flash('error', 'Name and email are required.');
            return res.redirect(`/admin/users/edit/${userId}`);
        }

        // Update the user's name and email
        const user = await User.findByIdAndUpdate(userId, { name, email }, { new: true });

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        req.flash('success', 'User details updated successfully.');
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while updating user details.');
        res.redirect(`/admin/users/edit/${req.params.id}`);
    }
});

router.get('/admin/users/list', ensureAuthenticated, async (req, res) => {
    try {

        // Ensure that only the admin or supervisor of the current company can view the users
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }

        // Log the current user's data for debugging
        console.log('Authenticated User:', req.user);

        // Fetch the company ID from the authenticated user's data
        const companyId = req.session.currentCompany;

        // Ensure companyId is present to avoid fetching users without an associated company
        if (!companyId) {
            req.flash('error', 'No company is associated with your account.');
            return res.redirect('/dashboard');
        }

        // Fetch the company document to ensure the owner is associated correctly
        // const company = await Company.findById(companyId).populate('owner');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat owner')
            .populate('fiscalYear')
            .populate('owner');

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

        if (!company) {
            req.flash('error', 'Company not found.');
            return res.redirect('/dashboard');
        }

        // Log the company document to verify the owner
        console.log('Company Document:', company);

        // Fetch users associated with the company, including the owner
        const users = await User.find({ company: companyId });

        // Include the company owner in the list and mark them as "Owner"
        if (company.owner) {
            const ownerExists = users.some(user => user._id.toString() === company.owner._id.toString());
            if (!ownerExists) {
                users.push({ ...company.owner.toObject(), isOwner: true });
            } else {
                // Mark the existing user as owner if already in the list
                users.forEach(user => {
                    if (user._id.toString() === company.owner._id.toString()) {
                        user.isOwner = true;
                    }
                });
            }
        }

        // Log the fetched users to check if any results are returned
        console.log('Fetched Users:', users);

        // Sort users array to place the owner at the top
        users.sort((a, b) => {
            if (a.isOwner) return -1;
            if (b.isOwner) return 1;
            return 0;
        });


        // Render the list of users associated with the current company
        res.render('retailer/users/list', {
            company,
            currentFiscalYear,
            users,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching users.');
        res.redirect('/dashboard');
    }
});

// Route to view individual user details
router.get('/users/view/:id', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    try {

        // Ensure that only the admin or supervisor of the current company can view the users
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }


        // Fetch the company ID from the authenticated user's data
        const companyId = req.session.currentCompany;

        // Ensure companyId is present to avoid fetching users without an associated company
        if (!companyId) {
            req.flash('error', 'No company is associated with your account.');
            return res.redirect('/dashboard');
        }

        // Fetch the company document to ensure the owner is associated correctly
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat owner')
            .populate('fiscalYear')
            .populate('owner');


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


        const userById = await User.findById(req.params.id)
            .populate('company', 'name') // Populate company name if needed
            .populate('fiscalYear', 'name'); // Populate fiscal year if needed

        if (!userById) {
            return res.status(404).render('errors/404', { message: 'User not found.' }); // Optional: Add a 404 page
        }

        res.render('retailer/users/userById', {
            userById,
            company,
            currentFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('errors/500', { message: 'An error occurred while fetching user details.' }); // Optional: Add a 500 page
    }
});


// Route to deactivate a user
router.post('/admin/users/:id/deactivate', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.params.id;

        // Find the user and set isActive to false
        await User.findByIdAndUpdate(userId, { isActive: false });

        req.flash('success', 'User deactivated successfully.');
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error deactivating user.');
        res.redirect('/admin/users/list');
    }
});

// Route to activate a user
router.post('/admin/users/:id/activate', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.params.id;

        // Find the user and set isActive to true
        await User.findByIdAndUpdate(userId, { isActive: true });

        req.flash('success', 'User activated successfully.');
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error activating user.');
        res.redirect('/admin/users/list');
    }
});

// Admin route to change user role
router.post('/admin/users/:id/role', ensureAuthenticated, async (req, res) => {
    try {
        // Only admin can change the role
        if (!req.user.isAdmin) {
            req.flash('error', 'You do not have permission to change user roles.');
            return res.redirect('/admin/users/list');
        }

        const userId = req.params.id;
        const newRole = req.body.role;

        // Validate the role to prevent invalid role assignments
        const validRoles = ['Sales', 'Purchase', 'Supervisor'];
        if (!validRoles.includes(newRole)) {
            req.flash('error', 'Invalid role.');
            return res.redirect('/admin/users/list');
        }

        // Update the user's role
        const user = await User.findByIdAndUpdate(userId, { role: newRole }, { new: true });

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        req.flash('success', `Role of ${user.name} has been updated to ${newRole}.`);
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while updating the user role.');
        res.redirect('/admin/users/list');
    }
});

//Login Page
router.get('/login', forwardAuthenticated, (req, res) => res.render('login'));

//Login
// router.post('/login', forwardAuthenticated, (req, res, next) => {
//     passport.authenticate('local', {
//         successRedirect: '/dashboard',
//         failureRedirect: '/login',
//         failureFlash: true
//     })(req, res, next);
// });

// Login route
router.post('/login', forwardAuthenticated, (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            req.flash('error', info.message || 'Login failed');
            return res.redirect('/login');
        }
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }

            // Redirect based on user role
            if (user.role === 'ADMINISTRATOR') {
                return res.redirect('/admin-dashboard');
            } else {
                return res.redirect('/login');
            }
        });
    })(req, res, next);
});


// Route to display the change password form
router.get('/user/change-password', ensureAuthenticated, ensureCompanySelected, async (req, res) => {

    const companyId = req.session.currentCompany;
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

    res.render('retailer/users/change-password', {
        company,
        currentFiscalYear,
        currentCompanyName: req.session.currentCompanyName,
        title: '',
        body: '',
        user: req.user,
        isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
    });
});

// // Route to handle password change form submission
// router.post('/user/change-password', ensureAuthenticated, async (req, res) => {
//     try {
//         const { currentPassword, newPassword, confirmNewPassword } = req.body;

//         // Find the user from the session
//         const user = await User.findById(req.user.id);

//         if (!user) {
//             req.flash('error', 'User not found.');
//             return res.redirect('/user/change-password');
//         }

//         // Check if current password matches
//         const isMatch = await user.comparePassword(currentPassword);
//         if (!isMatch) {
//             req.flash('error', 'Current password is incorrect.');
//             return res.redirect('/user/change-password');
//         }

//         // Check if new password and confirm new password match
//         if (newPassword !== confirmNewPassword) {
//             req.flash('error', 'New passwords do not match.');
//             return res.redirect('/user/change-password');
//         }

//         // Update the user's password
//         user.password = newPassword;
//         await user.save();

//         req.flash('success', 'Password updated successfully.');
//         res.redirect('/user/change-password');
//     } catch (err) {
//         console.error(err);
//         req.flash('error', 'An error occurred while changing the password.');
//         res.redirect('/user/change-password');
//     }
// });


// Route to handle password change form submission
router.post('/user/change-password', ensureAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        // Find the user from the session
        const user = await User.findById(req.user.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/user/change-password');
        }

        // Check if current password matches
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            req.flash('error', 'Current password is incorrect.');
            return res.redirect('/user/change-password');
        }

        // Check if new password and confirm new password match
        if (newPassword !== confirmNewPassword) {
            req.flash('error', 'New passwords do not match.');
            return res.redirect('/user/change-password');
        }

        // Update the user's password
        user.password = newPassword;
        await user.save();

        req.flash('success', 'Password updated successfully.');
        res.redirect('/user/change-password');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while changing the password.');
        res.redirect('/user/change-password');
    }
});




//Logout
router.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) return next(err);
        req.flash('success', 'Good bye');
        res.redirect('/login');
    });
});

module.exports = router;