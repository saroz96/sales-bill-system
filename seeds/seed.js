// const mongoose = require('mongoose');
// const companyGroup = require('../models/CompanyGroup');

// const groups = [
//     {
//         name: 'Sundry Creditors'
//     },
//     {
//         name: 'Bank Accounts'
//     },
//     {
//         name: 'Bank O/D Account'
//     },
//     {
//         name: 'Capital Account'
//     },
//     {
//         name: 'Sundry Debtors'
//     }
// ];

// const seedDatabase = async () => {
//     try {
//         // Remove all existing data
//         await companyGroup.deleteMany();

//         // Insert demo data
//         await companyGroup.insertMany(groups);

//         console.log('Database seeded successfully');
//     } catch (error) {
//         console.error('Error seeding database:', error);
//     }
// }

// module.exports = seedDatabase;