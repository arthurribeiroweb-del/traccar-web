import {
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import maplibregl from 'maplibre-gl';
import { map } from './core/MapView';
import { findFonts } from './core/mapUtil';

const typeLabelMap = {
  RADAR: 'Radar',
  BURACO: 'Buraco',
  QUEBRA_MOLAS: 'Quebra-molas',
};

const statusLabelMap = {
  PENDING_PRIVATE: 'Aguardando aprovação',
  APPROVED_PUBLIC: 'Público',
  REJECTED: 'Rejeitado',
};

const formatCreatedAt = (value) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MapCommunityReports = ({
  publicReports,
  pendingReports,
  onCancelPending,
}) => {
  const id = useId();
  const circleLayerId = `${id}-community-circle`;
  const textLayerId = `${id}-community-text`;
  const popupRef = useRef(null);

  const features = useMemo(() => {
    const all = [
      ...(publicReports || []).map((report) => ({ ...report, pending: false })),
      ...(pendingReports || []).map((report) => ({ ...report, pending: true })),
    ];

    return {
      type: 'FeatureCollection',
      features: all
        .filter((report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude))
        .map((report) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [report.longitude, report.latitude],
          },
          properties: {
            reportId: report.id,
            type: report.type,
            status: report.status,
            pending: report.pending,
            createdAt: report.createdAt,
            cancelable: Boolean(report.cancelable),
          },
        })),
    };
  }, [publicReports, pendingReports]);

  const clearPopup = () => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  };

  useEffect(() => {
    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    map.addLayer({
      id: circleLayerId,
      type: 'circle',
      source: id,
      paint: {
        'circle-radius': 11,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 2,
        'circle-opacity': ['case', ['to-boolean', ['get', 'pending']], 0.55, 0.95],
        'circle-color': [
          'match',
          ['get', 'type'],
          'RADAR',
          '#F59E0B',
          'BURACO',
          '#EF4444',
          'QUEBRA_MOLAS',
          '#2563EB',
          '#64748B',
        ],
      },
    });

    map.addLayer({
      id: textLayerId,
      type: 'symbol',
      source: id,
      layout: {
        'text-field': [
          'match',
          ['get', 'type'],
          'RADAR',
          'R',
          'BURACO',
          'B',
          'QUEBRA_MOLAS',
          'Q',
          '?',
        ],
        'text-size': 11,
        'text-font': findFonts(map),
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#FFFFFF',
      },
    });

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const onClick = (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties) {
        return;
      }

      const reportId = feature.properties.reportId;
      const type = feature.properties.type;
      const status = feature.properties.status;
      const createdAt = feature.properties.createdAt;
      const pending = feature.properties.pending === true || feature.properties.pending === 'true';
      const cancelable = feature.properties.cancelable === true || feature.properties.cancelable === 'true';

      clearPopup();

      const container = document.createElement('div');
      container.style.minWidth = '220px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.textContent = typeLabelMap[type] || type || '-';
      container.appendChild(title);

      const statusLine = document.createElement('div');
      statusLine.style.fontSize = '12px';
      statusLine.style.color = '#334155';
      statusLine.textContent = `Status: ${statusLabelMap[status] || status || '-'}`;
      container.appendChild(statusLine);

      const createdLine = document.createElement('div');
      createdLine.style.fontSize = '12px';
      createdLine.style.color = '#334155';
      createdLine.textContent = `Criado em: ${formatCreatedAt(createdAt)}`;
      container.appendChild(createdLine);

      if (pending) {
        const chip = document.createElement('div');
        chip.style.display = 'inline-flex';
        chip.style.width = 'fit-content';
        chip.style.padding = '4px 8px';
        chip.style.borderRadius = '999px';
        chip.style.background = '#E2E8F0';
        chip.style.fontSize = '11px';
        chip.style.fontWeight = '600';
        chip.style.color = '#1E293B';
        chip.textContent = 'Aguardando aprovação';
        container.appendChild(chip);
      }

      if (pending && cancelable && onCancelPending) {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.minHeight = '44px';
        button.style.padding = '10px 12px';
        button.style.border = '1px solid #CBD5E1';
        button.style.borderRadius = '8px';
        button.style.background = '#FFFFFF';
        button.style.cursor = 'pointer';
        button.style.textAlign = 'left';
        button.style.fontWeight = '600';
        button.textContent = 'Cancelar envio';
        button.onclick = async () => {
          button.disabled = true;
          button.textContent = 'Cancelando...';
          try {
            await onCancelPending(reportId);
            clearPopup();
          } catch {
            button.disabled = false;
            button.textContent = 'Cancelar envio';
          }
        };
        container.appendChild(button);
      }

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '280px',
      })
        .setLngLat(event.lngLat)
        .setDOMContent(container)
        .addTo(map);
    };

    [circleLayerId, textLayerId].forEach((layerId) => {
      map.on('mouseenter', layerId, onMouseEnter);
      map.on('mouseleave', layerId, onMouseLeave);
      map.on('click', layerId, onClick);
    });

    return () => {
      [circleLayerId, textLayerId].forEach((layerId) => {
        map.off('mouseenter', layerId, onMouseEnter);
        map.off('mouseleave', layerId, onMouseLeave);
        map.off('click', layerId, onClick);
      });
      clearPopup();
      if (map.getLayer(textLayerId)) {
        map.removeLayer(textLayerId);
      }
      if (map.getLayer(circleLayerId)) {
        map.removeLayer(circleLayerId);
      }
      if (map.getSource(id)) {
        map.removeSource(id);
      }
    };
  }, [onCancelPending]);

  useEffect(() => {
    map.getSource(id)?.setData(features);
  }, [features]);

  return null;
};

export default MapCommunityReports;
