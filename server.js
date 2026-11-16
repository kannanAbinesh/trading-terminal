/* Plugins. */
const express = require('express');
const path = require('path');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cookieParser = require('cookie-parser');

/* Helpers. */
const { port, environment, jwt_token } = require('./config');
const { verifyToken } = require('./src/middleware/verifyToken');
const { PUBLIC, UPLOADS } = require('./src/helpers/paths');
const tradingRoutes = require('./src/routes/trading');
const pageRoutes = require('./src/routes/pages');

/* Variables. */
const app = express();
const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'api-docs.yaml'));

/* Middleware. */
app.use(cors({ origin: '*', methods: ['POST', 'PUT', 'DELETE', 'GET'] }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser(jwt_token));
app.use('/public', express.static(PUBLIC));
app.use('/uploads', verifyToken, express.static(UPLOADS));   /* Datasets, back tests and live CSV files : login needed. */
if (environment === 'DEVELOPMENT') app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));   /* API docs : http://localhost:3000/api-docs */

/* Routes. */
app.use('/api/v1/trading', verifyToken, tradingRoutes);
app.use('', verifyToken, pageRoutes);

/* Start the server. */
app.listen(port, () => {
    console.log(`The server is running on port ${port}.`);
});