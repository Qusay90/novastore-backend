import React from 'react';
import {createRoot} from 'react-dom/client';
import {IntegratedApp} from './IntegratedApp.jsx';
import './canonical.css';
import './integrated.css';
import './integration/public-review.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><IntegratedApp /></React.StrictMode>);
