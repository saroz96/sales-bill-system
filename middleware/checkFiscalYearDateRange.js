const FiscalYear = require('../models/retailer/FiscalYear');
const Company = require('../models/retailer/Company');

// Middleware to check if the current date is within the active fiscal year
async function checkFiscalYearDateRange(req, res, next) {
    try {
        const companyId = req.session.currentCompany; // Assuming the user's company ID is stored in the session

        // Check if the fiscal year is already set in the session
        if (!req.session.currentFiscalYear) {
            const company = await Company.findById(companyId).populate('fiscalYear');

            if (!company) throw new Error('Company not found');
            if (!company.fiscalYear) throw new Error('Fiscal Year not found');

            // Set the fiscal year in the session
            req.session.currentFiscalYear = {
                id: company.fiscalYear._id,
                startDate: company.fiscalYear.startDate,
                endDate: company.fiscalYear.endDate,
                name: company.fiscalYear.name,
                dateFormat: company.fiscalYear.dateFormat // 'Nepali' or 'English'
            };
        }
        // Log the current fiscal year
        console.log('Current fiscal year in session:', JSON.stringify(req.session.currentFiscalYear, null, 2));
        // Destructure the start and end dates along with the date format from the session
        const { startDate, endDate, dateFormat } = req.session.currentFiscalYear;

        // Determine the type of entry to dynamically set the redirect URL
        let redirectUrl;
        const routePath = req.route.path; // Get the current route path

        if(routePath.includes('purchase-bills/edit')){
            redirectUrl='/purchase-bills-list'
        }else if (routePath.includes('purchase-bills')) {
            redirectUrl = '/purchase-bills'; // Redirect to purchase entry page
        } else if (routePath.includes('bills')) {
            redirectUrl = '/bills'; // Redirect to sales entry page
        } else if (routePath.includes('billsTrackBatch')) {
            redirectUrl = '/billsTrackBatch'
        } else if (routePath.includes('billsTrackBatchOpen')) {
            redirectUrl = '/billsTrackBatchOpen'
        } else {
            redirectUrl = '/'; // Default redirect URL
        }

        // Parse the entry date based on the company's selected date format
        // let entryDate;
        if (dateFormat === 'nepali') {
            // Expecting Nepali date in req.body.entryDate (as a string or object)
            entryDate = req.body.nepaliDate; // Use as-is for comparison
        } else if (dateFormat === 'english') {
            // Expecting English date in req.body.entryDate (as a string or Date object)
            entryDate = new Date(req.body.billDate);
        }

        // Validate the entry date based on the selected date format
        if (dateFormat === 'nepali') {
            // Compare as Nepali dates (assuming startDate and endDate are Nepali dates)
            if (entryDate < startDate || entryDate > endDate) {
                return res.render('retailer/errorSuccess/validation', {
                    error: 'Entries are not allowed outside the active fiscal year date range.',
                    success: null,
                    redirectUrl: redirectUrl,
                });
            }
        } else if (dateFormat === 'english') {
            // Compare as English dates
            const fiscalStartDate = new Date(startDate);
            const fiscalEndDate = new Date(endDate);
            if (entryDate < fiscalStartDate || entryDate > fiscalEndDate) {
                return res.render('retailer/errorSuccess/validation', {
                    error: 'Entries are not allowed outside the active fiscal year date range.',
                    success: null,
                    redirectUrl: redirectUrl,
                });
            }
        }

        next();
    } catch (err) {
        console.error('Error checking fiscal year date range:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
module.exports = checkFiscalYearDateRange;
