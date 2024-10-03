// Middleware to check if the user is an Admin or Supervisor
const ensureAdminOrSupervisor = (req, res, next) => {
    if (req.user.isAdmin || req.user.role === 'Supervisor') {
        return next();
    }
    req.flash('error', 'You are not authorized!');
    res.redirect(req.originalUrl);
};

module.exports = ensureAdminOrSupervisor;
