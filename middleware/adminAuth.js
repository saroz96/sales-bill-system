// Middleware to ensure the user is authenticated and an admin
function ensureAdminAuthenticated(req, res, next) {
    if (req.isAuthenticated() && req.user.isAdmin) {
        return next(); // User is authenticated and is an admin, proceed to the next middleware
    }
    req.flash('error', 'You need to be an admin to view this page.');
    res.redirect('/system-admin/express-login'); // Redirect to login if not authenticated or not an admin
}

// Middleware to check if the user is not an ADMINISTRATOR
const ensureNotAdministrator = (req, res, next) => {
    if (req.user && req.user.role === 'ADMINISTRATOR') {
        req.flash('error', 'Access denied. ADMINISTRATOR role cannot access this page.');
        return res.redirect('/admin-dashboard');
    }
    next();
};

module.exports = {
    ensureAdminAuthenticated,
    ensureNotAdministrator
};
//To create a default admin user
//node config/createDefaultUser.js