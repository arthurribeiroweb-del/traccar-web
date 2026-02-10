import {
  useEffect,
  useId,
} from 'react';
import { map } from './core/MapView';
import radarIconUrl from '../resources/images/icon/community-radar.svg';

const STATIC_RADARS_MIN_ZOOM = 10;
const RADAR_ICON_BASE_SIZE = 64;

const MapStaticRadars = ({ enabled }) => {
  const id = useId();
  const sourceId = `${id}-static-radars-source`;
  const layerId = `${id}-static-radars-layer`;
  const imageId = `${id}-static-radars-icon`;

  useEffect(() => {
    if (!enabled) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      if (map.hasImage(imageId)) {
        map.removeImage(imageId);
      }
      return () => {};
    }

    const loadIcon = () => {
      if (map.hasImage(imageId)) {
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!map.hasImage(imageId)) {
          const width = image.naturalWidth || image.width || RADAR_ICON_BASE_SIZE;
          const height = image.naturalHeight || image.height || RADAR_ICON_BASE_SIZE;
          const pixelRatio = Math.max(width, height) / RADAR_ICON_BASE_SIZE;
          map.addImage(imageId, image, {
            pixelRatio: Math.max(pixelRatio, 0.01),
          });
        }
      };
      image.src = radarIconUrl;
    };

    loadIcon();

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'symbol',
        source: sourceId,
        minzoom: STATIC_RADARS_MIN_ZOOM,
        layout: {
          'icon-image': imageId,
          'icon-size': 0.6,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    const loadData = async () => {
      try {
        const response = await fetch('/radars/scdb-radars-br.geojson');
        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.warn('Falha ao carregar scdb-radars-br.geojson', response.status);
          return;
        }
        const data = await response.json();
        map.getSource(sourceId)?.setData(data);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Erro ao carregar scdb-radars-br.geojson', error);
      }
    };

    loadData();

    return () => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      if (map.hasImage(imageId)) {
        map.removeImage(imageId);
      }
    };
  }, [enabled, imageId, layerId, sourceId]);

  return null;
};

export default MapStaticRadars;

