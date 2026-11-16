/* Wrapper : the frame around every page (side menu, top bar, logout) and the iframe that shows the pages.

   1. Asks the server who is logged in.
   2. Builds the side menu of that role from sideMenu.json.
   3. Opens a page in the iframe when a menu item is clicked (the last visited page is opened on start). */
document.addEventListener("DOMContentLoaded", async function () {

    /* ---------- Logged in user ---------- *

    /* The server keeps the login in a signed cookie the page cannot read, so the user is asked from the server. */
    async function readLoggedInUser() {
        const answer = await apiFetch("/api/v1/trading/me", { quiet: true });
        const user = answer?.data?.user || {};
        try { sessionStorage.setItem("role", user?.role); } catch (error) { };
        return user;
    };

    const user = await readLoggedInUser();

    /* DOM variables. */
    const sidebar = document.getElementById("wrapper-sidebar");
    const overlay = document.getElementById("wrapper-overlay");
    const toggleButton = document.getElementById("wrapper-toggle-btn");
    const closeButton = document.getElementById("wrapper-close-btn");
    const logoutButton = document.getElementById("wrapper-logout-btn");
    const pageTitle = document.getElementById("wrapper-page-title");
    const frame = document.getElementById("wrapper-frame");
    const loader = document.getElementById("wrapper-loader");
    const sideMenu = document.getElementById("wrapper-side-menu");

    /* ---------- Side menu ---------- */

    function createMenuButton(menuOption) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wrapper-menu-item";
        button.setAttribute("data-page", menuOption?.page);
        button.setAttribute("data-title", menuOption?.name);

        const icon = document.createElement("i");
        icon.className = menuOption?.icon;
        button.appendChild(icon);

        const label = document.createElement("span");
        label.textContent = menuOption?.name;
        button.appendChild(label);

        return button;
    };

    async function buildSideMenu() {
        const response = await apiFetch("/public/data/sideMenu.json", { quiet: true });
        const allMenus = Array.isArray(response.data) ? response.data : [];
        const menuOfThisUser = allMenus.find(function (menu) { return menu?.role === user?.role; });

        if (!menuOfThisUser || !sideMenu) return;

        menuOfThisUser.menuOptions.forEach(function (menuOption) {
            sideMenu.appendChild(createMenuButton(menuOption));
        });
    };

    await buildSideMenu();
    const menuItems = Array.from(document.querySelectorAll(".wrapper-menu-item"));

    /* ---------- Opening pages ---------- */

    function closeSidebar() {
        sidebar.classList.remove("wrapper-sidebar-open");
        overlay.classList.remove("wrapper-overlay-show");
    };

    /* Loads a page in the iframe and highlights its menu item. */
    function openPage(page, title) {
        if (loader) loader.classList.add("wrapper-loader-show");

        frame.src = "/pages/" + page;
        pageTitle.textContent = title;
        menuItems.forEach(function (item) {
            item.classList.toggle("wrapper-menu-active", item.dataset.page === page);
        });

        /* The last page is remembered, so a refresh opens the same page. */
        try { sessionStorage.setItem("route", page); } catch (error) { };
        closeSidebar();
    };

    function findMenuItem(page) {
        return menuItems.find(function (item) { return item.dataset.page === page; });
    };

    /* Other scripts (the floating trade) can open a page of the menu with this. */
    window.wrapperOpenPage = function (page) {
        const item = findMenuItem(page);
        if (item) openPage(item.dataset.page, item.dataset.title);
    };

    frame.addEventListener("load", function () {
        if (loader) loader.classList.remove("wrapper-loader-show");
    });

    menuItems.forEach(function (item) {
        item.addEventListener("click", function () { openPage(item.dataset.page, item.dataset.title); });
    });

    /* ---------- Buttons ---------- */

    if (closeButton) closeButton.addEventListener("click", closeSidebar);
    if (overlay) overlay.addEventListener("click", closeSidebar);

    /* The menu button of the phone / tablet layout. */
    if (toggleButton) {
        toggleButton.addEventListener("click", function () {
            sidebar.classList.toggle("wrapper-sidebar-open");
            overlay.classList.toggle("wrapper-overlay-show");
        });
    };

    if (logoutButton) {
        logoutButton.addEventListener("click", function () {
            window.location.href = "/logout";
        });
    };

    /* ---------- Start : open the last visited page (or the Dashboard) ---------- */

    let startPage = "dashboard";
    try { startPage = sessionStorage.getItem("route") || "dashboard"; } catch (error) { };

    const startItem = findMenuItem(startPage) || menuItems[0];
    if (startItem) openPage(startItem.dataset.page, startItem.dataset.title);
});
