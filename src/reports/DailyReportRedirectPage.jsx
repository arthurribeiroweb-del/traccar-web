import { useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Loader from '../common/components/Loader';

const DailyReportRedirectPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirectSearch = useMemo(() => {
    const dateValue = searchParams.get('date');
    const parsedDate = dayjs(dateValue, 'YYYY-MM-DD', true);
    const day = parsedDate.isValid() ? parsedDate : dayjs().subtract(1, 'day');

    const from = day.startOf('day').toISOString();
    const to = day.endOf('day').toISOString();
    const params = new URLSearchParams();
    params.set('daily', 'true');
    params.set('from', from);
    params.set('to', to);

    searchParams
      .getAll('deviceId')
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0)
      .forEach((id) => params.append('deviceId', String(id)));

    return params.toString();
  }, [searchParams]);

  useEffect(() => {
    navigate(`/reports/summary?${redirectSearch}`, { replace: true });
  }, [navigate, redirectSearch]);

  return <Loader />;
};

export default DailyReportRedirectPage;
