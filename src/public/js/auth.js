/* Shows the page and hides the first loader (marked with data-boot-loader).
   The server already checks the login before it sends any page, so nothing is checked here. */
document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = window.location.pathname === '/login';
    const container = document.querySelector(isLoginPage ? '.login-page' : '.wrapper-layout');
    const loader = document.querySelector('[data-boot-loader]');

    if (container) container.style.display = 'flex';
    if (loader) loader.style.display = 'none';
});
