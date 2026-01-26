import { useEffect, useId, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { map } from './core/MapView';
import { findFonts } from './core/mapUtil';

const MapReplayMarkers = ({
  markers,
  selectedStopId,
}) => {
  const id = useId();
  const labelLayerId = `${id}-label`;
  const circleLayerId = `${id}-circle`;
  const popupRef = useRef(null);
  const popupContainerRef = useRef(null);

  const pinnedRef = useRef(false);

  const clearPopup = () => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
      popupContainerRef.current = null;
    }
  };

  const onMouseEnter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };

  const onMouseLeave = () => {
    map.getCanvas().style.cursor = '';
    if (!pinnedRef.current) {
      clearPopup();
    }
  };

  const onFeatureEnter = (event) => {
    const feature = event.features?.[0];
    if (!feature?.properties) {
      return;
    }
    const { title, subtitle, details } = feature.properties;
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '2px';

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.textContent = title || '';
    container.appendChild(titleEl);

    if (subtitle) {
      const subtitleEl = document.createElement('div');
      subtitleEl.style.fontSize = '12px';
      subtitleEl.textContent = subtitle;
      container.appendChild(subtitleEl);
    }
    if (details) {
      details.split('\n').forEach((line) => {
        const detailsEl = document.createElement('div');
        detailsEl.style.fontSize = '11px';
        detailsEl.style.opacity = '0.8';
        detailsEl.textContent = line;
        container.appendChild(detailsEl);
      });
    }

    clearPopup();
    popupContainerRef.current = container;
    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    })
      .setLngLat(event.lngLat)
      .setDOMContent(container)
      .addTo(map);
  };

  const onMarkerClick = (event) => {
    pinnedRef.current = true;
    onFeatureEnter(event);
  };

  const onMapClick = (event) => {
    const features = map.queryRenderedFeatures(event.point, { layers: [labelLayerId, circleLayerId] });
    if (!features.length) {
      pinnedRef.current = false;
      clearPopup();
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      pinnedRef.current = false;
      clearPopup();
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
      filter: ['==', ['get', 'type'], 'stop'],
      paint: {
        'circle-color': ['get', 'badgeColor'],
        'circle-radius': 9,
        'circle-stroke-color': '#111',
        'circle-stroke-width': 1,
      },
    });
    map.addLayer({
      id: labelLayerId,
      type: 'symbol',
      source: id,
      paint: {
        'text-color': ['coalesce', ['get', 'textColor'], ['get', 'color']],
        'text-halo-color': '#111',
        'text-halo-width': 1,
      },
      layout: {
        'text-font': findFonts(map),
        'text-size': 12,
        'text-field': ['get', 'label'],
        'text-allow-overlap': true,
      },
    });
    [labelLayerId, circleLayerId].forEach((layerId) => {
      map.on('mouseenter', layerId, onMouseEnter);
      map.on('mouseleave', layerId, onMouseLeave);
      map.on('mousemove', layerId, onFeatureEnter);
      map.on('click', layerId, onMarkerClick);
    });
    map.on('click', onMapClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      [labelLayerId, circleLayerId].forEach((layerId) => {
        map.off('mouseenter', layerId, onMouseEnter);
        map.off('mouseleave', layerId, onMouseLeave);
        map.off('mousemove', layerId, onFeatureEnter);
        map.off('click', layerId, onMarkerClick);
      });
      map.off('click', onMapClick);
      document.removeEventListener('keydown', onKeyDown);
      clearPopup();
      if (map.getLayer(labelLayerId)) {
        map.removeLayer(labelLayerId);
      }
      if (map.getLayer(circleLayerId)) {
        map.removeLayer(circleLayerId);
      }
      if (map.getSource(id)) {
        map.removeSource(id);
      }
    };
  }, []);

  useEffect(() => {
    const features = markers.map((marker) => {
      const isSelected = marker.id === selectedStopId;
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [marker.longitude, marker.latitude],
        },
        properties: {
          label: marker.label,
          type: marker.type,
          color: marker.color,
          textColor: marker.textColor || marker.color,
          badgeColor: isSelected ? '#ffb300' : (marker.badgeColor || marker.color),
          title: marker.title,
          subtitle: marker.subtitle,
          details: marker.details,
        },
      };
    });
    map.getSource(id)?.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [markers, selectedStopId]);

  return null;
};

export default MapReplayMarkers;
