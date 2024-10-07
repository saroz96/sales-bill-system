const BillCounter = require('../models/wholeseller/billCounter'); // Assuming the schema is saved in models/BillCounter

async function getNextBillNumber(companyId, fiscalYearId, transactionType) {
    try {
        // Check if there is an existing bill counter for the given company, fiscal year, and transaction type
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYearId,
            transactionType: transactionType
        });

        if (!billCounter) {
            // If no counter exists, create a new one with the first bill number
            billCounter = new BillCounter({
                company: companyId,
                fiscalYear: fiscalYearId,
                transactionType: transactionType,
                currentBillNumber: 1 // Start at 1 for the new fiscal year
            });
        } else {
            // Increment the current bill number
            billCounter.currentBillNumber += 1;
        }

        // Save the updated bill counter
        await billCounter.save();
        console.log('Bill Count:', billCounter);
        // Return the current bill number
        return billCounter.currentBillNumber;
    } catch (error) {
        console.error("Error in getting next bill number: ", error);
        throw new Error("Unable to generate bill number");
    }
}

module.exports = {
    getNextBillNumber
};
