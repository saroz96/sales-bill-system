const express = require('express');
const router = express.Router();

const Item = require('../../models/wholeseller/Item');
const Category = require('../../models/wholeseller/Category');
const Unit = require('../../models/wholeseller/Unit');

const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const FiscalYear = require('../../models/wholeseller/FiscalYear');
const Company = require('../../models/wholeseller/Company');
const NepaliDate = require('nepali-date');

// Example backend route to handle item search
router.get('/items/search/get', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany
            const searchQuery = req.query.q;

            console.log('Company ID:', companyId);
            console.log('Search Query:', searchQuery);

            const items = await Item.find({ name: { $regex: new RegExp(searchQuery, 'i') }, company: companyId }).populate('category').populate('unit');
            console.log('Items found:', items);
            res.json({ items });
        } catch (error) {
            console.error('Error searching items:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


router.get('/items/search', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany;
            const searchQuery = req.query.q;
            const vatExempt = req.query.isVatExempt; // Query parameter for VAT selection
            const excludeIds = req.query.exclude ? req.query.exclude.split(',') : []; // Exclude these item IDs

            console.log('Company ID:', companyId);
            console.log('Search Query:', searchQuery);
            console.log('VAT Exempt:', vatExempt);
            console.log('Exclude IDs:', excludeIds);

            // Fetch the current fiscal year from the session
            const fiscalYear = req.session.currentFiscalYear.id;

            // Initialize the search conditions
            let searchConditions = {
                name: { $regex: new RegExp(searchQuery, 'i') },
                company: companyId,
                fiscalYear: fiscalYear,
                _id: { $nin: excludeIds } // Exclude items that are already in the table
            };

            // Modify the search conditions based on VAT selection
            if (vatExempt === 'true') {
                searchConditions.vatStatus = 'vatExempt';
            } else if (vatExempt === 'false') {
                searchConditions.vatStatus = 'vatable';
            } else if (vatExempt === 'all') {
                // If 'all' is selected, don't add any specific vatStatus condition
                delete searchConditions.vatStatus;
            }

            console.log('Search Conditions:', searchConditions);

            const items = await Item.find(searchConditions).populate('category').populate('unit');

            console.log('Items found:', items);

            res.json(items);
        } catch (error) {
            console.error('Error searching items:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});



router.get('/items/get', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany
            // const vatStatus = req.query.vatStatus === 'true'; // Convert string to boolean
            const items = await Item.find({ company: companyId }).populate('category').populate('unit');
            const categories = await Category.find({ company: companyId });
            const units = await Unit.find({ company: companyId });
            res.json(items, categories, units, companyId);
        } catch (err) {
            res.status(500).send(err.message);
        }
    }
});
// New route to fetch item by ID
router.get('/items/get/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const item = await Item.findById(req.params.id);
            res.json(item);
        } catch (err) {
            res.status(500).send(err.message);
        }
    }
});
// Route to fetch items based on current fiscal year
router.get('/items', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
            const company = await Company.findById(companyId); const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'


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

            // Find items that belong to the current fiscal year
            const items = await Item.find({
                company: companyId,
                fiscalYear: fiscalYear // Match items based on fiscalYearId
            }).populate('category').populate('unit');

            // Fetch categories and units for item creation
            const categories = await Category.find({ company: companyId });
            const units = await Unit.find({ company: companyId });

            // Render the items page with the fetched data
            res.render('wholeseller/item/items', {
                items,
                categories,
                units,
                companyId,
                currentCompanyName,
                companyDateFormat,
                nepaliDate,
                fiscalYear,
                title: 'Items',
                body: 'wholeseller >> Items >> item',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching items:", error);
            req.flash('error', 'Failed to fetch items for the current fiscal year.');
            res.redirect('/wholesellerDashboard');
        }
    } else {
        res.redirect('/'); // Handle unauthorized access
    }
});




router.get('/products', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const companyId = req.session.currentCompany;
        // Fetch the current fiscal year from the session
        const fiscalYear = req.session.currentFiscalYear.id;

        const products = await Item.find({
            company: companyId,
            fiscalYear: fiscalYear // Match items based on fiscalYearId
        }).populate('category').populate('unit');
        res.json(products);// this is for index.ejs to fetch products details
        // res.render('item/items', { products });
    }
});

