/* Login page : sends the email and password to the server, which starts the session. */
document.addEventListener('DOMContentLoaded', function () {

    /* DOM variables. */
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-btn');

    loginButton.onclick = async function (event) {
        event?.preventDefault();

        if (!emailInput.value || !passwordInput.value) {
            Toaster.warning('Please enter your email and password.');
            return;
        };

        const answer = await apiFetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
            quiet: true
        });
        if (!answer.ok) return;   /* apiFetch already showed the error toast. */

        Toaster.success('Login successful. Opening your dashboard...');
        setTimeout(function () { window.location.href = '/'; }, 600);
    };
});
