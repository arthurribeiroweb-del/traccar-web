import {
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import maplibregl from 'maplibre-gl';
import { map } from '../map/core/MapView';
import buracoIconUrl from '../resources/images/icon/community-buraco.png';
import radarIconUrl from '../resources/images/icon/community-radar.png';
import quebraMolasIconUrl from '../resources/images/icon/bump-ahead-sign-icon.svg';

const typeLabelMap = {
  RADAR: 'Radar',
  BURACO: 'Buraco',
  QUEBRA_MOLAS: 'Lombada',
};

const MapPendingReports = ({
  items,
  draftById,
  onItemClick,
  onApprove,
  onReject,
  savingId,
}) => {
  const id = useId();
  const symbolLayerId = `${id}-pending-symbol`;
  const popupRef = useRef(null);

  const imageIds = useMemo(() => ({
    BURACO: `${id}-pending-icon-buraco`,
    RADAR: `${id}-pending-icon-radar`,
    QUEBRA_MOLAS: `${id}-pending-icon-quebra-molas`,
  }), [id]);

  const features = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: items
        .filter((item) => {
          const draft = draftById[item.id];
          const lat = draft ? Number(draft.latitude) : item.latitude;
          const lon = draft ? Number(draft.longitude) : item.longitude;
          return Number.isFinite(lat) && Number.isFinite(lon)
            && lat >= -90 && lat <= 90
            && lon >= -180 && lon <= 180;
        })
        .map((item) => {
          const draft = draftById[item.id];
          const lat = draft ? Number(draft.latitude) : item.latitude;
          const lon = draft ? Number(draft.longitude) : item.longitude;
          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lon, lat],
            },
            properties: {
              reportId: item.id,
              type: item.type,
              authorName: item.authorName || `#${item.createdByUserId}`,
              createdAt: item.createdAt,
              radarSpeedLimit: draft?.radarSpeedLimit ?? item.radarSpeedLimit,
            },
          };
        }),
    };
  }, [items, draftById]);

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
          const width = image.naturalWidth || image.width || 64;
          const height = image.naturalHeight || image.height || 64;
          const pixelRatio = Math.max(width, height) / 64;
          map.addImage(imageId, image, {
            pixelRatio: Math.max(pixelRatio, 0.01),
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
        'icon-size': ['*', 0.6, ['match', ['get', 'type'], 'RADAR', 1.1, 1]],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 8,
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
      const authorName = feature.properties.authorName;
      const createdAt = feature.properties.createdAt;
      const radarSpeedLimit = Number(feature.properties.radarSpeedLimit);
      const item = items.find((i) => i.id === reportId);
      if (!item) {
        return;
      }

      clearPopup();

      const container = document.createElement('div');
      container.style.minWidth = '240px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '12px';
      container.style.padding = '4px';

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.style.fontSize = '16px';
      title.textContent = typeLabelMap[type] || type || '-';
      container.appendChild(title);

      const info = document.createElement('div');
      info.style.fontSize = '12px';
      info.style.color = '#666';
      info.innerHTML = `
        <div>Autor: ${authorName}</div>
        <div>Criado: ${new Date(createdAt).toLocaleString('pt-BR')}</div>
      `;
      container.appendChild(info);

      if (type === 'RADAR' && Number.isFinite(radarSpeedLimit) && radarSpeedLimit > 0) {
        const speedLine = document.createElement('div');
        speedLine.style.fontSize = '12px';
        speedLine.style.color = '#666';
        speedLine.textContent = `Velocidade: ${radarSpeedLimit} km/h`;
        container.appendChild(speedLine);
      }

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      actions.style.marginTop = '4px';

      const isSaving = savingId === `approve-${reportId}` || savingId === `reject-${reportId}`;

      const approveBtn = document.createElement('button');
      approveBtn.type = 'button';
      approveBtn.style.flex = '1';
      approveBtn.style.padding = '8px 12px';
      approveBtn.style.border = 'none';
      approveBtn.style.borderRadius = '6px';
      approveBtn.style.background = '#9c27b0';
      approveBtn.style.color = '#fff';
      approveBtn.style.cursor = isSaving ? 'not-allowed' : 'pointer';
      approveBtn.style.fontWeight = '600';
      approveBtn.style.fontSize = '14px';
      approveBtn.disabled = isSaving;
      approveBtn.textContent = isSaving && savingId === `approve-${reportId}` ? 'Aprovando...' : 'Aprovar';
      approveBtn.onclick = () => {
        if (!isSaving && onApprove) {
          onApprove(item);
        }
      };
      actions.appendChild(approveBtn);

      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.style.flex = '1';
      rejectBtn.style.padding = '8px 12px';
      rejectBtn.style.border = 'none';
      rejectBtn.style.borderRadius = '6px';
      rejectBtn.style.background = '#d32f2f';
      rejectBtn.style.color = '#fff';
      rejectBtn.style.cursor = isSaving ? 'not-allowed' : 'pointer';
      rejectBtn.style.fontWeight = '600';
      rejectBtn.style.fontSize = '14px';
      rejectBtn.disabled = isSaving;
      rejectBtn.textContent = isSaving && savingId === `reject-${reportId}` ? 'Rejeitando...' : 'Rejeitar';
      rejectBtn.onclick = () => {
        if (!isSaving && onReject) {
          onReject(reportId);
        }
      };
      actions.appendChild(rejectBtn);

      container.appendChild(actions);

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '280px',
      })
        .setLngLat(event.lngLat)
        .setDOMContent(container)
        .addTo(map);

      if (onItemClick) {
        onItemClick(item);
      }
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
  }, [id, imageIds, symbolLayerId, items, draftById, onItemClick, onApprove, onReject, savingId]);

  useEffect(() => {
    map.getSource(id)?.setData(features);
    if (features.features.length > 0) {
      const coordinates = features.features.map((f) => f.geometry.coordinates);
      const bounds = coordinates.reduce(
        (bounds, coord) => bounds.extend(coord),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      );
      const canvas = map.getCanvas();
      map.fitBounds(bounds, {
        padding: Math.min(canvas.width, canvas.height) * 0.15,
        duration: 500,
      });
    }
  }, [features, id]);

  return null;
};

export default MapPendingReports;
