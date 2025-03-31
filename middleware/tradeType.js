const Company = require('../models/retailer/Company');

async function ensureTradeType(req, res, next) {
    try {
        if (!req.session.currentCompany) {
            req.flash('error', 'Please select a company first');
            return res.redirect('/selectCompany');
        }

        const company = await Company.findById(req.session.currentCompany);

        if (!company) {
            req.flash('error', 'Company not found');
            return res.redirect('/selectCompany');
        }

        req.tradeType = company.tradeType;
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { ensureTradeType };
