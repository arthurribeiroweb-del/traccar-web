import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from '@mui/material';
import { useTranslation } from './LocalizationProvider';
import { useCatch } from '../../reactHelper';
import fetchOrThrow from '../util/fetchOrThrow';

const GEOCODE_TIMEOUT_MS = 15_000;
const NOMINATIM_TIMEOUT_MS = 8_000;
const NOMINATIM_USER_AGENT = 'TraccarWeb/1.0 (https://www.traccar.org)';

const CITY_KEYS = ['city', 'town', 'village', 'municipality', 'county', 'state'];

async function fetchCityFallback(latitude, longitude, signal) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    signal,
    headers: { 'Accept-Language': typeof navigator !== 'undefined' ? navigator.language : 'en', 'User-Agent': NOMINATIM_USER_AGENT },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const addr = json?.address;
  if (!addr || typeof addr !== 'object') return null;
  for (const k of CITY_KEYS) {
    const v = addr[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

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
  const [failed, setFailed] = useState(false);
  const currentKeyRef = useRef('');
  const abortRef = useRef(null);

  useEffect(() => {
    setAddress(originalAddress);
    setFailed(false);
  }, [latitude, longitude, originalAddress]);

  useEffect(() => {
    if (!inline || !addressEnabled || address) {
      setLoading(false);
      return;
    }

    const key = `${latitude},${longitude}`;
    if (currentKeyRef.current === key && failed) return;
    currentKeyRef.current = key;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const timeout = setTimeout(() => ac.abort(), GEOCODE_TIMEOUT_MS);

    setFailed(false);
    setLoading(true);

    const apply = (fn) => {
      if (!ac.signal.aborted && currentKeyRef.current === key) fn();
    };
    const stillCurrent = () => currentKeyRef.current === key;

    const tryCityFallback = () => {
      if (!stillCurrent() || ac.signal.aborted) return Promise.resolve();
      const ac2 = new AbortController();
      const t2 = setTimeout(() => ac2.abort(), NOMINATIM_TIMEOUT_MS);
      return fetchCityFallback(latitude, longitude, ac2.signal)
        .then((city) => {
          clearTimeout(t2);
          if (stillCurrent() && !ac.signal.aborted && city) apply(() => setAddress(city));
          else if (stillCurrent() && !ac.signal.aborted) apply(() => setFailed(true));
        })
        .catch(() => {
          clearTimeout(t2);
          if (stillCurrent() && !ac.signal.aborted) apply(() => setFailed(true));
        });
    };

    const query = new URLSearchParams({ latitude, longitude });
    fetchOrThrow(`/api/server/geocode?${query.toString()}`, { signal: ac.signal })
      .then((response) => response.text())
      .then((text) => {
        const trimmed = (text || '').trim();
        if (trimmed && trimmed.toLowerCase() !== 'null') {
          apply(() => setAddress(trimmed));
          return;
        }
        return tryCityFallback();
      })
      .catch((error) => {
        if (error?.name === 'AbortError') {
          if (stillCurrent()) return tryCityFallback();
          return;
        }
        return tryCityFallback();
      })
      .finally(() => {
        clearTimeout(timeout);
        if (abortRef.current === ac) abortRef.current = null;
        if (stillCurrent()) setLoading(false);
      });

    return () => {
      ac.abort();
      clearTimeout(timeout);
      if (abortRef.current === ac) abortRef.current = null;
    };
  }, [inline, addressEnabled, address, failed, latitude, longitude]);

  const showAddress = useCatch(async (event) => {
    event.preventDefault();
    const query = new URLSearchParams({ latitude, longitude });
    const response = await fetchOrThrow(`/api/server/geocode?${query.toString()}`);
    const text = await response.text();
    const trimmed = (text || '').trim();
    setAddress(trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : null);
  });

  if (inline) {
    let value;
    if (address) {
      value = address;
    } else if (loading) {
      value = t('sharedLoading');
    } else if (failed) {
      value = t('sharedAddressUnavailable');
    } else {
      value = '--';
    }
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
