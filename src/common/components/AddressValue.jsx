import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from '@mui/material';
import { useTranslation } from './LocalizationProvider';
import { useCatch } from '../../reactHelper';
import fetchOrThrow from '../util/fetchOrThrow';

const AddressValue = ({
  latitude,
  longitude,
  originalAddress,
  inline = false,
  className = '',
  expandedClassName = '',
  enableExpand = false,
  showTooltip = false,
}) => {
  const t = useTranslation();

  const addressEnabled = useSelector((state) => state.session.server.geocoderEnabled);

  const [address, setAddress] = useState();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAddress(originalAddress);
  }, [latitude, longitude, originalAddress]);

  useEffect(() => {
    let active = true;
    const fetchAddress = async () => {
      if (!inline || !addressEnabled || address || loading) {
        return;
      }
      try {
        setLoading(true);
        const query = new URLSearchParams({ latitude, longitude });
        const response = await fetchOrThrow(`/api/server/geocode?${query.toString()}`);
        const text = await response.text();
        if (active) {
          setAddress(text);
        }
      } catch (error) {
        // Ignore geocode errors silently for inline display
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchAddress();
    return () => {
      active = false;
    };
  }, [address, addressEnabled, inline, latitude, longitude, loading]);

  const showAddress = useCatch(async (event) => {
    event.preventDefault();
    const query = new URLSearchParams({ latitude, longitude });
    const response = await fetchOrThrow(`/api/server/geocode?${query.toString()}`);
    setAddress(await response.text());
  });

  if (inline) {
    const value = address || (loading ? t('sharedLoading') : '--');
    const classNames = expanded ? `${className} ${expandedClassName}`.trim() : className;
    return (
      <span
        className={classNames}
        title={showTooltip && address ? address : undefined}
        onClick={enableExpand ? () => setExpanded((prev) => !prev) : undefined}
        onKeyDown={enableExpand ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((prev) => !prev);
          }
        } : undefined}
        role={enableExpand ? 'button' : undefined}
        tabIndex={enableExpand ? 0 : undefined}
      >
        {value}
      </span>
    );
  }

  if (address) {
    return address;
  }
  if (addressEnabled) {
    return (<Link href="#" onClick={showAddress}>{t('sharedShowAddress')}</Link>);
  }
  return '';
};

export default AddressValue;
