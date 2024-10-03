// Import NepaliDate from the npm package
import NepaliDate from 'nepali-date';

document.addEventListener('DOMContentLoaded', function () {
    const billDateInput = document.getElementById('billDate');
    const nepaliDateInput = document.getElementById('nepaliDate');

    // Ensure NepaliDate is defined
    if (typeof NepaliDate === 'undefined') {
        console.error('NepaliDate is not defined. Please check the library inclusion.');
        return;
    }

    // Function to convert English date to Nepali date
    function englishToNepaliDate(englishDate) {
        const [day, month, year] = englishDate.split('/').map(Number);
        if (day && month && year) {
            try {
                const englishDateObj = new Date(year, month - 1, day);
                const nepaliDateObj = new NepaliDate(englishDateObj);
                return `${nepaliDateObj.getYear()}-${String(nepaliDateObj.getMonth() + 1).padStart(2, '0')}-${String(nepaliDateObj.getDate()).padStart(2, '0')}`;
            } catch (error) {
                console.error('Error converting to Nepali date:', error);
                return 'Invalid date';
            }
        } else {
            return 'Invalid date';
        }
    }

    // Function to convert Nepali date to English date
    function nepaliToEnglishDate(nepaliDate) {
        const [year, month, day] = nepaliDate.split('-').map(Number);
        if (day && month && year) {
            try {
                const nepaliDateObj = new NepaliDate(year, month - 1, day);
                const englishDateObj = nepaliDateObj.getEnglishDate();
                const yearStr = englishDateObj.getFullYear();
                const monthStr = String(englishDateObj.getMonth() + 1).padStart(2, '0'); // Months are 0-based
                const dayStr = String(englishDateObj.getDate()).padStart(2, '0');
                return `${dayStr}/${monthStr}/${yearStr}`;
            } catch (error) {
                console.error('Error converting to English date:', error);
                return 'Invalid date';
            }
        } else {
            return 'Invalid date';
        }
    }

    billDateInput.addEventListener('input', function () {
        const englishDate = this.value;
        if (englishDate) {
            nepaliDateInput.value = englishToNepaliDate(englishDate);
        } else {
            nepaliDateInput.value = '';
        }
    });

    nepaliDateInput.addEventListener('input', function () {
        const nepaliDate = this.value;
        if (nepaliDate) {
            billDateInput.value = nepaliToEnglishDate(nepaliDate);
        } else {
            billDateInput.value = '';
        }
    });
});
