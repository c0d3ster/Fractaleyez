import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage = () => (
  <div className="not-found">
    <h1>404</h1>
    <h2>Page not found!</h2>
    <Link to="/">Go back to the Home page</Link>
  </div>
);

export default NotFoundPage;
