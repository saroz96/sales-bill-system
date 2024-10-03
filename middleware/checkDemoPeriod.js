const mongoose = require('mongoose');

// Middleware to validate SalesBill entry date against company's renewalDate
const checkDemoPeriod = async (req, res, next) => {
    try {
        const companyId = req.session.currentCompany;
        const { billDate, nepaliDate } = req.body; // Extract both billDate and nepaliDate from the request body

        // Fetch the company details
        const Company = mongoose.model('Company');
        const company = await Company.findById(companyId);

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const { dateFormat, createdAt, renewalDate } = company;
        // Determine the type of entry to dynamically set the redirect URL
        let redirectUrl;
        const routePath = req.route.path; // Get the current route path

        if (routePath.includes('purchase-bills')) {
            redirectUrl = '/purchase-bills'; // Redirect to sales entry page
        } else if (routePath.includes('bills')) {
            redirectUrl = '/bills'; // Redirect to purchase entry page
        } else {
            redirectUrl = '/'; // Default redirect URL
        }

        // Check and compare the dates based on the company's date format
        let salesBillDate;


        if (!renewalDate) {
            if (dateFormat === 'nepali') {
                // If the company's date format is Nepali, directly use nepaliDate for comparison (string comparison)
                salesBillDate = nepaliDate;
            } else if (dateFormat === 'english') {
                // If the company's date format is English, use billDate from req.body (JavaScript Date object)
                salesBillDate = new Date(billDate);
            } else {
                return res.status(400).json({ error: 'Invalid date format' });
            }

            console.log('Company createdAt:', createdAt); // Debugging log
            console.log('SalesBill billDate:', salesBillDate); // Debugging log

            // Calculate one month after the company's createdAt date
            const oneMonthLater = new Date(createdAt);
            oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
            console.log('One month later:', oneMonthLater); // Debugging log

            // Validate the billDate based on the date format
            if (dateFormat === 'nepali') {
                // Simple string comparison for nepaliDate (assuming it's in a valid string format)
                if (salesBillDate > oneMonthLater.toISOString().split('T')[0]) {
                    return res.render('wholeseller/errorSuccess/validation', {
                        error: 'Demo period has expired. Please upgrade to the full version to continue using the software.',
                        success: null,
                        redirectUrl: redirectUrl,
                    });
                }
            } else if (dateFormat === 'english') {
                // Validate if the English date is beyond the one-month limit
                if (salesBillDate > oneMonthLater) {
                    return res.render('wholeseller/errorSuccess/validation', {
                        error: 'Demo period has expired. Please upgrade to the full version to continue using the software.',
                        success: null,
                        redirectUrl: redirectUrl,
                    });
                }
            }
        } else {

            if (dateFormat === 'nepali') {
                salesBillDate = nepaliDate.trim(); // Directly use nepaliDate from the request

                // Compare the Nepali dates (string comparison for 'YYYY-MM-DD' format)
                if (salesBillDate > renewalDate.trim()) {
                    return res.render('wholeseller/errorSuccess/validation', {
                        error: 'Renewal period has expired. Please renew to continue making entries.',
                        success: null,
                        redirectUrl: redirectUrl,
                    });
                }
            } else if (dateFormat === 'english') {
                salesBillDate = new Date(billDate);

                // Compare Date objects for English dates
                if (salesBillDate > new Date(renewalDate)) {
                    return res.render('wholeseller/errorSuccess/validation', {
                        error: 'Renewal period has expired. Please renew to continue making entries.',
                        success: null,
                        redirectUrl: redirectUrl,
                    });
                }
            } else {
                return res.status(400).json({ error: 'Invalid date format' });
            }
        }

        // If the date is valid, proceed
        next();
    } catch (err) {
        console.error('Error in checkDemoPeriod middleware:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

module.exports = checkDemoPeriod;
