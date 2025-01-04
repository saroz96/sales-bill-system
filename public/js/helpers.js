// function numberToWords(num) {
//     const ones = [
//         '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
//         'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
//         'Seventeen', 'Eighteen', 'Nineteen'
//     ];

//     const tens = [
//         '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
//     ];

//     const scales = ['', 'Thousand', 'Lakh', 'Crore'];

//     function convertHundreds(num) {
//         let words = '';

//         if (num > 99) {
//             words += ones[Math.floor(num / 100)] + ' Hundred ';
//             num %= 100;
//         }

//         if (num > 19) {
//             words += tens[Math.floor(num / 10)] + ' ';
//             num %= 10;
//         }

//         if (num > 0) {
//             words += ones[num] + ' ';
//         }

//         return words.trim();
//     }

//     function convertSection(num) {
//         let words = '';
//         if (num > 0) {
//             words = convertHundreds(num) + ' ';
//         }
//         return words;
//     }

//     if (num === 0) return 'Zero Rupees and Zero Paisa Only';

//     if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

//     let rupees = Math.floor(num);
//     let paise = Math.round((num - rupees) * 100);

//     // Rounding off logic
//     if (paise > 50) {
//         rupees += 1;
//         paise = 0;
//     }

//     let words = '';

//     for (let i = scales.length - 1; i >= 0; i--) {
//         let unit = Math.pow(100, i + 1);
//         if (rupees >= unit) {
//             words += convertSection(Math.floor(rupees / unit)) + scales[i] + ' ';
//             rupees %= unit;
//         }
//     }
//     words += convertSection(rupees) + ' Rupees';

//     if (paise > 0) {
//         words += ' and ' + convertSection(paise) + ' Paisa';
//     } else {
//         words += ' and Zero Paisa';
//     }

//     words += ' Only';

//     return words.trim();
// }

// module.exports = { numberToWords };
