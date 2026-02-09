import {
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import maplibregl from 'maplibre-gl';
import { map } from './core/MapView';
import buracoIconUrl from '../resources/images/icon/community-buraco.svg';
import radarIconUrl from '../resources/images/icon/community-radar.svg';
import quebraMolasIconUrl from '../resources/images/icon/community-quebra-molas.svg';

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

const MIN_VISIBLE_ZOOM = 17;
const COMMUNITY_ICON_BASE_SIZE = 64;

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
  const symbolLayerId = `${id}-community-symbol`;
  const popupRef = useRef(null);

  const imageIds = useMemo(() => ({
    BURACO: `${id}-community-icon-buraco`,
    RADAR: `${id}-community-icon-radar`,
    QUEBRA_MOLAS: `${id}-community-icon-quebra-molas`,
  }), [id]);

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
            radarSpeedLimit: report.radarSpeedLimit,
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
    const iconEntries = [
      { imageId: imageIds.BURACO, iconUrl: buracoIconUrl },
      { imageId: imageIds.RADAR, iconUrl: radarIconUrl },
      { imageId: imageIds.QUEBRA_MOLAS, iconUrl: quebraMolasIconUrl },
    ];

    const loadSvgAsMapImage = (imageId, iconUrl) => {
      if (map.hasImage(imageId)) {
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!map.hasImage(imageId)) {
          const width = image.naturalWidth || image.width || COMMUNITY_ICON_BASE_SIZE;
          const height = image.naturalHeight || image.height || COMMUNITY_ICON_BASE_SIZE;
          const pixelRatio = Math.max(width, height) / COMMUNITY_ICON_BASE_SIZE;
          map.addImage(imageId, image, {
            pixelRatio: pixelRatio >= 1 ? pixelRatio : 1,
          });
        }
      };
      image.src = iconUrl;
    };

    iconEntries.forEach(({ imageId, iconUrl }) => {
      loadSvgAsMapImage(imageId, iconUrl);
    });

    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    map.addLayer({
      id: symbolLayerId,
      type: 'symbol',
      source: id,
      minzoom: MIN_VISIBLE_ZOOM,
      layout: {
        'icon-image': [
          'match',
          ['get', 'type'],
          'RADAR',
          imageIds.RADAR,
          'BURACO',
          imageIds.BURACO,
          'QUEBRA_MOLAS',
          imageIds.QUEBRA_MOLAS,
          imageIds.RADAR,
        ],
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          17,
          0.4,
          18.5,
          0.48,
          20,
          0.56,
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 8,
      },
      paint: {
        'icon-opacity': ['case', ['to-boolean', ['get', 'pending']], 0.58, 1],
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
      const radarSpeedLimit = Number(feature.properties.radarSpeedLimit);
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

      if (type === 'RADAR' && Number.isFinite(radarSpeedLimit) && radarSpeedLimit > 0) {
        const speedLine = document.createElement('div');
        speedLine.style.fontSize = '12px';
        speedLine.style.color = '#334155';
        speedLine.textContent = `Velocidade: ${radarSpeedLimit} km/h`;
        container.appendChild(speedLine);
      }

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

    map.on('mouseenter', symbolLayerId, onMouseEnter);
    map.on('mouseleave', symbolLayerId, onMouseLeave);
    map.on('click', symbolLayerId, onClick);

    return () => {
      map.off('mouseenter', symbolLayerId, onMouseEnter);
      map.off('mouseleave', symbolLayerId, onMouseLeave);
      map.off('click', symbolLayerId, onClick);
      clearPopup();
      if (map.getLayer(symbolLayerId)) {
        map.removeLayer(symbolLayerId);
      }
      if (map.getSource(id)) {
        map.removeSource(id);
      }
      Object.values(imageIds).forEach((imageId) => {
        if (map.hasImage(imageId)) {
          map.removeImage(imageId);
        }
      });
    };
  }, [id, imageIds, onCancelPending, symbolLayerId]);

  useEffect(() => {
    map.getSource(id)?.setData(features);
  }, [features, id]);

  return null;
};

export default MapCommunityReports;
