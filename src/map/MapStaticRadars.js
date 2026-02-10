import {
  useEffect,
  useId,
  useMemo,
} from 'react';
import { map } from './core/MapView';
import radarIconUrl from '../resources/images/icon/community-radar.svg';
import speed20IconUrl from '../resources/images/icon/speed-limit-20-sign-icon.svg';
import speed30IconUrl from '../resources/images/icon/speed-limit-30-sign-icon.svg';
import speed40IconUrl from '../resources/images/icon/speed-limit-40-sign-icon.svg';
import speed50IconUrl from '../resources/images/icon/speed-limit-50-sign-icon.svg';
import speed60IconUrl from '../resources/images/icon/speed-limit-60-sign-icon.svg';
import speed70IconUrl from '../resources/images/icon/speed-limit-70-sign-icon.svg';
import speed80IconUrl from '../resources/images/icon/speed-limit-80-sign-icon.svg';
import speed90IconUrl from '../resources/images/icon/speed-limit-90-sign-icon.svg';
import speed100IconUrl from '../resources/images/icon/speed-limit-100-sign-icon.svg';
import speed120IconUrl from '../resources/images/icon/speed-limit-120-sign-icon.svg';

const STATIC_RADARS_MIN_ZOOM = 10;
const RADAR_ICON_BASE_SIZE = 64;

const MapStaticRadars = ({ enabled }) => {
  const id = useId();
  const sourceId = `${id}-static-radars-source`;
  const layerId = `${id}-static-radars-layer`;

  const imageIds = useMemo(() => ({
    DEFAULT: `${id}-static-radars-generic`,
    SPEED_20: `${id}-static-radars-20`,
    SPEED_30: `${id}-static-radars-30`,
    SPEED_40: `${id}-static-radars-40`,
    SPEED_50: `${id}-static-radars-50`,
    SPEED_60: `${id}-static-radars-60`,
    SPEED_70: `${id}-static-radars-70`,
    SPEED_80: `${id}-static-radars-80`,
    SPEED_90: `${id}-static-radars-90`,
    SPEED_100: `${id}-static-radars-100`,
    SPEED_120: `${id}-static-radars-120`,
  }), [id]);

  useEffect(() => {
    if (!enabled) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      Object.values(imageIds).forEach((imgId) => {
        if (map.hasImage(imgId)) {
          map.removeImage(imgId);
        }
      });
      return () => {};
    }

    const iconEntries = [
      { imageId: imageIds.DEFAULT, iconUrl: radarIconUrl },
      { imageId: imageIds.SPEED_20, iconUrl: speed20IconUrl },
      { imageId: imageIds.SPEED_30, iconUrl: speed30IconUrl },
      { imageId: imageIds.SPEED_40, iconUrl: speed40IconUrl },
      { imageId: imageIds.SPEED_50, iconUrl: speed50IconUrl },
      { imageId: imageIds.SPEED_60, iconUrl: speed60IconUrl },
      { imageId: imageIds.SPEED_70, iconUrl: speed70IconUrl },
      { imageId: imageIds.SPEED_80, iconUrl: speed80IconUrl },
      { imageId: imageIds.SPEED_90, iconUrl: speed90IconUrl },
      { imageId: imageIds.SPEED_100, iconUrl: speed100IconUrl },
      { imageId: imageIds.SPEED_120, iconUrl: speed120IconUrl },
    ];

    const loadSvgAsMapImage = (imageId, iconUrl) => {
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
      image.src = iconUrl;
    };

    iconEntries.forEach(({ imageId, iconUrl }) => {
      loadSvgAsMapImage(imageId, iconUrl);
    });

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
          'icon-image': [
            'match',
            ['get', 'speedKph'],
            20, imageIds.SPEED_20,
            30, imageIds.SPEED_30,
            40, imageIds.SPEED_40,
            50, imageIds.SPEED_50,
            60, imageIds.SPEED_60,
            70, imageIds.SPEED_70,
            80, imageIds.SPEED_80,
            90, imageIds.SPEED_90,
            100, imageIds.SPEED_100,
            120, imageIds.SPEED_120,
            imageIds.DEFAULT,
          ],
          'icon-size': 0.6,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    const loadData = async () => {
      try {
        // Caminho relativo para funcionar tanto em desenvolvimento quanto em produção
        // mesmo quando o Traccar é servido em subcaminhos (ex.: /rastreador/).
        const response = await fetch('radars/scdb-radars-br.geojson');
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
      Object.values(imageIds).forEach((imgId) => {
        if (map.hasImage(imgId)) {
          map.removeImage(imgId);
        }
      });
    };
  }, [enabled, imageIds, layerId, sourceId]);

  return null;
};

export default MapStaticRadars;

