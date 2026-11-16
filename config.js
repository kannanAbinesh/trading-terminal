/* Plugins. */
require('dotenv').config({ quiet: true });

module.exports = {
    port: process.env.PORT || 3000,
    environment: process.env.ENVIRONMENT || 'DEVELOPMENT',
    jwt_token: process.env.JWT_TOKEN,
    newsMinutesBefore: 15,
    newsMinutesAfter: 15,
    newsCurrencies: ['USD']
};