router.post('/items', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const { name, hscode, category, unit, price, puPrice, vatStatus, openingStock, openingStockBalance } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Fetch the company and populate the fiscalYear
        const company = await Company.findById(companyId).populate('fiscalYear');

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

        // Validate the category and unit
        const categories = await Category.findOne({ _id: category, company: companyId });
        if (!categories) {
            return res.status(400).json({ error: 'Invalid item category for this company' });
        }

        const units = await Unit.findOne({ _id: unit, company: companyId });
        if (!units) {
            return res.status(400).json({ error: 'Invalid item unit for this company' });
        }

        // Check if an item with the same name already exists for the current fiscal year
        const existingItem = await Item.findOne({ name, company: companyId, fiscalYear: fiscalYear });
        if (existingItem) {
            return res.status(400).json({ error: 'Item already exists for the current fiscal year.' });
        }

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newItem = new Item({
            name,
            hscode,
            category,
            unit,
            price,
            puPrice,
            vatStatus,
            stock: openingStock, // Set total stock to opening stock initially
            company: companyId,
            openingStockByFiscalYear: [{
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance
            }],
            stockEntries: openingStock > 0 ? [{
                quantity: openingStock,
                date: new Date(),
                fiscalYear: fiscalYear // Record stock entry with fiscal year
            }] : [],
            fiscalYear: fiscalYear, // Associate the item with the current fiscal year
        });

        // Save the new item
        await newItem.save();

        // Log the new item for debugging purposes
        console.log(newItem);

        // Flash success message and redirect
        req.flash('success', 'Item added successfully!');
        res.redirect('/items');
    }
});


router.get('/items/:id', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    const companyId = req.session.currentCompany;
    const currentCompanyName = req.session.currentCompanyName;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        const company = await Company.findById(companyId).populate('fiscalYear');

        // Check if fiscal year is already in the session
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year found in session or no fiscal year in the company, set it
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year for further use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        // If no fiscal year is still found in session, return an error
        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session.' });
        }

        // Fetch the item details along with the category and unit data
        const items = await Item.findOne({ _id: req.params.id, company: companyId })
            .populate('category')
            .populate('unit')
            .lean(); // Use .lean() to get plain JavaScript objects instead of Mongoose documents

        if (!items) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Check if item has openingStockByFiscalYear array
        if (!items.openingStockByFiscalYear || !Array.isArray(items.openingStockByFiscalYear)) {
            return res.status(400).json({ error: 'No opening stock information available for this item.' });
        }

        // Find the opening stock for the current fiscal year
        const openingStockForFiscalYear = items.openingStockByFiscalYear.find(stockEntry =>
            stockEntry.fiscalYear && stockEntry.fiscalYear.toString() === fiscalYear
        );

        // Default to 0 if no opening stock is found for the fiscal year
        const openingStock = openingStockForFiscalYear ? openingStockForFiscalYear.openingStock : 0;
        const openingStockBalance = openingStockForFiscalYear ? openingStockForFiscalYear.openingStockBalance : 0;
        const salesPrice = openingStockForFiscalYear ? openingStockForFiscalYear.salesPrice : 0;
        const purchasePrice = openingStockForFiscalYear ? openingStockForFiscalYear.purchasePrice : 0;

        // Render the page with the item details and opening stock for the current fiscal year
        res.render('wholeseller/item/view', {
            items,
            openingStock,
            openingStockBalance,
            salesPrice,
            purchasePrice,
            fiscalYear,
            currentCompanyName,
            title: 'Items',
            body: 'wholeseller >> Items >> view',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});


// Route to render the edit item form
router.get('/items/:id/edit', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany;
            const item = await Item.findById(req.params.id, { company: companyId });
            res.render('wholeseller/item/editItem', { item, companyId });
        } catch (err) {
            console.error('Error fetching item:', err);
            req.flash('error', 'Error fetching item');
            res.redirect('/items');
        }
    }
});

