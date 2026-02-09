import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import maplibregl from 'maplibre-gl';
import { map } from './core/MapView';
import fetchOrThrow from '../common/util/fetchOrThrow';
import buracoIconUrl from '../resources/images/icon/community-buraco.svg';
import buracoApprovedIconUrl from '../resources/images/icon/community-buraco-approved.svg';
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

/** Zoom mínimo: abaixo disso (visão acima de ~50 m) os ícones de buraco somem para não poluir o mapa */
const ZOOM_HIDE_BEYOND_100M = 17;
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

const formatAuthorForDisplay = (value) => {
  if (!value) {
    return 'Usuario';
  }
  const raw = String(value).trim();
  if (!raw) {
    return 'Usuario';
  }
  const normalized = raw.includes('@') ? raw.split('@')[0] : raw;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return 'Usuario';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return parts[parts.length - 1];
};
const MapCommunityReports = ({
  publicReports,
  pendingReports,
  onCancelPending,
}) => {
  const id = useId();
  const symbolLayerId = `${id}-community-symbol`;
  const popupRef = useRef(null);
  const [voteState, setVoteState] = useState({});
  const [hiddenReports, setHiddenReports] = useState(new Set());

  const clearPopup = useCallback(() => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, []);

  const loadVotes = useCallback(async (reportId) => {
    const response = await fetchOrThrow(`/api/community/reports/${reportId}/votes`);
    const data = await response.json();
    setVoteState((prev) => ({ ...prev, [reportId]: data }));
    setHiddenReports((prev) => {
      const next = new Set(prev);
      if (data.status === 'REMOVED') {
        next.add(String(reportId));
      } else {
        next.delete(String(reportId));
      }
      return next;
    });
    if (data.status === 'REMOVED') {
      clearPopup();
    }
    return data;
  }, [clearPopup]);

  const sendVote = useCallback(async (reportId, vote) => {
    const response = await fetchOrThrow(`/api/community/reports/${reportId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote }),
    });
    const data = await response.json();
    setVoteState((prev) => ({ ...prev, [reportId]: data }));
    setHiddenReports((prev) => {
      const next = new Set(prev);
      if (data.status === 'REMOVED') {
        next.add(String(reportId));
      } else {
        next.delete(String(reportId));
      }
      return next;
    });
    if (data.status === 'REMOVED') {
      clearPopup();
    }
    return data;
  }, [clearPopup]);

  const imageIds = useMemo(() => ({
    BURACO: `${id}-community-icon-buraco`,
    BURACO_APPROVED: `${id}-community-icon-buraco-approved`,
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
            authorName: report.authorName,
            existsVotes: report.existsVotes ?? 0,
            goneVotes: report.goneVotes ?? 0,
            lastVotedAt: report.lastVotedAt,
          },
        })),
    };
  }, [publicReports, pendingReports]);

  useEffect(() => {
    const iconEntries = [
      { imageId: imageIds.BURACO, iconUrl: buracoIconUrl },
      { imageId: imageIds.BURACO_APPROVED, iconUrl: buracoApprovedIconUrl },
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
      minzoom: ZOOM_HIDE_BEYOND_100M,
      layout: {
        'icon-image': [
          'match',
          ['get', 'type'],
          'BURACO',
          ['case', ['to-boolean', ['get', 'pending']], imageIds.BURACO, imageIds.BURACO_APPROVED],
          'RADAR',
          imageIds.RADAR,
          'QUEBRA_MOLAS',
          imageIds.QUEBRA_MOLAS,
          imageIds.RADAR,
        ],
        // icon-size must have zoom at the top level; apply type scaling per stop
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          16,
          ['*', 0.35, ['match', ['get', 'type'], 'BURACO', 0.8, 0.85]],
          17.5,
          ['*', 0.45, ['match', ['get', 'type'], 'BURACO', 0.8, 0.85]],
          19,
          ['*', 0.55, ['match', ['get', 'type'], 'BURACO', 0.8, 0.85]],
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
      const authorName = formatAuthorForDisplay(feature.properties.authorName);
      const initialVotes = voteState[reportId] || {
        existsVotes: feature.properties.existsVotes || 0,
        goneVotes: feature.properties.goneVotes || 0,
        userVote: feature.properties.userVote,
        lastVotedAt: feature.properties.lastVotedAt,
        status,
        canVote: feature.properties.userVote ? false : true,
        nextVoteAt: null,
      };

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

      if (type === 'BURACO') {
        const descLine = document.createElement('div');
        descLine.style.fontSize = '12px';
        descLine.style.color = '#0F172A';
        descLine.textContent = `Buraco na pista, feito por ${authorName}`;
        container.appendChild(descLine);
      }

      const statusLine = document.createElement('div');
      statusLine.style.fontSize = '12px';
      statusLine.style.color = '#334155';
      statusLine.textContent = `Status: ${statusLabelMap[status] || status || '-'}`;
      container.appendChild(statusLine);

      const voteLine = document.createElement('div');
      voteLine.style.fontSize = '12px';
      voteLine.style.color = '#0F172A';
      container.appendChild(voteLine);

      const feedbackLine = document.createElement('div');
      feedbackLine.style.fontSize = '11px';
      feedbackLine.style.color = '#B91C1C';
      feedbackLine.style.minHeight = '14px';
      container.appendChild(feedbackLine);

      const lastVoteLine = document.createElement('div');
      lastVoteLine.style.fontSize = '11px';
      lastVoteLine.style.color = '#475569';
      container.appendChild(lastVoteLine);

      const updateVoteInfo = (data) => {
        const exists = data?.existsVotes ?? 0;
        const gone = data?.goneVotes ?? 0;
        voteLine.textContent = `Votos: Existe ${exists} | Sumiu ${gone}`;
        if (data?.lastVotedAt) {
          lastVoteLine.textContent = `Último voto: ${formatCreatedAt(data.lastVotedAt)}`;
        } else {
          lastVoteLine.textContent = '';
        }
      };
      updateVoteInfo(initialVotes);

      const buttonsRow = document.createElement('div');
      buttonsRow.style.display = 'flex';
      buttonsRow.style.gap = '8px';
      buttonsRow.style.margin = '4px 0';
      buttonsRow.addEventListener('click', (event) => event.stopPropagation());
      buttonsRow.addEventListener('mousedown', (event) => event.stopPropagation());
      buttonsRow.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
      buttonsRow.addEventListener('touchend', (event) => event.stopPropagation());
      container.appendChild(buttonsRow);
      const voteButtons = [];
      const setVoteButtonsDisabled = (disabled) => {
        voteButtons.forEach((button) => {
          button.disabled = disabled;
          button.style.opacity = disabled ? '0.7' : '1';
          button.style.cursor = disabled ? 'not-allowed' : 'pointer';
        });
      };

      const renderButton = (label, value, accent) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.flex = '1';
        button.style.minHeight = '36px';
        button.style.borderRadius = '8px';
        button.style.border = `1px solid ${accent ? '#0EA5E9' : '#CBD5E1'}`;
        button.style.background = '#FFFFFF';
        button.style.color = '#0F172A';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.touchAction = 'manipulation';
        button.textContent = label;
        voteButtons.push(button);
        const applyActive = (active) => {
          button.style.background = active ? '#E0F2FE' : '#FFFFFF';
          button.style.borderColor = active ? '#0EA5E9' : '#CBD5E1';
        };
        applyActive(initialVotes.userVote === value);
        button.onclick = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          setVoteButtonsDisabled(true);
          feedbackLine.textContent = '';
          feedbackLine.style.color = '#475569';
          feedbackLine.textContent = 'Enviando voto...';
          try {
            const data = await sendVote(reportId, value);
            applyUserVote(data);
            updateVoteInfo(data);
            feedbackLine.style.color = '#166534';
            feedbackLine.textContent = 'Voto enviado com sucesso.';
            setVoteButtonsDisabled(!(data?.canVote ?? true));
          } catch (error) {
            console.warn('vote failed', error);
            const message = String(error?.message || '').toUpperCase();
            if (message.includes('VOTE_COOLDOWN_ACTIVE')) {
              const currentData = await loadVotes(reportId).catch(() => null);
              if (currentData?.nextVoteAt) {
                feedbackLine.textContent = `Voce podera votar novamente em ${formatCreatedAt(currentData.nextVoteAt)}.`;
              } else {
                feedbackLine.textContent = 'Voce ja votou neste buraco recentemente.';
              }
              feedbackLine.style.color = '#92400E';
              setVoteButtonsDisabled(true);
            } else {
              feedbackLine.textContent = 'Nao foi possivel votar.';
              feedbackLine.style.color = '#B91C1C';
              setVoteButtonsDisabled(false);
            }
          } finally {
            if (!feedbackLine.textContent) {
              setVoteButtonsDisabled(false);
            }
          }
        };
        button.addEventListener('mousedown', (event) => event.stopPropagation());
        button.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
        button.addEventListener('touchend', (event) => event.stopPropagation());
        buttonsRow.appendChild(button);
        return applyActive;
      };

      const applyExistsActive = renderButton('Ainda existe', 'EXISTS', true);
      const applyGoneActive = renderButton('Sumiu', 'GONE', false);
      const applyUserVote = (data) => {
        applyExistsActive(data?.userVote === 'EXISTS');
        applyGoneActive(data?.userVote === 'GONE');
      };
      applyUserVote(initialVotes);
      setVoteButtonsDisabled(!(initialVotes?.canVote ?? true));
      if (!(initialVotes?.canVote ?? true) && initialVotes?.nextVoteAt) {
        feedbackLine.style.color = '#92400E';
        feedbackLine.textContent = `Voce podera votar novamente em ${formatCreatedAt(initialVotes.nextVoteAt)}.`;
      }

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
        closeOnClick: false,
        maxWidth: '280px',
      })
        .setLngLat(event.lngLat)
        .setDOMContent(container)
        .addTo(map);

      loadVotes(reportId)
        .then((data) => {
          updateVoteInfo(data);
          applyUserVote(data);
          setVoteButtonsDisabled(!(data?.canVote ?? true));
          if (!(data?.canVote ?? true) && data?.nextVoteAt) {
            feedbackLine.style.color = '#92400E';
            feedbackLine.textContent = `Voce podera votar novamente em ${formatCreatedAt(data.nextVoteAt)}.`;
          }
        })
        .catch((error) => console.warn('loadVotes failed', error));
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
    const filteredFeatures = {
      ...features,
      features: features.features.filter((feature) => {
        const reportId = feature?.properties?.reportId;
        return !hiddenReports.has(String(reportId));
      }),
    };
    map.getSource(id)?.setData(filteredFeatures);
  }, [features, hiddenReports, id]);

  return null;
};

export default MapCommunityReports;

