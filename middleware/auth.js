module.exports = {
    ensureAuthenticated: function (req, res, next) {
        if (req.isAuthenticated()) {
            // Check if the user is deactivated
            if (!req.user.isActive) {
                req.logout(err => {
                    if (err) return next(err);
                    req.flash('error', 'Your account has been deactivated. Please contact the admin.');
                    return res.redirect('/login');
                });
            } else {
                return next();
            }
            req.flash('error', 'Please log in to view that resource');
            res.redirect('/login');
        }
    },


    forwardAuthenticated: function (req, res, next) {
        if (!req.isAuthenticated()) {
            return next();
        }
        res.redirect('/dashboard');
    },

    ensureCompanySelected: (req, res, next) => {
        if (req.session.currentCompany) {
            return next();
        }
        req.flash('error', 'Please select a company first');
        res.redirect('/dashboard');

        // Set current company information in res.locals
        res.locals.currentCompanyName = req.session.currentCompanyName;
    },
};