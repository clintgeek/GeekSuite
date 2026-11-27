import { Navigate, useLocation } from 'react-router-dom';
import { redirectTarget } from './redirectTarget.js';

/** An old address: lands on `to`, keeping its query string. See redirectTarget. */
export default function RedirectWithQuery({ to, params }) {
  const location = useLocation();
  return <Navigate to={redirectTarget(to, location, params)} replace />;
}
