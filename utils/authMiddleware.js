// Simple HTTP Basic Auth middleware for Express
const basicAuth = require('basic-auth');

const API_USER = process.env.API_USER || process.env.REACT_APP_USERNAME;
const API_PASS = process.env.API_PASS || process.env.REACT_APP_PASSWORD;

function authMiddleware(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== API_USER || user.pass !== API_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="API"');
    return res.status(401).send('Authentication required.');
  }
  next();
}

module.exports = authMiddleware;
