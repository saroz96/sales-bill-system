// addTestItems.js

const mongoose = require('mongoose');
const Item = require('./models/Item'); // Adjust the path as needed

const DB_URI = 'mongodb://localhost:27017/yourDatabase'; // Replace with your database URI

async function seedItems() {
    try {
        // Connect to MongoDB
        mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/Sarathi');

        // Insert test item data
        const testItem = new Item({
            name: 'Test Item',
            hscode: 123456,
            category: '66a4b24e1aaa8011744033df', // Replace with a valid category ID
            price: 100,
            unit: '66a4b2481aaa8011744033d6', // Replace with a valid unit ID
            vatStatus: 'vatable',
            openingStock: 50,
            stock: 50,
            company: '66a4b2401aaa8011744033c9' // Replace with a valid company ID
        });

        await testItem.save();

        console.log('Test item data inserted successfully');

        // Close the connection
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error inserting test items:', err);
        process.exit(1);
    }
}

seedItems();
