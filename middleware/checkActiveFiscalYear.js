const Company = require('../models/retailer/Company');
const FiscalYear = require('../models/retailer/FiscalYear');

async function ensureFiscalYear(req, res, next) {
    if (!req.session.currentFiscalYear) {
        try {
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).populate('fiscalYear');

            // Assuming 'fiscalYear' is an object rather than an array
            if (company && company.fiscalYear) {
                const fiscalYear = company.fiscalYear;

                // Optionally, if you need to ensure the fiscalYear is the latest one,
                // you should still validate this with your application logic or data
                req.session.currentFiscalYear = {
                    id: fiscalYear._id.toString(),
                    startDate: fiscalYear.startDate,
                    endDate: fiscalYear.endDate,
                    name: fiscalYear.name,
                    dateFormat: fiscalYear.dateFormat,
                    isActive: true
                };
            } else {
                req.flash('error', 'No active fiscal year set. Please select a fiscal year.');
                return res.redirect('/switch-fiscal-year');
            }
        } catch (err) {
            console.error('Error setting fiscal year in session:', err);
            req.flash('error', 'Failed to set fiscal year. Please try again.');
            return res.redirect('/retailerDashboard');
        }
    }
    next();
}

module.exports = ensureFiscalYear;
