import { Navigate, useSearchParams } from 'react-router-dom';
import { useReportsAccess } from '../common/util/permissions';

const ReportsIndexRedirect = () => {
  const reportsAccess = useReportsAccess();
  const [searchParams] = useSearchParams();
  const deviceId = searchParams.getAll('deviceId')[0];
  const target = reportsAccess ? '/reports/combined' : '/reports/dashboard';
  const search = deviceId ? `?deviceId=${deviceId}` : '';
  return <Navigate to={`${target}${search}`} replace />;
};

export default ReportsIndexRedirect;
