// In your seed or initial setup file
const Setting = require('../models/Settings');

const transactionDisplaySetting = new Setting({
    key: 'displayTransactions',
    key: 'displayTransactionsForPurchase',
    value: true  // default to true
});

transactionDisplaySetting.save().catch(error => console.error(error));

