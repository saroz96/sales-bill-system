module.exports = function switchCompany(req, res, next) {
    const companyId = req.query.companyId || req.body.companyId; // Assuming companyId is passed in query or body
    if (companyId) {
        req.session.companyId = companyId;
    }
    next();
};

// module.exports = switchCompany;
