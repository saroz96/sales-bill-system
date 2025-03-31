const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const FiscalYear = require('../models/retailer/FiscalYear');
const Account = require('../models/retailer/Account');
const Company = require('../models/retailer/Company');
const Transaction = require('../models/retailer/Transaction');
const Item = require('../models/retailer/Item');

// Function to calculate the closing balance of an account
async function calculateClosingBalance(accountId, fiscalYearId) {
    try {
        // Fetch the fiscal year details
        const fiscalYear = await FiscalYear.findById(fiscalYearId);
        if (!fiscalYear) throw new Error('Fiscal Year not found');

        // Fetch transactions related to the account within the fiscal year
        const transactions = await Transaction.find({
            account: accountId,
            date: { $gte: fiscalYear.startDate, $lte: fiscalYear.endDate }
        });

        let closingBalance = 0;

        transactions.forEach(transaction => {
            if (transaction.type === 'credit') {
                closingBalance += transaction.amount;
            } else if (transaction.type === 'debit') {
                closingBalance -= transaction.amount;
            }
        });

        return closingBalance;
    } catch (err) {
        console.error('Error calculating closing balance:', err);
        throw err;
    }
}

async function switchFiscalYear(companyId, newFiscalYearData) {
    try {
        const company = await Company.findById(companyId);
        if (!company) throw new Error('Company not found');

        // Check if the fiscal year with the same name already exists for this company
        const existingFiscalYear = await FiscalYear.findOne({
            name: newFiscalYearData.name,
            company: company._id
        });

        if (existingFiscalYear) {
            throw new Error(`Fiscal year ${newFiscalYearData.name} already exists for this company`);
        }

        // Create the new fiscal year
        const newFiscalYear = new FiscalYear({
            name: newFiscalYearData.name,
            startDate: newFiscalYearData.startDate,
            endDate: newFiscalYearData.endDate,
            dateFormat: newFiscalYearData.dateFormat,
            isActive: true,
            company: company._id
        });

        await newFiscalYear.save();

        // Deactivate the current fiscal year
        await FiscalYear.updateMany({ company: company._id }, { isActive: false });

        // Assign the new fiscal year to the company
        company.fiscalYear = newFiscalYear._id;
        await company.save();

        // Transfer data to the new fiscal year
        await transferDataToNewFiscalYear(company, newFiscalYear._id);

        return newFiscalYear;
    } catch (err) {
        console.error('Error switching fiscal year:', err);
        throw err;
    }
}

async function transferDataToNewFiscalYear(company, newFiscalYearId) {
    // Find all accounts for the company in the previous fiscal year
    const accounts = await Account.find({
        company: company._id,
        fiscalYear: company.fiscalYear
    });

    for (const account of accounts) {
        // Calculate the closing balance for the account
        const closingBalance = await calculateClosingBalance(account._id, company.fiscalYear);

        // Update the existing account's opening balance and fiscal year
        const result = await Account.updateOne(
            {
                _id: account._id
            },
            {
                $set: {
                    openingBalance: closingBalance,
                    fiscalYear: newFiscalYearId
                }
            }
        );

        if (result.nModified > 0) {
            console.log(`Account ${account.name} has been updated with a new opening balance for the fiscal year.`);
        } else {
            console.log(`Account ${account.name} could not be updated.`);
        }
    }

    // Find all items for the company
    const items = await Item.find({ company: company._id });

    for (const item of items) {
        // Calculate closing stock for the previous fiscal year
        const closingStock = await calculateItemClosingStock(item._id, company.fiscalYear);

        // Update the item with the new fiscal year's opening stock
        const result = await Item.updateOne(
            {
                _id: item._id
            },
            {
                $set: {
                    openingStock: closingStock,
                    fiscalYear: newFiscalYearId
                }
            }
        );

        if (result.nModified > 0) {
            console.log(`Item ${item.name} updated with new opening stock for fiscal year ${newFiscalYearId}.`);
        } else {
            console.log(`Item ${item.name} could not be updated.`);
        }
    }
}


async function calculateItemClosingStock(itemId, fiscalYear) {
    const transactions = await Transaction.find({
        item: itemId,
        fiscalYear: fiscalYear
    });

    let closingStock = 0;
    for (const transaction of transactions) {
        // Increment or decrement based on transaction type
        if (transaction.type === 'Purc' || transaction.type === 'stockAdjustment') {
            closingStock += transaction.quantity;
        } else if (transaction.type === 'Sale' || transaction.type === 'Slrt') {
            closingStock -= transaction.quantity;
        }
    }

    return closingStock;
}




// Export the functions
module.exports = {
    switchFiscalYear,
    transferDataToNewFiscalYear,
    calculateItemClosingStock
};