// Route to handle editing an item
router.put('/items/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const { name, hscode, category, price, puPrice, vatStatus, openingStock, unit, openingStockBalance } = req.body;
            const companyId = req.session.currentCompany;

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

            // Fetch the current fiscal year from the session or company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

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

                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }

            // Validate the category and unit
            const categories = await Category.findOne({ _id: category, company: companyId });
            if (!categories) {
                return res.status(400).json({ error: 'Invalid item category for this company' });
            }

            const units = await Unit.findOne({ _id: unit, company: companyId });
            if (!units) {
                return res.status(400).json({ error: 'Invalid item unit for this company' });
            }

            // Fetch the current item details
            const item = await Item.findById(req.params.id);
            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }

            // Ensure all variables are valid numbers
            const itemStock = Number(item.stock) || 0;
            const oldOpeningStock = Number(item.openingStock) || 0;
            const newOpeningStock = Number(openingStock) || 0;
            const openingStockBal = Number(openingStockBalance) || 0;

            // Debugging: Log the values to check for NaN or undefined
            console.log('itemStock:', itemStock);
            console.log('oldOpeningStock:', oldOpeningStock);
            console.log('newOpeningStock:', newOpeningStock);

            // Calculate the updated stock by adjusting opening stock
            const currentStock = itemStock - oldOpeningStock + newOpeningStock;

            // Update the item details, including the fiscal year data for stock entries
            await Item.findByIdAndUpdate(req.params.id, {
                name,
                hscode,
                category,
                unit,
                price,
                puPrice,
                vatStatus,
                openingStock: newOpeningStock,
                stock: currentStock,
                openingStockBalance: openingStockBal,
                stockEntries: newOpeningStock > 0 ? [{
                    quantity: newOpeningStock,
                    date: new Date(),
                    fiscalYear: fiscalYear // Ensure stock entry is tied to fiscal year
                }] : [],
                company: companyId,
                openingStockByFiscalYear: [{
                    fiscalYear: fiscalYear,
                    salesPrice: price,
                    purchasePrice: puPrice,
                    openingStock: newOpeningStock,
                    openingStockBalance: openingStockBal
                }],
                fiscalYear: fiscalYear // Ensure item is associated with the current fiscal year
            });

            req.flash('success', 'Item updated successfully');
            res.redirect('/items');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'An item with this name already exists within the selected company.');
                return res.redirect(`/items/${req.params.id}`);
            }

            console.error('Error updating item:', err);
            req.flash('error', 'Error updating item');
            res.redirect(`/items/${req.params.id}`);
        }
    }
});


// Route to handle form submission and delete the company group
router.delete('/items/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        const { id } = req.params;
        const companyId = req.session.currentCompany;

        await Item.findByIdAndDelete(id, { company: companyId });
        req.flash('success', 'Items deleted successfully');
        res.redirect('/items');
    }
})
// Route to list all items and their stock levels
router.get('/items-list', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const company = await Company.findById(companyId).populate('fiscalYear');;

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

            const items = await Item.find({ company: companyId, fiscalYear: fiscalYear }).populate('category').exec();
            res.render('wholeseller/item/listItems', {
                items, companyId, currentCompanyName,
                title: 'Items List',
                body: 'wholeseller >> Items >> all items',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (err) {
            console.error('Error fetching items:', err);
            req.flash('error_msg', 'Error fetching items');
            res.redirect('/');
        }
    }
});

// // Route to render stock adjustments form
// router.get('/items/:id/stock-adjustments', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
//     try {
//         const item = await Item.findById(req.params.id).populate('category').exec();
//         res.render('item/stockAdjustments', { item });
//     } catch (err) {
//         console.error('Error fetching item for stock adjustments:', err);
//         req.flash('error', 'Error fetching item for stock adjustments');
//         res.redirect('/items');
//     }
// });

// // Route to handle adding stock adjustments
// router.post('/items/:id/stock-adjustments', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
//     try {
//         const { type, quantity, reason } = req.body;
//         const item = await Item.findById(req.params.id);

//         const adjustment = {
//             type,
//             quantity,
//             reason,
//         };

//         if (type === 'excess') {
//             item.stock += parseInt(quantity, 10);
//         } else if (type === 'short') {
//             if (item.stock < quantity) {
//                 req.flash('error', 'Cannot reduce stock below zero');
//                 return res.redirect(`/items/${req.params.id}/stock-adjustments`);
//             }
//             item.stock -= parseInt(quantity, 10);
//         }

//         item.stockAdjustments.push(adjustment);
//         await item.save();

//         req.flash('success', 'Stock adjustment added successfully');
//         res.redirect(`/items/${req.params.id}/stock-adjustments`);
//     } catch (err) {
//         console.error('Error adding stock adjustment:', err);
//         req.flash('error', 'Error adding stock adjustment');
//         res.redirect(`/items/${req.params.id}/stock-adjustments`);
//     }
// });


module.exports = router;