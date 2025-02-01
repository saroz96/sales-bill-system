 // Form validation script
 (function () {
    'use strict';
    window.addEventListener('load', function () {
        const forms = document.getElementsByClassName('needs-validation');
        for (let i = 0; i < forms.length; i++) {
            forms[i].addEventListener('submit', function (event) {
                if (forms[i].checkValidity() === false) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                forms[i].classList.add('was-validated');
            }, false);
        }
    }, false);
})();

// Automatically focus on the voucher number input
document.getElementById('billNumber').focus();